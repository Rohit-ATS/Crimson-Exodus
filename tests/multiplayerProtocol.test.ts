import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { multiplayerEndpoint, normalizeRoomCode } from '../src/multiplayer/protocol.ts'

const location = (protocol: string, hostname: string, host = hostname) => ({ protocol, hostname, host }) as Location

describe('multiplayer browser configuration', () => {
  it('normalizes human-entered room codes', () => {
    assert.equal(normalizeRoomCode(' ab-c 12! '), 'ABC12')
    assert.equal(normalizeRoomCode('abcdefghi'), 'ABCDEF')
  })

  it('uses a configured secure Render socket on GitHub Pages', () => {
    assert.equal(
      multiplayerEndpoint('wss://crimson-exodus.onrender.com/ws', location('https:', 'rohit-ats.github.io')),
      'wss://crimson-exodus.onrender.com/ws',
    )
  })

  it('discovers the same-origin socket on Render and localhost', () => {
    assert.equal(multiplayerEndpoint(undefined, location('https:', 'crimson-exodus.onrender.com')), 'wss://crimson-exodus.onrender.com/ws')
    assert.equal(multiplayerEndpoint(undefined, location('http:', 'localhost', 'localhost:5173')), 'ws://localhost:5173/ws')
  })

  it('does not silently connect GitHub Pages to an unknown backend', () => {
    assert.equal(multiplayerEndpoint(undefined, location('https:', 'rohit-ats.github.io')), null)
    assert.equal(multiplayerEndpoint('https://not-a-websocket.example', location('https:', 'rohit-ats.github.io')), null)
  })
})
