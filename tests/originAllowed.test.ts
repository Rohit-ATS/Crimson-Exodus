import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_ALLOWED_ORIGINS, originAllowed, parseAllowedOrigins } from '../server/origin.mjs'

const list = parseAllowedOrigins(DEFAULT_ALLOWED_ORIGINS)

describe('crew link origin check', () => {
  it('allows a page served by this same server, whatever it is called', () => {
    /**
     * The custom-domain fix. A page served by this server cannot be a
     * cross-site request, so the domain does not have to be recognised by
     * name. Before this, only *.onrender.com was granted same-origin, and a
     * custom domain in front of the same service was refused at the upgrade
     * with nothing on screen to explain it.
     */
    assert.equal(originAllowed('https://crimsonexodus.com', 'crimsonexodus.com', list), true)
    assert.equal(originAllowed('https://www.crimsonexodus.com', 'www.crimsonexodus.com', list), true)
    assert.equal(originAllowed('https://crimson-exodus.onrender.com', 'crimson-exodus.onrender.com', list), true)
    assert.equal(originAllowed('http://box.lan:8080', 'box.lan:8080', list), true)
  })

  it('refuses a page on any other site', () => {
    assert.equal(originAllowed('https://evil.test', 'crimsonexodus.com', list), false)
    // The classic suffix-matching hole: a hostname that merely ends with ours.
    assert.equal(originAllowed('https://crimsonexodus.com.evil.test', 'crimsonexodus.com', list), false)
    // And one that merely contains it.
    assert.equal(originAllowed('https://evil.test/crimsonexodus.com', 'crimsonexodus.com', list), false)
    // A port mismatch is a different origin.
    assert.equal(originAllowed('https://crimsonexodus.com:8443', 'crimsonexodus.com', list), false)
  })

  it('still honours the explicit allowlist for genuine cross-origin use', () => {
    // GitHub Pages talking to a server on Render is legitimately cross-origin.
    assert.equal(originAllowed('https://rohit-ats.github.io', 'crimson-exodus.onrender.com', list), true)
    const custom = parseAllowedOrigins('https://a.example, https://b.example')
    assert.equal(originAllowed('https://b.example', 'server.example', custom), true)
    assert.equal(originAllowed('https://c.example', 'server.example', custom), false)
  })

  it('allows local development from either loopback name', () => {
    assert.equal(originAllowed('http://localhost:5173', '127.0.0.1:10000', list), true)
    assert.equal(originAllowed('http://127.0.0.1:5173', 'localhost:10000', list), true)
  })

  it('refuses anything that is not an http origin', () => {
    assert.equal(originAllowed(undefined, 'crimsonexodus.com', list), false)
    assert.equal(originAllowed('', 'crimsonexodus.com', list), false)
    assert.equal(originAllowed('null', 'crimsonexodus.com', list), false)
    assert.equal(originAllowed('not a url', 'crimsonexodus.com', list), false)
    // A file:// or extension page must not be able to open a crew link.
    assert.equal(originAllowed('file://', 'crimsonexodus.com', list), false)
    assert.equal(originAllowed('chrome-extension://abc', 'crimsonexodus.com', list), false)
  })

  it('refuses everything when the request carries no Host', () => {
    assert.equal(originAllowed('https://crimsonexodus.com', undefined, list), false)
    assert.equal(originAllowed('https://crimsonexodus.com', '', list), false)
  })
})
