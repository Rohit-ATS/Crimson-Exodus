/**
 * nasaGallery.ts — The bundled NASA image library, with real credits.
 *
 * Every entry is a real NASA/JPL product, downloaded from the NASA Image and
 * Video Library (images.nasa.gov) and bundled into `public/nasa/` so the game
 * works offline and at a demo booth with bad wifi. Nothing here is generated,
 * stylised or AI-made. The `credit` string is the one NASA publishes for that
 * asset and it is rendered on the image everywhere it appears.
 *
 * The `teaches` line is the reason the image is in the game: each procedure
 * step in the EVA reveals the real picture of that same operation being done
 * on Mars by Perseverance, so the player can see that the thing they just
 * clicked is a thing that actually happens.
 *
 * Image use: NASA media are generally not copyrighted and may be reused with
 * credit. See https://www.nasa.gov/nasa-brand-center/images-and-media/
 */

const BASE = import.meta.env.BASE_URL

export interface GalleryImage {
  /** NASA Photojournal / library id. */
  id: string
  /** Bundled path. */
  file: string
  title: string
  instrument: string
  date: string
  credit: string
  /** Canonical NASA page or asset for the original. */
  url: string
  /** What this image shows, in one or two sentences. */
  caption: string
  /** Why the game shows it at this moment. */
  teaches?: string
}

const g = (i: GalleryImage) => i

export const GALLERY: Record<string, GalleryImage> = {
  // --- Abrasion: clearing the weathering rind ------------------------------
  abrasionPatches: g({
    id: 'PIA24926',
    file: `${BASE}nasa/PIA24926-abrasion-patches.jpg`,
    title: '2 Abrasion Patches From Perseverance at Jezero Delta',
    instrument: 'WATSON (SHERLOC), Mars 2020',
    date: '15 Sep 2022',
    credit: 'NASA/JPL-Caltech/ASU/MSSS',
    url: 'https://images.nasa.gov/details/PIA24926',
    caption:
      'Circular patches Perseverance ground into "Skinner Ridge" (left) and "Wildcat Ridge" (right) in the Jezero delta. Each patch is about 5 cm across.',
    teaches:
      'This is the real version of the step you just performed. The rover grinds away the dust and the oxidised rind before any instrument is allowed to look at the rock, because the outside of a Mars rock is not the rock.',
  }),
  abrasionWalhalla: g({
    id: 'PIA26320',
    file: `${BASE}nasa/PIA26320-abrasion-walhalla.jpg`,
    title: "Perseverance's Abrasion Patch at 'Walhalla Glades'",
    instrument: 'Front Hazard Avoidance Camera, Mars 2020',
    date: '14 Jun 2024 (sol 1180)',
    credit: 'NASA/JPL-Caltech',
    url: 'https://images.nasa.gov/details/PIA26320',
    caption:
      'The arm turret holding WATSON over a fresh abrasion patch in the Bright Angel region of Jezero Crater.',
    teaches:
      'The tool and the camera are on the same turret, a few centimetres from the rock. On Mars nobody looks at a prepared surface from a distance.',
  }),

  // --- Hand-lens scale ----------------------------------------------------
  watsonDourbes: g({
    id: 'PIA24940',
    file: `${BASE}nasa/PIA24940-watson-dourbes.jpg`,
    title: "WATSON's View of Dourbes in Mars' Jezero Crater",
    instrument: 'WATSON (SHERLOC), Mars 2020',
    date: '5 Nov 2021 (sol 253)',
    credit: 'NASA/JPL-Caltech/MSSS',
    url: 'https://images.nasa.gov/details/PIA24940',
    caption:
      'A 5 cm abraded patch on the target "Dourbes", merged from eight fully-shadowed frames so that no sunlight washes out the texture.',
    teaches:
      'This is hand-lens scale: what your eye gets at 10 cm through a loupe. Grain size, sorting and cement are decided at this scale and nowhere else.',
  }),
  pixlOuzel: g({
    id: 'PIA26206',
    file: `${BASE}nasa/PIA26206-pixl-ouzel.jpg`,
    title: "PIXL Instrument on Perseverance Studies 'Ouzel Falls'",
    instrument: 'WATSON + PIXL, Mars 2020',
    date: 'May 2023',
    credit: 'NASA/JPL-Caltech/MSSS',
    url: 'https://images.nasa.gov/details/PIA26206',
    caption:
      'An abrasion patch with PIXL X-ray chemistry mapped onto it, element by element, before a core was taken nearby at "Otis Peak".',
    teaches:
      'Looking is step one; composition is step two. The order matters — you abrade, then you measure, then you decide whether the rock is worth a tube.',
  }),

  // --- Coring -------------------------------------------------------------
  coreInDrill: g({
    id: 'PIA24804',
    file: `${BASE}nasa/PIA24804-core-in-drill.jpg`,
    title: "Sample Tube in Perseverance's Drill With Rock Core",
    instrument: 'Mastcam-Z, Mars 2020',
    date: '1 Sep 2021 (sol 190)',
    credit: 'NASA/JPL-Caltech/ASU/MSSS',
    url: 'https://images.nasa.gov/details/PIA24804',
    caption:
      'A rock core "slightly thicker than a pencil" sitting in sample tube 266, photographed inside the coring bit immediately after drilling.',
    teaches:
      'This is what a sealed sample actually is: a finger-sized cylinder of rock. Everything the mission hopes to learn from Mars Sample Return rides on tubes this size.',
  }),
  tubesSol1000: g({
    id: 'PIA26232',
    file: `${BASE}nasa/PIA26232-tubes-sol1000.jpg`,
    title: 'Cored Samples Aboard Perseverance at Sol 1,000',
    instrument: 'Mastcam-Z + WATSON, Mars 2020',
    date: '12 Dec 2023 (sol 1000)',
    credit: 'NASA/JPL-Caltech/ASU/MSSS',
    url: 'https://images.nasa.gov/details/PIA26232',
    caption:
      'Thirteen rock cores held aboard the rover after 1,000 sols, each shown beside the abrasion patch made at the same spot.',
    teaches:
      'A thousand sols of driving produced thirteen tubes. Sampling is rationed, not collected — which is why choosing the wrong rock costs more than the time it took.',
  }),

  // --- Depots and caches ---------------------------------------------------
  depotMontage: g({
    id: 'PIA25738',
    file: `${BASE}nasa/PIA25738-depot-montage.jpg`,
    title: "WATSON's Photomontage of Mars Sample Depot",
    instrument: 'WATSON (SHERLOC), Mars 2020',
    date: '21 Dec 2022 – 28 Jan 2023',
    credit: 'NASA/JPL-Caltech/MSSS',
    url: 'https://images.nasa.gov/details/PIA25738',
    caption:
      'The ten tubes Perseverance laid on the ground at "Three Forks" in Jezero Crater, each imaged where it fell.',
    teaches:
      'Real missions pre-position things on the surface for later. A depot is only useful if somebody wrote down exactly where it is.',
  }),
  depotMap: g({
    id: 'PIA25682',
    file: `${BASE}nasa/PIA25682-depot-map.jpg`,
    title: "Perseverance's Three Forks Sample Depot Map",
    instrument: 'Mars 2020 localisation',
    date: '30 Jan 2023',
    credit: 'NASA/JPL-Caltech',
    url: 'https://images.nasa.gov/details/PIA25682',
    caption:
      'The surveyed drop points of the Three Forks depot, laid out in a zigzag 5 to 15 m apart so a future lander can safely reach each one.',
    teaches:
      'The spacing is a safety decision, not a tidy one: a recovery vehicle needs room to approach each tube without driving over the others.',
  }),

  // --- The link home -------------------------------------------------------
  dsnMadrid: g({
    id: 'PIA26147',
    file: `${BASE}nasa/PIA26147-dsn-madrid.jpg`,
    title: 'Six Deep Space Network Antennas in Madrid, Arrayed',
    instrument: 'Madrid Deep Space Communications Complex',
    date: '20 Apr 2024',
    credit: 'MDSCC/INTA, Francisco "Paco" Moreno',
    url: 'https://images.nasa.gov/details/PIA26147',
    caption:
      'All six antennas of the Madrid DSN complex pointed at one spacecraft at once, combining their receiving power to pull in a signal too faint for any one dish.',
    teaches:
      'This is the other end of your radio link. It is real hardware on three continents, and it cannot make the speed of light any faster.',
  }),

  // --- Weather -------------------------------------------------------------
  dustStormGlobal: g({
    id: 'PIA25412',
    file: `${BASE}nasa/PIA25412-dust-storm-global.jpg`,
    title: 'Mars Dust Storm in Relation to InSight, Curiosity and Perseverance',
    instrument: 'MARCI (Mars Reconnaissance Orbiter)',
    date: '29 Sep 2022',
    credit: 'NASA/JPL-Caltech/MSSS',
    url: 'https://images.nasa.gov/details/PIA25412',
    caption:
      'A continent-sized dust storm in a daily global map of Mars, with the three active surface missions marked.',
    teaches:
      'Dust storms on Mars are regional to planet-wide and they are seen from orbit first. The reason you get a warning at all is that something was already watching from above.',
  }),
  dustDevilSelfie: g({
    id: 'PIA26574',
    file: `${BASE}nasa/PIA26574-dust-devil-selfie.jpg`,
    title: "Dust Devil Photobombs Perseverance's Selfie",
    instrument: 'WATSON (SHERLOC), 59-frame mosaic',
    date: '10 May 2025 (sol 1500)',
    credit: 'NASA/JPL-Caltech/MSSS',
    url: 'https://images.nasa.gov/details/PIA26574',
    caption:
      'A dust devil turning about 5 km behind the rover, caught in a 59-frame arm-camera selfie on sol 1,500. The dark hole in the rock ahead is the "Bell Island" borehole.',
    teaches:
      'Convective vortices are a daily afternoon fact of life at Jezero. They also scour dust off solar panels, so not every dust event is bad news.',
  }),

  // --- Context and traverse ------------------------------------------------
  deltaPano: g({
    id: 'PIA24921',
    file: `${BASE}nasa/PIA24921-delta-pano.jpg`,
    title: "Detailed Panorama of Mars' Jezero Crater Delta",
    instrument: 'Mastcam-Z, 1,118-frame mosaic',
    date: '14 Sep 2022',
    credit: 'NASA/JPL-Caltech/ASU/MSSS',
    url: 'https://images.nasa.gov/details/PIA24921',
    caption:
      'A 2.5-gigapixel mosaic of 1,118 frames — the most detailed landscape panorama returned from Mars — looking at the ancient river delta in Jezero Crater.',
    teaches:
      'Context imaging is not decoration. Without the wide frame, nobody on Earth can tell where in the stratigraphy your close-up came from.',
  }),
  roverTracks: g({
    id: 'PIA25171',
    file: `${BASE}nasa/PIA25171-rover-tracks.jpg`,
    title: 'Perseverance Looks Back at Wheel Tracks',
    instrument: 'Navigation cameras, Mars 2020',
    date: '17 Mar 2022 (sol 381)',
    credit: 'NASA/JPL-Caltech',
    url: 'https://images.nasa.gov/details/PIA25171',
    caption: 'Wheel tracks pressed into Jezero regolith, looking back along the drive.',
    teaches:
      'Looking back at your own tracks is a navigation technique, not nostalgia. On a dusty return leg they may be the clearest route marker you have.',
  }),
  slipperyTerrain: g({
    id: 'PIA26479',
    file: `${BASE}nasa/PIA26479-slippery-terrain.jpg`,
    title: 'Perseverance Views Slippery Terrain',
    instrument: 'Navigation cameras, Mars 2020',
    date: '11 Nov 2024 (sol 1326)',
    credit: 'NASA/JPL-Caltech',
    url: 'https://images.nasa.gov/details/PIA26479',
    caption:
      'Loose sand on a 10° average slope during the climb to the Jezero rim — a drive the team recorded as slippery.',
    teaches:
      'Sand on a slope is the hazard, not the slope. Ten degrees of firm rock is a walk; ten degrees of unconsolidated sand is a treadmill that eats your oxygen.',
  }),
  cheyavaWorkspace: g({
    id: 'PIA26401',
    file: `${BASE}nasa/PIA26401-cheyava-workspace.jpg`,
    title: "Mastcam-Z Views the 'Cheyava Falls' Workspace",
    instrument: 'Mastcam-Z, Mars 2020',
    date: '23 Jul 2024 (sol 1217)',
    credit: 'NASA/JPL-Caltech/ASU/MSSS',
    url: 'https://images.nasa.gov/details/PIA26401',
    caption:
      'The finished workspace at "Cheyava Falls": a drill hole at far left, and a circular white abrasion patch on each of two rocks.',
    teaches:
      'A worked site on Mars looks like this — a few centimetres of fresh rock and one borehole. That is the whole physical footprint of a day of science.',
  }),
}

export type GalleryKey = keyof typeof GALLERY

/** Look up by key, tolerating a missing entry rather than throwing in the UI. */
export function img(key: string): GalleryImage | undefined {
  return (GALLERY as Record<string, GalleryImage>)[key]
}
