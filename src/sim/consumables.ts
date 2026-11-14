/**
 * consumables.ts — Portable life support model for Jack's suit.
 *
 * ===========================================================================
 *  THIS IS A GAME MECHANIC. It is physically reasoned but it is NOT a flight
 *  life-support model and it does not describe any real or planned suit.
 *  No certified Mars surface EVA suit exists. Numbers here are chosen so the
 *  consumption rates are of the right order for a human doing field geology,
 *  and so the player can reason about a return margin. The app shows this
 *  disclaimer wherever these numbers appear.
 * ===========================================================================
 *
 * The physical reasoning that *is* grounded:
 *  - Oxygen use follows metabolic rate: burning 1 litre of O2 releases about
 *    20.9 kJ, so O2 demand is metabolic power / 20.9 kJ per litre.
 *    (Standard indirect-calorimetry constant.)
 *  - CO2 production is O2 consumption times the respiratory quotient (~0.85
 *    on a mixed diet), and a scrubber bed has a finite CO2 capacity.
 *  - Walking metabolic cost rises with speed, with slope, and with suit mass,
 *    but Mars gravity is 0.379 g so the weight penalty is much smaller than on Earth.
 *  - Suit heating load rises as ambient temperature falls and as the dust
 *    column cuts the solar input, which is why a storm costs battery.
 *
 * Reference points for the reasoning, not for the exact figures:
 *  NASA EVA/spacesuit overview https://www.nasa.gov/humans-in-space/spacesuits/
 *  NASA Mars facts (gravity, temperature) https://science.nasa.gov/mars/facts/
 */

/** kJ of metabolic energy released per litre of O2 consumed. */
const KJ_PER_LITRE_O2 = 20.9
/** Grams per litre of O2 at STP. */
const G_PER_LITRE_O2 = 1.429
/** Respiratory quotient. */
const RQ = 0.85

export interface SuitSpec {
  /** Usable O2 in the primary tank, kg. */
  o2Kg: number
  /** CO2 the scrubber bed can absorb before breakthrough, kg. */
  scrubberKg: number
  /** Battery energy, Wh. */
  batteryWh: number
  /** Feedwater for sublimator cooling plus drinking water, kg. */
  waterKg: number
  /** Suit + PLSS mass, kg. */
  suitMassKg: number
  /** Crew member mass, kg. */
  crewMassKg: number
  /** Suit internal pressure, kPa. A low-pressure suit avoids a long prebreathe. */
  suitPressureKPa: number
  /** Steady suit leak rate, kg O2 per hour. */
  leakKgPerHour: number
  /** Fraction of each consumable that must remain untouched at lander arrival. */
  reserveFraction: number
}

/**
 * A short-duration surface EVA profile: a small portable life support unit sized
 * for roughly a four-hour excursion plus reserve, rather than an ISS-class
 * seven-hour EMU load. Early Mars surface operations are much likelier to look
 * like this than like a full-shift orbital EVA.
 */
export const JACK_SUIT: SuitSpec = {
  o2Kg: 0.62,
  scrubberKg: 0.46,
  batteryWh: 300,
  waterKg: 1.9,
  suitMassKg: 62,
  crewMassKg: 78,
  suitPressureKPa: 29.6, // ~4.3 psi, the pressure class used for EMU operations
  leakKgPerHour: 0.045,
  reserveFraction: 0.2,
}

export type Activity = 'idle' | 'walk' | 'climb' | 'work' | 'shelter'

/** Baseline metabolic power by activity, watts. */
const BASE_WATTS: Record<Activity, number> = {
  idle: 130,
  walk: 255,
  climb: 390,
  work: 330, // kneeling, coring, handling tools — field geology is not restful
  shelter: 150,
}

export interface LoadInputs {
  activity: Activity
  /** Ground speed, m/s. */
  speedMs: number
  /** Terrain grade along the direction of travel, as a fraction (0.1 = 10%). */
  grade: number
  /** Terrain roughness penalty, 1 = smooth regolith, up to ~1.6 for blocky talus. */
  roughness: number
  /** Ambient air temperature, degC. */
  airTempC: number
  /** Direct solar irradiance reaching the suit, W/m^2. */
  irradiance: number
  /** 0-1 dust coating on the radiator and visor. */
  dustFouling: number
  /** True when visibility is poor enough to need lamps and nav aids. */
  lowVisibility?: boolean
}

export interface LoadRates {
  /** Metabolic power, W. */
  metabolicW: number
  /** O2 draw, kg/h. */
  o2KgPerHour: number
  /** CO2 generated, kg/h. */
  co2KgPerHour: number
  /** Electrical load, W. */
  electricalW: number
  /** Water used for cooling and drinking, kg/h. */
  waterKgPerHour: number
  /** Heater share of the electrical load, W — the number a storm moves. */
  heaterW: number
}

export function loadRates(spec: SuitSpec, i: LoadInputs): LoadRates {
  // --- Metabolic -----------------------------------------------------------
  let metabolicW = BASE_WATTS[i.activity]

  if (i.activity === 'walk' || i.activity === 'climb') {
    const totalMassKg = spec.suitMassKg + spec.crewMassKg
    // Pandolf-style structure: level walking cost scales with mass and speed^2,
    // plus a grade term. Scaled to Mars gravity (0.379 g) for the weight-bearing part.
    const gRatio = 3.721 / 9.807
    const level = 2.0 * totalMassKg * gRatio * (0.2 + 1.15 * i.speedMs * i.speedMs)
    const slope = 0.33 * totalMassKg * gRatio * Math.max(0, i.grade) * i.speedMs * 100
    metabolicW = BASE_WATTS.idle + (level + slope) * i.roughness
    // A pressurised suit costs real work to bend; joint torque is a known penalty.
    metabolicW *= 1.22
  } else if (i.activity === 'work') {
    metabolicW *= i.roughness > 1.3 ? 1.12 : 1
  }

  metabolicW = Math.min(metabolicW, 700) // hard ceiling: nobody sustains more

  // --- Oxygen and CO2 ------------------------------------------------------
  const litresO2PerSec = metabolicW / (KJ_PER_LITRE_O2 * 1000)
  const o2MetabolicKgPerHour = (litresO2PerSec * G_PER_LITRE_O2 * 3600) / 1000
  const o2KgPerHour = o2MetabolicKgPerHour + spec.leakKgPerHour
  // CO2 mass = O2 moles consumed * RQ * 44/32
  const co2KgPerHour = o2MetabolicKgPerHour * RQ * (44 / 32)

  // --- Thermal and electrical ---------------------------------------------
  // Suit avionics, comms, pumps, fans, lights: a steady floor.
  const avionicsW = 105
  // Heating: the suit loses heat to a -60 degC environment by radiation and by
  // conduction through the boots. Metabolic heat offsets some of it. In the cold,
  // or when dust kills the solar gain, the heaters take up the difference.
  const deltaT = Math.max(0, -10 - i.airTempC)
  // ~4.2 W/K lumped loss: radiation from the suit shell to a cold sky, plus
  // conduction through the boots into regolith tens of degrees below the air.
  const radiativeLossW = 4.2 * deltaT
  const solarGainW = 0.22 * i.irradiance * (1 - 0.6 * i.dustFouling)
  const metabolicHeatW = metabolicW * 0.78 // most metabolic power ends up as heat
  const heaterW = Math.max(0, Math.min(420, radiativeLossW - solarGainW - metabolicHeatW * 0.45))
  // Low visibility means helmet lamps, nav aids and the hazard camera all come on.
  const lowVisW = i.lowVisibility ? 42 : 0
  const electricalW = avionicsW + heaterW + lowVisW

  // --- Water ---------------------------------------------------------------
  // Sublimator rejects surplus heat by evaporating feedwater: ~2.26 MJ/kg.
  const surplusHeatW = Math.max(0, metabolicHeatW + solarGainW - radiativeLossW)
  // A dust-coated radiator rejects heat less efficiently, so the sublimator
  // has to make up the difference out of feedwater.
  const coolingKgPerHour = ((surplusHeatW * 3600) / 2.26e6) * (1 + 0.5 * i.dustFouling)
  const drinkKgPerHour = 0.14
  const waterKgPerHour = coolingKgPerHour + drinkKgPerHour

  return { metabolicW, o2KgPerHour, co2KgPerHour, electricalW, waterKgPerHour, heaterW }
}

export interface Consumables {
  o2Kg: number
  co2AbsorbedKg: number
  batteryWh: number
  waterKg: number
  /** 0-1 dust coating accumulated on the suit. */
  dustFouling: number
}

export function freshConsumables(spec: SuitSpec): Consumables {
  return {
    o2Kg: spec.o2Kg,
    co2AbsorbedKg: 0,
    batteryWh: spec.batteryWh,
    waterKg: spec.waterKg,
    dustFouling: 0,
  }
}

/** Advance the consumables by `dtHours`. Returns a new object. */
export function consume(
  c: Consumables,
  rates: LoadRates,
  dtHours: number,
  dustRatePerHour: number,
): Consumables {
  return {
    o2Kg: Math.max(0, c.o2Kg - rates.o2KgPerHour * dtHours),
    co2AbsorbedKg: c.co2AbsorbedKg + rates.co2KgPerHour * dtHours,
    batteryWh: Math.max(0, c.batteryWh - (rates.electricalW * dtHours)),
    waterKg: Math.max(0, c.waterKg - rates.waterKgPerHour * dtHours),
    dustFouling: Math.min(1, c.dustFouling + dustRatePerHour * dtHours),
  }
}

export interface Fractions {
  o2: number
  scrubber: number
  battery: number
  water: number
  /** The binding constraint: the smallest of the four. */
  limiting: 'o2' | 'scrubber' | 'battery' | 'water'
  limitingFraction: number
}

export function fractions(spec: SuitSpec, c: Consumables): Fractions {
  const f = {
    o2: c.o2Kg / spec.o2Kg,
    scrubber: 1 - c.co2AbsorbedKg / spec.scrubberKg,
    battery: c.batteryWh / spec.batteryWh,
    water: c.waterKg / spec.waterKg,
  }
  let limiting: Fractions['limiting'] = 'o2'
  let limitingFraction = f.o2
  for (const k of ['scrubber', 'battery', 'water'] as const) {
    if (f[k] < limitingFraction) {
      limitingFraction = f[k]
      limiting = k
    }
  }
  return { ...f, limiting, limitingFraction: Math.max(0, limitingFraction) }
}

export interface ReturnEstimate {
  /** Minutes of walking to get home along the planned path. */
  walkMinutes: number
  /** Minutes of consumables the suit can still supply at the return workload. */
  enduranceMinutes: number
  /** enduranceMinutes - walkMinutes. Negative means you are already late. */
  marginMinutes: number
  /** Margin expressed against the mandated reserve. */
  marginAfterReserveMinutes: number
  /** Traffic-light state for the HUD. */
  status: 'nominal' | 'caution' | 'warning' | 'critical'
  /** Which consumable will run out first on the way home. */
  limiting: Fractions['limiting']
}

/**
 * How long can Jack keep going, and is that enough to get back?
 *
 * `returnDistanceM` is the remaining path length to the lander, which the route
 * system supplies — not a straight line, because the route is the whole point.
 */
export function returnEstimate(
  spec: SuitSpec,
  c: Consumables,
  returnDistanceM: number,
  returnSpeedMs: number,
  returnRates: LoadRates,
): ReturnEstimate {
  const walkMinutes = returnDistanceM / Math.max(0.1, returnSpeedMs) / 60

  const hoursO2 = c.o2Kg / Math.max(1e-6, returnRates.o2KgPerHour)
  const hoursScrub =
    (spec.scrubberKg - c.co2AbsorbedKg) / Math.max(1e-6, returnRates.co2KgPerHour)
  const hoursBatt = c.batteryWh / Math.max(1e-6, returnRates.electricalW)
  const hoursWater = c.waterKg / Math.max(1e-6, returnRates.waterKgPerHour)

  const candidates: Array<[Fractions['limiting'], number]> = [
    ['o2', hoursO2],
    ['scrubber', hoursScrub],
    ['battery', hoursBatt],
    ['water', hoursWater],
  ]
  candidates.sort((a, b) => a[1] - b[1])
  const [limiting, hours] = candidates[0]

  const enduranceMinutes = hours * 60
  const marginMinutes = enduranceMinutes - walkMinutes
  const reserveMinutes = enduranceMinutes * spec.reserveFraction
  const marginAfterReserveMinutes = marginMinutes - reserveMinutes

  let status: ReturnEstimate['status'] = 'nominal'
  if (marginAfterReserveMinutes < 0) status = 'caution'
  if (marginMinutes < 10) status = 'warning'
  if (marginMinutes <= 0) status = 'critical'

  return {
    walkMinutes,
    enduranceMinutes,
    marginMinutes,
    marginAfterReserveMinutes,
    status,
    limiting,
  }
}

/** Pretty label for a consumable key. */
export const CONSUMABLE_LABEL: Record<Fractions['limiting'], string> = {
  o2: 'OXYGEN',
  scrubber: 'CO₂ SCRUBBER',
  battery: 'BATTERY',
  water: 'FEEDWATER',
}
