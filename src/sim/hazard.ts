/**
 * hazard.ts — Planning cues, not safety certification.
 *
 * ===========================================================================
 *  READ THIS. Everything this module produces is a PLANNING CUE derived from a
 *  SYNTHETIC height field. The orbital products this project cites are 25 cm/px
 *  at their very best (HiRISE) and 463 m/px for the global elevation grid (MOLA).
 *  Nothing at those scales can certify that a human can safely place a boot on a
 *  given square metre of Mars. The hazard shading in this app exists to make the
 *  player reason about terrain, exposure and shelter. It is not a walkability map.
 * ===========================================================================
 *
 * The cues combine four things an EVA planner genuinely cares about:
 *   1. Slope          — steep ground is slow, tiring, and a fall risk in a suit.
 *   2. Roughness      — blocky talus and loose megaripples cost time and footing.
 *   3. Exposure       — how far you are from anything that breaks the wind-borne dust.
 *   4. Return cost    — how expensive it is to get home from here, right now.
 */

import { roughnessAt, slopeDeg } from '../mission/terrain'
import { SHELTERS, type Shelter } from '../mission/site'
import type { WeatherEvent } from './weather'

export interface HazardSample {
  /** 0-1 composite planning-cue score. Higher is worse. */
  score: number
  slope: number
  roughness: number
  /** 0-1, 1 = fully in the open. */
  exposure: number
  /** 0-1 protection from the best nearby shelter. */
  protection: number
  nearestShelter: Shelter | null
  nearestShelterDistM: number
}

/**
 * How much protection the terrain and the shelter list give at this point,
 * for a dust front arriving on `fromDeg`.
 */
export function protectionAt(x: number, z: number, fromDeg: number): {
  protection: number
  shelter: Shelter | null
  distM: number
} {
  let best: Shelter | null = null
  let bestProt = 0
  let bestDist = Infinity

  for (const s of SHELTERS) {
    const dist = Math.hypot(x - s.x, z - s.z)
    if (dist < bestDist) bestDist = dist
    if (dist > s.radius * 1.9) continue
    // Falls off from the centre of the sheltered pocket.
    const falloff = Math.max(0, 1 - Math.max(0, dist - s.radius * 0.45) / (s.radius * 1.45))
    // A shelter works best when it is between you and the front.
    const bearingToShelter = (Math.atan2(s.x - x, s.z - z) * 180) / Math.PI
    const delta = Math.abs(((bearingToShelter - fromDeg + 540) % 360) - 180)
    // delta 0 means the shelter lies on the upwind bearing: ideal.
    const aspect = 0.55 + 0.45 * Math.cos((delta * Math.PI) / 180)
    const prot = s.effectiveness * falloff * aspect
    if (prot > bestProt) {
      bestProt = prot
      best = s
    }
  }
  return { protection: Math.max(0, Math.min(1, bestProt)), shelter: best, distM: bestDist }
}

/** Composite planning-cue hazard at a point. */
export function hazardAt(
  x: number,
  z: number,
  weather: WeatherEvent,
  fromDeg: number,
  terrain?: { slope: number; roughness: number },
): HazardSample {
  const sl = terrain?.slope ?? slopeDeg(x, z)
  const rough = terrain?.roughness ?? roughnessAt(x, z, sl)
  const { protection, shelter, distM } = protectionAt(x, z, fromDeg)

  // Slope term: negligible below 8 deg, serious by 25 deg.
  const slopeTerm = Math.min(1, Math.max(0, (sl - 7) / 20))
  // Roughness term.
  const roughTerm = Math.min(1, Math.max(0, (rough - 1.05) / 0.6))
  // Exposure matters only when something is blowing.
  const exposure = 1 - protection
  const weatherWeight = Math.min(1, weather.tau / 1.6)
  const exposureTerm = exposure * weatherWeight

  // Range from the lander: being 1.2 km out is itself a hazard in a storm.
  const range = Math.hypot(x, z)
  const rangeTerm = Math.min(1, range / 1100) * (0.25 + 0.75 * weatherWeight)

  const score = Math.min(
    1,
    0.34 * slopeTerm + 0.2 * roughTerm + 0.28 * exposureTerm + 0.18 * rangeTerm,
  )

  return {
    score,
    slope: sl,
    roughness: rough,
    exposure,
    protection,
    nearestShelter: shelter,
    nearestShelterDistM: distM,
  }
}

/**
 * Rasterise the hazard field for the map overlay.
 * Returns row-major `res*res` scores covering [-extent, extent] in both axes.
 */
export function hazardField(
  res: number,
  extent: number,
  weather: WeatherEvent,
  fromDeg: number,
): Float32Array {
  const out = new Float32Array(res * res)
  for (let j = 0; j < res; j++) {
    // Row 0 is north (max z) so the raster matches a map with north up.
    const z = extent - (2 * extent * j) / (res - 1)
    for (let i = 0; i < res; i++) {
      const x = -extent + (2 * extent * i) / (res - 1)
      out[j * res + i] = hazardAt(x, z, weather, fromDeg).score
    }
  }
  return out
}

export interface ShelterAdvice {
  /** The shelter the model recommends heading for. */
  shelter: Shelter
  distanceM: number
  /** Estimated walking minutes to reach it. */
  minutes: number
  /** Protection it would give against the current front. */
  protection: number
  /** True when the lander is the recommendation, i.e. abort the EVA. */
  isAbort: boolean
  rationale: string
}

/**
 * The project's walk-back rule, in one place.
 *
 * Margin is already endurance minus the walk home, so "thin" is not a fraction
 * of the margin — it is a fraction of the walk, plus an absolute floor. Below
 * either, sheltering stops being an option and the only correct answer is to
 * start walking.
 *
 * Exported because the rover companion gives the player the same advice out
 * loud, and two thresholds for the same rule would eventually disagree with
 * each other in front of somebody making a decision.
 */
export function marginIsThin(marginMinutes: number, homeMinutes: number): boolean {
  return marginMinutes < homeMinutes * 0.45 || marginMinutes < 18
}

/**
 * Where should Jack go right now?
 *
 * The rule the model follows, and states to the player:
 *   - If the return margin is already thin, the answer is always the lander.
 *     Sheltering burns consumables you need to walk home on.
 *   - Otherwise prefer the nearest effective shelter that is closer than home,
 *     wait the front out, then re-plan.
 */
export function shelterAdvice(
  x: number,
  z: number,
  fromDeg: number,
  homeMinutes: number,
  marginMinutes: number,
  walkSpeedMs: number,
  /** True when the threat is a regional storm rather than a passing dust devil. */
  regional = false,
): ShelterAdvice | null {
  const lander = SHELTERS.find((s) => s.id === 'lander')!

  const candidates = SHELTERS.map((s) => {
    const distanceM = Math.hypot(x - s.x, z - s.z)
    const minutes = distanceM / Math.max(0.2, walkSpeedMs) / 60
    const { protection } = protectionAt(s.x, s.z, fromDeg)
    return { shelter: s, distanceM, minutes, protection: Math.max(protection, s.effectiveness * 0.9) }
  }).sort((a, b) => a.minutes - b.minutes)

  // Thin margin: sheltering is a luxury. Go home.
  if (marginIsThin(marginMinutes, homeMinutes)) {
    const home = candidates.find((c) => c.shelter.id === 'lander')!
    return {
      ...home,
      shelter: lander,
      minutes: homeMinutes,
      isAbort: true,
      rationale:
        `Return margin is ${marginMinutes.toFixed(0)} min against a ${homeMinutes.toFixed(0)} min walk home. Sheltering spends the consumables you need for that walk. Abort to the lander now — you can repeat the EVA on the next sol, you cannot repeat the suit.`,
    }
  }

  // A boulder cluster will see you through a dust devil. It will not see you
  // through a regional storm, and recommending it for one would contradict the
  // shelter's own description. Raise the bar when the front is regional.
  const minProtection = regional ? 0.55 : 0.35
  const useful = candidates.find((c) => c.protection > minProtection && c.minutes < homeMinutes * 0.8)
  if (useful) {
    return {
      ...useful,
      isAbort: useful.shelter.id === 'lander',
      rationale:
        `${useful.shelter.name} is ${useful.distanceM.toFixed(0)} m out, about ${useful.minutes.toFixed(0)} min, and removes roughly ${(useful.protection * 100).toFixed(0)}% of the exposure. ${useful.shelter.why} Margin is ${marginMinutes.toFixed(0)} min, enough to wait the front out and still walk home.`,
    }
  }

  const home = candidates.find((c) => c.shelter.id === 'lander')!
  return {
    ...home,
    shelter: lander,
    minutes: homeMinutes,
    isAbort: true,
    rationale: regional
      ? 'No shelter within reach gives enough cover for a regional storm on this bearing. Partial cover is for waiting out a dust devil, not a front that lasts hours. The lander is the only position that actually protects the crew. Turn for home.'
      : 'No effective shelter within reach on this bearing. The lander is the only position that actually protects the crew. Turn for home.',
  }
}
