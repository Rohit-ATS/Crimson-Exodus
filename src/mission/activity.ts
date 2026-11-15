/**
 * activity.ts — Procedures, not buttons.
 *
 * The problem this module solves: a button that instantly flips a checkbox
 * teaches nothing. A player clicks "Abrade", sees a tick appear, and learns
 * only that the game accepted a click. They do not learn that abrading a rock
 * on Mars means bracing a rotary-percussive tool in a third of Earth's gravity,
 * grinding a 5 cm circle about 8 mm deep, and then blowing the tailings out of
 * the hole with puffs of nitrogen because a brush would smear dust back across
 * the fresh surface.
 *
 * So every action in the EVA is defined here as a PROCEDURE: an ordered set of
 * beats with real durations, a real NASA image of the same operation being done
 * on Mars, and one thing worth remembering if you are ever standing on that
 * surface yourself. The UI plays the beats out over several seconds with the
 * mission clock visibly running, and the mission cost in minutes and
 * consumables is charged while it plays — the time compression is shown on
 * screen rather than hidden.
 *
 * PROVENANCE OF THE PROCEDURE DETAIL
 *  - Abrasion patch geometry (5 cm circle), the abrade-then-analyse-then-core
 *    order, and the gaseous Dust Removal Tool: Mars 2020 sampling system, as
 *    described on the mission's own instrument pages and visible in the images
 *    this module cites. https://science.nasa.gov/mission/mars-2020-perseverance/
 *  - WATSON's fully-shadowed imaging technique: NASA/JPL PIA24940 caption.
 *  - Core dimensions ("slightly thicker than a pencil", ~6 cm): PIA24804.
 *  - Mars surface gravity 3.721 m/s^2, 0.379 g: NASA Mars fact sheet.
 *  - Perchlorate in Martian soil at the 0.5-1% level: Phoenix Wet Chemistry
 *    Laboratory, Hecht et al. 2009, Science 325, 64.
 *  - Suit pressure and prebreathe rationale: NASA EVA physiology practice.
 *
 * WHAT IS A GAME MECHANIC: the specific minute costs, the beat timings, and the
 * fact that a procedure can be skipped at a scoring penalty. Those are tuned
 * for a playable EVA, not taken from a flight rule.
 */

import type { Tool } from '../state/live'
import type { Station } from './site'

export type ActivityKind =
  | 'abrade'
  | 'lens'
  | 'record'
  | 'core'
  | 'photo'
  | 'flag'
  | 'cache'
  | 'shelter'
  | 'ingress'

/** One step inside a procedure. */
export interface Beat {
  /** Fraction of the procedure at which this beat becomes the active one. */
  at: number
  /** Short imperative, shown as the current line. */
  label: string
  /** Why it is done this way. One or two sentences, read while it plays. */
  detail: string
  /** Optional live telemetry caption for this beat. */
  meter?: string
}

/** One thing worth remembering if you are ever actually there. */
export interface Lesson {
  id: string
  headline: string
  body: string
  /** Where the fact comes from. */
  source: string
}

export interface ActivityDef {
  kind: ActivityKind
  /** Procedure name, as it would appear on a cuff checklist. */
  title: string
  subtitle: string
  tool: Tool
  /** Mission minutes this procedure costs. */
  minutes: number
  /** Real seconds the animation runs for. */
  realSec: number
  beats: Beat[]
  /** Gallery keys revealed when the procedure completes. */
  images: string[]
  lesson: Lesson
  /** Headline shown on the result card. */
  resultTitle: string
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** How long the animation plays for, given what it costs in mission minutes. */
function realSecFor(minutes: number): number {
  return clamp(5.5 + minutes * 0.7, 7, 14)
}

// ---------------------------------------------------------------------------
// Lessons. Kept separate so the debrief can present the full field guide of
// everything the player actually did, in the order they learned it.
// ---------------------------------------------------------------------------

export const LESSONS: Record<string, Lesson> = {
  pressureSuit: {
    id: 'pressureSuit',
    headline: 'Your blood would boil at Mars pressure, at body temperature',
    body:
      'Surface pressure at Jezero is around 6-8 millibars, well under one percent of Earth\u2019s and far below the ' +
      'Armstrong limit of about 63 millibars \u2014 the pressure at which water boils at 37 \u00b0C. Unprotected, the ' +
      'water in your eyes, mouth and lungs would vaporise in seconds. This is why there is no such thing as a quick ' +
      'step outside on Mars, and why the suit is not clothing, it is a spacecraft.',
    source: 'NASA Mars Fact Sheet; Armstrong limit, ~6.3 kPa at 37 \u00b0C',
  },
  co2Kills: {
    id: 'co2Kills',
    headline: 'You can suffocate with a full oxygen tank',
    body:
      'Oxygen is not the only consumable that matters. The carbon dioxide you exhale has to be chemically removed or ' +
      'it builds up in the helmet, and CO\u2082 poisoning arrives as confusion and poor judgement before it arrives as ' +
      'unconsciousness \u2014 which means the first thing you lose is your ability to notice you are losing it. ' +
      'Watch the scrubber, not just the O\u2082.',
    source: 'Portable life support architecture; CO\u2082 washout is a standing EVA concern',
  },
  coldKills: {
    id: 'coldKills',
    headline: 'The battery is the heater, and the heater is survival',
    body:
      'Jezero swings from around \u221220 \u00b0C in the warmest part of the afternoon to below \u221280 \u00b0C before dawn. ' +
      'The thin air carries little heat, so you lose it mostly by radiation, and the only thing stopping that is ' +
      'electrical heating. A dead battery on Mars does not mean the lights go out. It means you freeze with oxygen ' +
      'left to breathe, which is why battery is so often the limiting consumable on this EVA.',
    source: 'Perseverance MEDA air temperatures at Jezero; Curiosity REMS at Gale',
  },
  radiationShelter: {
    id: 'radiationShelter',
    headline: 'Mass is the only shielding, and the suit has almost none',
    body:
      'Mars has no global magnetic field and about one percent of Earth\u2019s atmospheric column, so galactic cosmic ' +
      'rays reach the ground. Curiosity\u2019s RAD instrument measured roughly 0.2 to 0.3 millisieverts a day on the ' +
      'surface. A solar particle event can deliver a large fraction of a career limit in hours. A pressure suit stops ' +
      'almost none of it; regolith, water and a cabin wall stop most. When the particle monitor goes off, the answer ' +
      'is to get mass between you and the sky.',
    source: 'Hassler et al. 2014, Science 343, 1244797 (MSL RAD surface dose)',
  },
  noCompass: {
    id: 'noCompass',
    headline: 'There is no GPS and a compass does not work',
    body:
      'Mars lost its global magnetic field billions of years ago, so a magnetic compass points at nothing useful, and ' +
      'there is no satellite navigation constellation. You navigate by the Sun, by landmarks and by dead reckoning ' +
      'from your own tracks. In a dust event, when visibility collapses and the Sun becomes a smear, all three of ' +
      'those go at once \u2014 which is why a storm is a navigation emergency long before it is anything else.',
    source: 'MGS magnetometer: crustal remanence only, no global dipole',
  },
  rind: {
    id: 'rind',
    headline: 'The outside of a Mars rock is not the rock',
    body:
      'Every exposed surface on Mars carries a dust coating over an oxidised weathering rind. It can hide a texture completely, or fake one convincingly. Until you have cut through it you are reading the planet’s paint, not its geology — which is why Perseverance grinds a 5 cm patch before any instrument is allowed to look.',
    source: 'Mars 2020 sampling system; NASA/JPL PIA24926, PIA24940',
  },
  dustIsTheHazard: {
    id: 'dustIsTheHazard',
    headline: 'Dust is the number one problem with working on Mars',
    body:
      'Martian fines are a few micrometres across, electrostatically clingy, and loaded with perchlorate salts at around the half-percent level. They abrade seals, blind optics, foul radiators and are toxic to breathe. Apollo crews lost suit joints to lunar dust in three days. Dust management is not housekeeping on Mars, it is life support.',
    source: 'Phoenix WCL (Hecht et al. 2009, Science 325, 64); Apollo EVA debriefs',
  },
  gravityNotWeight: {
    id: 'gravityNotWeight',
    headline: 'You cannot lean on a tool at 0.38 g',
    body:
      'Mars surface gravity is 3.72 m/s², 38% of Earth’s. Your mass is unchanged, so you still have full inertia to fight, but you have barely a third of the weight to press a cutting tool into rock. Every reaction load has to be taken by your stance or by a brace, not by your body weight.',
    source: 'NASA Mars Fact Sheet',
  },
  shadowTheTarget: {
    id: 'shadowTheTarget',
    headline: 'Shade the thing you are trying to see',
    body:
      'Mars gets about 590 W/m² at the top of the atmosphere and direct sun at the surface is harsh and nearly unfiltered at short wavelengths. At hand-lens scale that glare destroys exactly the fine texture you are looking for. WATSON takes its sharpest close-ups fully shadowed, by putting the arm between the Sun and the rock.',
    source: 'NASA/JPL PIA24940 caption',
  },
  massIsLife: {
    id: 'massIsLife',
    headline: 'Mass you carry is mass you breathe for',
    body:
      'Carrying anything costs oxygen, because walking cost scales with the mass you are moving. Perseverance returned thirteen cores in its first thousand sols. Sampling is rationed, not collected — and a sample taken without a recorded field observation arrives on Earth as a rock with no story, which is worth a fraction of the same rock with one.',
    source: 'NASA/JPL PIA26232; Pandolf-type metabolic cost scaled to Mars gravity',
  },
  noOneToAsk: {
    id: 'noOneToAsk',
    headline: 'Earth cannot help you with the next ten minutes',
    body:
      'One-way light time to Earth runs from about 3 minutes near opposition to 22 near conjunction. Ask a question and the answer is two light times plus thinking time old when it arrives. Anything that can hurt you faster than that is yours alone to decide. This is the single biggest operational difference between Mars and low Earth orbit.',
    source: 'JPL approximate planetary positions, computed live in this app',
  },
  contextFrame: {
    id: 'contextFrame',
    headline: 'A close-up with no wide shot is nearly worthless',
    body:
      'A photograph without its position, its illumination geometry and a wider frame around it cannot be tied back to the stratigraphy. Perseverance’s 1,118-frame delta panorama exists so that every close-up afterwards has somewhere to sit. Log the Sun angle with the frame or you have logged a pretty picture.',
    source: 'NASA/JPL PIA24921',
  },
  cacheRange: {
    id: 'cacheRange',
    headline: 'Pre-positioned supplies are what create range',
    body:
      'Walking range is not set by how far you can walk. It is set by how far you can walk and still walk back, on what you carry. The only way to beat that is to put consumables out on the surface in advance — the same logic behind the Three Forks sample depot, surveyed to the metre so somebody else can find it later.',
    source: 'NASA/JPL PIA25682, PIA25738',
  },
  flagTreaty: {
    id: 'flagTreaty',
    headline: 'A flag on Mars is commemoration, not a claim',
    body:
      'Article II of the 1967 Outer Space Treaty, which every spacefaring nation has signed, makes outer space and celestial bodies not subject to national appropriation by any means. Planting a flag marks that people came. It establishes no territory. Also: at 6 millibars there is not enough air to fly one — Apollo used a horizontal wire, and Mars would need the same.',
    source: 'Outer Space Treaty 1967, Article II; Apollo flag assembly design',
  },
  shelterNotDie: {
    id: 'shelterNotDie',
    headline: 'The reserve is not a resource',
    body:
      'A consumables reserve exists so that the unexpected has somewhere to come out of. The moment you start spending it to finish a task, you have no margin for the next surprise — and on Mars the next surprise is a dust front you cannot see through or a slope that is softer than it looked. Turning back with science undone is a successful EVA. There is no partial credit for a suit that ran out.',
    source: 'Standard EVA flight-rule practice; modelled in this app’s return estimate',
  },
}

// ---------------------------------------------------------------------------
// The procedures
// ---------------------------------------------------------------------------

export function abradeActivity(st: Station): ActivityDef {
  return {
    kind: 'abrade',
    title: 'Abrade a patch',
    subtitle: `${st.codename} — clear the weathering rind to fresh rock`,
    tool: 'brush',
    minutes: st.abradeMinutes,
    realSec: realSecFor(st.abradeMinutes),
    resultTitle: 'Fresh rock exposed',
    beats: [
      {
        at: 0,
        label: 'Brace the tool against the outcrop',
        detail:
          'At 0.38 g your body weight cannot push a cutting tool into rock. The reaction load goes into your stance and into the brace, or the bit skates.',
        meter: 'reaction load → stance',
      },
      {
        at: 0.16,
        label: 'Abrading bit down — rotary percussive',
        detail:
          'A circle about 5 cm across, taken down roughly 8 mm. That is the same patch geometry Perseverance grinds, and it is sized so the analytical instruments can see nothing but fresh rock.',
        meter: 'patch ø 50 mm · depth 8 mm',
      },
      {
        at: 0.44,
        label: 'Rind breaking through — tailings building up',
        detail:
          'The cuttings pile up inside the hole and hide the surface you cut it to see. This is the point where the job is half done and looks finished.',
        meter: 'cuttings accumulating',
      },
      {
        at: 0.62,
        label: 'Dust removal — gas, not a brush',
        detail:
          'Perseverance blows the patch clear with puffs of nitrogen from its gaseous Dust Removal Tool. A brush would drag fines back across the fresh rock and contaminate the one surface you care about.',
        meter: 'N₂ puff · 5 of 5',
      },
      {
        at: 0.84,
        label: 'Patch clear — document before you touch it',
        detail:
          'Image the prepared surface before anything else gets near it. Once an instrument or a glove has been on it, you can no longer prove what it looked like when it was fresh.',
        meter: 'documentation frame',
      },
    ],
    images: ['abrasionPatches', 'abrasionWalhalla'],
    lesson: LESSONS.rind,
  }
}

export function lensActivity(st: Station, abraded: boolean): ActivityDef {
  return {
    kind: 'lens',
    title: 'Hand lens on the target',
    subtitle: abraded
      ? `${st.codename} — close inspection of the prepared patch`
      : `${st.codename} — inspection through an intact rind`,
    tool: 'lens',
    minutes: st.lensMinutes,
    realSec: realSecFor(st.lensMinutes),
    resultTitle: abraded ? 'Texture resolved' : 'Little resolved',
    beats: [
      {
        at: 0,
        label: 'Put your own shadow on the target',
        detail:
          'Direct Mars sunlight at this scale burns out the fine texture. WATSON takes its sharpest close-ups fully shadowed; you do it by standing in the right place.',
        meter: 'target shadowed',
      },
      {
        at: 0.2,
        label: 'Set working distance and focus',
        detail:
          'Hand-lens scale is roughly 10 cm from the rock, around 10x. Everything that decides what this rock is happens between a millimetre and a centimetre.',
        meter: '≈ 10x · 100 mm standoff',
      },
      {
        at: 0.44,
        label: 'Grain size and sorting',
        detail: abraded
          ? 'Grain size tells you how much energy the transporting medium had. Sorting tells you how long it worked on them. Together they tell you what moved this sediment.'
          : 'Through the dust coating and the oxidised rind, grain boundaries will not resolve. You are looking at weathering products, not grains.',
        meter: abraded ? 'grains resolving' : 'no grain boundaries',
      },
      {
        at: 0.68,
        label: 'Cement, contacts and crystal habit',
        detail: abraded
          ? 'What holds the grains together, and whether crystals grew in place or were deposited, separates a sedimentary rock from an igneous one at a glance.'
          : 'A rind can both hide a real texture and imitate a false one. Anything recorded from here carries a confidence caveat for good reason.',
        meter: abraded ? 'cement visible' : 'ambiguous',
      },
      {
        at: 0.86,
        label: 'Log the observation geometry',
        detail:
          'Standoff, magnification, illumination and which patch it was. Without those four numbers the image cannot be compared with anything.',
        meter: 'geometry logged',
      },
    ],
    images: abraded ? ['watsonDourbes', 'pixlOuzel'] : ['abrasionPatches'],
    lesson: abraded ? LESSONS.shadowTheTarget : LESSONS.rind,
  }
}

export function recordActivity(st: Station, confident: boolean): ActivityDef {
  return {
    kind: 'record',
    title: 'Record the interpretation',
    subtitle: `${st.codename} — commit a field call to the log`,
    tool: 'none',
    minutes: Math.max(1, Math.round(st.workMinutes * 0.3)),
    realSec: 8,
    resultTitle: 'Observation on the record',
    beats: [
      {
        at: 0,
        label: 'State the observation, not the conclusion',
        detail:
          'Field notes separate what you saw from what you think it means. The first is evidence and survives being wrong; the second is an argument.',
        meter: 'dictating to the log',
      },
      {
        at: 0.26,
        label: 'Attach the supporting frames',
        detail: confident
          ? 'Prepared patch, hand-lens frames, illumination geometry. The call is anchored to something somebody else can check.'
          : 'No prepared surface to point at. The call goes in the log flagged, because a reviewer on Earth has no way to confirm it.',
        meter: confident ? 'evidence attached' : 'unsupported — flagged',
      },
      {
        at: 0.56,
        label: 'Nobody can confirm this for you',
        detail:
          'The nearest person who could argue with you is at least three minutes away at the speed of light, and typically much more. You are the reviewer.',
        meter: 'autonomous decision',
      },
      {
        at: 0.82,
        label: 'Commit — it is permanent',
        detail:
          'This is what gives any sample from this station its meaning. A tube with a recorded field context is worth several times the same tube without one.',
        meter: 'written to mission log',
      },
    ],
    images: ['cheyavaWorkspace'],
    lesson: LESSONS.noOneToAsk,
  }
}

export function coreActivity(st: Station): ActivityDef {
  const minutes = Math.max(1, Math.round(st.workMinutes * 0.55))
  return {
    kind: 'core',
    title: 'Seal a core',
    subtitle: `${st.codename} — ${st.sampleName}`,
    tool: 'drill',
    minutes,
    realSec: realSecFor(minutes),
    resultTitle: 'Core sealed',
    beats: [
      {
        at: 0,
        label: 'Seat the coring bit beside the patch',
        detail:
          'Not through the abrasion patch — beside it. The patch is the documented surface that gives the core its context, so you do not destroy it to get the sample.',
        meter: 'offset from patch',
      },
      {
        at: 0.18,
        label: 'Rotary percussive to depth',
        detail:
          'Hammering while rotating, because rotation alone polishes hard rock instead of cutting it. The core comes out slightly thicker than a pencil and about 6 cm long.',
        meter: 'ø 13 mm · depth 60 mm',
      },
      {
        at: 0.46,
        label: 'Break the core off at the base',
        detail:
          'A clean break matters. A core that snaps halfway gives you a short sample and a jammed bit, and there is nobody coming to clear it.',
        meter: 'core break-off',
      },
      {
        at: 0.64,
        label: 'Volume assessment image',
        detail:
          'Photograph the core inside the tube before sealing, so the amount of rock in it is known on Earth. Perseverance does exactly this, and has caught empty tubes that way.',
        meter: 'imaging inside tube',
      },
      {
        at: 0.82,
        label: 'Hermetic seal and label',
        detail:
          'Sealed, serial-numbered and logged against the observation you just recorded. The seal is what makes it a sample rather than a rock in a bag.',
        meter: 'tube sealed',
      },
    ],
    images: ['coreInDrill', 'tubesSol1000'],
    lesson: LESSONS.massIsLife,
  }
}

export function photoActivity(label: string): ActivityDef {
  return {
    kind: 'photo',
    title: 'Context frame',
    subtitle: label,
    tool: 'none',
    minutes: 1,
    realSec: 7,
    resultTitle: 'Frame captured and geo-tagged',
    beats: [
      {
        at: 0,
        label: 'Frame wide enough to be useful',
        detail:
          'Include the horizon or a known landmark. A frame with nothing recognisable in it cannot be located later, however sharp it is.',
        meter: 'composing',
      },
      {
        at: 0.3,
        label: 'Record the illumination geometry',
        detail:
          'Sun elevation and azimuth, local true solar time, dust opacity. Shadow direction and length are how anybody later works out the shape of what you photographed.',
        meter: 'sun angle · LTST · opacity',
      },
      {
        at: 0.62,
        label: 'Tag position and heading',
        detail:
          'Where you stood and which way you faced. Without it the frame is an image; with it the frame is data.',
        meter: 'position · heading',
      },
      {
        at: 0.85,
        label: 'Queue for downlink',
        detail: 'Nothing is science until it is off the planet.',
        meter: 'queued',
      },
    ],
    images: ['deltaPano'],
    lesson: LESSONS.contextFrame,
  }
}

export function flagActivity(countryName: string): ActivityDef {
  return {
    kind: 'flag',
    title: 'Emplace commemorative flag',
    subtitle: countryName,
    tool: 'flag',
    minutes: 2,
    realSec: 9,
    resultTitle: 'Flag emplaced',
    beats: [
      {
        at: 0,
        label: 'Find ground that will hold a pole',
        detail:
          'Regolith over bedrock, not drift sand. A pole in a ripple crest falls over in the first afternoon convective gust.',
        meter: 'probing regolith',
      },
      {
        at: 0.26,
        label: 'Drive the pole',
        detail:
          'At 0.38 g you cannot hammer with your weight. Short strokes, load into the stance, and accept that it goes in slower than it would at home.',
        meter: 'penetration · slow',
      },
      {
        at: 0.56,
        label: 'Deploy the horizontal spar',
        detail:
          'Mars air is about 6 millibars — under one percent of Earth’s. There is nowhere near enough air to hold a flag out, so it needs a wire or spar along the top edge. Apollo solved the same problem the same way on the Moon.',
        meter: 'spar extended',
      },
      {
        at: 0.82,
        label: 'Photograph, and say what it is',
        detail:
          'Outer Space Treaty Article II: no celestial body is subject to national appropriation. This marks that people came here. It claims nothing.',
        meter: 'documented',
      },
    ],
    images: ['dustDevilSelfie'],
    lesson: LESSONS.flagTreaty,
  }
}

export function cacheActivity(name: string, minutes: number): ActivityDef {
  return {
    kind: 'cache',
    title: 'Consumables swap',
    subtitle: name,
    tool: 'none',
    minutes,
    realSec: realSecFor(minutes),
    resultTitle: 'Loads swapped',
    beats: [
      {
        at: 0,
        label: 'Open the depot and verify the inventory',
        detail:
          'Check it is the cache you think it is and that it holds what the manifest says. A depot you cannot verify is a hope, not a plan.',
        meter: 'manifest check',
      },
      {
        at: 0.2,
        label: 'Swap the oxygen bottle',
        detail:
          'The single highest-value item out here. Everything else lets you work; this lets you exist.',
        meter: 'O₂ bottle exchanged',
      },
      {
        at: 0.44,
        label: 'Fresh carbon dioxide scrubber',
        detail:
          'Oxygen is not the only thing that runs out. The CO₂ you exhale has to be removed or it kills you with a full oxygen tank still on your back.',
        meter: 'scrubber cartridge',
      },
      {
        at: 0.66,
        label: 'Battery and water',
        detail:
          'Mars nights reach around −100 °C at this latitude. Battery is suit heating, and heating is survival after sunset.',
        meter: 'battery · water',
      },
      {
        at: 0.86,
        label: 'Log what you took and what is left',
        detail:
          'Write down what the depot still holds. The next person to need it — possibly you, later today — plans against that number.',
        meter: 'depot state logged',
      },
    ],
    images: ['depotMontage', 'depotMap'],
    lesson: LESSONS.cacheRange,
  }
}

export function shelterActivity(where: string): ActivityDef {
  return {
    kind: 'shelter',
    title: 'Take shelter',
    subtitle: where,
    tool: 'none',
    minutes: 3,
    realSec: 8,
    resultTitle: 'Sheltered',
    beats: [
      {
        at: 0,
        label: 'Get the terrain between you and the wind',
        detail:
          'A scarp face, a boulder cluster or the lee of a ridge. You are looking to cut the dust flux and the sand blasting at suit height, not to hide from the sky.',
        meter: 'seeking lee',
      },
      {
        at: 0.3,
        label: 'Face away, protect the visor and seals',
        detail:
          'A scratched visor is permanent and a fouled seal is fatal. Both are cheaper to prevent than to discover.',
        meter: 'visor downwind',
      },
      {
        at: 0.6,
        label: 'Drop the metabolic rate',
        detail:
          'Stopping is an oxygen decision as well as a safety one. Standing still roughly halves your consumption against walking, which buys you minutes you may need later.',
        meter: 'metabolic rate down',
      },
      {
        at: 0.85,
        label: 'Re-run the walk-home number',
        detail:
          'Shelter is only the right answer while the margin still covers the walk back afterwards. Recompute, then decide whether this is a pause or an abort.',
        meter: 'margin recomputed',
      },
    ],
    images: ['dustStormGlobal', 'slipperyTerrain'],
    lesson: LESSONS.shelterNotDie,
  }
}

export function ingressActivity(dustFouling: number): ActivityDef {
  return {
    kind: 'ingress',
    title: 'Ingress and repressurise',
    subtitle: 'Climb the ladder, clean down, and get the suit off',
    tool: 'none',
    minutes: 8,
    realSec: 11,
    resultTitle: 'Inside. Suit off.',
    beats: [
      {
        at: 0,
        label: 'Clean down before the hatch',
        detail:
          `Brush and blow the worst of it off outside. You are carrying ${(dustFouling * 100).toFixed(0)}% dust fouling, ` +
          'and every gram that comes through the hatch stays in the habitat for the rest of the mission — in the ' +
          'filters, in the food, and in your lungs.',
        meter: 'dust mitigation',
      },
      {
        at: 0.22,
        label: 'Into the airlock, outer hatch closed',
        detail:
          'A suitport or an airlock exists so the habitat atmosphere is never thrown away and the dust never gets ' +
          'past this volume. The hatch seal is a wear item and dust is what wears it.',
        meter: 'outer hatch sealed',
      },
      {
        at: 0.46,
        label: 'Repressurise',
        detail:
          'From about 7 millibars outside to a habitable cabin. Outside is far below the Armstrong limit — the ' +
          'pressure at which water boils at body temperature — so this is not a comfort step, it is the whole ' +
          'reason the suit existed for the last few hours.',
        meter: '7 mbar → cabin',
      },
      {
        at: 0.7,
        label: 'Equalise, then crack the helmet',
        detail:
          'Pressure equal on both sides before anything is opened. A suit at a higher pressure than the cabin is a ' +
          'hatch that will not open, and a cabin at a higher pressure is a hatch that opens very fast indeed.',
        meter: 'Δp ≈ 0',
      },
      {
        at: 0.88,
        label: 'Doff the suit and log the consumables',
        detail:
          'What came back in the tanks is what tomorrow gets planned against. The number you write down now is the ' +
          'number that decides how far anyone can walk next sol.',
        meter: 'consumables logged',
      },
    ],
    images: ['dustDevilSelfie'],
    lesson: LESSONS.pressureSuit,
  }
}

/** The beat active at a given progress fraction. */
export function activeBeat(def: ActivityDef, progress: number): number {
  let i = 0
  for (let k = 0; k < def.beats.length; k++) if (progress >= def.beats[k].at) i = k
  return i
}
