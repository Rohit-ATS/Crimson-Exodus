/**
 * orbits.ts — Real heliocentric geometry for Earth and Mars, and real Mars timekeeping.
 *
 * Everything in this file is computed from published ephemeris approximations, not invented.
 * It drives two things the player can feel:
 *   1. The actual one-way light time to Earth right now (comms delay).
 *   2. The actual Mars season (solar longitude Ls) and local true solar time at Jezero,
 *      which set the sun angle, temperature and dust-storm likelihood.
 *
 * SOURCES
 *  - Keplerian elements and rates: E.M. Standish, "Keplerian Elements for Approximate
 *    Positions of the Major Planets", JPL Solar System Dynamics.
 *    https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *  - Mars timekeeping algorithm: Allison & McEwen (2000); implemented as in the
 *    NASA GSFC "Mars24" sunclock algorithm description.
 *    https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
 *
 * ACCURACY / UNCERTAINTY (stated honestly, surfaced in the app's Data Details panel)
 *  - Planet positions: good to roughly 0.001-0.01 AU over 1800-2050. The resulting
 *    one-way light time is therefore accurate to a few tenths of a second out of
 *    several hundred seconds, i.e. well under 1%.
 *  - This is a geometric straight-line light time. It is NOT an operational DSN
 *    link prediction: it ignores light-time iteration for the moving receiver,
 *    relativistic delay, and station scheduling.
 */

export const AU_KM = 149_597_870.7
export const C_KM_S = 299_792.458
const DEG = Math.PI / 180

/** Classical elements at J2000 plus per-century rates (Standish). */
interface Elements {
  a: number; aDot: number // semi-major axis, AU
  e: number; eDot: number // eccentricity
  I: number; IDot: number // inclination, deg
  L: number; LDot: number // mean longitude, deg
  wbar: number; wbarDot: number // longitude of perihelion, deg
  Om: number; OmDot: number // longitude of ascending node, deg
}

/** Earth/Moon barycenter. */
const EARTH: Elements = {
  a: 1.00000261, aDot: 0.00000562,
  e: 0.01671123, eDot: -0.00004392,
  I: -0.00001531, IDot: -0.01294668,
  L: 100.46457166, LDot: 35999.37244981,
  wbar: 102.93768193, wbarDot: 0.32327364,
  Om: 0.0, OmDot: 0.0,
}

const MARS: Elements = {
  a: 1.52371034, aDot: 0.00001847,
  e: 0.09339410, eDot: 0.00007882,
  I: 1.84969142, IDot: -0.00813131,
  L: -4.55343205, LDot: 19140.30268499,
  wbar: -23.94362959, wbarDot: 0.44441088,
  Om: 49.55953891, OmDot: -0.29257343,
}

export interface Vec3 { x: number; y: number; z: number }

const norm360 = (d: number) => ((d % 360) + 360) % 360

/** Julian Date (UT) from a JS Date. */
export function julianDate(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5
}

/**
 * TT - UTC in seconds. TAI-UTC has been 37 s since 2017 (no leap second added
 * since 2016-12-31), and TT = TAI + 32.184 s.
 */
const TT_MINUS_UTC = 69.184

/** Solve Kepler's equation M = E - e sin E by Newton iteration. */
function eccentricAnomaly(M: number, e: number): number {
  let E = M
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < 1e-12) break
  }
  return E
}

/** Heliocentric position in the J2000 ecliptic frame, in AU. */
function heliocentric(el: Elements, centuriesSinceJ2000: number): Vec3 {
  const T = centuriesSinceJ2000
  const a = el.a + el.aDot * T
  const e = el.e + el.eDot * T
  const I = (el.I + el.IDot * T) * DEG
  const L = el.L + el.LDot * T
  const wbar = el.wbar + el.wbarDot * T
  const Om = el.Om + el.OmDot * T

  const omega = (wbar - Om) * DEG // argument of perihelion
  const M = norm360(L - wbar) * DEG
  const E = eccentricAnomaly(M > Math.PI ? M - 2 * Math.PI : M, e)

  // Position in the orbital plane
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)

  const cw = Math.cos(omega), sw = Math.sin(omega)
  const cO = Math.cos(Om * DEG), sO = Math.sin(Om * DEG)
  const cI = Math.cos(I), sI = Math.sin(I)

  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp,
  }
}

export interface LinkGeometry {
  /** Earth-Mars straight-line distance, km. */
  distanceKm: number
  /** Same, in AU. */
  distanceAu: number
  /** One-way light time, seconds. */
  owltSec: number
  /** Round-trip light time, seconds. */
  rttSec: number
  /** Mars heliocentric distance, AU (drives solar irradiance). */
  marsSunAu: number
  /** Sun-Earth-Mars angle in degrees; small values mean solar conjunction. */
  sunEarthMarsDeg: number
  /** True when the Sun is close to the line of sight: real missions go quiet here. */
  nearConjunction: boolean
}

/** Real Earth-Mars link geometry for a given instant. */
export function linkGeometry(date: Date = new Date()): LinkGeometry {
  const jdTT = julianDate(date) + TT_MINUS_UTC / 86400
  const T = (jdTT - 2451545.0) / 36525

  const e = heliocentric(EARTH, T)
  const m = heliocentric(MARS, T)

  const dx = m.x - e.x, dy = m.y - e.y, dz = m.z - e.z
  const distanceAu = Math.hypot(dx, dy, dz)
  const distanceKm = distanceAu * AU_KM
  const owltSec = distanceKm / C_KM_S

  const marsSunAu = Math.hypot(m.x, m.y, m.z)
  const earthSunAu = Math.hypot(e.x, e.y, e.z)

  // Sun-Earth-Mars angle, by the law of cosines at Earth's vertex.
  const cosSEM =
    (earthSunAu * earthSunAu + distanceAu * distanceAu - marsSunAu * marsSunAu) /
    (2 * earthSunAu * distanceAu)
  const sunEarthMarsDeg = Math.acos(Math.max(-1, Math.min(1, cosSEM))) / DEG

  return {
    distanceKm,
    distanceAu,
    owltSec,
    rttSec: owltSec * 2,
    marsSunAu,
    sunEarthMarsDeg,
    // Deep Space Network operations suspend commanding inside a few degrees of
    // Sun-Earth-Probe angle; 3 deg is a commonly cited moratorium threshold.
    nearConjunction: sunEarthMarsDeg < 3,
  }
}

/** Solar irradiance at Mars, W/m^2. Solar constant 1361 W/m^2 at 1 AU, falls as 1/r^2. */
export function solarIrradiance(marsSunAu: number): number {
  return 1361 / (marsSunAu * marsSunAu)
}

export interface MarsClock {
  /** Mars Sol Date. */
  msd: number
  /** Coordinated Mars Time, hours 0-24 (prime meridian mean solar time). */
  mtcHours: number
  /** Local Mean Solar Time at the site, hours 0-24. */
  lmstHours: number
  /** Local True Solar Time at the site, hours 0-24 — this is what the sun actually does. */
  ltstHours: number
  /** Areocentric solar longitude, deg. 0 = northern spring equinox, 90 = N summer solstice. */
  solarLongitudeDeg: number
  /** Equation of time, in hours. */
  eotHours: number
  /** Solar declination on Mars, deg. */
  solarDeclinationDeg: number
  /** Sun elevation above the local horizon, deg. Negative is night. */
  sunElevationDeg: number
  /** Sun azimuth, deg clockwise from north. */
  sunAzimuthDeg: number
  /** Mission sol number at the site, counted from Perseverance landing. */
  siteSol: number
}

/** One Mars sol in Earth seconds: 24 h 39 m 35.244 s. */
export const SOL_SECONDS = 88775.244
/** Ratio of a sol to an Earth day. */
export const SOL_PER_DAY = 1.0274912517

/**
 * Mars24 algorithm. `eastLonDeg` is planetographic east longitude of the site.
 */
export function marsClock(date: Date, eastLonDeg: number, latDeg: number): MarsClock {
  const jdTT = julianDate(date) + TT_MINUS_UTC / 86400
  const dj = jdTT - 2451545.0

  // Mars mean anomaly and fictitious mean sun
  const M = (19.3871 + 0.52402073 * dj) * DEG
  const alphaFMS = 270.3871 + 0.524038496 * dj

  // Perturbers (Allison & McEwen table), degrees
  const pbsTerms: Array<[number, number, number]> = [
    [0.0071, 2.2353, 49.409],
    [0.0057, 2.7543, 168.173],
    [0.0039, 1.1177, 191.837],
    [0.0037, 15.7866, 21.736],
    [0.0021, 2.1354, 15.704],
    [0.0020, 2.4694, 95.528],
    [0.0018, 32.8493, 49.095],
  ]
  let pbs = 0
  for (const [A, tau, phi] of pbsTerms) {
    pbs += A * Math.cos(((0.985626 * dj) / tau + phi) * DEG)
  }

  // Equation of center
  const eoc =
    (10.691 + 3.0e-7 * dj) * Math.sin(M) +
    0.623 * Math.sin(2 * M) +
    0.050 * Math.sin(3 * M) +
    0.005 * Math.sin(4 * M) +
    0.0005 * Math.sin(5 * M) +
    pbs

  const Ls = norm360(alphaFMS + eoc)

  // Equation of time, degrees -> hours
  const eotDeg =
    2.861 * Math.sin(2 * Ls * DEG) -
    0.071 * Math.sin(4 * Ls * DEG) +
    0.002 * Math.sin(6 * Ls * DEG) -
    eoc
  const eotHours = eotDeg * (24 / 360)

  const msd = (dj - 4.5) / SOL_PER_DAY + 44796.0 - 0.00096
  const mtcHours = (msd * 24) % 24

  const westLon = norm360(-eastLonDeg)
  const lmstHours = ((mtcHours - westLon * (24 / 360)) % 24 + 24) % 24
  const ltstHours = ((lmstHours + eotHours) % 24 + 24) % 24

  // Solar declination: sin(dec) = sin(obliquity) * sin(Ls). Mars obliquity 25.19 deg.
  const obliquity = 25.19 * DEG
  const dec = Math.asin(Math.sin(obliquity) * Math.sin(Ls * DEG))

  // Hour angle: 0 at local true solar noon, +15 deg per hour after noon.
  const H = (ltstHours - 12) * 15 * DEG
  const lat = latDeg * DEG
  const sinEl =
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)))

  // Azimuth measured clockwise from north.
  const y = -Math.cos(dec) * Math.sin(H)
  const x = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H)
  const az = norm360(Math.atan2(y, x) / DEG)

  // Perseverance landed at Jezero on 2021-02-18 20:55 UTC, which falls on Mars
  // Sol Date ~52304.7. Mission sols are counted in LOCAL time at the landing
  // site and roll over at local midnight, so this simple difference is good to
  // about +/-1 sol. It is a display figure, nothing in the simulation depends
  // on it.
  const LANDING_MSD = 52304.0
  const siteSol = Math.floor(msd - LANDING_MSD)

  return {
    msd,
    mtcHours,
    lmstHours,
    ltstHours,
    solarLongitudeDeg: Ls,
    eotHours,
    solarDeclinationDeg: dec / DEG,
    sunElevationDeg: el / DEG,
    sunAzimuthDeg: az,
    siteSol,
  }
}

/** Format a decimal hour count as HH:MM:SS. */
export function formatHours(h: number): string {
  const total = Math.floor(((h % 24) + 24) % 24 * 3600)
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** Mars season name from solar longitude, for the northern hemisphere (Jezero is 18 N). */
export function seasonName(ls: number): string {
  if (ls < 90) return 'Northern Spring'
  if (ls < 180) return 'Northern Summer'
  if (ls < 270) return 'Northern Autumn'
  return 'Northern Winter'
}

/**
 * Mars' global dust storm season runs roughly Ls 180-360 (northern autumn/winter,
 * perihelion season). Returns a 0-1 climatological propensity factor.
 * Reference: Mars dust activity climatology, e.g. Montabone et al. (2015) dust
 * optical depth reanalysis. This is a smooth stand-in for that climatology.
 */
export function dustSeasonFactor(ls: number): number {
  // Peak near Ls 210-310, quiet near Ls 70-120.
  const phase = ((ls - 260) * DEG)
  return 0.5 + 0.5 * Math.cos(phase)
}

export interface SunTimes {
  /** Local true solar time of sunrise, hours. */
  sunriseLtst: number
  /** Local true solar time of sunset, hours. */
  sunsetLtst: number
  /** Length of daylight, hours of local solar time. */
  daylightHours: number
  /** Sun elevation at local solar noon, degrees. */
  noonElevationDeg: number
}

/**
 * Sunrise and sunset at the site for the current season, in local TRUE solar
 * time, from the standard hour-angle relation cos H0 = -tan(lat) tan(dec).
 * Mars has essentially no twilight refraction worth modelling at this precision,
 * and its obliquity (25.19 deg) is close enough to Earth's that the seasonal
 * swing in day length feels familiar.
 */
export function sunTimes(solarLongitudeDeg: number, latDeg: number): SunTimes {
  const obliquity = 25.19 * DEG
  const dec = Math.asin(Math.sin(obliquity) * Math.sin(solarLongitudeDeg * DEG))
  const lat = latDeg * DEG
  const cosH0 = -Math.tan(lat) * Math.tan(dec)
  if (cosH0 <= -1) {
    return { sunriseLtst: 0, sunsetLtst: 24, daylightHours: 24, noonElevationDeg: 90 - Math.abs((lat - dec) / DEG) }
  }
  if (cosH0 >= 1) {
    return { sunriseLtst: 12, sunsetLtst: 12, daylightHours: 0, noonElevationDeg: -1 }
  }
  const H0 = Math.acos(cosH0) / DEG // degrees
  const half = H0 / 15
  return {
    sunriseLtst: 12 - half,
    sunsetLtst: 12 + half,
    daylightHours: 2 * half,
    noonElevationDeg: 90 - Math.abs((lat - dec) / DEG),
  }
}

/**
 * How many Earth seconds from `now` until the site's local true solar time
 * reaches `targetLtst`. A Mars sol runs 2.75% longer than an Earth day, so local
 * solar hours are correspondingly longer in Earth time.
 */
export function secondsUntilLtst(now: Date, eastLonDeg: number, latDeg: number, targetLtst: number): number {
  const c = marsClock(now, eastLonDeg, latDeg)
  let delta = targetLtst - c.ltstHours
  if (delta < 0) delta += 24
  return delta * 3600 * SOL_PER_DAY
}
