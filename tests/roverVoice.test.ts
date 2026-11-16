import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  authHeader, rawKeyAllowed, readConfig, resolveTier, subprotocols,
} from '../src/ai/voice.ts'

const cfg = (over: Record<string, string> = {}) => readConfig(over)

describe('MERV credential handling', () => {
  it('never uses a bundled key off localhost', () => {
    // A VITE_ variable is compiled into the public bundle. Using one on a
    // deployed site publishes the key to every visitor.
    assert.equal(rawKeyAllowed('localhost', true), true)
    assert.equal(rawKeyAllowed('127.0.0.1', true), true)
    assert.equal(rawKeyAllowed('crimson-exodus.vercel.app', true), false)
    assert.equal(rawKeyAllowed('localhost', false), false)
  })

  it('uses Bearer for a short-lived token and Token for a raw key', () => {
    assert.equal(authHeader({ value: 'J', kind: 'token', expiresAt: 0 }), 'Bearer J')
    assert.equal(authHeader({ value: 'K', kind: 'raw-key', expiresAt: 0 }), 'Token K')
  })

  it('puts the credential second in the WebSocket subprotocol list', () => {
    const key = { value: 'K', kind: 'raw-key' as const, expiresAt: 0 }
    const tok = { value: 'J', kind: 'token' as const, expiresAt: 0 }
    assert.deepEqual(subprotocols(key), ['token', 'K'])
    assert.deepEqual(subprotocols(tok), ['bearer', 'J'])
    // The retry flips the scheme and keeps the credential in place.
    assert.deepEqual(subprotocols(tok, 1), ['token', 'J'])
    assert.deepEqual(subprotocols(key, 1), ['bearer', 'K'])
  })
})

describe('MERV tier selection', () => {
  it('falls to the offline tier with no credential', () => {
    assert.equal(resolveTier(cfg(), false), 'local')
    assert.equal(resolveTier(cfg({ VITE_ROVER_MODE: 'agent' }), false), 'local')
  })

  it('never selects the billed agent tier automatically', () => {
    // It spends money per spoken word and hands the microphone to a hosted
    // model. That must be an explicit decision, not a side effect of having
    // set a key.
    assert.equal(resolveTier(cfg(), true), 'grounded')
    assert.equal(resolveTier(cfg({ VITE_ROVER_MODE: 'auto' }), true), 'grounded')
    assert.equal(resolveTier(cfg({ VITE_ROVER_MODE: 'agent' }), true), 'agent')
  })

  it('honours an explicit request for the offline tier', () => {
    assert.equal(resolveTier(cfg({ VITE_ROVER_MODE: 'local' }), true), 'local')
  })

  it('defaults to a Deepgram-hosted language model, so one key is enough', () => {
    const c = cfg()
    assert.equal(c.thinkProvider, 'anthropic')
    assert.ok(c.voice.startsWith('aura'))
    assert.equal(c.want, 'auto')
    assert.equal(c.apiKey, null)
    assert.equal(c.tokenUrl, null)
  })
})
