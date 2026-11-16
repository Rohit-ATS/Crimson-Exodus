/**
 * terrain.ts — The one authoritative height field for the mission area.
 *
 * Used by: the 3D surface mesh, the planning map's shaded relief, the elevation
 * profile, the slope/roughness inputs to the consumables model, and the hazard model.
 * One function, so the map and the walk can never disagree.
 *
 * ===========================================================================
 *  HONEST LABEL. This is a SYNTHETIC height field. It is shaped to match the
 *  published large-scale morphology of the Jezero western delta front — floor
 *  elevation, scarp height and orientation, an isolated outcrop remnant south
 *  of the delta, and a megarippled trough to the southwest — using figures from
 *  MOLA/HiRISE-derived products and the Mars 2020 landing-site literature.
 *
 *  It is NOT a NASA digital elevation model and it is NOT resampled from one.
 *  Metre-scale detail here is procedural. The app says this on the map, in the
 *  Data Details panel, and in the debrief. A real traverse plan would use a
 *  HiRISE stereo DTM (~1 m/post) and would still require rover or orbital
 *  hazard assessment at footpath scale.
 *
 *  Large-scale figures it is anchored to:
 *   - Jezero crater floor elevation about -2600 m relative to the areoid.
 *   - Western delta scarp relief of several tens of metres, front trending
 *     roughly N-S to NNE, stepping up to the west.
 *   - "Kodiak"-type isolated delta remnant butte, ~20 m of relief, standing
 *     south of the main delta front.
 *   - Seitah: olivine-bearing unit with extensive aeolian megaripples.
 *  Sources: NASA Mars Trek Jezero products https://trek.nasa.gov/mars/
 *           Mars 2020 landing site / Jezero geology
 *           https://science.nasa.gov/mission/mars-2020-perseverance/
 * ===========================================================================
 */

/** Half-extent of the playable area in metres. The map is 2*EXTENT on a side. */
export const EXTENT = 1200

/** Elevation of the lander pad relative to the MOLA areoid, metres. */
export const DATUM_ELEVATION_M = -2571

// ---------------------------------------------------------------------------
// Deterministic value noise with fBm. No dependencies, stable across reloads.
// ---------------------------------------------------------------------------

/**
 * Integer hash. Every multiply goes through Math.imul so it stays exact in
 * 32-bit space: a plain `*` here silently exceeds 2^53 for grid coordinates of
 * a few hundred, and the rounding destroys exactly the low bits the hash then
 * reads back, which turns the noise into a coherent radial starburst centred on
 * the origin. It looks like a lens flare baked into the landscape.
 */
function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = smooth(xf), v = smooth(yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function fbm(x: number, y: number, octaves: number, lacunarity = 2.03, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y
  for (let o = 0; o < octaves; o++) {
    sum += amp * (valueNoise(fx, fy) * 2 - 1)
    norm += amp
    amp *= gain
    fx *= lacunarity
    fy *= lacunarity
  }
  return sum / norm
}

/**
 * Ridged multifractal. Inverting and squaring the noise turns smooth hills into
 * sharp crests, which is what gives a cratered, wind-scoured basalt plain its
 * wrinkle ridges and ejecta texture. Plain fBm alone reads as rolling sand dunes
 * and looks nothing like Mars.
 */
function ridged(x: number, y: number, octaves: number): number {
  let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y, prev = 1
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(valueNoise(fx, fy) * 2 - 1)
    n *= n
    sum += n * amp * prev
    prev = n
    norm += amp
    amp *= 0.52
    fx *= 2.07
    fy *= 2.07
  }
  return sum / Math.max(1e-4, norm)
}

/** Smooth step helper. */
function sstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// Named morphological features, in local metres. +x is east, +z is north.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Impact craters
// ---------------------------------------------------------------------------

interface Crater { x: number; z: number; r: number; depthFrac: number; rimFrac: number }

/**
 * Impact craters are the defining texture of any Martian surface that has been
 * exposed for a while, and a plain without them reads as a sand dune field.
 * These are placed deterministically, sized on a power law (many small, few
 * large), and given a range of degradation states: a fresh crater is a deep bowl
 * with a sharp raised rim, an old one is a shallow dish with the rim nearly
 * erased. Jezero's floor is heavily cratered at this scale.
 *
 * Profile: a paraboloid bowl inside the rim, a raised rim crest at r = R, and an
 * ejecta blanket decaying outward roughly as (R/r)^3 — the standard idealised
 * simple-crater form.
 */
const CRATERS: Crater[] = (() => {
  const out: Crater[] = []
  const rand = (() => {
    let a = 0x9e3779b9 >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })()
  let guard = 0
  while (out.length < 46 && guard < 4000) {
    guard++
    const x = (rand() * 2 - 1) * 1450
    const z = (rand() * 2 - 1) * 1450
    // Power law: lots of small craters, a handful of big ones.
    const r = 9 + 170 * Math.pow(rand(), 3.1)
    // Keep the pad, the stations and the breach floor clear enough to walk.
    if (Math.hypot(x, z) < 110 + r) continue
    const clearOf: Array<[number, number, number]> = [
      [-392, -452, 55], [-770, -25, 60], [-455, -200, 55],
    ]
    if (clearOf.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r * 0.8)) continue
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < (c.r + r) * 0.82)) continue
    // Degradation state: fresh craters are deep and sharp, old ones are dishes.
    const fresh = rand()
    out.push({
      x, z, r,
      depthFrac: 0.055 + 0.15 * fresh,
      rimFrac: 0.012 + 0.042 * fresh,
    })
  }
  return out
})()

/**
 * Spatial index over the craters.
 *
 * ===========================================================================
 *  This is the hottest code in the project, and it is worth saying why.
 *
 *  `heightAt` is the one authoritative height field: the 3D mesh, the map,
 *  the elevation profile, the route cost model, the hazard raster, the ground
 *  litter and the rover's six wheel contacts all read it. While the player
 *  walks it is evaluated thousands of times a second. A CPU profile of the
 *  walking case put a third of all samples inside terrain evaluation, and
 *  `craterAt` alone was the single largest non-idle cost — larger than
 *  `heightAt` itself.
 *
 *  The reason was simple: it tested all 46 craters on every sample, with a
 *  `Math.hypot` each, when a given point is within reach of two or three.
 *
 *  So craters are bucketed into a coarse grid once, at module load. A lookup
 *  is one array index, and the loop runs over the handful that can possibly
 *  contribute. Rejection uses squared distance — `Math.hypot` is a slow call
 *  in V8 because it guards against overflow — and the true distance is only
 *  computed for craters that actually pass.
 *
 *  THE OUTPUT IS UNCHANGED. Exactly the same craters contribute exactly the
 *  same amount at every point; this only stops asking the other forty-odd.
 * ===========================================================================
 */
const CRATER_CELL = 256

/**
 * The grid is sized from the craters themselves, not from a guessed constant.
 *
 * Craters are placed out to 1450 m and the largest reaches 2.6 radii beyond
 * its centre, so influence extends past the 1200 m playable extent. A grid
 * that stopped short would silently drop those contributions outside its
 * bounds and leave a step in the ground at the edge of the index — the kind
 * of bug that never shows up where anybody is standing and corrupts the map
 * and the far horizon.
 */
const CRATER_BOUND = CRATERS.reduce(
  (m, c) => Math.max(m, Math.abs(c.x) + c.r * 2.6, Math.abs(c.z) + c.r * 2.6),
  0,
) + CRATER_CELL
const CRATER_ORIGIN = -CRATER_BOUND
const CRATER_GRID_N = Math.ceil((CRATER_BOUND * 2) / CRATER_CELL) + 1

/** Per-crater values that never change, hoisted out of the sample loop. */
interface CraterPrepared extends Crater {
  /** Square of the radius beyond which the crater contributes nothing. */
  reachSq: number
  depth: number
  rim: number
  invR: number
}

const CRATER_GRID: CraterPrepared[][] = (() => {
  const cells: CraterPrepared[][] = Array.from(
    { length: CRATER_GRID_N * CRATER_GRID_N }, () => [],
  )
  for (const c of CRATERS) {
    const reach = c.r * 2.6
    const prepared: CraterPrepared = {
      ...c,
      reachSq: reach * reach,
      depth: c.r * c.depthFrac,
      rim: c.r * c.rimFrac,
      invR: 1 / c.r,
    }
    // Add the crater to every cell its reach circle touches.
    const i0 = Math.max(0, Math.floor((c.x - reach - CRATER_ORIGIN) / CRATER_CELL))
    const i1 = Math.min(CRATER_GRID_N - 1, Math.floor((c.x + reach - CRATER_ORIGIN) / CRATER_CELL))
    const j0 = Math.max(0, Math.floor((c.z - reach - CRATER_ORIGIN) / CRATER_CELL))
    const j1 = Math.min(CRATER_GRID_N - 1, Math.floor((c.z + reach - CRATER_ORIGIN) / CRATER_CELL))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) cells[j * CRATER_GRID_N + i].push(prepared)
    }
  }
  return cells
})()

/** Craters that can possibly affect this point. Empty outside the field. */
function cratersNear(x: number, z: number): CraterPrepared[] {
  const i = Math.floor((x - CRATER_ORIGIN) / CRATER_CELL)
  const j = Math.floor((z - CRATER_ORIGIN) / CRATER_CELL)
  if (i < 0 || j < 0 || i >= CRATER_GRID_N || j >= CRATER_GRID_N) return EMPTY_CRATERS
  return CRATER_GRID[j * CRATER_GRID_N + i]
}

const EMPTY_CRATERS: CraterPrepared[] = []

function craterAt(x: number, z: number): number {
  let h = 0
  const near = cratersNear(x, z)
  for (let k = 0; k < near.length; k++) {
    const c = near[k]
    const dx = x - c.x
    const dz = z - c.z
    const dSq = dx * dx + dz * dz
    if (dSq > c.reachSq) continue
    const t = Math.sqrt(dSq) * c.invR
    if (t < 1) {
      // Paraboloid bowl, flattening into the rim crest.
      h += -c.depth * (1 - t * t) + c.rim * sstep(0.72, 1.0, t)
    } else {
      // Rim crest decaying into the ejecta blanket.
      const inv = 1 / t
      h += c.rim * (inv * inv * inv)
    }
  }
  return h
}

/** The delta scarp front: a line the traverse must either climb or walk around. */
const SCARP_X = -560          // scarp toe, metres west of the lander
const SCARP_TREND = 0.22      // tan of the trend angle; front leans NNE
const SCARP_RELIEF = 46       // metres of relief, top to toe
const SCARP_RUN = 135         // horizontal run of the scarp face

/** Kodiak-type isolated delta remnant, south of the main front. */
const KODIAK = { x: -460, z: -540, r: 100, h: 21 }

/** Second, smaller remnant butte. */
const NUKSHAK = { x: -230, z: 470, r: 72, h: 13 }

/**
 * An incised valley cutting through the delta front, centred on this northing.
 * Real deltas are breached by the channel that built them; at Jezero the inlet
 * is Neretva Vallis. The breach is the only gentle way up onto the delta top,
 * and it is what makes the long floor route viable against the direct climb.
 */
const BREACH_Z = -30
const BREACH_HALFWIDTH = 120

/**
 * A talus apron spilling off the north wall of the breach valley: the debris
 * cone shed by wall retreat, graded at a walkable angle. It is the only place a
 * suited crew member can get between the delta top and the valley floor without
 * a technical descent, which is exactly the kind of feature a traverse plan
 * lives or dies on.
 */
const RAMP = { cx: -715, cz: 72, rx: 108, rz: 98, lowZ: -22, lowH: 6, slope: 0.188 }

/**
 * Elevation above the lander datum, in metres, at local (x, z).
 * Positive is uphill from the pad.
 */
export function heightAt(x: number, z: number): number {
  let h = 0

  // --- Regional slope: the crater floor rises very gently toward the delta ---
  h += -x * 0.0045

  // --- Delta scarp ---------------------------------------------------------
  // Distance west of the scarp toe, corrected for the front's trend. A real
  // delta front is lobate, not a drawn line: the toe wanders by tens of metres
  // as individual lobes prograde different distances onto the floor.
  const toe = SCARP_X + z * SCARP_TREND
    + 62 * fbm(z / 310 + 11.3, 4.7, 3)
    + 19 * fbm(z / 88 + 3.1, 8.9, 2)
  const intoScarp = toe - x // positive once you are west of the toe

  // Inside the breach the front is cut down into a long, gentle ramp; outside it
  // the face is short and steep. Both end up at the same plateau height, so the
  // delta top is continuous and only the way up differs.
  const breach = sstep(BREACH_HALFWIDTH, BREACH_HALFWIDTH * 0.35, Math.abs(z - BREACH_Z))
  const faceRelief = SCARP_RELIEF * (1 - 0.65 * breach)
  const faceRun = SCARP_RUN * (1 + 2.8 * breach)
  const scarpRamp = sstep(0, faceRun, intoScarp)
  h += faceRelief * scarpRamp
  // Past the face, climb the remaining relief over a longer run so the plateau
  // height is the same whether you came up the breach or straight up the front.
  h += (SCARP_RELIEF - faceRelief) * sstep(faceRun, faceRun + 300, intoScarp)
  // The top of the delta keeps climbing gently, as a real fan surface does.
  h += 0.012 * Math.max(0, intoScarp - faceRun - 300)

  // Gullies incising the scarp face: a real delta front is not a smooth wall.
  const gully = Math.sin(z * 0.019) * Math.sin(z * 0.0071 + 1.2)
  h -= 2.0 * gully * gully * scarpRamp * (1 - scarpRamp) * 4

  // --- Isolated remnant buttes --------------------------------------------
  for (const b of [KODIAK, NUKSHAK]) {
    const d = Math.hypot(x - b.x, z - b.z) / b.r
    if (d < 1.35) {
      // Flat-topped with a steep talus flank, like a resistant capped remnant.
      const cap = 1 - sstep(0.5, 1.2, d)
      h += b.h * cap
      h += b.h * 0.2 * (1 - sstep(1.08, 1.4, d)) * (1 - cap)
    }
  }

  // --- Seitah-type megarippled trough on the crater floor ----------------
  // Placed EAST of the scarp toe: this unit is the basement the delta sits on,
  // so it has to be exposed on the floor, below the sediments, not on top of them.
  const seitah = sstep(300, 80, Math.hypot(x + 450, z + 200) - 165)
  // Aeolian megaripples: long-wavelength transverse bedforms, crest-to-crest
  // of order tens of metres, amplitude of order a metre.
  const rippleDir = (x * 0.78 + z * 0.62) / 26
  h += seitah * (1.15 * Math.sin(rippleDir) + 0.35 * Math.sin(rippleDir * 2.7 + 1.1))
  h -= seitah * 4.5 // the trough itself sits low

  // --- Impact craters -----------------------------------------------------
  h += craterAt(x, z)

  // --- Wrinkle ridges and ejecta texture ---------------------------------
  // Jezero's floor is a lava plain that has been cratered and then scoured, so
  // it carries both broad undulation and sharp, lineated crests.
  h += 9.0 * fbm(x / 540, z / 540, 5)
  h += 3.4 * (ridged(x / 205, z / 205, 4) - 0.42)
  h += 1.5 * fbm(x / 72, z / 72, 4)
  // Nothing below ~20 m goes in the height field. The planning map samples it at
  // about 5.7 m and the 3D mesh at 5.4 m, so finer terms alias into long moire
  // streaks that read as artefacts. Sub-metre texture is added where it belongs,
  // in the terrain shader's detail normals, which have no sampling grid.
  h += 0.55 * fbm(x / 26, z / 26, 3)

  // --- A barchan dune field on the floor, northeast of the pad -----------
  // Dark basaltic sand, transverse to the prevailing wind. Real barchan fields
  // are patchy: crescent-shaped dunes separated by swept bedrock, not an
  // infinite corrugation, so the crest amplitude is modulated along and across
  // the crest lines and the field edge is diffuse.
  {
    const dune = sstep(560, 130, Math.hypot(x - 430, z - 320))
    if (dune > 0.002) {
      const along = (x * 0.62 - z * 0.78) / 46
      const across = (x * 0.78 + z * 0.62) / 46
      // Patchiness: where this drops low the sand has been stripped to bedrock.
      const patch = Math.max(0, fbm(x / 165, z / 165, 3) * 1.5 + 0.35)
      const crestBreak = 0.55 + 0.75 * fbm(across / 2.4 + 7.7, along / 11 + 2.2, 3)
      // Asymmetric profile: a long windward slope, a short steep slip face.
      const phase = along - Math.floor(along)
      const prof = phase < 0.74 ? (phase / 0.74) : (1 - (phase - 0.74) / 0.26)
      h += dune * patch * crestBreak * (2.4 * prof - 0.9)
    }
  }

  // --- Talus ramp: blend toward a graded plane ----------------------------
  const dr = Math.hypot((x - RAMP.cx) / RAMP.rx, (z - RAMP.cz) / RAMP.rz)
  if (dr < 1.3) {
    const w = 1 - sstep(0.55, 1.3, dr)
    const hRamp = RAMP.lowH + (z - RAMP.lowZ) * RAMP.slope + 0.55 * fbm(x / 26, z / 26, 3)
    h = h * (1 - w) + hRamp * w
  }

  // --- Keep the landing pad flat and safe --------------------------------
  const padFlat = 1 - sstep(26, 95, Math.hypot(x, z))
  h *= 1 - padFlat
  h += padFlat * 0

  return h
}

/** Elevation relative to the Mars areoid, metres. */
export function elevationAreoid(x: number, z: number): number {
  return DATUM_ELEVATION_M + heightAt(x, z)
}

/** Surface normal, by central differences. */
export function normalAt(x: number, z: number, eps = 1.2): [number, number, number] {
  const hx = heightAt(x + eps, z) - heightAt(x - eps, z)
  const hz = heightAt(x, z + eps) - heightAt(x, z - eps)
  const nx = -hx / (2 * eps)
  const nz = -hz / (2 * eps)
  const len = Math.hypot(nx, 1, nz)
  return [nx / len, 1 / len, nz / len]
}

/** Slope magnitude in degrees. */
export function slopeDeg(x: number, z: number, eps = 2.5): number {
  const hx = (heightAt(x + eps, z) - heightAt(x - eps, z)) / (2 * eps)
  const hz = (heightAt(x, z + eps) - heightAt(x, z - eps)) / (2 * eps)
  return (Math.atan(Math.hypot(hx, hz)) * 180) / Math.PI
}

/**
 * Terrain roughness, 1 = smooth regolith, up to about 1.7 for blocky talus.
 * Derived from short-baseline height variance, which is what actually slows a
 * walker down: loose blocks, ripple crests and scree.
 */
export function roughnessAt(x: number, z: number, knownSlopeDeg?: number): number {
  const h0 = heightAt(x, z)
  let varSum = 0
  const samples: Array<[number, number]> = [
    [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5], [2.5, 2.5], [-2.5, -2.5],
  ]
  for (const [dx, dz] of samples) {
    const d = heightAt(x + dx, z + dz) - h0
    varSum += d * d
  }
  const rms = Math.sqrt(varSum / samples.length)
  // Talus on a steep face is rougher than the floor regardless of local variance.
  // Callers which already measured the local slope (for example, the live
  // hazard and consumables update) can pass it through and avoid four more
  // height-field evaluations.
  const slope = knownSlopeDeg ?? slopeDeg(x, z)
  const slopeBoost = sstep(10, 26, slope) * 0.3
  return Math.min(1.75, 1 + rms * 0.55 + slopeBoost)
}

/** Grade along a direction of travel, as a fraction (0.1 = 10%). */
export function gradeAlong(x: number, z: number, dirX: number, dirZ: number, step = 4): number {
  const len = Math.hypot(dirX, dirZ) || 1
  const ux = (dirX / len) * step, uz = (dirZ / len) * step
  return (heightAt(x + ux, z + uz) - heightAt(x, z)) / step
}

/**
 * Walking speed on this terrain, m/s.
 *
 * The slope term is Tobler's hiking function, the standard empirical
 * walking-speed-versus-slope relation used in GIS least-cost-path work:
 *   v = 6 exp(-3.5 |grade + 0.05|)  km/h
 * It peaks on a slight downhill, not on the flat, which is correct.
 * Here it is normalised so a level walk gives `baseMs`, then divided by the
 * local roughness.
 *
 * GAME MECHANIC for the absolute numbers: `baseMs` of about 0.9 m/s is a
 * plausible pace for a suited geologist carrying tools, but no Mars surface EVA
 * has ever been walked, so there is nothing to calibrate against.
 * Tobler, W. (1993), "Three presentations on geographical analysis and modeling".
 */
export function walkSpeed(baseMs: number, grade: number, roughness: number): number {
  const tobler = (g: number) => Math.exp(-3.5 * Math.abs(g + 0.05))
  const slopePenalty = tobler(grade) / tobler(0)
  return Math.max(0.1, (baseMs * slopePenalty) / roughness)
}
