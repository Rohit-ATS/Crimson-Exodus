import { useEffect } from 'react'
import { useStore } from './store'
import { marsAudio } from '../sim/audio'
import { live } from './live'

/**
 * Fixed-step simulation loop.
 *
 * The physics, the consumables and Jack's motion all advance in fixed 1/20 s
 * steps regardless of the display refresh rate, so a 144 Hz monitor
 * and a 60 Hz monitor produce the same mission. Frames are clamped so a
 * backgrounded tab cannot deliver one enormous step and teleport Jack across
 * the crater. The terrain and atmosphere models are intentionally detailed;
 * 20 Hz keeps their CPU cost off the renderer's every-frame budget.
 */
export function useSimLoop() {
  const phase = useStore((s) => s.phase)

  useEffect(() => {
    if (phase !== 'surface') return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const STEP = 1 / 20

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.25, (t - last) / 1000)
      last = t
      acc += dt
      let guard = 0
      const tick = useStore.getState().tick
      while (acc >= STEP && guard < 8) {
        tick(STEP)
        acc -= STEP
        guard++
      }
      if (acc > STEP * 8) acc = 0

      // The mix is driven by the same modelled numbers the HUD shows.
      const s = useStore.getState()
      if (s.phase === 'surface' && !s.paused) {
        marsAudio.update({
          densityKgM3: s.env.densityKgM3,
          speedOfSoundMs: s.env.speedOfSoundMs,
          windMs: s.env.windMs,
          gustMs: s.env.gustMs,
          dustTau: s.env.dustOpticalDepth,
          speedMs: s.speedMs,
          working: live.jack.working > 0,
          tool: live.jack.tool,
          electricalW: s.rates.electricalW,
          status: s.ret.status,
        }, dt)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase])
}
