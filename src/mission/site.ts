/**
 * site.ts — The mission: one site, one science question, three stations, three routes.
 *
 * The site is real. The science question is the one Perseverance is actually
 * working at Jezero. The station placements inside the local 2.4 km box are
 * GAME PLACEMENTS inspired by real named features, not surveyed coordinates.
 * Every claim about what the rocks are is sourced; every claim that is a game
 * simplification is marked `assumption`.
 */

export interface Provenance {
  /** Short id used to cross-reference the Data Details panel. */
  id: string
  label: string
  instrument: string
  /** Mission or product that produced it. */
  source: string
  /** Observation or product date, as published. */
  date: string
  /** Native resolution, where the product has one. */
  resolution: string
  url: string
  /** Honest statement of what this product can and cannot support. */
  caveat: string
  kind: 'imagery' | 'topography' | 'thermal' | 'in-situ' | 'model' | 'synthetic'
}

export const PROVENANCE: Provenance[] = [
  {
    id: 'trek-mola',
    label: 'MOLA gridded topography',
    instrument: 'Mars Orbiter Laser Altimeter (MOLA)',
    source: 'Mars Global Surveyor, via NASA Mars Trek',
    date: '1999–2001 (gridded product)',
    resolution: '463 m/pixel at the equator',
    url: 'https://trek.nasa.gov/mars/',
    caveat:
      'Regional context only. At 463 m/pixel a single pixel is wider than this whole traverse corridor. MOLA cannot show a footpath hazard, a boulder, or a scarp edge. It is used here for the elevation band of the region, nothing finer.',
    kind: 'topography',
  },
  {
    id: 'trek-ctx',
    label: 'CTX global mosaic',
    instrument: 'Context Camera (CTX)',
    source: 'Mars Reconnaissance Orbiter, via NASA Mars Trek',
    date: '2006–present',
    resolution: '~5–6 m/pixel',
    url: 'https://trek.nasa.gov/mars/',
    caveat:
      'Good for landform recognition — the delta front, the crater rim, dune fields. A 5 m pixel still averages over every rock an astronaut would trip on.',
    kind: 'imagery',
  },
  {
    id: 'trek-hirise',
    label: 'HiRISE high-resolution imagery',
    instrument: 'High Resolution Imaging Science Experiment (HiRISE)',
    source: 'Mars Reconnaissance Orbiter, via NASA Mars Trek / HiRISE archive',
    date: '2006–present',
    resolution: '~25–30 cm/pixel; stereo DTMs ~1 m/post',
    url: 'https://www.uahirise.org/',
    caveat:
      'The best orbital basis for traverse planning that exists, and still not a certification of walkability. Stereo DTM vertical precision is tens of centimetres at best, and shadowed or low-contrast ground is poorly constrained.',
    kind: 'imagery',
  },
  {
    id: 'themis',
    label: 'THEMIS thermal inertia',
    instrument: 'Thermal Emission Imaging System (THEMIS)',
    source: 'Mars Odyssey, via NASA Mars Trek',
    date: '2002–present',
    resolution: '~100 m/pixel',
    url: 'https://trek.nasa.gov/mars/',
    caveat:
      'Thermal inertia distinguishes dust and loose sand from exposed bedrock, which is genuinely useful for guessing where the footing is firm and where an outcrop is exposed. At 100 m/pixel it is a hint about the neighbourhood, not about the next ten metres.',
    kind: 'thermal',
  },
  {
    id: 'mastcam-z',
    label: 'Mastcam-Z outcrop imagery',
    instrument: 'Mastcam-Z',
    source: 'Mars 2020 Perseverance, NASA Mars image archive',
    date: '2021–present',
    resolution: 'Centimetre-scale at tens of metres range',
    url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/',
    caveat:
      'Real surface observations of real outcrops. Historical — each image is a specific sol, not a live view, and not the conditions in this simulated EVA.',
    kind: 'imagery',
  },
  {
    id: 'meda',
    label: 'MEDA environmental record',
    instrument: 'Mars Environmental Dynamics Analyzer (MEDA)',
    source: 'Mars 2020 Perseverance',
    date: '2021–present',
    resolution: 'Pressure, air and ground temperature, wind, radiation, dust opacity',
    url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/',
    caveat:
      'MEDA is the reason the environment model in this app has the right shape: the diurnal temperature swing, the afternoon wind peak, the pressure range and the dust-devil frequency are all anchored to what MEDA has reported at Jezero. The values this app displays are MODEL OUTPUT for the current real Mars season and local solar time, not MEDA telemetry playback and not a forecast.',
    kind: 'in-situ',
  },
  {
    id: 'hirise-dtm',
    label: 'HiRISE digital terrain model (real-site map)',
    instrument: 'HiRISE stereo, MRO',
    source: 'USGS Astrogeology, Mars 2020 Terrain Relative Navigation products (Fergason et al. 2020)',
    date: 'Released 2020; the elevation model Perseverance landed with',
    resolution: '1 m/post native; bundled here as a 3.65 × 2.49 km window averaged to 4 m posts',
    url: 'https://doi.org/10.5066/P9REJ9JN',
    caveat:
      'Real measured elevation of the landing site, Séítah, Kodiak and the delta front, used for the real-site map\'s hillshade, elevation, slope, route length, climb and profile. At 4 m posts it resolves scarps, butte flanks and ripple fields, not individual boulders. The 3D walk does not use it; it uses the synthetic field shaped to this site.',
    kind: 'topography',
  },
  {
    id: 'crism',
    label: 'CRISM carbonate browse map',
    instrument: 'Compact Reconnaissance Imaging Spectrometer for Mars (CRISM)',
    source: 'MRO, observation FRT00005C5E, MTRDR browse product CAR, via PDS Geosciences Node',
    date: '19 May 2007',
    resolution: '~18 m/pixel, map-projected per the PDS label',
    url: 'https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/2007/2007_139/frt00005c5e/',
    caveat:
      'A spectral-parameter browse image, not a mineral identification: colours indicate where carbonate or hydrated-mineral absorptions are likely. Inside the traverse window the signal is weak; the strongest carbonate signal in this observation lies about 8 km north-west.',
    kind: 'imagery',
  },
  {
    id: 'm20-traverse',
    label: 'Perseverance traverse and outcrop images',
    instrument: 'Rover localization; Mastcam-Z; WATSON (SHERLOC)',
    source: 'NASA/JPL-Caltech, Mars 2020 waypoints and NASA Photojournal',
    date: 'Sols 13–714 (traverse); 2021–2024 (images)',
    resolution: 'Localized rover positions; images credited individually',
    url: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
    caveat:
      'The dashed track on the real-site map is where Perseverance actually drove. The station photographs are real images of the real outcrops each station is modelled on, each with its PIA number and credit; they are historical observations, not views of this EVA.',
    kind: 'in-situ',
  },
  {
    id: 'rad',
    label: 'Surface radiation dose',
    instrument: 'Radiation Assessment Detector (RAD)',
    source: 'Mars Science Laboratory Curiosity, Gale Crater',
    date: 'Aug 2012 – Jun 2013 (GCR baseline); 20 May 2024 (largest SEP event)',
    resolution: 'GCR: 0.210 mGy/day absorbed, 0.64 mSv/day dose equivalent. SEP May 2024: ~8.1 mGy',
    url: 'https://doi.org/10.1126/science.1244797',
    caveat:
      'The cosmic-ray background is the real surface measurement (Hassler et al. 2014), applied at Jezero; Jezero sits ~2 km higher than Gale, so the true rate there is slightly higher. A solar particle event, when one occurs in the game, is scaled to the May 2024 RAD total, but its timing is a game schedule and its hours-long profile is compressed into EVA minutes. Shielding factors for the lander and terrain are reasoned game values, not a transport calculation.',
    kind: 'in-situ',
  },
  {
    id: 'synthetic-dem',
    label: 'Local height field (synthetic)',
    instrument: 'Procedural, this project',
    source: 'JACK: Marswalk',
    date: '2026',
    resolution: 'Continuous function, sampled at 4 m for the mesh',
    url: '',
    caveat:
      'The metre-scale terrain you walk on is SYNTHETIC. It is shaped to the published large-scale morphology of the Jezero delta front — floor elevation near -2600 m, a scarp of several tens of metres trending roughly N-S, an isolated remnant butte south of the front, a megarippled trough to the southwest — but it is not resampled from any NASA DEM. Do not read a slope number here as a measurement of Mars.',
    kind: 'synthetic',
  },
  {
    id: 'ephemeris',
    label: 'Planetary positions and Mars time',
    instrument: 'Keplerian approximation + Mars24 algorithm',
    source: 'JPL Solar System Dynamics; NASA GISS Mars24',
    date: 'Computed live from your system clock',
    resolution: 'Position error of order 0.01 AU; light time error well under 1%',
    url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    caveat:
      'The Earth-Mars light time, the Mars season (Ls), the local true solar time at Jezero and the sun angle are computed for the real current instant and are genuinely accurate. They are straight-line geometry, not a Deep Space Network link prediction.',
    kind: 'model',
  },
  {
    id: 'flags',
    label: 'National flag images',
    instrument: 'flagcdn.com (public domain flag renderings)',
    source: 'Third party, ISO 3166-1 keyed',
    date: 'Fetched at runtime',
    resolution: 'Raster, 320 px wide',
    url: 'https://flagcdn.com',
    caveat:
      'Flags are fetched from a public CDN at runtime and are not NASA data. If the network is unavailable the app falls back to a drawn approximation and says so. Planting a flag is a symbolic act in this game; the Outer Space Treaty is explicit that it creates no claim of sovereignty.',
    kind: 'imagery',
  },
  {
    id: 'merv',
    label: 'MERV, the rover companion',
    instrument: 'Fictional scout rover; real rocker-bogie kinematics and solar power model',
    source: 'This project. Facts quoted by MERV are sourced individually in the transcript.',
    date: 'n/a',
    resolution: 'n/a',
    url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/',
    caveat:
      'MERV IS NOT A REAL OR PLANNED VEHICLE. What is faithful: the suspension is a rocker-bogie, the passive two-joint-per-side design NASA has used on every Mars rover since Sojourner in 1997, and it is articulated here the way the real one works; the power model is a solar array whose output collapses with dust loading and low sun, which is what ended Opportunity in 2018 and InSight in 2022. What is fiction: the speed. Perseverance tops out near 0.042 m/s (152 m/h). MERV moves at walking pace so that a companion can actually accompany you, and that is the one deliberate departure in the vehicle. Separately: every Mars fact MERV states comes from a hand-written, individually sourced knowledge base in this repository and carries its citation in the transcript; every mission number he quotes is read live from the simulation. If an optional Deepgram voice service is configured, it supplies speech recognition and synthesis — and on the opt-in agent tier, a hosted language model composes the wording with the live telemetry in its prompt and functions that query this simulation for every figure. That tier is labelled in the comms panel whenever it is running.',
    kind: 'synthetic',
  },
]

export const SITE = {
  name: 'Jezero Crater — western delta front',
  body: 'Mars',
  /** Perseverance landing site, "Octavia E. Butler Landing". */
  latDeg: 18.4447,
  eastLonDeg: 77.4508,
  elevationM: -2571,
  craterDiameterKm: 45,
  /** Local area the player can walk, metres on a side. */
  areaM: 2400,
  blurb:
    'A 45 km impact crater on the western edge of Isidis Planitia. An inlet valley, an outlet valley and a fan-shaped sediment deposit on the western wall are the evidence that a lake stood here. Perseverance landed on the crater floor in February 2021 and has been working from the floor up onto the delta front ever since.',
  sources: ['trek-mola', 'trek-ctx', 'trek-hirise', 'themis'],
} as const

export const SCIENCE_QUESTION = {
  short: 'Did the Jezero delta front record a long-lived lake, and do its fine-grained beds preserve organic carbon?',
  long:
    'Orbital images show a fan at the mouth of Neretva Vallis with the geometry of a river delta. If that is right, the lowest beds should be inclined foreset bedding deposited into standing water, the overlying beds should fine upward into mudstone deposited in quiet water, and the surrounding floor should be igneous basement that predates the lake. Perseverance has now tested all three. This EVA asks the astronaut to make the same three observations on foot and bring back one sealed sample.',
  objectives: [
    'Document inclined bedding geometry at a delta remnant and decide whether it is a foreset.',
    'Characterise the finest-grained bed you can reach and assess its preservation potential.',
    'Establish the relationship between the sedimentary package and the crater-floor basement.',
  ],
  sources: ['mastcam-z', 'trek-hirise'],
} as const

// ---------------------------------------------------------------------------
// Science stations
// ---------------------------------------------------------------------------

export interface Observation {
  id: string
  prompt: string
  /** The options the astronaut can record. Exactly one is the supported reading. */
  options: Array<{
    id: string
    text: string
    /** Is this the interpretation the real data supports? */
    supported: boolean
    /** Why — shown after the player commits. */
    feedback: string
  }>
}

export interface Station {
  id: string
  /** Display name. Real feature names are flagged in `realFeature`. */
  name: string
  codename: string
  /** Local metres, +x east, +z north. GAME PLACEMENT. */
  x: number
  z: number
  /** Interaction radius, metres. */
  radius: number
  /** Minutes of station work for the full observation + sample. */
  workMinutes: number
  /** Minutes to clear the weathering rind with the brush and abrader. */
  abradeMinutes: number
  /** Minutes for a close hand-lens inspection of the prepared patch. */
  lensMinutes: number
  /** What the abraded patch shows that the dusty outside did not. */
  abradeReveal: string
  /** What the hand lens resolves once the patch is clean. */
  lensReveal: string
  /** Science value if fully worked. */
  value: number
  /** One-line summary for the map pin. */
  tagline: string
  /** What is actually known about this kind of rock, with the source. */
  briefing: string
  /** The real named feature this station is modelled on. */
  realFeature: string
  /** Which PROVENANCE entries back the briefing. */
  sources: string[]
  /** Explicit list of what is a game assumption here. */
  assumptions: string[]
  observation: Observation
  /** Can a core sample be taken here? */
  sampleable: boolean
  sampleName: string
  /** Rough colour family of the rock, used by the 3D scene. */
  rockTint: string
}

export const STATIONS: Station[] = [
  {
    id: 'kodiak',
    name: 'Delta remnant butte',
    codename: 'STATION 1 — KODIAK',
    x: -392,
    z: -452,
    radius: 26,
    workMinutes: 22,
    abradeMinutes: 5,
    lensMinutes: 4,
    abradeReveal:
      'Under the dust coating and the oxidised rind, the fresh face is grey-brown and the bedding planes are suddenly obvious as alternating coarse and fine couplets. From the outside this looked like a uniform tan wall.',
    lensReveal:
      'At hand-lens scale the coarse couplets are well-sorted sand with rounded grains, and the laminae within each couplet climb at a consistent angle before being cut off sharply along a single plane near the top of the face. The cut-off is the relationship that matters.',
    value: 34,
    tagline: 'Inclined beds in an isolated outcrop. Foresets or not?',
    briefing:
      'An isolated, flat-topped remnant standing clear of the main delta front, so its full stratigraphic section is exposed on all sides. At the real Kodiak butte, Mastcam-Z imaging resolved a lower package of beds inclined at an angle to the horizontal, overlain by near-horizontal beds. Inclined foreset beds passing upward into flat topset beds is the diagnostic architecture of a Gilbert-type delta prograding into standing water — it requires a lake, not a transient flood.',
    realFeature:
      'Kodiak, an isolated delta remnant south of the Jezero western delta front, imaged by Perseverance Mastcam-Z in 2021.',
    sources: ['mastcam-z', 'trek-hirise'],
    assumptions: [
      'Position within this 2.4 km box is a game placement, not the surveyed location of Kodiak.',
      'The outcrop geometry you see in 3D is procedural, built to express inclined bedding, not photogrammetry.',
    ],
    observation: {
      id: 'kodiak-bedding',
      prompt:
        'You are standing at the base of the butte with a clean cross-section above you. Record the bedding geometry.',
      options: [
        {
          id: 'foreset',
          text: 'Lower beds inclined ~15°, truncated by flat-lying upper beds. Foreset over topset.',
          supported: true,
          feedback:
            'This is the observation that matters. Inclined foresets capped by horizontal topsets is delta architecture built into standing water — evidence for a lake with a stable level, not a flash flood. It is what Perseverance found at Kodiak.',
        },
        {
          id: 'horizontal',
          text: 'All beds flat-lying and parallel throughout the section.',
          supported: false,
          feedback:
            'Look again at the lower third of the face. Flat-lying throughout would point to quiet-water or sheet deposition and would remove the delta interpretation — so getting this wrong costs you the lake.',
        },
        {
          id: 'crossbed',
          text: 'Decimetre-scale trough cross-bedding in every bed, no systematic dip.',
          supported: false,
          feedback:
            'Trough cross-bedding does occur in the delta package, but it is not the dominant architecture of this face, and recording it alone loses the foreset-topset relationship.',
        },
        {
          id: 'igneous',
          text: 'Massive, unbedded, crystalline. Not sedimentary.',
          supported: false,
          feedback:
            'That describes the crater-floor basement at Station 3, not this butte. Bedding is clearly visible here at metre scale.',
        },
      ],
    },
    sampleable: true,
    sampleName: 'Foreset sandstone core',
    rockTint: '#9a6a4e',
  },
  {
    id: 'flats',
    name: 'Fine-grained flats',
    codename: 'STATION 2 — HOGWALLOW',
    x: -770,
    z: -25,
    radius: 30,
    workMinutes: 28,
    abradeMinutes: 6,
    lensMinutes: 5,
    abradeReveal:
      'The abraded patch is far lighter than the weathered outside and shows pale nodules and thin bright veins cutting the rock — sulfate cement that the dusty exterior hid completely.',
    lensReveal:
      'Nothing resolves. At the limit of the lens the rock is still featureless and even-toned, with no grains visible at all. That absence IS the measurement: it puts the grain size below the resolution of the lens.',
    value: 42,
    tagline: 'The finest grain size on the delta. Best preservation odds.',
    briefing:
      'A recessive, light-toned, very fine-grained unit on the delta front — the quiet-water end of the system, where the finest mud settled out. Perseverance found fine-grained sulfate-bearing rocks in this part of the section, and later, in the fine-grained Bright Angel formation, the "Cheyava Falls" rock with millimetre-scale reaction fronts and organic carbon: a potential biosignature that needs Earth laboratories to test. Fine grain size means low permeability and high surface area, which is exactly what protects organic molecules over billions of years.',
    realFeature:
      'Hogwallow Flats on the Jezero delta front, and the fine-grained Bright Angel formation where Perseverance sampled "Cheyava Falls" in July 2024.',
    sources: ['mastcam-z', 'meda'],
    assumptions: [
      'Position is a game placement.',
      'The game awards science value for a correct observation; it does not simulate instrument spectra.',
      'A potential biosignature is a hypothesis requiring sample return. Nothing in this game detects life.',
    ],
    observation: {
      id: 'flats-grain',
      prompt:
        'Hand lens on a fresh face. Record grain size and what it implies for preservation.',
      options: [
        {
          id: 'mudstone',
          text: 'Below hand-lens resolution — mudstone. Low permeability, high preservation potential.',
          supported: true,
          feedback:
            'Correct, and it is the reason this station is the highest-value target on the traverse. Mud deposited in standing water, then sealed by its own low permeability, is the best place in Jezero to look for preserved organics.',
        },
        {
          id: 'sandstone',
          text: 'Medium sand, well sorted and rounded.',
          supported: false,
          feedback:
            'That is the foreset facies at Station 1. Recording sand here loses the quiet-water signal and the preservation argument with it.',
        },
        {
          id: 'conglomerate',
          text: 'Pebble conglomerate with clasts up to 4 cm.',
          supported: false,
          feedback:
            'Conglomerate is present elsewhere in the fan — it marks high-energy channel flow. It is the opposite of what this recessive, light-toned unit records.',
        },
        {
          id: 'evaporite',
          text: 'Coarse crystalline evaporite, no detrital grains.',
          supported: false,
          feedback:
            'Sulfates are present as cements and nodules here, but the rock is a fine-grained detrital sediment, not a crystalline evaporite.',
        },
      ],
    },
    sampleable: true,
    sampleName: 'Mudstone core',
    rockTint: '#c9b199',
  },
  {
    id: 'seitah',
    name: 'Floor basement contact',
    codename: 'STATION 3 — SÉÍTAH',
    x: -455,
    z: -200,
    radius: 28,
    workMinutes: 18,
    abradeMinutes: 7,
    lensMinutes: 4,
    abradeReveal:
      'This one fights the abrader — it is markedly harder than the sedimentary targets. The fresh surface is dark grey-green and glitters where the light catches it.',
    lensReveal:
      'The glitter resolves into large, blocky, interlocking crystals several millimetres across, with no cement and no grain boundaries of a detrital sort. Crystals this size grew slowly, in place.',
    value: 28,
    tagline: 'Olivine-rich igneous floor. The clock the lake is measured against.',
    briefing:
      'The crater floor southwest of the delta, a megarippled trough exposing the unit below the sediments. Perseverance showed that the Jezero floor is igneous, not sedimentary as some pre-landing interpretations allowed: the Máaz formation is basaltic lava and the Séítah formation is a coarse-grained olivine cumulate — crystals that settled out of a cooling melt. That matters twice over. Igneous rock can be radiometrically dated once it is back on Earth, which puts an absolute age on everything above it; and olivine weathers fast in water, so finding it fresh constrains how long the water lasted.',
    realFeature:
      'The Séítah and Máaz formations on the Jezero crater floor, characterised by Perseverance in 2021–2022.',
    sources: ['mastcam-z', 'themis'],
    assumptions: [
      'Position is a game placement.',
      'Mineral identification in the game is a recorded judgement, not a simulated SHERLOC or PIXL measurement.',
    ],
    observation: {
      id: 'seitah-unit',
      prompt:
        'You are on the exposed floor unit below the sedimentary package. Record the rock type and the contact relationship.',
      options: [
        {
          id: 'cumulate',
          text: 'Coarse-grained olivine-rich igneous rock; the sedimentary beds lie unconformably on top of it.',
          supported: true,
          feedback:
            'Correct. An igneous basement beneath the delta gives you a datable floor and an absolute age bracket for the lake. This is the single most useful stratigraphic relationship on the traverse.',
        },
        {
          id: 'mudstone',
          text: 'Fine-grained lake mudstone, continuous with the delta beds above.',
          supported: false,
          feedback:
            'This was a live pre-landing hypothesis for the Jezero floor, and Perseverance ruled it out. The floor is igneous.',
        },
        {
          id: 'impact',
          text: 'Impact melt breccia with shocked clasts.',
          supported: false,
          feedback:
            'Reasonable to consider inside a crater, but the texture here is a cumulate: large, interlocking crystals that grew slowly, not a chaotic melt sheet.',
        },
        {
          id: 'aeolian',
          text: 'Cemented aeolian sandstone, cross-bedded at decimetre scale.',
          supported: false,
          feedback:
            'The active megaripples around you are aeolian, but the bedrock beneath them is not.',
        },
      ],
    },
    sampleable: true,
    sampleName: 'Olivine cumulate core',
    rockTint: '#6f6a5c',
  },
]

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export interface Route {
  id: string
  name: string
  codename: string
  /** Waypoints in local metres, starting and ending at the lander. */
  waypoints: Array<[number, number]>
  /** Which stations this route passes within reach of, in order. */
  stations: string[]
  pitch: string
  pros: string[]
  cons: string[]
  /** Planning-cue hazard rating, not a safety certification. */
  hazard: 'low' | 'moderate' | 'high'
}

export const LANDER: [number, number] = [0, 0]

export const ROUTES: Route[] = [
  {
    id: 'floor',
    name: 'Floor Traverse',
    codename: 'ROUTE A',
    waypoints: [
      [0, 0],
      [-150, -230],
      [-300, -470],
      [-392, -452],   // S1 Kodiak, at the foot of the butte section
      [-480, -500],
      [-560, -430],
      [-520, -300],
      [-455, -200],   // S3 Seitah, floor basement in the megaripple trough
      [-500, -110],
      [-620, -55],
      [-770, -25],    // S2 Hogwallow, up the breach valley
      [-660, -40],
      [-540, -55],
      [-380, 30],
      [-150, 70],
      [0, 0],
    ],
    stations: ['kodiak', 'seitah', 'flats'],
    pitch:
      'A long southern loop across open crater floor to all three stations, entering the delta front through the breach valley at the far end. The most ground to cover and the least that can go wrong.',
    pros: [
      'Reaches all three stations, so the full science question is answerable.',
      'Almost entirely on open floor: you can see a dust front coming and you have room to react.',
      'Passes the Kodiak lee and the boulder cluster, so there is shelter within reach for most of the walk.',
      'Lowest climb of any route that reaches Station 2.',
    ],
    cons: [
      'Longest distance and longest duration. Every metre is consumables.',
      'The Séítah leg crosses aeolian megaripples — loose, slow footing.',
      'Only viable if you start with a healthy margin. It leaves little slack for a storm.',
    ],
    hazard: 'low',
  },
  {
    id: 'breach',
    name: 'Neretva Breach',
    codename: 'ROUTE B',
    waypoints: [
      [0, 0],
      [-220, -70],
      [-455, -200],   // S3 Seitah
      [-560, -80],
      [-660, -35],
      [-770, -25],    // S2 Hogwallow
      [-640, -10],
      [-400, -60],
      [-170, -40],
      [0, 0],
    ],
    stations: ['seitah', 'flats'],
    pitch:
      'Straight up the incised valley that cuts the delta front. Shortest route to the highest-value station, almost no climbing — and the one stretch of this map where the terrain can trap you.',
    pros: [
      'Shortest distance and shortest duration of the three. Biggest margin at Station 2.',
      'The breach is a gentle ramp: a few percent grade where the open front is over thirty.',
      'The valley walls expose the delta section in cross-section, which is how the stratigraphy is actually read.',
    ],
    cons: [
      'A narrow corridor with steep walls funnels wind-blown dust and loses visibility first in a storm.',
      'Long stretch with no shelter except the alcove near Station 2.',
      'Skips Station 1, so the foreset bedding geometry goes unrecorded.',
    ],
    hazard: 'high',
  },
  {
    id: 'rim',
    name: 'Plateau Rim',
    codename: 'ROUTE C',
    waypoints: [
      [0, 0],
      [-250, 140],
      [-500, 200],
      [-640, 196],   // climbs the open scarp face
      [-712, 160],   // onto the delta top
      [-716, 60],    // down the talus apron
      [-740, -6],
      [-770, -25],   // S2 Hogwallow, reached from above
      [-660, -90],
      [-600, -240],
      [-560, -420],
      [-392, -452],  // S1 Kodiak
      [-250, -330],
      [0, 0],
    ],
    stations: ['flats', 'kodiak'],
    pitch:
      'Climb the open delta front, work the top of the fan, drop into the valley from above, then come home down the southern floor. The most expensive metres on the map, bought for the best sightlines on it.',
    pros: [
      'From the plateau you can see weather approaching across the whole crater floor.',
      'Reaches both the highest-value station and the bedding geometry at Station 1.',
      'Descending the southern flank is fast — Tobler’s curve actually peaks on a slight downhill.',
    ],
    cons: [
      'Climbs 46 m of unbroken scarp at over 30% grade. Slope dominates the metabolic cost and it is slow.',
      'Exposed on the face with no shelter for the middle of the climb.',
      'Skips Station 3, so there is no igneous basement sample and no absolute age bracket.',
    ],
    hazard: 'moderate',
  },
]

// ---------------------------------------------------------------------------
// Shelters
// ---------------------------------------------------------------------------

export interface Shelter {
  id: string
  name: string
  x: number
  z: number
  /** Effective radius of useful protection, metres. */
  radius: number
  /** How much of the dust/wind exposure it removes, 0-1. */
  effectiveness: number
  why: string
}

export const SHELTERS: Shelter[] = [
  {
    id: 'lander',
    name: 'Lander — pressurised',
    x: 0,
    z: 0,
    radius: 40,
    effectiveness: 1,
    why: 'The only real shelter: an airlock, a recharge port and a hull between you and the dust. Everything else on this map just buys time.',
  },
  {
    id: 'kodiak-lee',
    name: 'Kodiak lee slope',
    x: -500,
    z: -625,
    radius: 55,
    effectiveness: 0.72,
    why: 'A 23 m butte between you and the prevailing dust-front bearing. Cuts the wind-borne dust flux sharply and gives you a wall to work against.',
  },
  {
    id: 'breach-alcove',
    name: 'Breach alcove',
    x: -715,
    z: -95,
    radius: 46,
    effectiveness: 0.66,
    why: 'A side re-entrant off the incised valley, three-sided and deep enough to break the flow. The only real cover on the breach route, and it sits a short walk from Station 2.',
  },
  {
    id: 'boulder-cluster',
    name: 'Boulder cluster',
    x: -320,
    z: -330,
    radius: 32,
    effectiveness: 0.42,
    why: 'Metre-scale blocks shed off the scarp. Partial cover only — use it to wait out a dust devil, not a regional storm.',
  },
]

/**
 * A consumables cache, set down by a robotic lander or an earlier EVA.
 *
 * Pre-positioning caches along a planned traverse is a standard way to extend
 * walkback range without carrying the mass: it is how polar and mountaineering
 * expeditions work, it is the logic behind Perseverance's Three Forks sample
 * depot, and every serious study of crewed Mars surface operations assumes some
 * version of it.
 *
 * GAME MECHANIC. The capacities below are chosen so that reaching the cache
 * converts a marginal plan into a viable one — which is exactly the decision it
 * is there to create: it sits off the direct line, so taking it costs the time
 * it saves you, unless you planned for it.
 */
export interface Cache {
  id: string
  name: string
  x: number
  z: number
  /** How close Jack must be to swap consumables, metres. */
  radius: number
  /** Minutes to swap the battery and top off the tanks. */
  swapMinutes: number
  /** Fraction of a full load this cache restores. */
  restore: { o2: number; battery: number; water: number; scrubber: number }
  why: string
}

export const CACHES: Cache[] = [
  {
    id: 'depot-alpha',
    name: 'Cache ALPHA',
    // On the crater floor between the lander and the southern stations, a short
    // detour off every route rather than on any of them.
    x: -250,
    z: -330,
    radius: 22,
    swapMinutes: 9,
    restore: { o2: 0.5, battery: 0.6, water: 0.45, scrubber: 0.5 },
    why:
      'A spare battery, a charged O\u2082 bottle, a fresh scrubber cartridge and a water bladder, set down on an earlier sortie. Swapping takes nine minutes with gloves on and buys back most of an excursion.',
  },
]

export const MISSION_RULES = [
  'Walking and working both consume oxygen, scrubber capacity, battery and feedwater. Climbing costs far more than walking on the flat.',
  'The suit must still hold the mandated reserve fraction when Jack reaches the lander. Spending into the reserve is a mission rule violation even if Jack survives.',
  'The return estimate is computed along the remaining route, not as a straight line. A shortcut across the scarp is not a shortcut.',
  'Skipping a station is often the correct decision. Coming home with two good observations beats running the suit dry for a third.',
  'Science value comes from recorded observations and sealed samples, not from reaching a marker.',
  'A dust storm does not kill you with wind. It takes your visibility, your solar input and your margin. The game will advise shelter or abort; taking that advice is how you win.',
  'Everything in this list is a GAME MECHANIC. No real EVA suit, Mars lander or surface operations rule is being simulated.',
]
