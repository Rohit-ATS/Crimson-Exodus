import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'
import { after, before, describe, it } from 'node:test'
import WebSocket from 'ws'

let service: ChildProcessWithoutNullStreams
let port = 0
let wsUrl = ''
let origin = ''

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('No test port'))
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function waitForLine(child: ChildProcessWithoutNullStreams, pattern: RegExp): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`Server startup timed out:\n${output}`)), 8_000)
    const onData = (data: Buffer) => {
      output += data.toString()
      if (!pattern.test(output)) return
      clearTimeout(timer)
      child.stdout.off('data', onData)
      resolve()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', (data) => { output += data.toString() })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Server exited during startup (${code}):\n${output}`))
    })
  })
}

function openSocket(socketOrigin = origin): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, { headers: { Origin: socketOrigin } })
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

function nextMessage<T extends { type: string }>(socket: WebSocket, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 4_000)
    const handler = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as T
      if (message.type !== type) return
      clearTimeout(timer)
      socket.off('message', handler)
      resolve(message)
    }
    socket.on('message', handler)
  })
}

const snapshot = {
  protocol: 2,
  phase: 'surface',
  route: { id: 'ares', progress: 0.42 },
  mission: { evaSec: 600, timeScale: 10, paused: false, activity: 'walk', procedure: null, aborting: false, sheltering: false },
  position: { x: 120, z: -80, heading: 1.2, atLander: false },
  lifeSupport: { o2: 0.84, scrubber: 0.78, battery: 0.71, water: 0.69, limiting: 'water', returnMarginMin: 38, reserveMarginMin: 12, returnStatus: 'nominal' },
  environment: { weather: 'clear', headline: 'NOMINAL', dustOpacity: 0.47, visibilityM: 20_000, airTempC: -31, radiation: null, doseMSv: 0.12 },
  science: { nearStation: null, samples: 0, photos: 1, completedStations: 0, feedPackages: 0 },
  outcome: null,
}

before(async () => {
  port = await freePort()
  origin = `http://localhost:${port}`
  wsUrl = `ws://127.0.0.1:${port}/ws`
  service = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: origin },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  await waitForLine(service, /multiplayer listening/)
})

after(async () => {
  if (!service || service.exitCode != null) return
  const exited = new Promise<void>((resolve) => service.once('exit', () => resolve()))
  service.kill('SIGTERM')
  await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3_000))])
  if (service.exitCode == null) service.kill('SIGKILL')
})

describe('Render multiplayer service', () => {
  it('serves health and rejects malformed or cross-origin requests', async () => {
    const health = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true, protocol: 2, rooms: 0 })

    const malformed = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`)
    assert.equal(malformed.status, 400)

    const token = await fetch(`http://127.0.0.1:${port}/api/deepgram-token`, { method: 'POST' })
    assert.equal(token.status, 403)

    await assert.rejects(openSocket('https://attacker.onrender.com'))
  })

  it('runs create, join, telemetry, chat, command, acknowledgement and reconnect end to end', async () => {
    const ev = await openSocket()
    ev.send(JSON.stringify({ type: 'create', protocol: 2 }))
    const evJoined = await nextMessage<{ type: 'joined'; roomCode: string }>(ev, 'joined')
    assert.match(evJoined.roomCode, /^[A-Z2-9]{6}$/)

    const habcom = await openSocket()
    habcom.send(JSON.stringify({ type: 'join', protocol: 2, roomCode: evJoined.roomCode, role: 'habcom' }))
    const habJoined = await nextMessage<{ type: 'joined'; resumeToken: string; peerConnected: boolean }>(habcom, 'joined')
    assert.equal(habJoined.peerConnected, true)

    ev.send(JSON.stringify({ type: 'snapshot', snapshot }))
    const telemetry = await nextMessage<{ type: 'snapshot'; snapshot: typeof snapshot }>(habcom, 'snapshot')
    assert.equal(telemetry.snapshot.phase, 'surface')
    assert.equal(telemetry.snapshot.lifeSupport.o2, 0.84)

    habcom.send(JSON.stringify({ type: 'chat', text: 'Telemetry copy.' }))
    const chat = await nextMessage<{ type: 'chat'; message: { text: string } }>(ev, 'chat')
    assert.equal(chat.message.text, 'Telemetry copy.')

    habcom.send(JSON.stringify({ type: 'command', kind: 'hold', note: 'Evaluate return margin.' }))
    const recommendation = await nextMessage<{ type: 'command'; command: { id: string; kind: string } }>(ev, 'command')
    assert.equal(recommendation.command.kind, 'hold')
    ev.send(JSON.stringify({ type: 'command_ack', commandId: recommendation.command.id, accepted: true }))
    const acknowledgement = await nextMessage<{ type: 'command_ack'; accepted: boolean }>(habcom, 'command_ack')
    assert.equal(acknowledgement.accepted, true)

    habcom.send(JSON.stringify({ type: 'snapshot', snapshot }))
    const forbidden = await nextMessage<{ type: 'error'; code: string }>(habcom, 'error')
    assert.equal(forbidden.code, 'FORBIDDEN')

    const resumed = await openSocket()
    resumed.send(JSON.stringify({
      type: 'join', protocol: 2, roomCode: evJoined.roomCode,
      role: 'habcom', resumeToken: habJoined.resumeToken,
    }))
    const resumedJoin = await nextMessage<{ type: 'joined'; resumeToken: string; snapshot: typeof snapshot }>(resumed, 'joined')
    assert.equal(resumedJoin.resumeToken, habJoined.resumeToken)
    assert.equal(resumedJoin.snapshot.phase, 'surface')

    ev.close()
    habcom.close()
    resumed.close()
  })

  it('streams independently validated EV-1 and EV-2 surface poses', async () => {
    const ev = await openSocket()
    ev.send(JSON.stringify({ type: 'create', protocol: 2 }))
    const hosted = await nextMessage<{ type: 'joined'; roomCode: string }>(ev, 'joined')

    const ev2 = await openSocket()
    ev2.send(JSON.stringify({ type: 'join', protocol: 2, roomCode: hosted.roomCode, role: 'ev2' }))
    await nextMessage(ev2, 'joined')

    const evPose = { x: 12, z: 24, heading: 0.4, speedMs: 0.9, moving: 1, stride: 2, sentAt: 1 }
    ev.send(JSON.stringify({ type: 'pose', pose: evPose }))
    const seenByEv2 = await nextMessage<{ type: 'pose'; role: string; pose: typeof evPose }>(ev2, 'pose')
    assert.equal(seenByEv2.role, 'ev')
    assert.equal(seenByEv2.pose.x, 12)

    const ev2Pose = { x: 14, z: 25, heading: -0.2, speedMs: 0.8, moving: 0.7, stride: 3, sentAt: 1 }
    ev2.send(JSON.stringify({ type: 'pose', pose: ev2Pose }))
    const seenByEv1 = await nextMessage<{ type: 'pose'; role: string; pose: typeof ev2Pose }>(ev, 'pose')
    assert.equal(seenByEv1.role, 'ev2')
    assert.equal(seenByEv1.pose.z, 25)

    await new Promise((resolve) => setTimeout(resolve, 90))
    ev2.send(JSON.stringify({ type: 'pose', pose: { ...ev2Pose, x: 1100, z: 1100 } }))
    const rejected = await nextMessage<{ type: 'error'; code: string }>(ev2, 'error')
    assert.equal(rejected.code, 'POSE_SPEED')

    ev2.close()
    ev.close()
  })

  it('seats five crew, refuses the sixth, and lets a refreshed player back in', async () => {
    /**
     * The bug this covers, end to end, against the real server process.
     *
     * Reported from the deployed build: the room was created, a second
     * player tried to join, and the server said the station was already
     * occupied. Two separate causes, both fixed here — the room only ever
     * had two seats, and a player's own dead socket counted against them
     * when they came back.
     */
    const identity = (n: number) => ({
      playerId: `crew_${String(n).padStart(24, '0')}`,
      callsign: `CREW-${String.fromCharCode(65 + n)}${n}${n}`,
    })

    const ev = await openSocket()
    ev.send(JSON.stringify({ type: 'create', protocol: 2, ...identity(1) }))
    const hosted = await nextMessage<{
      type: 'joined'; roomCode: string; callsign: string; capacity: number
      roster: Array<{ callsign: string; role: string; you?: boolean }>
    }>(ev, 'joined')
    assert.equal(hosted.capacity, 5)
    assert.equal(hosted.callsign, identity(1).callsign)
    assert.equal(hosted.roster.length, 1)
    assert.equal(hosted.roster[0].you, true)

    const ev2 = await openSocket()
    ev2.send(JSON.stringify({
      type: 'join', protocol: 2, roomCode: hosted.roomCode, role: 'ev2', ...identity(5),
    }))
    const surfaceCrew = await nextMessage<{ type: 'joined'; role: string }>(ev2, 'joined')
    assert.equal(surfaceCrew.role, 'ev2')

    // Three more at HABCOM. Every one of these used to be refused.
    const habs: WebSocket[] = []
    for (let n = 2; n <= 4; n += 1) {
      const socket = await openSocket()
      socket.send(JSON.stringify({
        type: 'join', protocol: 2, roomCode: hosted.roomCode, role: 'habcom', ...identity(n),
      }))
      const joined = await nextMessage<{ type: 'joined'; role: string; roster: unknown[] }>(socket, 'joined')
      assert.equal(joined.role, 'habcom', `crew member ${n} was refused`)
      assert.equal(joined.roster.length, n + 1)
      habs.push(socket)
    }

    // The fifth is refused, and says the room is full rather than claiming a
    // station is occupied while seats are free.
    const fifth = await openSocket()
    fifth.send(JSON.stringify({
      type: 'join', protocol: 2, roomCode: hosted.roomCode, role: 'habcom', ...identity(6),
    }))
    const refused = await nextMessage<{ type: 'error'; code: string; message: string }>(fifth, 'error')
    assert.equal(refused.code, 'ROOM_FULL')
    assert.match(refused.message, /full/i)
    fifth.close()

    // A HABCOM player refreshes: same identity, brand new socket, and the old
    // one has NOT closed yet. They must get their own seat back.
    const refreshed = await openSocket()
    refreshed.send(JSON.stringify({
      type: 'join', protocol: 2, roomCode: hosted.roomCode, role: 'habcom', ...identity(3),
    }))
    const back = await nextMessage<{
      type: 'joined'; role: string; callsign: string; roster: unknown[]
    }>(refreshed, 'joined')
    assert.equal(back.role, 'habcom')
    assert.equal(back.callsign, identity(3).callsign)
    // Still five aboard: they reclaimed a seat rather than taking a new one.
    assert.equal(back.roster.length, 5)

    // And everyone else is told who is in the room.
    const rosterUpdate = await nextMessage<{
      type: 'roster'; roster: Array<{ callsign: string }>; capacity: number
    }>(ev, 'roster')
    assert.equal(rosterUpdate.capacity, 5)
    assert.equal(rosterUpdate.roster.length, 5)

    ev.close()
    ev2.close()
    refreshed.close()
    for (const socket of habs) socket.close()
  })

  it('does not let a second player take the EV-1 driving seat', async () => {
    const ev = await openSocket()
    ev.send(JSON.stringify({
      type: 'create', protocol: 2, playerId: `crew_${'1'.repeat(24)}`, callsign: 'CREW-AA2',
    }))
    const hosted = await nextMessage<{ type: 'joined'; roomCode: string }>(ev, 'joined')

    const intruder = await openSocket()
    intruder.send(JSON.stringify({
      type: 'join', protocol: 2, roomCode: hosted.roomCode, role: 'ev',
      playerId: `crew_${'2'.repeat(24)}`, callsign: 'CREW-BB3',
    }))
    const refused = await nextMessage<{ type: 'error'; code: string; message: string }>(intruder, 'error')
    assert.equal(refused.code, 'ROLE_TAKEN')
    // The message has to tell them what to do instead.
    assert.match(refused.message, /HABCOM/)

    ev.close()
    intruder.close()
  })
})
