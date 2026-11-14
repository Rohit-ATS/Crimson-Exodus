/**
 * weather.ts — Transient Mars weather events during the EVA.
 *
 * Two kinds of event, both real phenomena at Jezero:
 *
 *  1. DUST DEVIL — a convective vortex, metres to ~100 m wide, lasting minutes.
 *     Perseverance and Ingenuity observed these routinely at Jezero, strongest in
 *     the early afternoon. They lift dust, spike the wind and drop the pressure a
 *     few pascals as the core passes. Mostly a nuisance: optics and dust coating.
 *
 *  2. REGIONAL DUST STORM — hundreds of km across, lasting sols to weeks. Raises
 *     column optical depth from ~0.5 to 2-5, which collapses solar transmission,
 *     cuts visibility, and warms the mid-atmosphere. This is the event that ends
 *     an EVA: not because the wind can knock an astronaut down (it cannot, the air
 *     is far too thin) but because you lose visibility, lose power margin, and
 *     coat every seal and radiator in abrasive dust.
 *
 * SOURCES
 *  - Dust devil statistics at Jezero from Mars 2020 MEDA:
 *    https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/
 *  - Regional and global storm behaviour and optical depths:
 *    Montabone et al. (2015) dust climatology; NASA dust-storm explainers
 *    https://science.nasa.gov/mars/
 *
 * MODEL STATUS — event timing here is a deterministic pseudo-random schedule
 * seeded by the mission, weighted by the real seasonal dust climatology for the
 * current Ls. It is NOT a Mars weather forecast. The app says so on screen.
 */

import { dustSeasonFactor } from './orbits'

export type WeatherKind = 'clear' | 'dust-devil' | 'regional-storm'
export type StormPhase = 'watch' | 'approach' | 'onset' | 'peak' | 'clearing'

export interface WeatherEvent {
  kind: WeatherKind
  phase: StormPhase
  /** 0-1 intensity ramp for the current phase. */
  intensity: number
  /** Added column optical depth. */
  tau: number
  /** Multiplier applied to the background wind field. */
  windFactor: number
  /** Visual range in metres — what the astronaut can actually see. */
  visibilityM: number
  /** Minutes until this event's next phase change. */
  minutesToNextPhase: number
  headline: string
  detail: string
  /** True when mission rules say to stop traversing and shelter or return. */
  advisesShelter: boolean
  /** True when mission rules say abort the EVA and head for the lander. */
  advisesAbort: boolean
}

export const CLEAR: WeatherEvent = {
  kind: 'clear',
  phase: 'watch',
  intensity: 0,
  tau: 0,
  windFactor: 1,
  visibilityM: 20000,
  minutesToNextPhase: 0,
  headline: 'NOMINAL',
  detail: 'Background dust loading. No transient events within the local area.',
  advisesShelter: false,
  advisesAbort: false,
}

export interface ScheduledEvent {
  kind: Exclude<WeatherKind, 'clear'>
  /** EVA elapsed minutes at which the event begins to be detectable. */
  startMin: number
  /** Total duration in EVA minutes, across all phases. */
  durationMin: number
  /** Peak added optical depth. */
  peakTau: number
  /** Peak wind multiplier. */
  peakWind: number
  /** Bearing the system approaches from, deg clockwise from north. */
  fromDeg: number
}

/** Mulberry32 — small deterministic PRNG so a given mission seed always replays. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Build the weather schedule for one EVA.
 *
 * @param seed          mission seed
 * @param ls            current solar longitude, sets storm climatology
 * @param evaLengthMin  planned EVA duration in minutes
 * @param forceStorm    guarantee one regional storm (used by the guided demo)
 */
export function scheduleWeather(
  seed: number,
  ls: number,
  evaLengthMin: number,
  forceStorm = false,
): ScheduledEvent[] {
  const rand = rng(seed)
  const events: ScheduledEvent[] = []
  const season = dustSeasonFactor(ls) // 0-1

  // Regional storm probability over a single EVA, scaled by season. Real regional
  // storms are rare on any given sol; the demo setting raises this so the mechanic
  // is reachable in a 10-minute judging window.
  const stormChance = forceStorm ? 1 : 0.18 + 0.5 * season
  if (rand() < stormChance) {
    events.push({
      kind: 'regional-storm',
      // In a normal run it lands in the second half, after the player has
      // committed. In demo mode it arrives early enough to be seen inside a
      // ten-minute judging window.
      startMin: forceStorm
        ? evaLengthMin * (0.14 + 0.06 * rand())
        : evaLengthMin * (0.3 + 0.25 * rand()),
      durationMin: evaLengthMin * (0.55 + 0.3 * rand()),
      peakTau: forceStorm ? 3.4 + 2.2 * rand() : 1.4 + 2.8 * rand() * (0.5 + 0.5 * season),
      peakWind: 2.1 + 1.3 * rand(),
      fromDeg: rand() * 360,
    })
  }

  // Dust devils: a handful per EVA, biased to the convective afternoon.
  const devilCount = 1 + Math.floor(rand() * 4)
  for (let n = 0; n < devilCount; n++) {
    events.push({
      kind: 'dust-devil',
      startMin: rand() * evaLengthMin,
      durationMin: 2 + rand() * 6,
      peakTau: 0.25 + 0.5 * rand(),
      peakWind: 2.4 + 2.2 * rand(),
      fromDeg: rand() * 360,
    })
  }

  return events.sort((a, b) => a.startMin - b.startMin)
}

/** Piecewise phase envelope: approach ramp, flat peak, clearing decay. */
function envelope(t: number): { phase: StormPhase; intensity: number; frac: number } {
  // t is 0-1 across the whole event.
  if (t < 0.12) return { phase: 'approach', intensity: t / 0.12 * 0.35, frac: t / 0.12 }
  if (t < 0.32) return { phase: 'onset', intensity: 0.35 + ((t - 0.12) / 0.2) * 0.45, frac: (t - 0.12) / 0.2 }
  if (t < 0.68) return { phase: 'peak', intensity: 0.8 + ((t - 0.32) / 0.36) * 0.2, frac: (t - 0.32) / 0.36 }
  return { phase: 'clearing', intensity: Math.max(0, 1 - (t - 0.68) / 0.32), frac: (t - 0.68) / 0.32 }
}

/**
 * Evaluate the active weather at an EVA elapsed time.
 * A regional storm always wins over a dust devil if both are active.
 */
export function weatherAt(
  events: ScheduledEvent[],
  elapsedMin: number,
  baseTau: number,
): WeatherEvent {
  // A storm is "on the board" before it arrives — this is the watch window that
  // lets the player make a decision instead of being ambushed.
  const WATCH_LEAD_MIN = 14

  let active: WeatherEvent | null = null
  let watch: WeatherEvent | null = null

  for (const e of events) {
    const end = e.startMin + e.durationMin
    if (elapsedMin >= e.startMin && elapsedMin <= end) {
      const t = (elapsedMin - e.startMin) / e.durationMin
      const { phase, intensity } = envelope(t)
      const tau = e.peakTau * intensity
      const windFactor = 1 + (e.peakWind - 1) * intensity
      const totalTau = baseTau + tau

      // Visibility from Koschmieder's relation, v = 3.912 / k, where k is the
      // near-surface extinction coefficient.
      //
      // Mapping a COLUMN optical depth to a near-surface k needs care. In quiet
      // conditions the dust is well mixed through a scale height of order 10 km,
      // so even tau = 0.5 leaves tens of kilometres of visibility, which is what
      // rover panoramas show. During an active lifting event the dust is being
      // raised FROM the surface, so it is concentrated in the lowest kilometre
      // or two and the near-surface extinction is several times the well-mixed
      // value. That enhancement is what actually takes an astronaut's horizon
      // away, and it is why a storm is survivable but not navigable.
      const mixingDepth = 9000
      const liftEnhancement = 1 + 3.2 * intensity * (e.kind === 'regional-storm' ? 1 : 0.5)
      const extinction = Math.max(1e-6, (totalTau / mixingDepth) * liftEnhancement)
      const visibilityM = Math.min(20000, 3.912 / extinction)

      const nextBoundary = [0.12, 0.32, 0.68, 1.0].find((b) => b > t) ?? 1
      const minutesToNextPhase = (nextBoundary - t) * e.durationMin

      if (e.kind === 'regional-storm') {
        const headlines: Record<StormPhase, string> = {
          watch: 'DUST STORM WATCH',
          approach: 'DUST FRONT INBOUND',
          onset: 'DUST STORM ONSET',
          peak: 'DUST STORM PEAK',
          clearing: 'DUST STORM CLEARING',
        }
        const details: Record<StormPhase, string> = {
          watch: 'Regional dust system detected on the approach bearing.',
          approach:
            `Opacity rising. Front bearing ${Math.round(e.fromDeg)}°. Visibility falling. Decide now: push to the next station, shelter, or turn for the lander.`,
          onset:
            'Column opacity climbing fast. Solar input and visibility dropping. Traverse over open ground is no longer advised.',
          peak:
            'Peak opacity. Visibility minimal, suit power on battery, abrasive dust across every seal and radiator. Stay in shelter or complete the return.',
          clearing:
            'Opacity falling as the front passes. Visibility recovering. Reassess the return margin before moving.',
        }
        active = {
          kind: 'regional-storm',
          phase,
          intensity,
          tau,
          windFactor,
          visibilityM,
          minutesToNextPhase,
          headline: headlines[phase],
          detail: details[phase],
          advisesShelter: phase === 'onset' || phase === 'peak',
          advisesAbort: phase === 'onset' || phase === 'peak',
        }
        break // regional storm takes precedence
      }

      if (!active) {
        active = {
          kind: 'dust-devil',
          phase,
          intensity,
          tau,
          windFactor,
          visibilityM,
          minutesToNextPhase,
          headline: 'DUST DEVIL',
          detail:
            `Convective vortex passing, bearing ${Math.round(e.fromDeg)}°. Gusting and dust-lifting for a few minutes. Face away, shield the optics, keep walking if the margin allows.`,
          advisesShelter: false,
          advisesAbort: false,
        }
      }
    } else if (
      e.kind === 'regional-storm' &&
      elapsedMin < e.startMin &&
      elapsedMin >= e.startMin - WATCH_LEAD_MIN
    ) {
      watch = {
        ...CLEAR,
        kind: 'regional-storm',
        phase: 'watch',
        minutesToNextPhase: e.startMin - elapsedMin,
        headline: 'DUST STORM WATCH',
        detail:
          `Regional dust system tracked ${Math.round(e.startMin - elapsedMin)} min out on bearing ${Math.round(e.fromDeg)}°. Projected peak opacity τ ≈ ${(baseTau + e.peakTau).toFixed(1)}. Build return margin now.`,
        advisesShelter: false,
        advisesAbort: false,
      }
    }
  }

  return active ?? watch ?? CLEAR
}
