import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CREW_LINK_META, multiplayerEndpoint, normalizeRoomCode, resolveMultiplayerEndpoint,
  sameConnectionIntent,
} from '../src/multiplayer/protocol.ts'
import { readFileSync } from 'node:fs'

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

  it('recognizes duplicate in-flight joins without conflating different rooms or roles', () => {
    const join = { mode: 'join' as const, roomCode: 'GRFFPQ', role: 'habcom' as const }
    assert.equal(sameConnectionIntent(join, { ...join }), true)
    assert.equal(sameConnectionIntent(join, { ...join, roomCode: 'ABC234' }), false)
    assert.equal(sameConnectionIntent(join, { ...join, role: 'ev' }), false)
    assert.equal(sameConnectionIntent(null, join), false)
  })

  /** A document that carries the marker our own server stamps in. */
  const served = (content: string | null = '/ws') => ({
    querySelector: (sel: string) =>
      sel === `meta[name="${CREW_LINK_META}"]` && content !== null
        ? { getAttribute: () => content }
        : null,
  })

  it('believes the server over the hostname', () => {
    /**
     * A custom domain in front of the Render service is the case that broke:
     * the page loads from crimsonexodus.com, the socket is on the very same
     * service, and nothing in the hostname says so. The server stamps a
     * marker into the index.html it serves, so the browser does not have to
     * guess.
     */
    assert.deepEqual(
      resolveMultiplayerEndpoint(undefined, location('https:', 'crimsonexodus.com'), served()),
      { url: 'wss://crimsonexodus.com/ws', source: 'same-origin' },
    )
    assert.deepEqual(
      resolveMultiplayerEndpoint(undefined, location('https:', 'www.crimsonexodus.com'), served()),
      { url: 'wss://www.crimsonexodus.com/ws', source: 'same-origin' },
    )
  })

  it('still refuses a static host, which stamps no marker', () => {
    // GitHub Pages serves the same index.html out of the repository build.
    // Only our own server injects the marker, so Pages still asks to be told.
    const r = resolveMultiplayerEndpoint(undefined, location('https:', 'rohit-ats.github.io'), served(null))
    assert.equal('reason' in r && r.reason, 'unset')
  })

  it('ignores a marker that is not a path on this origin', () => {
    // Defensive: the value is used to build a socket URL, so an absolute or
    // scheme-relative value must not redirect the crew link somewhere else.
    for (const bad of ['//evil.example/ws', 'https://evil.example/ws', '', 'ws']) {
      const r = resolveMultiplayerEndpoint(undefined, location('https:', 'crimsonexodus.com'), served(bad))
      assert.equal('reason' in r && r.reason, 'unset', `accepted ${JSON.stringify(bad)}`)
    }
  })

  it('lets an explicit setting win over the marker', () => {
    const r = resolveMultiplayerEndpoint(
      'wss://elsewhere.example/ws', location('https:', 'crimsonexodus.com'), served(),
    )
    assert.deepEqual(r, { url: 'wss://elsewhere.example/ws', source: 'configured' })
  })

  it('serves one service from the same origin when told to', () => {
    // For a custom domain, or any host that serves the app and the socket
    // together. Discovery only recognises *.onrender.com by name.
    assert.deepEqual(
      resolveMultiplayerEndpoint('same-origin', location('https:', 'crimsonexodus.com')),
      { url: 'wss://crimsonexodus.com/ws', source: 'same-origin' },
    )
    assert.deepEqual(
      resolveMultiplayerEndpoint(' same-origin ', location('http:', 'box.local', 'box.local:8080')),
      { url: 'ws://box.local:8080/ws', source: 'same-origin' },
    )
  })

  it('says which of the three problems it actually hit', () => {
    /**
     * All three used to return null, and the UI printed "set
     * VITE_MULTIPLAYER_URL" for every one of them — including to somebody on
     * Render, where the variable should not be needed, whose configured value
     * had in fact been parsed and rejected.
     */
    const unset = resolveMultiplayerEndpoint(undefined, location('https:', 'rohit-ats.github.io'))
    assert.equal('reason' in unset && unset.reason, 'unset')
    assert.match((unset as { message: string }).message, /build-time/)

    // The commonest mistake: copying the service URL out of the dashboard.
    const wrongScheme = resolveMultiplayerEndpoint(
      'https://crimson-exodus.onrender.com/ws', location('https:', 'rohit-ats.github.io'),
    )
    assert.equal('reason' in wrongScheme && wrongScheme.reason, 'not-a-websocket-url')
    assert.match((wrongScheme as { message: string }).message, /wss:\/\//)
    assert.match((wrongScheme as { message: string }).message, /https:\/\/crimson-exodus/)

    const junk = resolveMultiplayerEndpoint('crimson-exodus.onrender.com', location('https:', 'rohit-ats.github.io'))
    assert.equal('reason' in junk && junk.reason, 'unparseable')
    assert.match((junk as { message: string }).message, /not a URL/)
  })

  it('needs no configuration at all on Render', () => {
    const r = resolveMultiplayerEndpoint(undefined, location('https:', 'crimson-exodus.onrender.com'))
    assert.deepEqual(r, { url: 'wss://crimson-exodus.onrender.com/ws', source: 'same-origin' })
  })

  it('keeps the old URL-or-null helper working', () => {
    assert.equal(multiplayerEndpoint('wss://a.onrender.com/ws', location('https:', 'x.com')), 'wss://a.onrender.com/ws')
    assert.equal(multiplayerEndpoint('https://a.onrender.com/ws', location('https:', 'x.com')), null)
  })

  it('guards the browser client before replacing an opening socket', () => {
    const source = readFileSync(new URL('../src/multiplayer/client.ts', import.meta.url), 'utf8')
    assert.match(source, /socket\.readyState === WebSocket\.CONNECTING/)
    assert.match(source, /sameConnectionIntent\(intent, nextIntent\)/)
  })
})
