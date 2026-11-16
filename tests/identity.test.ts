import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { freshIdentity, parseIdentity } from '../src/state/identity.ts'

describe('temporary player identity', () => {
  it('mints an id and a readable callsign with no account involved', () => {
    const a = freshIdentity()
    assert.match(a.playerId, /^crew_[0-9a-f]{24}$/)
    assert.match(a.callsign, /^CREW-[A-Z0-9]{3}$/)
  })

  it('does not repeat itself', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i += 1) seen.add(freshIdentity().playerId)
    assert.equal(seen.size, 2000)
  })

  it('keeps the callsign readable aloud', () => {
    // A callsign gets read across a table during a demo. O/0 and I/1 are the
    // two pairs people mishear, so the alphabet excludes them.
    for (let i = 0; i < 400; i += 1) {
      assert.doesNotMatch(freshIdentity().callsign.slice(5), /[O0I1]/)
    }
  })

  it('rejects anything that is not an identity it wrote', () => {
    assert.equal(parseIdentity(null), null)
    assert.equal(parseIdentity('not json'), null)
    assert.equal(parseIdentity('{}'), null)
    assert.equal(parseIdentity(JSON.stringify({ playerId: 'crew_short', callsign: 'CREW-AB2' })), null)
    assert.equal(parseIdentity(JSON.stringify({ playerId: `crew_${'a'.repeat(24)}`, callsign: 'nope' })), null)
    // A valid one survives the round trip.
    const good = freshIdentity()
    assert.deepEqual(parseIdentity(JSON.stringify(good)), good)
  })

  it('is stored per browser tab, not per browser', () => {
    /**
     * This is the load-bearing decision in the module, so it is asserted in
     * source rather than left to a comment.
     *
     * `localStorage` is shared between tabs. Two tabs is how a two-player
     * build gets tested, and under a shared id the server would read the
     * second tab as the first one reconnecting and hand it the same seat —
     * one player, playing against themselves, with no way to see why.
     */
    const source = readFileSync(new URL('../src/state/identity.ts', import.meta.url), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.match(code, /sessionStorage\.getItem/)
    assert.match(code, /sessionStorage\.setItem/)
    assert.doesNotMatch(code, /localStorage/)
  })
})
