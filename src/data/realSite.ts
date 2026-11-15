/**
 * realSite.ts — Real NASA data for the Jezero landing area, at traverse scale.
 *
 * Everything in this file is measured, not modelled:
 *
 *  - ELEVATION: a 3.65 km x 2.49 km window cut from the USGS Mars 2020 Terrain
 *    Relative Navigation HiRISE DTM (Fergason et al. 2020, doi:10.5066/P9REJ9JN),
 *    1 m/post, block-averaged to 4 m posts and bundled with the app
 *    (public/data/jezero_hirise_dtm_4m.bin). This is the elevation model the
 *    Perseverance landing system itself carried.
 *  - IMAGERY: the HiRISE 25 cm controlled orthomosaic of Jezero and the CTX 6 m
 *    orthomosaic from the same USGS product set, served live as WMTS tiles by
 *    NASA Mars Trek.
 *  - SPECTRAL: the CRISM MTRDR carbonate browse product for observation
 *    FRT00005C5E (MRO, 19 May 2007), map-projected per its PDS label.
 *  - ROVER: Perseverance's localized waypoints (NASA/JPL-Caltech), and
 *    Mastcam-Z / WATSON images of the real outcrops.
 *
 * Coordinates are planetocentric, east-positive, on the Mars 2000 sphere.
 */

const BASE = import.meta.env.BASE_URL

export const MARS_R_M = 3396190

export interface DtmMeta {
  width: number
  height: number
  postM: number
  lonW: number
  lonE: number
  latN: number
  latS: number
  minM: number
  maxM: number
  citation: string
  source: string
}

export interface Dtm {
  meta: DtmMeta
  /** Elevation, metres, row-major north to south. NaN where no data. */
  z: Float32Array
  /** Ground distance between posts, metres. */
  dxM: number
  dyM: number
  /** Ground size of the window, metres. */
  widthM: number
  heightM: number
}

let dtmPromise: Promise<Dtm> | null = null

/** Load the bundled HiRISE DTM window once. */
export function loadDtm(): Promise<Dtm> {
  if (!dtmPromise) {
    dtmPromise = (async () => {
      const [metaRes, binRes] = await Promise.all([
        fetch(`${BASE}data/jezero_hirise_dtm_4m.json`),
        fetch(`${BASE}data/jezero_hirise_dtm_4m.bin`),
      ])
      if (!metaRes.ok || !binRes.ok) throw new Error('DTM not available')
      const meta = (await metaRes.json()) as DtmMeta
      const u = new Uint16Array(await binRes.arrayBuffer())
      const z = new Float32Array(u.length)
      for (let i = 0; i < u.length; i++) z[i] = u[i] === 0 ? NaN : u[i] / 10 - 3000
      const latMid = ((meta.latN + meta.latS) / 2) * (Math.PI / 180)
      const dxM = meta.postM * Math.cos(latMid)
      const dyM = meta.postM
      return { meta, z, dxM, dyM, widthM: meta.width * dxM, heightM: meta.height * dyM }
    })()
    dtmPromise.catch(() => { dtmPromise = null })
  }
  return dtmPromise
}

/** Fractional grid position of a lon/lat. */
export function lonLatToGrid(d: Dtm, lon: number, lat: number): [number, number] {
  const m = d.meta
  return [
    ((lon - m.lonW) / (m.lonE - m.lonW)) * m.width,
    ((m.latN - lat) / (m.latN - m.latS)) * m.height,
  ]
}

export function gridToLonLat(d: Dtm, gx: number, gy: number): [number, number] {
  const m = d.meta
  return [
    m.lonW + (gx / m.width) * (m.lonE - m.lonW),
    m.latN - (gy / m.height) * (m.latN - m.latS),
  ]
}

/** Bilinear elevation at a grid position. */
export function elevAt(d: Dtm, gx: number, gy: number): number {
  const { width: W, height: H } = d.meta
  const x = Math.max(0, Math.min(W - 1.001, gx - 0.5))
  const y = Math.max(0, Math.min(H - 1.001, gy - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const a = d.z[y0 * W + x0], b = d.z[y0 * W + x0 + 1]
  const c = d.z[(y0 + 1) * W + x0], e = d.z[(y0 + 1) * W + x0 + 1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy
}

/** Slope in degrees at an integer grid cell (central differences). */
export function slopeDegAt(d: Dtm, x: number, y: number): number {
  const { width: W, height: H } = d.meta
  const xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1)
  const yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1)
  const gx = (d.z[y * W + xr] - d.z[y * W + xl]) / ((xr - xl) * d.dxM)
  const gy = (d.z[yd * W + x] - d.z[yu * W + x]) / ((yd - yu) * d.dyM)
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI
}

/** Ground distance between two lon/lat points, metres (local flat approximation). */
export function groundDistM(a: [number, number], b: [number, number]): number {
  const lat = (((a[1] + b[1]) / 2) * Math.PI) / 180
  const dE = ((b[0] - a[0]) * Math.PI) / 180 * MARS_R_M * Math.cos(lat)
  const dN = ((b[1] - a[1]) * Math.PI) / 180 * MARS_R_M
  return Math.hypot(dE, dN)
}

// ---------------------------------------------------------------------------
// Real features
// ---------------------------------------------------------------------------

export interface RealFeature {
  id: string
  name: string
  lon: number
  lat: number
  /** Which game station is modelled on this feature, if any. */
  stationId?: string
  what: string
  /** Where the coordinate comes from. */
  locatedBy: string
}

export const REAL_FEATURES: RealFeature[] = [
  {
    id: 'landing',
    name: 'Octavia E. Butler Landing',
    lon: 77.45089,
    lat: 18.44463,
    what: 'Where Perseverance touched down on 18 February 2021. The lander position for this EVA.',
    locatedBy: 'Perseverance localized waypoint, sol 13 (NASA/JPL-Caltech)',
  },
  {
    id: 'seitah',
    name: 'Séítah (south overlook)',
    lon: 77.4413,
    lat: 18.4327,
    stationId: 'seitah',
    what: 'Olivine-rich igneous floor unit, cut into ridges and covered in ripples. Perseverance cored it in 2021.',
    locatedBy: 'Perseverance localized waypoint, sol 201',
  },
  {
    id: 'kodiak',
    name: 'Kodiak butte',
    lon: 77.40805,
    lat: 18.44025,
    stationId: 'kodiak',
    what: 'Isolated delta remnant, ~60 m of relief above the floor, showing inclined foreset beds under flat topsets.',
    locatedBy: 'Summit located in the HiRISE DTM; consistent with the published position 2.6 km west of the landing zone. Perseverance imaged it but never drove there.',
  },
  {
    id: 'hogwallow',
    name: 'Hogwallow Flats',
    lon: 77.4061,
    lat: 18.4587,
    stationId: 'flats',
    what: 'Fine-grained, sulfate-bearing sedimentary rock at the base of the delta front. Sampled in 2022.',
    locatedBy: 'Perseverance localized waypoints, sols 461–464',
  },
]

// ---------------------------------------------------------------------------
// Live imagery (NASA Mars Trek WMTS)
// ---------------------------------------------------------------------------

export interface TrekLayer {
  id: 'hirise' | 'ctx'
  layer: string
  name: string
  resolution: string
  zoom: number
  credit: string
}

export const TREK_JEZERO: TrekLayer[] = [
  {
    id: 'hirise',
    layer: 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
    name: 'HiRISE orthomosaic',
    resolution: '25 cm/pixel native (drawn here from Trek zoom 14, ~2.5 m/pixel)',
    zoom: 14,
    credit: 'NASA/JPL-Caltech/University of Arizona/USGS — MRO HiRISE, Jezero controlled mosaic (Fergason et al. 2020)',
  },
  {
    id: 'ctx',
    layer: 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0',
    name: 'CTX orthomosaic',
    resolution: '6 m/pixel',
    zoom: 13,
    credit: 'NASA/JPL-Caltech/MSSS/USGS — MRO Context Camera, Jezero controlled mosaic',
  },
]

export function trekTileUrl(layer: string, z: number, row: number, col: number): string {
  return `https://trek.nasa.gov/tiles/Mars/EQ/${layer}/1.0.0//default/default028mm/${z}/${row}/${col}.png`
}

/** Tile column/row containing a lon/lat at zoom z (Trek EQ: 2^(z+1) x 2^z tiles). */
export function trekTileIndex(z: number, lon: number, lat: number): [number, number] {
  return [Math.floor(((lon + 180) / 360) * 2 ** (z + 1)), Math.floor(((90 - lat) / 180) * 2 ** z)]
}

export function trekTileBounds(z: number, col: number, row: number) {
  const dDeg = 180 / 2 ** z
  return { lonW: -180 + col * dDeg, lonE: -180 + (col + 1) * dDeg, latN: 90 - row * dDeg, latS: 90 - (row + 1) * dDeg }
}

// ---------------------------------------------------------------------------
// CRISM spectral layer (bundled, PDS Geosciences has no CORS)
// ---------------------------------------------------------------------------

/** From the PDS label of FRT00005C5E_07_BRCARJ_MTR3 (IMAGE_MAP_PROJECTION). */
export const CRISM_CAR = {
  url: `${BASE}data/crism/frt00005c5e_car.png`,
  observation: 'FRT00005C5E',
  date: '2007-05-19',
  product: 'MTRDR browse product CAR (Mg-carbonate)',
  /** Pixels per degree of latitude. */
  res: 3291.7295604,
  centerLatDeg: 15,
  lineOffset: 61342.5333333,
  sampleOffset: -245713.3444444,
  width: 890,
  height: 891,
  legend:
    'Blueish- or yellowish-white colours often indicate carbonate; red/magenta may indicate Fe/Mg-phyllosilicate; blue likely indicates other hydrated minerals. Positive identification needs the spectra, not the browse colours. (PDS label text; Viviano-Beck et al. 2014.)',
  credit: 'NASA/JPL-Caltech/JHU-APL — MRO CRISM, via PDS Geosciences Node',
  pdsUrl: 'https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/2007/2007_139/frt00005c5e/',
}

/** Pixel (0-based, fractional) in the CRISM browse image for a lon/lat. */
export function crismPixel(lon: number, lat: number): [number, number] {
  const c = CRISM_CAR
  const k = Math.cos((c.centerLatDeg * Math.PI) / 180)
  return [lon * k * c.res + c.sampleOffset, c.lineOffset - lat * c.res]
}

// ---------------------------------------------------------------------------
// Perseverance traverse and imagery
// ---------------------------------------------------------------------------

export interface TraverseData {
  credit: string
  source: string
  segments: Array<Array<[number, number, number]>>
}

let traversePromise: Promise<TraverseData> | null = null
export function loadTraverse(): Promise<TraverseData> {
  if (!traversePromise) {
    traversePromise = fetch(`${BASE}data/m20_traverse_jezero_box.json`).then((r) => {
      if (!r.ok) throw new Error('traverse not available')
      return r.json()
    })
    traversePromise.catch(() => { traversePromise = null })
  }
  return traversePromise
}

export interface RoverImage {
  id: string
  file: string
  title: string
  instrument: string
  date: string
  credit: string
  /** Original NASA source of the bundled copy. */
  url: string
  caption: string
}

const PJ = 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia'

export const ROVER_IMAGES: Record<string, RoverImage[]> = {
  kodiak: [
    {
      id: 'PIA24802',
      file: `${BASE}nasa/PIA24802-kodiak.jpg`,
      title: 'Perseverance Captures Image of Kodiak',
      instrument: 'Mastcam-Z',
      date: '18 Apr 2021 (sol 57)',
      credit: 'NASA/JPL-Caltech/ASU/MSSS',
      url: 'https://science.nasa.gov/photojournal/perseverance-captures-image-of-kodiak/',
      caption: 'Mastcam-Z view of the real butte from the crater floor. Look for the relationship between the lower and upper beds: that is the observation this station asks you to make.',
    },
    {
      id: 'PIA24814',
      file: `${BASE}nasa/PIA24814-kodiak-hirise.jpg`,
      title: "Jezero Crater's Kodiak and Scarps",
      instrument: 'HiRISE (MRO)',
      date: 'Orbital',
      credit: 'NASA/JPL-Caltech/University of Arizona/USGS',
      url: `${PJ}24/pia24814/PIA24814.jpg`,
      caption: 'The same butte from orbit. What the plan sees versus what the boots see.',
    },
  ],
  flats: [
    {
      id: 'PIA25672',
      file: `${BASE}nasa/PIA25672-hogwallow.jpg`,
      title: "Perseverance's Mastcam-Z Views Hogwallow Flats",
      instrument: 'Mastcam-Z',
      date: '6 Jun 2022 (sol 461)',
      credit: 'NASA/JPL-Caltech/ASU/MSSS',
      url: `${PJ}25/pia25672/PIA25672.jpg`,
      caption: 'The fine-grained sedimentary rocks at the foot of the delta front that Perseverance sampled in 2022.',
    },
    {
      id: 'PIA26368',
      file: `${BASE}nasa/PIA26368-cheyava-falls.jpg`,
      title: "Perseverance Finds a Rock With 'Leopard Spots'",
      instrument: 'WATSON (SHERLOC)',
      date: '18 Jul 2024 (sol 1212)',
      credit: 'NASA/JPL-Caltech/MSSS',
      url: `${PJ}26/pia26368/PIA26368.jpg`,
      caption: "'Cheyava Falls' in the Bright Angel formation, ~16 km WNW of the landing site, outside this map. The best preservation target Perseverance has found.",
    },
  ],
  seitah: [
    {
      id: 'PIA24816',
      file: `${BASE}nasa/PIA24816-seitah.jpg`,
      title: "Perseverance Rover's View of South Séítah",
      instrument: 'Mastcam-Z',
      date: '12 Sep 2021 (sol 201)',
      credit: 'NASA/JPL-Caltech/ASU/MSSS',
      url: `${PJ}24/pia24816/PIA24816.jpg`,
      caption: 'Ridges of layered igneous rock and sand ripples. Ripple fields are the footing hazard here, not the rock.',
    },
    {
      id: 'PIA25023',
      file: `${BASE}nasa/PIA25023-seitah-rocks.jpg`,
      title: 'Two Perspectives of Séítah Rocks',
      instrument: 'Mastcam-Z',
      date: '19 Oct 2021 (sol 237)',
      credit: 'NASA/JPL-Caltech/ASU/MSSS',
      url: `${PJ}25/pia25023/PIA25023.jpg`,
      caption: 'A colour image beside a mineral map of the same Séítah rocks.',
    },
  ],
}

export const CONTEXT_MINERAL_MAP: RoverImage = {
  id: 'PIA23380',
  file: `${BASE}nasa/PIA23380-jezero-minerals.jpg`,
  title: 'Jezero Crater Minerals',
  instrument: 'CRISM + CTX (MRO)',
  date: 'Published 12 Nov 2019',
  credit: 'NASA/JPL-Caltech/MSSS/JHU-APL/Purdue/USGS',
  url: 'https://science.nasa.gov/photojournal/jezero-crater-minerals/',
  caption: 'Crater-wide context: green is carbonate, red is olivine.',
}
