import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { WINDOWS, windowPosition, type WindowSpec } from '../src/ui/hud/windows.ts'

const spec = (over: Partial<WindowSpec> = {}): WindowSpec => ({
  id: 'life', label: 'LIFE', title: 'Life', width: 268, anchor: { x: 0.5, y: 0.5 }, ...over,
})

describe('HUD window placement', () => {
  it('places an untouched window at its anchor fraction', () => {
    const p = windowPosition(spec(), undefined, { w: 1600, h: 1000 })
    assert.deepEqual(p, { x: 800, y: 500 })
  })

  it('keeps a dragged window, but drags it back on screen', () => {
    // A window parked off the right edge of a 27-inch monitor is unreachable
    // when the same browser profile is opened on a laptop, and the player has
    // no way to get it back.
    const small = { w: 1024, h: 680 }
    const p = windowPosition(spec(), { x: 2400, y: 1800 }, small)
    assert.ok(p.x <= small.w - 90, `x ${p.x} is off the right edge`)
    assert.ok(p.y <= small.h - 54, `y ${p.y} is off the bottom`)
    assert.ok(p.x >= 0 && p.y >= 0)
  })

  it('keeps a negative position on screen too', () => {
    const p = windowPosition(spec(), { x: -500, y: -200 }, { w: 1280, h: 720 })
    assert.ok(p.x >= 0 && p.y >= 0)
  })

  it('respects a dragged position that is already valid', () => {
    const p = windowPosition(spec(), { x: 300, y: 220 }, { w: 1600, h: 1000 })
    assert.deepEqual(p, { x: 300, y: 220 })
  })
})

describe('HUD window catalogue', () => {
  it('has a unique id and a dock label for every window', () => {
    const ids = WINDOWS.map((w) => w.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const w of WINDOWS) {
      assert.ok(w.label.length > 0 && w.title.length > 0, w.id)
      assert.ok(w.width >= 200 && w.width <= 520, `${w.id} width ${w.width}`)
    }
  })

  it('anchors every window inside the viewport', () => {
    for (const w of WINDOWS) {
      assert.ok(w.anchor.x >= 0 && w.anchor.x < 0.95, `${w.id} x anchor`)
      assert.ok(w.anchor.y >= 0 && w.anchor.y < 0.9, `${w.id} y anchor`)
      // A window anchored at the far right must still fit beside its width.
      const p = windowPosition(w, undefined, { w: 1280, h: 720 })
      assert.ok(p.x + 120 < 1280, `${w.id} opens off the right edge at 1280 wide`)
    }
  })
})

describe('the HUD keeps what you cannot afford to miss', () => {
  const hud = (p: string) => readFileSync(p, 'utf8')

  it('never hides the status bar or a hazard behind a button', () => {
    const src = hud('src/ui/Hud.tsx')
    // These are rendered unconditionally, not gated on a window being open.
    assert.match(src, /<StatusBar \/>/)
    assert.match(src, /s\.weather\.kind !== 'clear' && \(/)
    assert.match(src, /s\.radiation\.sepPhase && \(/)
  })

  it('shows the limiting consumable and the margin without opening anything', () => {
    const bar = hud('src/ui/hud/StatusBar.tsx')
    assert.match(bar, /limiting/)
    assert.match(bar, /label="margin"/)
    assert.match(bar, /s\.ret\.marginMinutes/)
  })

  it('declares the dock button as a hoisted component', () => {
    // Defined inside the render function it got a new identity every render,
    // so React remounted every button twenty times a second and clicks were
    // intermittently swallowed by a detached node.
    const dock = hud('src/ui/hud/HudDock.tsx')
    assert.match(dock, /^function Btn\(/m)
    assert.doesNotMatch(dock, /const Btn = /)
  })
})
