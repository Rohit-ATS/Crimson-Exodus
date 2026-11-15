/**
 * AdaptiveQuality.tsx — Measure the machine, then stop asking it for things it
 * cannot do.
 *
 * This runs on an unknown laptop at a judging table. A fixed quality setting is
 * a gamble: pick it high and an integrated GPU renders a slideshow, pick it low
 * and a good machine shows a worse game than it could. So the renderer measures
 * its own frame time and moves between three tiers.
 *
 * The control law is deliberately boring, because a quality controller that
 * oscillates is worse than one that is simply wrong:
 *
 *  - It measures a MEDIAN over a window, not a mean. One 200 ms hitch from a
 *    shader compile or a GC pause must not trigger a downgrade.
 *  - It only acts on a full window of samples, so it cannot react to the first
 *    few frames of a scene that has not finished warming up.
 *  - Downgrades are quick (two bad windows) because a stuttering demo is the
 *    worst outcome. Upgrades are slow (five good windows) and stop permanently
 *    after the second attempt, so the renderer cannot ping-pong between tiers
 *    for the whole session.
 *  - The first window after any change is discarded, because changing the
 *    shadow map forces a reallocation that is not representative.
 *
 * Thresholds: downgrade above 22 ms median (below ~45 fps), upgrade below
 * 11 ms (above ~90 fps, i.e. clear headroom). The gap between them is the
 * hysteresis band and it is wide on purpose.
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { TIERS, renderTier, useSettings, type RenderTier } from '../state/settings'

const WINDOW = 90
const DOWN_MS = 22
const UP_MS = 11
const BAD_WINDOWS_TO_DROP = 2
const GOOD_WINDOWS_TO_RAISE = 5
const MAX_UPGRADES = 2

export default function AdaptiveQuality() {
  const { gl } = useThree()
  const quality = useSettings((s) => s.quality)
  const autoTier = useSettings((s) => s.autoTier)

  const samples = useRef<number[]>([])
  const bad = useRef(0)
  const good = useRef(0)
  const upgrades = useRef(0)
  const skipNext = useRef(true)
  const last = useRef(performance.now())

  // Keep the mutable mirror in step with whatever the settings resolve to.
  useEffect(() => {
    renderTier.current = useSettings.getState().tier()
    const want = Math.min(renderTier.current.dprMax, window.devicePixelRatio || 1)
    if (Math.abs(gl.getPixelRatio() - want) > 0.01) gl.setPixelRatio(want)
    skipNext.current = true
    samples.current.length = 0
  }, [quality, autoTier, gl])

  useFrame(() => {
    const now = performance.now()
    const dt = now - last.current
    last.current = now
    // Ignore absurd deltas: a backgrounded tab or a breakpoint is not a
    // statement about this machine's rendering speed.
    if (dt <= 0 || dt > 500) return

    const s = samples.current
    s.push(dt)
    if (s.length < WINDOW) return

    const sorted = [...s].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    s.length = 0

    useSettings.getState().setFrameMs(median)

    // Discard the first window after a change: a shadow-map reallocation and
    // the shader recompiles that follow it are not steady-state behaviour.
    if (skipNext.current) { skipNext.current = false; return }

    // A manual quality choice is a choice. Measure and report, but do not act.
    if (useSettings.getState().quality !== 'auto') return

    const tier = useSettings.getState().autoTier

    if (median > DOWN_MS) {
      good.current = 0
      bad.current++
      if (bad.current >= BAD_WINDOWS_TO_DROP && tier > 0) {
        bad.current = 0
        skipNext.current = true
        useSettings.getState().setAutoTier((tier - 1) as RenderTier)
      }
    } else if (median < UP_MS) {
      bad.current = 0
      good.current++
      if (
        good.current >= GOOD_WINDOWS_TO_RAISE &&
        tier < 2 &&
        upgrades.current < MAX_UPGRADES
      ) {
        good.current = 0
        upgrades.current++
        skipNext.current = true
        useSettings.getState().setAutoTier((tier + 1) as RenderTier)
      }
    } else {
      // In the band: let both counters decay rather than resetting hard, so a
      // machine sitting right on a threshold settles instead of flapping.
      bad.current = Math.max(0, bad.current - 1)
      good.current = Math.max(0, good.current - 1)
    }
  })

  return null
}

/** Start the renderer at the tier the settings already resolve to. */
export function initialTier(): RenderTier {
  const s = useSettings.getState()
  if (s.quality === 'high') return 2
  if (s.quality === 'balanced') return 1
  if (s.quality === 'performance') return 0
  return s.autoTier
}

export { TIERS }
