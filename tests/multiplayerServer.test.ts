import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomRegistry, validateSnapshot } from '../server/rooms.mjs'

const connection = () => ({ close() {} })

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

  it('allows one HABCOM and protects occupied roles', () => {
    const registry = new RoomRegistry()
    const { room } = registry.create(connection())
    const habcom = registry.join(room.code, 'habcom', connection())
    assert.equal(habcom.client.role, 'habcom')
    assert.throws(() => registry.join(room.code, 'habcom', connection()), /already occupied/)
  })

  it('supports token-based reconnect without opening a second role slot', () => {
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
