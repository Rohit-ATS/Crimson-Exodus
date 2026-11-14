/**
 * mars.ts — Mars surface environment model.
 *
 * Gives pressure, temperature, density, wind and dust loading at the mission site
 * as a function of real Mars season (Ls) and real local true solar time, both of
 * which come from `orbits.ts`. These feed the HUD readouts, the sky and dust in the
 * 3D scene, and the hazard model.
 *
 * SOURCES
 *  - Atmospheric composition, mean surface pressure, temperature range, gravity:
 *    NASA Mars facts. https://science.nasa.gov/mars/facts/
 *  - Mars Climate Database / Viking-Curiosity-InSight pressure records establish the
 *    seasonal CO2 condensation cycle with maxima near Ls 60 and Ls 260 and the
 *    diurnal thermal tide. See also Mars 2020 MEDA first-results papers for Jezero
 *    pressure, air/ground temperature and wind statistics:
 *    https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/
 *  - Dust optical depth climatology: Montabone et al. (2015), Icarus.
 *
 * MODEL STATUS — read this before trusting a number.
 *  This is a PARAMETERIZED CLIMATOLOGY, not a forecast and not a measurement
 *  playback. Values are tuned so that the seasonal and diurnal ranges match
 *  published Jezero observations, but any single instant is an illustrative
 *  model output. The app labels these readouts as MODEL, never as live telemetry.
 */

const DEG = Math.PI / 180

/** Mars atmospheric composition, volume mixing ratio. NASA Mars facts. */
export const ATMOSPHERE_COMPOSITION = [
  { species: 'CO₂', symbol: 'CO2', percent: 95.1 },
  { species: 'Nitrogen', symbol: 'N2', percent: 2.59 },
  { species: 'Argon', symbol: 'Ar', percent: 1.94 },
  { species: 'Oxygen', symbol: 'O2', percent: 0.16 },
  { species: 'Carbon monoxide', symbol: 'CO', percent: 0.06 },
] as const

/** Surface gravity, m/s^2. */
export const MARS_G = 3.721
/** Earth surface gravity for comparison, m/s^2. */
export const EARTH_G = 9.807
/** Mean molar mass of the Mars atmosphere, kg/mol (CO2-dominated). */
export const MARS_MOLAR_MASS = 0.04334
/** Universal gas constant, J/(mol K). */
export const R_UNIVERSAL = 8.31446
/** Specific gas constant for the Mars mixture, J/(kg K). */
export const MARS_R_SPECIFIC = R_UNIVERSAL / MARS_MOLAR_MASS // ~191.8
/** Ratio of specific heats for CO2. */
export const MARS_GAMMA = 1.289

/** Reference pressure at the MOLA areoid (zero elevation), Pa. */
const P_AREOID = 610

export interface Environment {
  /** Ambient pressure, Pa. */
  pressurePa: number
  /** Same, in millibars, the unit mission reports usually use. */
  pressureMbar: number
  /** Air temperature at ~1.5 m, K. */
  airTempK: number
  /** Air temperature, degC. */
  airTempC: number
  /** Ground (regolith surface) temperature, degC — can be much warmer than the air. */
  groundTempC: number
  /** Atmospheric density, kg/m^3. */
  densityKgM3: number
  /** Speed of sound, m/s. */
  speedOfSoundMs: number
  /** Sustained wind speed, m/s. */
  windMs: number
  /** Peak gust, m/s. */
  gustMs: number
  /** Wind direction, deg from which it blows, clockwise from north. */
  windFromDeg: number
  /** Column dust optical depth at 880 nm. */
  dustOpticalDepth: number
  /** Fraction of top-of-atmosphere sunlight reaching the ground, 0-1. */
  solarTransmission: number
  /** Direct-beam irradiance on a surface normal to the Sun, W/m^2. */
  directIrradiance: number
  /** Partial pressure of O2 in the ambient air, Pa. Effectively nothing. */
  o2PartialPa: number
  /** Temperature at which water boils at this pressure, degC. */
  waterBoilingC: number
  /** Dynamic pressure of the wind, Pa — the force story for a storm. */
  windDynamicPa: number
  /** Equivalent Earth-air wind speed producing the same dynamic pressure, m/s. */
  windEarthEquivMs: number
  /**
   * Surface frost coverage, 0-1.
   *
   * Water frost forms on the Martian surface overnight and burns off within an
   * hour or two of sunrise. Viking 2 photographed it at its landing site, and
   * it has since been seen from orbit and at other latitudes — including, in
   * 2024, on the Tharsis volcanoes. It is a thin rime, microns thick, not snow.
   * Here it accumulates through the coldest hours and sublimates after dawn.
   */
  frost: number
  /**
   * True when the boundary layer is stably stratified — overnight, when the
   * ground has radiated its heat away and the air above it is warmer than the
   * surface. Turbulence collapses, dust settles, and what wind there is drains
   * downhill rather than convecting.
   */
  stableNight: boolean
}

function smoothNoise(seed: number): number {
  // Deterministic pseudo-noise in [-1, 1], continuous in `seed`.
  return (
    0.6 * Math.sin(seed * 1.37 + 0.7) +
    0.3 * Math.sin(seed * 3.11 + 2.3) +
    0.1 * Math.sin(seed * 7.57 + 5.1)
  )
}

export interface EnvInputs {
  /** Areocentric solar longitude, deg. */
  ls: number
  /** Local true solar time, hours. */
  ltst: number
  /** Site elevation relative to the areoid, m (negative = below datum). */
  elevationM: number
  /** Solar irradiance at the top of the Mars atmosphere, W/m^2. */
  toaIrradiance: number
  /** Sun elevation above the horizon, deg. */
  sunElevationDeg: number
  /** Additional dust optical depth contributed by an active storm event. */
  stormTau?: number
  /** Multiplier on wind from an active storm event. */
  stormWindFactor?: number
  /** Continuous clock in sols, used to vary the gust field smoothly. */
  solTime: number
}

/**
 * Surface environment at the site.
 */
export function environment(i: EnvInputs): Environment {
  const { ls, ltst, elevationM, toaIrradiance, sunElevationDeg, solTime } = i
  const stormTau = i.stormTau ?? 0
  const stormWindFactor = i.stormWindFactor ?? 1

  // --- Temperature ---------------------------------------------------------
  // Seasonal mean air temperature. Jezero (18.4 N) is warmest in northern summer
  // but perihelion falls in northern autumn, so the curve is asymmetric.
  // Jezero sits at 18.4 N. MEDA has reported air temperatures there spanning
  // roughly -90 degC before dawn to about -20 degC in the early afternoon, so the
  // annual mean sits near -52 degC with a seasonal swing of order 10 K.
  const seasonal =
    -52 + 9 * Math.sin((ls - 80) * DEG) + 4 * Math.sin((ls - 250) * DEG)

  // Diurnal cycle. Thin air means a huge swing and a fast response: coldest just
  // before dawn, warmest about an hour and a half after local noon.
  const diurnalPhase = (ltst - 13.5) * 15 * DEG
  const diurnalAmp = 32
  const airTempC = seasonal + diurnalAmp * Math.cos(diurnalPhase) +
    2.5 * smoothNoise(solTime * 9.3)

  // The regolith surface runs much hotter than the air by day because the thin
  // atmosphere couples poorly to the ground. MEDA saw ground-air splits of tens of K.
  const insolationFactor = Math.max(0, Math.sin(Math.max(0, sunElevationDeg) * DEG))
  const groundTempC = airTempC + 32 * insolationFactor - 6 * (1 - insolationFactor)

  const airTempK = airTempC + 273.15

  // --- Pressure ------------------------------------------------------------
  // Hydrostatic reduction to site elevation. The scale height depends on the
  // mean temperature of the whole atmospheric COLUMN, not on the 1.5 m air
  // temperature, so a 60 K diurnal swing at boot level must not move it. Mars
  // column-mean temperature is close to 210 K.
  const COLUMN_MEAN_K = 210
  const scaleHeight = (MARS_R_SPECIFIC * COLUMN_MEAN_K) / MARS_G // ~10.8 km
  const pStatic = P_AREOID * Math.exp(-elevationM / scaleHeight)

  // Seasonal CO2 condensation cycle: up to ~25% of the atmosphere freezes onto the
  // winter pole and returns. Two maxima per year, near Ls 60 and Ls 260.
  const seasonalPressure =
    1 + 0.085 * Math.cos((ls - 60) * DEG) + 0.055 * Math.cos((ls - 260) * DEG * 1.0)

  // Diurnal thermal tide, a few percent, minimum in the afternoon.
  const tide = 1 + 0.025 * Math.cos((ltst - 4) * 15 * DEG)

  // A dust storm raises the column mass over the site slightly.
  const stormPressure = 1 + 0.015 * Math.min(stormTau / 3, 1)

  const pressurePa = pStatic * seasonalPressure * tide * stormPressure

  // --- Density and acoustics ----------------------------------------------
  const densityKgM3 = pressurePa / (MARS_R_SPECIFIC * airTempK)
  const speedOfSoundMs = Math.sqrt(MARS_GAMMA * MARS_R_SPECIFIC * airTempK)

  // --- Wind ----------------------------------------------------------------
  // MEDA at Jezero: typically a few m/s, strongest in the early afternoon when the
  // convective boundary layer is deepest; dust devils are common then.
  const diurnalWind = 3.2 + 4.0 * Math.max(0, Math.cos((ltst - 14) * 13 * DEG))

  // Overnight the surface radiates to a cold sky, the boundary layer goes
  // stably stratified, and daytime convection shuts down. What is left is a
  // steady katabatic drainage flow running downslope — at Jezero, off the
  // crater rim and the delta, out across the floor. It is gentler than the
  // afternoon wind but it does not gust, and it blows from a fixed direction.
  const stableNight = ltst < 5.5 || ltst > 19.5
  const windMs = Math.max(
    0.3,
    (stableNight
      ? 2.1 + 0.8 * smoothNoise(solTime * 3.3)
      : diurnalWind + 1.6 * smoothNoise(solTime * 17.1)) * stormWindFactor,
  )
  // Gust factor: convective turbulence gives peaks well above the mean. A stable
  // nocturnal layer barely gusts at all.
  const gustMs = windMs * (stableNight
    ? 1.12 + 0.08 * (1 + smoothNoise(solTime * 9.1)) / 2
    : 1.5 + 0.45 * (1 + smoothNoise(solTime * 41.3)) / 2)
  // Drainage flow comes off the delta to the west; daytime wind wanders.
  const windFromDeg = stableNight
    ? (278 + 12 * smoothNoise(solTime * 1.7) + 360) % 360
    : (210 + 55 * smoothNoise(solTime * 2.3) + 360) % 360

  // --- Dust and light ------------------------------------------------------
  const backgroundTau = 0.45 + 0.2 * Math.sin((ls - 230) * DEG)
  const dustOpticalDepth = Math.max(0.1, backgroundTau + stormTau)

  // Beer-Lambert through a slant path. Airmass is capped for very low sun.
  const airmass = sunElevationDeg > 0
    ? Math.min(12, 1 / Math.max(0.08, Math.sin(sunElevationDeg * DEG)))
    : 12
  const solarTransmission = Math.exp(-dustOpticalDepth * airmass)
  const directIrradiance =
    sunElevationDeg > 0 ? toaIrradiance * solarTransmission * Math.sin(sunElevationDeg * DEG) : 0

  // --- Derived human-relevant numbers --------------------------------------
  const o2PartialPa = pressurePa * 0.0016

  // Boiling point of water at the ambient pressure, by inverting the Magnus
  // saturation-vapour-pressure formula (accurate to a few tenths of a kelvin in
  // this range, unlike a constant-latent-heat Clausius-Clapeyron fit).
  // es(T) = 610.94 * exp(17.625 T / (T + 243.04)), T in degC.
  const lnR = Math.log(Math.max(1, pressurePa) / 610.94)
  const waterBoilingC = (243.04 * lnR) / (17.625 - lnR)

  // Wind force. This is the number that explains why a 25 m/s Mars wind is not a
  // 25 m/s Earth wind: dynamic pressure scales with density, and Mars air is ~1% as dense.
  const windDynamicPa = 0.5 * densityKgM3 * gustMs * gustMs
  const windEarthEquivMs = Math.sqrt((2 * windDynamicPa) / 1.225)

  // --- Frost ---------------------------------------------------------------
  // Accumulates through the coldest hours and sublimates quickly once the sun
  // is on the ground. Needs a surface genuinely cold enough to hold it.
  const coldEnough = Math.max(0, Math.min(1, (-75 - groundTempC) / 18))
  const nightProgress = ltst < 7
    ? Math.max(0, Math.min(1, (7 - ltst) / 5))
    : ltst > 21 ? Math.min(1, (ltst - 21) / 3) : 0
  const burnOff = 1 - Math.max(0, Math.min(1, (sunElevationDeg - 2) / 12))
  const frost = Math.max(0, Math.min(1, coldEnough * nightProgress * burnOff))

  return {
    pressurePa,
    pressureMbar: pressurePa / 100,
    airTempK,
    airTempC,
    groundTempC,
    densityKgM3,
    speedOfSoundMs,
    windMs,
    gustMs,
    windFromDeg,
    dustOpticalDepth,
    solarTransmission,
    directIrradiance,
    o2PartialPa,
    waterBoilingC,
    windDynamicPa,
    windEarthEquivMs,
    frost,
    stableNight,
  }
}

/**
 * The Armstrong limit — the pressure below which water boils at body temperature,
 * about 6.3 kPa. Mars surface pressure is roughly one tenth of that, which is why
 * the suit is not optional. Used for the briefing copy, not for gameplay maths.
 */
export const ARMSTRONG_LIMIT_PA = 6300

/** How many times thinner the Mars column is than Earth sea level. */
export function thinnerThanEarth(pressurePa: number): number {
  return 101325 / pressurePa
}
