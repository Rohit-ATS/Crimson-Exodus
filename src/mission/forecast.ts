/**
 * forecast.ts — Pre-walk consumables forecast for a route.
 *
 * Integrates the same life-support model the live EVA uses, along the same
 * sampled path, at the same local walking speeds, with the same station work
 * times. So the number the planner shows and the number the HUD shows during the
 * walk come from one model: if the plan says you finish with 34 minutes of
 * margin, the walk will agree unless something changes — and the thing that
 * changes is the weather.
 *
 * GAME MECHANIC, inheriting every caveat from `sim/consumables.ts`.
 */

import {
  JACK_SUIT, consume, freshConsumables, fractions, loadRates,
  type Consumables, type Fractions,
} from '../sim/consumables'
import { roughnessAt } from './terrain'
import type { SampledPoint } from './path'
import { STATIONS } from './site'

export interface Forecast {
  /** Total EVA duration, minutes. */
  totalMinutes: number
  walkMinutes: number
  workMinutes: number
  /** Consumables at the moment Jack reaches the lander again. */
  endFractions: Fractions
  /** Which consumable binds. */
  limiting: Fractions['limiting']
  /** Minutes of endurance left on arrival, at walking load. */
  spareMinutes: number
  /** Does the plan preserve the mandated reserve? */
  keepsReserve: boolean
  /** Smallest margin over the walk-home requirement at any point, minutes. */
  worstMarginMinutes: number
  /** Where that worst margin occurs, metres along the route. */
  worstAtM: number
  /** Peak distance from the lander, metres. */
  maxRangeM: number
  /** Energy expended, kJ, and the food-equivalent for scale. */
  metabolicKJ: number
  feasible: boolean
  verdict: string
}

export function forecastRoute(
  path: SampledPoint[],
  plannedStations: string[],
  env: { airTempC: number; irradiance: number },
): Forecast {
  let cons: Consumables = freshConsumables(JACK_SUIT)
  let walkSec = 0
  let workSec = 0
  let metabolicKJ = 0
  let worstMargin = Infinity
  let worstAt = 0
  let maxRange = 0

  // Which sample index each planned station is nearest to, so station work is
  // charged at the right point along the route.
  const stationAt = new Map<number, number>()
  for (const id of plannedStations) {
    const st = STATIONS.find((s) => s.id === id)
    if (!st) continue
    let best = 0, bestD = Infinity
    for (let i = 0; i < path.length; i++) {
      const d = (path[i].x - st.x) ** 2 + (path[i].z - st.z) ** 2
      if (d < bestD) { bestD = d; best = i }
    }
    stationAt.set(best, (stationAt.get(best) ?? 0) + st.workMinutes)
  }

  // Remaining time to walk home from each index, precomputed.
  const homeMin = new Float64Array(path.length)
  {
    let t = 0
    for (let i = path.length - 2; i >= 0; i--) {
      const a = path[i], b = path[i + 1]
      const seg = Math.hypot(b.x - a.x, b.z - a.z, b.h - a.h)
      t += seg / Math.max(0.1, a.speedMs)
      homeMin[i] = t / 60
    }
  }

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1]
    const seg = Math.hypot(b.x - a.x, b.z - a.z, b.h - a.h)
    const dtSec = seg / Math.max(0.1, a.speedMs)
    const activity = a.grade > 0.18 ? 'climb' : 'walk'

    const rates = loadRates(JACK_SUIT, {
      activity,
      speedMs: a.speedMs,
      grade: a.grade,
      roughness: a.roughness,
      airTempC: env.airTempC,
      irradiance: env.irradiance,
      dustFouling: cons.dustFouling,
    })
    cons = consume(cons, rates, dtSec / 3600, 0.004)
    walkSec += dtSec
    metabolicKJ += (rates.metabolicW * dtSec) / 1000

    // Station work charged here.
    const work = stationAt.get(i)
    if (work) {
      const wSec = work * 60
      const wRates = loadRates(JACK_SUIT, {
        activity: 'work',
        speedMs: 0,
        grade: 0,
        roughness: a.roughness,
        airTempC: env.airTempC,
        irradiance: env.irradiance,
        dustFouling: cons.dustFouling,
      })
      cons = consume(cons, wRates, wSec / 3600, 0.004)
      workSec += wSec
      metabolicKJ += (wRates.metabolicW * wSec) / 1000
    }

    maxRange = Math.max(maxRange, Math.hypot(a.x, a.z))

    // Margin check at this point.
    const f = fractions(JACK_SUIT, cons)
    const homeRates = loadRates(JACK_SUIT, {
      activity: 'walk', speedMs: 0.75, grade: 0.02, roughness: 1.15,
      airTempC: env.airTempC, irradiance: env.irradiance, dustFouling: cons.dustFouling,
    })
    const hours = Math.min(
      cons.o2Kg / homeRates.o2KgPerHour,
      (JACK_SUIT.scrubberKg - cons.co2AbsorbedKg) / homeRates.co2KgPerHour,
      cons.batteryWh / homeRates.electricalW,
      cons.waterKg / homeRates.waterKgPerHour,
    )
    const margin = hours * 60 - homeMin[i]
    if (margin < worstMargin) { worstMargin = margin; worstAt = a.s }
    if (f.limitingFraction <= 0) break
  }

  const endFractions = fractions(JACK_SUIT, cons)
  const endRates = loadRates(JACK_SUIT, {
    activity: 'walk', speedMs: 0.75, grade: 0, roughness: 1.1,
    airTempC: env.airTempC, irradiance: env.irradiance, dustFouling: cons.dustFouling,
  })
  const spareHours = Math.min(
    cons.o2Kg / endRates.o2KgPerHour,
    (JACK_SUIT.scrubberKg - cons.co2AbsorbedKg) / endRates.co2KgPerHour,
    cons.batteryWh / endRates.electricalW,
    cons.waterKg / endRates.waterKgPerHour,
  )
  const keepsReserve = endFractions.limitingFraction >= JACK_SUIT.reserveFraction
  const feasible = endFractions.limitingFraction > 0

  const verdict = !feasible
    ? 'NOT SURVIVABLE AS PLANNED. The suit runs dry before Jack gets home, in clear weather, with no contingency. Drop a station or take a shorter route.'
    : !keepsReserve
      ? `Completes, but finishes inside the mandated ${(JACK_SUIT.reserveFraction * 100).toFixed(0)}% reserve. That is a flight rule violation on a clear sol. One dust event and it becomes a rescue.`
      : worstMargin < 25
        ? 'Completes with the reserve intact, but the margin gets thin in the middle. Viable only if the weather holds.'
        : 'Comfortable. Reserve intact throughout, with enough margin to absorb a dust event and still walk home.'

  return {
    totalMinutes: (walkSec + workSec) / 60,
    walkMinutes: walkSec / 60,
    workMinutes: workSec / 60,
    endFractions,
    limiting: endFractions.limiting,
    spareMinutes: spareHours * 60,
    keepsReserve,
    worstMarginMinutes: worstMargin === Infinity ? 0 : worstMargin,
    worstAtM: worstAt,
    maxRangeM: maxRange,
    metabolicKJ,
    feasible,
    verdict,
  }
}

export { roughnessAt }
