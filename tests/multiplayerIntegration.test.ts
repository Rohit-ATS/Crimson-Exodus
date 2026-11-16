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
  protocol: 1,
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
    assert.deepEqual(await health.json(), { ok: true, protocol: 1, rooms: 0 })

    const malformed = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`)
    assert.equal(malformed.status, 400)

    const token = await fetch(`http://127.0.0.1:${port}/api/deepgram-token`, { method: 'POST' })
    assert.equal(token.status, 403)

    await assert.rejects(openSocket('https://attacker.onrender.com'))
  })

  it('runs create, join, telemetry, chat, command, acknowledgement and reconnect end to end', async () => {
    const ev = await openSocket()
    ev.send(JSON.stringify({ type: 'create', protocol: 1 }))
    const evJoined = await nextMessage<{ type: 'joined'; roomCode: string }>(ev, 'joined')
    assert.match(evJoined.roomCode, /^[A-Z2-9]{6}$/)

    const habcom = await openSocket()
    habcom.send(JSON.stringify({ type: 'join', protocol: 1, roomCode: evJoined.roomCode, role: 'habcom' }))
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
      type: 'join', protocol: 1, roomCode: evJoined.roomCode,
      role: 'habcom', resumeToken: habJoined.resumeToken,
    }))
    const resumedJoin = await nextMessage<{ type: 'joined'; resumeToken: string; snapshot: typeof snapshot }>(resumed, 'joined')
    assert.equal(resumedJoin.resumeToken, habJoined.resumeToken)
    assert.equal(resumedJoin.snapshot.phase, 'surface')

    ev.close()
    habcom.close()
    resumed.close()
  })
})
