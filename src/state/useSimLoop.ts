import { useEffect } from 'react'
import { useStore } from './store'
import { marsAudio } from '../sim/audio'
import { live } from './live'
import { useMerv } from './merv'
import { followTarget, stepRover } from '../sim/rover'
import { STATIONS } from '../mission/site'

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
        driveRover(STEP)
        acc -= STEP
        guard++
      }
      if (acc > STEP * 8) acc = 0

      // MERV's conversational layer runs on REAL time, not mission time: his
      // advisories are rate-limited so that compressing the clock thirty-fold
      // does not turn a companion into an alarm.
      useMerv.getState().tick(dt)

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

/**
 * Drive MERV one simulation step.
 *
 * This lives in the loop rather than in the mission store because it is purely
 * derived motion: nothing about the rover's position changes the mission, so it
 * has no business triggering a React update. It reads the store and writes the
 * live layer, the same contract Jack's own locomotion uses.
 *
 * The step is in EVA seconds, matching Jack. Both are in the same time frame,
 * so MERV keeps station at every compression setting instead of being left
 * behind the moment the player holds Shift.
 */
function driveRover(dtRealSec: number): void {
  const s = useStore.getState()
  if (s.phase !== 'surface' || s.paused) return
  const r = live.rover
  const j = live.jack

  const dtEva = dtRealSec * s.timeScale

  // Hold position whenever Jack is not travelling: during a procedure, while
  // sheltering, and while he is working a station. A rover that keeps nudging
  // for its stand-off distance while somebody is drilling is a nuisance.
  const hold = s.sheltering || !!s.proc || j.working > 0

  const t = followTarget(j.x, j.z, j.heading)
  stepRover(r, {
    targetX: t.x,
    targetZ: t.z,
    jackX: j.x,
    jackZ: j.z,
    hold,
    directIrradianceW: s.env.directIrradiance,
    tau: s.env.dustOpticalDepth,
    windMs: s.env.gustMs,
  }, dtEva)

  /**
   * Where the mast looks by default.
   *
   * Only set while MERV is not mid-sentence: an advisory points the mast at
   * whatever it is about — the up-sun horizon for a front, the sky for the
   * relay — and that aim must survive until he has finished saying it.
   */
  if (r.talking === 0 && r.listening === 0 && r.thinking === 0) {
    r.mastIntent = s.proc || s.nearStation ? 'station'
      : s.weather.kind !== 'clear' ? 'storm'
        : j.moving > 0.3 ? 'jack'
          : 'horizon'
  }
}

/** The outcrop the mast should aim at, if Jack is standing in a station. */
export function mastStation(stationId: string | null): [number, number] | null {
  if (!stationId) return null
  const st = STATIONS.find((x) => x.id === stationId)
  return st ? [st.x, st.z] : null
}
