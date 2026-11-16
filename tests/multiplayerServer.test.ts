import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomRegistry, ROLE_CAPACITY, ROOM_CAPACITY, readIdentity, validateSnapshot } from '../server/rooms.mjs'
import { ROOM_CAPACITY as CLIENT_ROOM_CAPACITY, ROLE_CAPACITY as CLIENT_ROLE_CAPACITY } from '../src/multiplayer/protocol.ts'

const connection = () => ({ closed: null, close(code: number) { this.closed = code } })

let seq = 0
/** A distinct throwaway identity, the shape the browser mints per tab. */
const player = (callsign = 'CREW-AB2') => ({
  playerId: `crew_${String(seq++).padStart(24, '0')}`,
  callsign,
})

const snapshot = {
  protocol: 1,
  phase: 'surface',
  route: { id: 'ares', progress: 0.5 },
  mission: { evaSec: 100, timeScale: 1, paused: false, activity: 'walk', procedure: null },
  position: { x: 1, z: 2, heading: 0, atLander: false },
  lifeSupport: { o2: 0.9, scrubber: 0.8, battery: 0.7, water: 0.6, limiting: 'water', returnMarginMin: 40, reserveMarginMin: 10, returnStatus: 'nominal' },
  environment: { weather: 'clear', headline: 'NOMINAL', dustOpacity: 0.4, visibilityM: 20000, airTempC: -30, radiation: null, doseMSv: 0.1 },
  science: { nearStation: null, samples: 0, photos: 1, completedStations: 0, feedPackages: 0 },
  outcome: null,
}

describe('multiplayer room registry', () => {
  it('creates isolated six-character rooms and assigns EV-1', () => {
    const registry = new RoomRegistry()
    const first = registry.create(connection())
    const second = registry.create(connection())
    assert.match(first.room.code, /^[A-Z2-9]{6}$/)
    assert.notEqual(first.room.code, second.room.code)
    assert.equal(first.client.role, 'ev')
  })

  it('seats four: one EV-1 and three at HABCOM', () => {
    const registry = new RoomRegistry()
    const { room } = registry.create(connection(), player('CREW-EV1'))
    for (let i = 0; i < ROLE_CAPACITY.habcom; i += 1) {
      const joined = registry.join(room.code, 'habcom', connection(), player())
      assert.equal(joined.client.role, 'habcom')
    }
    assert.equal(room.clients.size, ROOM_CAPACITY)
    // The fifth is refused, and told why rather than being told the room is
    // occupied when three seats were free.
    assert.throws(
      () => registry.join(room.code, 'habcom', connection(), player()),
      /full/i,
    )
  })

  it('refuses a second EV-1 and points them at HABCOM', () => {
    const registry = new RoomRegistry()
    const { room } = registry.create(connection(), player())
    assert.throws(
      () => registry.join(room.code, 'ev', connection(), player()),
      /already crewed/i,
    )
  })

  it('gives a returning player their own seat back, not a refusal', () => {
    /**
     * The bug this fixes. A refresh leaves the old socket seated until its
     * close event arrives, so the player's own dead connection was reported
     * as occupying the station they were trying to rejoin.
     */
    const registry = new RoomRegistry()
    const { room } = registry.create(connection(), player('CREW-EV1'))
    const me = player('CREW-XY7')
    const first = registry.join(room.code, 'habcom', connection(), me)
    assert.equal(room.clients.size, 2)

    const again = registry.join(room.code, 'habcom', connection(), me)
    assert.equal(again.client.role, 'habcom')
    assert.equal(again.client.callsign, 'CREW-XY7')
    // One seat, not two, and the stale socket was closed rather than left open.
    assert.equal(room.clients.size, 2)
    assert.equal(first.client.connection.closed, 4001)
  })

  it('returns an EV-1 to the driving seat even if the lobby asks for HABCOM', () => {
    // After a reload the lobby does not know what you were. The room does.
    const registry = new RoomRegistry()
    const host = player('CREW-EV1')
    const { room } = registry.create(connection(), host)
    const back = registry.join(room.code, 'habcom', connection(), host)
    assert.equal(back.client.role, 'ev')
    assert.equal(room.clients.size, 1)
  })

  it('treats separate tabs on one machine as separate crew', () => {
    // Two tabs is how everybody tests this. They must not evict each other.
    const registry = new RoomRegistry()
    const { room } = registry.create(connection(), player('CREW-EV1'))
    registry.join(room.code, 'habcom', connection(), player('CREW-AA2'))
    registry.join(room.code, 'habcom', connection(), player('CREW-BB3'))
    assert.equal(room.clients.size, 3)
    assert.equal([...room.clients.values()].filter((c) => c.role === 'habcom').length, 2)
  })

  it('still seats a client that brings no identity at all', () => {
    // Blocked storage, or an older build. It simply counts as a new person
    // every time, which is the behaviour this replaced.
    const registry = new RoomRegistry()
    const { room } = registry.create(connection())
    const anon = registry.join(room.code, 'habcom', connection())
    assert.equal(anon.client.role, 'habcom')
    assert.match(anon.client.callsign, /^CREW-/)
    assert.equal(anon.client.playerId, null)
  })

  it('ignores a forged or malformed identity', () => {
    assert.deepEqual(readIdentity({ playerId: 'nope', callsign: 'CREW-AB2' }), { playerId: null, callsign: 'CREW-AB2' })
    assert.deepEqual(readIdentity({ playerId: `crew_${'a'.repeat(24)}`, callsign: 'hack<script>' }).callsign, null)
    assert.deepEqual(readIdentity(), { playerId: null, callsign: null })
  })

  it('names everyone in the room, and marks which one is you', () => {
    const registry = new RoomRegistry()
    const host = registry.create(connection(), player('CREW-EV1'))
    registry.join(host.room.code, 'habcom', connection(), player('CREW-HB2'))
    const roster = registry.occupants(host.room, host.client)
    assert.equal(roster.length, 2)
    assert.deepEqual(roster.map((entry) => entry.callsign).sort(), ['CREW-EV1', 'CREW-HB2'])
    assert.equal(roster.filter((entry) => entry.you).length, 1)
    assert.equal(roster.find((entry) => entry.you)?.role, 'ev')
  })

  it('keeps the browser and the server agreeing on capacity', () => {
    // Two copies of the same number in two languages. They drift silently.
    assert.equal(ROOM_CAPACITY, CLIENT_ROOM_CAPACITY)
    assert.deepEqual(ROLE_CAPACITY, CLIENT_ROLE_CAPACITY)
  })

  it('never evicts a different crew member when somebody resumes', () => {
    /**
     * A resume token identifies one client, not a role.
     *
     * While a room held a single HABCOM those were the same thing, so the
     * code looked up "the client with this role". With three HABCOM seats it
     * threw out whoever happened to be first in the map — a different person,
     * removed from the mission because somebody else reloaded their browser.
     * A four-tab browser test caught it; the unit tests could not, because
     * they only ever had one HABCOM to confuse.
     */
    const registry = new RoomRegistry()
    const { room } = registry.create(connection(), player('CREW-EV1'))
    const alice = registry.join(room.code, 'habcom', connection(), player('CREW-AA2'))
    const bob = registry.join(room.code, 'habcom', connection(), player('CREW-BB3'))
    assert.equal(room.clients.size, 3)

    // Bob's socket dies, then Bob comes back with his token but no identity,
    // which is the pre-identity path.
    registry.detach(room, bob.client)
    bob.client.connection.close(1006)
    const back = registry.join(room.code, 'habcom', connection(), { resumeToken: bob.client.token })

    assert.equal(back.client.role, 'habcom')
    assert.equal(room.clients.size, 3)
    // Alice is untouched: still seated, socket never closed.
    assert.ok([...room.clients.values()].some((c) => c.id === alice.client.id))
    assert.equal(alice.client.connection.closed, null)
  })

  it('refuses a stale token rather than evicting someone for a free seat', () => {
    const registry = new RoomRegistry()
    const { room } = registry.create(connection(), player('CREW-EV1'))
    const first = registry.join(room.code, 'habcom', connection(), player('CREW-AA2'))
    registry.detach(room, first.client)
    // Three new people take every HABCOM seat while the first is away.
    for (let i = 0; i < ROLE_CAPACITY.habcom; i += 1) {
      registry.join(room.code, 'habcom', connection(), player())
    }
    assert.equal(room.clients.size, ROOM_CAPACITY)
    assert.throws(
      () => registry.join(room.code, 'habcom', connection(), { resumeToken: first.client.token }),
      /full/i,
    )
  })

  it('supports token-based reconnect without opening a second role slot', () => {
    // The pre-identity path, kept working for clients that bring no id.
    const registry = new RoomRegistry()
    const { room } = registry.create(connection())
    const first = registry.join(room.code, 'habcom', connection())
    const resumed = registry.join(room.code, 'habcom', connection(), first.client.token)
    assert.equal(resumed.client.token, first.client.token)
    assert.equal([...room.clients.values()].filter((client) => client.role === 'habcom').length, 1)
  })

  it('sanitizes telemetry instead of trusting the browser payload', () => {
    const clean = validateSnapshot({ ...snapshot, lifeSupport: { ...snapshot.lifeSupport, o2: 99 }, position: { x: Infinity, z: 2 } })
    assert.ok(clean)
    assert.equal(clean.lifeSupport.o2, 1)
    assert.equal(clean.position.x, 0)
    assert.equal(validateSnapshot({ ...snapshot, protocol: 99 }), null)
  })

  it('closes recommendations exactly once', () => {
    const registry = new RoomRegistry()
    const { room } = registry.create(connection())
    const command = registry.addCommand(room, 'return', 'Margin trending down')
    assert.ok(command)
    assert.equal(registry.acknowledge(room, command.id, true)?.status, 'accepted')
    assert.equal(registry.acknowledge(room, command.id, false), null)
  })

  it('expires abandoned rooms but never sweeps an occupied mission', () => {
    const registry = new RoomRegistry()
    const occupied = registry.create(connection())
    const abandoned = registry.create(connection())
    registry.detach(abandoned.room, abandoned.client)
    registry.sweep(Date.now() + 31 * 60 * 1000)
    assert.equal(registry.rooms.has(abandoned.room.code), false)
    assert.equal(registry.rooms.has(occupied.room.code), true)
  })
})
