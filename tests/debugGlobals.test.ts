import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDebugGlobals, type DebugGlobalTarget } from '../src/state/debugGlobals.ts'

describe('installDebugGlobals', () => {
  it('never exposes state in a production build', () => {
    const target: DebugGlobalTarget = {}
    assert.equal(installDebugGlobals(
      { DEV: false, VITE_ENABLE_DEBUG_GLOBALS: 'true' }, target, 'store', 'live',
    ), false)
    assert.deepEqual(target, {})
  })

  it('keeps ordinary development sessions private by default', () => {
    const target: DebugGlobalTarget = {}
    assert.equal(installDebugGlobals({ DEV: true }, target, 'store', 'live'), false)
    assert.deepEqual(target, {})
  })

  it('exposes both handles only after an explicit development opt-in', () => {
    const target: DebugGlobalTarget = {}
    const store = { name: 'store' }
    const live = { name: 'live' }
    assert.equal(installDebugGlobals(
      { DEV: true, VITE_ENABLE_DEBUG_GLOBALS: 'true' }, target, store, live,
    ), true)
    assert.deepEqual(target, { __jack: store, __live: live })
  })

  it('requires the exact true literal', () => {
    const target: DebugGlobalTarget = {}
    assert.equal(installDebugGlobals(
      { DEV: true, VITE_ENABLE_DEBUG_GLOBALS: 'TRUE' }, target, 'store', 'live',
    ), false)
    assert.deepEqual(target, {})
  })
})
