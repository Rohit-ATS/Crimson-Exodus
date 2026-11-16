/**
 * brain.ts — MERV's reasoning layer.
 *
 * Two jobs, and they are different.
 *
 *  1. ANSWER. A question comes in; an answer goes out. Questions about Mars go
 *     to the sourced knowledge base. Questions about *this EVA* — "can I keep
 *     going", "how far am I from home", "what should I do next" — are answered
 *     from the live simulation, with the actual numbers, because those are the
 *     questions a companion exists to answer and a general-purpose language
 *     model cannot: it does not know how much oxygen is left in this suit.
 *
 *  2. VOLUNTEER. Nobody asks the important question in time. So MERV watches
 *     the telemetry himself and speaks first when something crosses a line.
 *
 * Everything here is a pure function of a telemetry snapshot. That makes the
 * whole conversational layer testable without a browser, a microphone or a
 * network, and it is why the same code can drive the offline transcript and
 * the prompt handed to a hosted language model.
 */

import { CONSUMABLE_LABEL } from '../sim/consumables'
import { marginIsThin } from '../sim/hazard'
import { missionStatus, stationProgress } from '../mission/objectives'
import { STATIONS } from '../mission/site'
import { roverStatusLine } from '../sim/rover'
import { formatHours, seasonName } from '../sim/orbits'
import { live } from '../state/live'
import type { State } from '../state/store'
import { QUIPS, findTopic, pick } from './knowledge'

/** Everything MERV can see. Flat and serialisable on purpose. */
export interface Telemetry {
  phase: string
  /** EVA elapsed, minutes. */
  evaMin: number
  ltst: number
  sol: number
  season: string
  sunElevationDeg: number

  x: number
  z: number
  distanceFromLanderM: number
  slopeDeg: number
  hazardScore: number

  walkHomeMin: number
  enduranceMin: number
  marginMin: number
  reserveMarginMin: number
  limiting: string
  limitingLabel: string
  retStatus: string
  o2: number
  scrubber: number
  battery: number
  water: number

  tempC: number
  pressurePa: number
  windMs: number
  gustMs: number
  tau: number
  visibilityM: number
  transmission: number

  weatherKind: string
  weatherPhase: string
  weatherHeadline: string
  minutesToNextPhase: number
  advisesShelter: boolean
  advisesAbort: boolean
  stormFromDeg: number

  doseMSv: number
  doseRateUSvH: number
  sepPhase: string | null

  nearStation: string | null
  nearStationName: string | null
  stationNext: string | null
  stationsWorked: number
  samples: number
  photos: number
  atLander: boolean

  objectivesDone: number
  objectivesTotal: number
  nextObjective: string | null
  nextObjectiveStep: string | null
  criticalStatus: string | null

  owltMin: number
  dustFouling: number
  sheltering: boolean

  shelterName: string | null
  shelterDistM: number
  shelterIsAbort: boolean
  shelterWhy: string | null

  roverMode: string
  roverBattery: number
  roverArrayW: number
  roverArrayDust: number
  roverOdoM: number
  roverStatus: string
}

/** Read a telemetry snapshot out of mission state. */
export function snapshot(s: State): Telemetry {
  const st = missionStatus(s)
  const station = s.nearStation ? STATIONS.find((x) => x.id === s.nearStation) ?? null : null
  const prog = s.nearStation ? stationProgress(s, s.nearStation) : null
  const r = live.rover
  const worked = Object.values(s.stations).filter((x) => x.inspected || x.sampled).length

  return {
    phase: s.phase,
    evaMin: s.time.evaSec / 60,
    ltst: s.clock.ltstHours,
    sol: s.clock.siteSol,
    season: seasonOf(s),
    sunElevationDeg: s.clock.sunElevationDeg,

    x: s.jackX,
    z: s.jackZ,
    distanceFromLanderM: Math.hypot(s.jackX, s.jackZ),
    slopeDeg: s.hazard.slope,
    hazardScore: s.hazard.score,

    walkHomeMin: s.ret.walkMinutes,
    enduranceMin: s.ret.enduranceMinutes,
    marginMin: s.ret.marginMinutes,
    reserveMarginMin: s.ret.marginAfterReserveMinutes,
    limiting: s.ret.limiting,
    limitingLabel: CONSUMABLE_LABEL[s.frac.limiting] ?? s.frac.limiting,
    retStatus: s.ret.status,
    o2: s.frac.o2,
    scrubber: s.frac.scrubber,
    battery: s.frac.battery,
    water: s.frac.water,

    tempC: s.env.airTempC,
    pressurePa: s.env.pressurePa,
    windMs: s.env.windMs,
    gustMs: s.env.gustMs,
    tau: s.env.dustOpticalDepth,
    visibilityM: s.weather.visibilityM,
    transmission: s.env.solarTransmission,

    weatherKind: s.weather.kind,
    weatherPhase: s.weather.phase,
    weatherHeadline: s.weather.headline,
    minutesToNextPhase: s.weather.minutesToNextPhase,
    advisesShelter: s.weather.advisesShelter,
    advisesAbort: s.weather.advisesAbort,
    stormFromDeg: s.stormFromDeg,

    doseMSv: s.doseMSv,
    doseRateUSvH: s.radiation.doseRateUSvH,
    sepPhase: s.radiation.sepPhase ?? null,

    nearStation: s.nearStation,
    nearStationName: station?.name ?? null,
    stationNext: prog?.next ?? null,
    stationsWorked: worked,
    samples: s.samples.length,
    photos: s.photos.length,
    atLander: s.atLander,

    objectivesDone: st.primaryDone,
    objectivesTotal: st.primaryTotal,
    nextObjective: st.nextUp?.title ?? null,
    nextObjectiveStep: st.nextUp?.next ?? st.nextUp?.detail ?? null,
    criticalStatus: st.critical[0]?.statusLabel ?? null,

    owltMin: s.link.owltSec / 60,
    dustFouling: s.cons.dustFouling,
    sheltering: s.sheltering,

    shelterName: s.advice?.shelter.name ?? null,
    shelterDistM: s.advice?.distanceM ?? 0,
    shelterIsAbort: s.advice?.isAbort ?? false,
    shelterWhy: s.advice?.rationale ?? null,

    roverMode: r.mode,
    roverBattery: r.battery,
    roverArrayW: r.arrayW,
    roverArrayDust: r.arrayDust,
    roverOdoM: r.odometerM,
    roverStatus: roverStatusLine(r),
  }
}

function seasonOf(s: State): string {
  return seasonName(s.clock.solarLongitudeDeg)
}

export interface Reply {
  text: string
  /** Shown under the answer. Absent for situational answers, which cite the sim. */
  source?: string
  /** A survival-guide entry this answer should unlock. */
  lesson?: string
  /** Drives the colour of the line in the transcript. */
  tone: 'info' | 'warning' | 'danger' | 'science'
}

const pct = (v: number) => `${Math.round(v * 100)}%`
/** Minutes, spoken. These lines go through a speech engine, so "1 minutes" is
 *  not a cosmetic problem — it is audible. */
const m = (v: number) => {
  const n = Math.round(v)
  return `${n} ${n === 1 ? 'minute' : 'minutes'}`
}

/** Normalised question text, used by every matcher. */
function norm(q: string): string {
  return ` ${q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}
const any = (t: string, ...phrases: string[]) => phrases.some((p) => t.includes(` ${p} `) || t.includes(` ${p}`))

/**
 * Situational intents — questions about *now*, answered from the simulation.
 *
 * Ordered by how much it matters that the right one wins. A question that
 * could be either "should I turn back" or a general query about margins is
 * answered with this EVA's numbers, because that is the more useful answer and
 * the general one is one follow-up away.
 */
/**
 * `reply` receives the normalised question as well as the telemetry.
 *
 * Most intents ignore it. The consumables intent does not: "how much oxygen do
 * I have" and "how much battery do I have" are the same intent and want
 * different sentences, and an intent that cannot see which one was asked has
 * to answer both, which is how you get a companion that recites all four
 * gauges every time you ask about one.
 */
type Intent = { id: string; match: (t: string) => boolean; reply: (d: Telemetry, t: string) => Reply }

const INTENTS: Intent[] = [
  {
    id: 'turnback',
    match: (t) => any(t, 'should i turn', 'turn back', 'turn around', 'keep going', 'press on',
      'can i continue', 'should i continue', 'am i ok', 'am i safe', 'is it safe', 'abort',
      'do i have time', 'enough time', 'should i stay',
      // "How much time do I have left" is a margin question, not a clock
      // question, and it is one of the two or three things anybody actually
      // asks out loud. It used to reach the knowledge base and come back with
      // the length of a sol.
      'how much time', 'time do i have', 'time left', 'how long can i', 'how much longer',
      'can i make it', 'can i reach', 'far enough', 'should i go'),
    reply: (d) => {
      // Standing at the hatch there is no walk to be short of, and the return
      // estimate has nothing to work with yet. Answering "no, turn back" there
      // would be nonsense dressed up as caution.
      if (d.atLander && d.walkHomeMin < 0.2) {
        return {
          text: `You are at the lander, so there is nothing to get back from yet — walk home is zero and the margin is the whole suit: ${m(d.enduranceMin)} at the return workload, ${d.limitingLabel} limiting. Ask me again once you are out. The number that will matter is margin against walk home, and I will tell you the moment it gets thin.`,
          tone: 'info',
          lesson: 'massIsLife',
        }
      }
      // The same rule the shelter advisor uses. They must never disagree.
      const tight = marginIsThin(d.marginMin, d.walkHomeMin)
      const head = tight
        ? 'No. Turn for home now.'
        : d.marginMin < d.walkHomeMin ? 'I would start back. This is the decision point, not a warning.'
          : 'You have room, and here is the arithmetic.'
      const storm = d.advisesAbort
        ? ` And the weather has already made the call for you — ${d.weatherHeadline.toLowerCase()}, abort advised.`
        : d.advisesShelter ? ` Weather is also pushing at you: ${d.weatherHeadline.toLowerCase()}, shelter advised.`
          : ''
      return {
        text: `${head} Walk home is ${m(d.walkHomeMin)}. The suit can supply ${m(d.enduranceMin)} at the return workload, so your margin is ${m(d.marginMin)}, and ${m(d.reserveMarginMin)} of that is above the mandated reserve. ${d.limitingLabel} is the limiting item at ${pct(limitingFrac(d))}.${storm} The reserve is not a resource — the moment you start spending it, a surprise becomes a fatality instead of an inconvenience.`,
        tone: tight || d.advisesAbort ? 'danger' : d.marginMin < d.walkHomeMin ? 'warning' : 'info',
        lesson: 'massIsLife',
      }
    },
  },
  /**
   * The player's own consumables — the most-asked question there is.
   *
   * This intent did not exist, and its absence was the single worst bug in
   * MERV. "How much oxygen do I have left" matched no intent, fell through to
   * the knowledge base, scored highest against the atmospheric-composition
   * topic and came back as a lecture about Mars air being 0.16 percent oxygen.
   * A confident, well-sourced answer to a question nobody asked is worse than
   * a refusal, and it happened for oxygen, battery, water and the scrubber —
   * which is to say for every gauge on the suit.
   */
  {
    id: 'consumables',
    // 'your' belongs to the rover, not the suit: "how is your battery" is a
    // question about MERV and is answered by the roverself intent below.
    match: (t) => !any(t, 'your') && any(t,
      'my oxygen', 'my o2', 'my air', 'my battery', 'my power', 'my water', 'my scrubber',
      'my levels', 'my consumables', 'my suit', 'my supply', 'my supplies',
      'much oxygen', 'much o2', 'much air', 'much battery', 'much power', 'much water',
      'much scrubber', 'much charge', 'much left',
      'oxygen left', 'o2 left', 'air left', 'battery left', 'power left', 'water left',
      'oxygen do i', 'o2 do i', 'air do i', 'battery do i', 'water do i', 'power do i',
      'oxygen am i', 'oxygen is left', 'battery is left', 'water is left',
      'what is limiting', 'limiting me', 'limiting item', 'limiting consumable',
      'running low', 'running out', 'life support', 'consumable'),
    reply: consumableReply,
  },
  /**
   * Time of day, sol, and elapsed EVA — read off the mission clock.
   *
   * "What time is it on Mars" and "what sol is it" both used to be answered
   * with the LENGTH of a sol, which is a fine fact and not the question.
   */
  {
    id: 'clocknow',
    match: (t) => any(t, 'what time is it', 'time is it', 'what sol', 'which sol', 'sol is it',
      'sol are we', 'local time', 'solar time', 'time of day', 'what is the time',
      'how long have i been', 'how long have we been', 'how long out', 'how long outside',
      'been out here', 'elapsed', 'what season'),
    reply: (d) => ({
      text: `${m(d.evaMin)} into the EVA. Local true solar time is ${formatHours(d.ltst)} on sol ${d.sol}, ${d.season}, sun ${d.sunElevationDeg.toFixed(0)} degrees above the horizon. A sol runs 24 hours 39 minutes, so my clock and yours drift apart by about forty minutes a day — which is why the mission runs on sols and not on dates. What matters more than the hour is the light: once the sun drops, your power budget and your footing both get worse at the same time.`,
      tone: 'info',
    }),
  },
  {
    id: 'status',
    match: (t) => any(t, 'status', 'how am i doing', 'report', 'sitrep', 'how are things',
      'how much do i have', 'consumables', 'how is it going', 'where do i stand'),
    reply: (d) => ({
      text: `${m(d.evaMin)} into the EVA, local solar time ${formatHours(d.ltst)}, sol ${d.sol}. You are ${d.distanceFromLanderM.toFixed(0)} metres from the lander with ${m(d.walkHomeMin)} of walking to get back. Oxygen ${pct(d.o2)}, scrubber ${pct(d.scrubber)}, battery ${pct(d.battery)}, water ${pct(d.water)} — ${d.limitingLabel} is limiting. Margin ${m(d.marginMin)}, status ${d.retStatus}. Outside it is ${d.tempC.toFixed(0)} degrees, wind ${d.windMs.toFixed(1)} metres per second, optical depth ${d.tau.toFixed(2)}, visibility ${(d.visibilityM / 1000).toFixed(1)} kilometres. ${d.stationsWorked} station worked, ${d.samples} tube sealed, ${d.photos} frames in the log.`,
      tone: d.retStatus === 'critical' ? 'danger' : d.retStatus === 'warning' ? 'warning' : 'info',
    }),
  },
  {
    id: 'weathernow',
    match: (t) => any(t, 'storm coming', 'is a storm', 'weather', 'forecast', 'wind right now',
      'what is the sky doing', 'dust coming', 'how bad is it', 'visibility'),
    reply: (d) => {
      if (d.weatherKind === 'clear') {
        return {
          text: `Nothing on top of us. Optical depth ${d.tau.toFixed(2)}, visibility ${(d.visibilityM / 1000).toFixed(1)} kilometres, wind ${d.windMs.toFixed(1)} with gusts to ${d.gustMs.toFixed(1)}. ${pct(d.transmission)} of the sunlight is reaching the ground. That is background dust loading, and at this season it is what nominal looks like. I am watching the up-sun horizon — if that changes I will tell you before you notice it.`,
          tone: 'info',
        }
      }
      const kind = d.weatherKind === 'regional-storm' ? 'A regional dust storm' : 'A dust devil'
      return {
        text: `${kind}, phase ${d.weatherPhase}, arriving from bearing ${d.stormFromDeg.toFixed(0)} degrees. ${d.weatherHeadline}. Next phase change in about ${m(d.minutesToNextPhase)}. Optical depth ${d.tau.toFixed(2)}, visibility down to ${d.visibilityM < 1000 ? `${d.visibilityM.toFixed(0)} metres` : `${(d.visibilityM / 1000).toFixed(1)} kilometres`}, ${pct(d.transmission)} of sunlight getting through. ${d.advisesAbort ? 'Mission rules say abort.' : d.advisesShelter ? 'Mission rules say shelter or return.' : 'Still inside limits, but I would not add range right now.'}`,
        tone: d.advisesAbort ? 'danger' : d.advisesShelter ? 'warning' : 'info',
        lesson: 'dustIsTheHazard',
      }
    },
  },
  {
    id: 'whereshelter',
    match: (t) => any(t, 'where do i go', 'where should i go', 'nearest shelter', 'take cover',
      'where is shelter', 'get out of this', 'hide from'),
    reply: (d) => {
      if (!d.shelterName) {
        return {
          text: 'No shelter recommendation active, because nothing is currently threatening you. When something is, I will name the position and tell you how long it takes to reach it. For reference, the lander is the only thing out here that actually repressurises.',
          tone: 'info',
          lesson: 'shelterNotDie',
        }
      }
      return {
        text: `${d.shelterIsAbort ? 'Home. ' : ''}${d.shelterName}, ${d.shelterDistM.toFixed(0)} metres out. ${d.shelterWhy ?? ''}`,
        tone: d.shelterIsAbort ? 'warning' : 'info',
        lesson: 'shelterNotDie',
      }
    },
  },
  {
    id: 'whatnext',
    match: (t) => any(t, 'what next', 'what should i do', 'what now', 'objective', 'mission',
      'what am i here for', 'what is left', 'to do', 'am i done', 'how do i win', 'succeed'),
    reply: (d) => {
      const crit = d.criticalStatus ? ` Critical objective — come home alive — currently reads: ${d.criticalStatus}.` : ''
      if (!d.nextObjective) {
        return {
          text: `Every primary objective is done: ${d.objectivesDone} of ${d.objectivesTotal}.${crit} The useful thing now is to get back inside while the margin is still comfortable. Nothing you add to the science return is worth the suit.`,
          tone: 'info',
        }
      }
      return {
        text: `${d.objectivesDone} of ${d.objectivesTotal} primary objectives done. Next up: ${d.nextObjective}. ${d.nextObjectiveStep ?? ''}${crit}`,
        tone: 'info',
      }
    },
  },
  {
    id: 'whereami',
    match: (t) => any(t, 'where am i', 'how far', 'position', 'coordinates', 'how far from',
      'distance', 'how far away', 'how long to get back', 'how long to walk'),
    reply: (d) => ({
      text: `${d.distanceFromLanderM.toFixed(0)} metres from the lander, on ground sloping about ${d.slopeDeg.toFixed(0)} degrees. Walking that back costs ${m(d.walkHomeMin)} at your current speed, and the route is not a straight line, which is why the number is bigger than the distance suggests. Remember there is no compass and no GPS here — I am dead-reckoning off my own odometry, ${d.roverOdoM.toFixed(0)} metres so far, and the sun angle.`,
      tone: 'info',
      lesson: 'noCompass',
    }),
  },
  {
    id: 'thisrock',
    match: (t) => any(t, 'this rock', 'this outcrop', 'what is this', 'what am i looking at',
      'this station', 'what do i do here', 'this site'),
    reply: (d) => {
      if (!d.nearStation) {
        return {
          text: 'You are not inside a station radius, so I have nothing specific to tell you about the ground under your boots beyond the slope and the roughness. Walk into a marked station and I will give you the outcrop and what it is for.',
          tone: 'info',
        }
      }
      const st = STATIONS.find((x) => x.id === d.nearStation)
      return {
        text: `${d.nearStationName}. ${st?.tagline ?? ''} ${st?.briefing ?? ''} Next step here: ${d.stationNext ?? 'nothing — this station is complete'}.`,
        tone: 'science',
        source: st?.realFeature ? `Modelled on ${st.realFeature}` : undefined,
        lesson: 'rind',
      }
    },
  },
  {
    id: 'radiationnow',
    match: (t) => any(t, 'how much radiation', 'my dose', 'am i getting dosed', 'dose so far',
      'radiation right now', 'particle'),
    reply: (d) => ({
      text: d.sepPhase
        ? `This is the part that matters. A solar particle event is in progress, phase ${d.sepPhase}, and the rate is ${d.doseRateUSvH.toFixed(0)} microsieverts per hour against a background near 27. You have taken ${d.doseMSv.toFixed(2)} millisieverts this EVA. Your suit stops almost none of this. The lander hull stops most of it. Go inside.`
        : `${d.doseMSv.toFixed(2)} millisieverts accumulated this EVA, at ${d.doseRateUSvH.toFixed(0)} microsieverts per hour. That is the galactic cosmic ray background, which is roughly 0.2 to 0.3 millisieverts a day on this surface — about twenty times Earth sea level. It is not an emergency. It is a budget you cannot stop spending while you are outside.`,
      tone: d.sepPhase ? 'danger' : 'info',
      source: 'MSL RAD surface measurements, Hassler et al. 2014',
      lesson: 'radiationShelter',
    }),
  },
  {
    id: 'earthnow',
    match: (t) => any(t, 'ask earth', 'call home', 'how long for a reply', 'light delay right now',
      'contact earth', 'can earth help'),
    reply: (d) => ({
      text: `Right now the one-way light time is ${d.owltMin.toFixed(1)} minutes, so a question and its answer cost you ${(d.owltMin * 2).toFixed(1)} minutes before anybody on Earth has even read it. That is why I exist. I am on this side of the delay, and I can be wrong in zero seconds instead of right in ${(d.owltMin * 2).toFixed(0)} minutes.`,
      tone: 'info',
      lesson: 'noOneToAsk',
    }),
  },
  {
    id: 'roverself',
    match: (t) => any(t, 'how are you', 'are you ok', 'your battery', 'your power', 'your array',
      'you alright', 'how is your', 'your status'),
    reply: (d) => ({
      text: `Battery ${pct(d.roverBattery)}, array making ${d.roverArrayW.toFixed(0)} watts with ${pct(d.roverArrayDust)} dust loading, ${d.roverOdoM.toFixed(0)} metres on the odometer. ${d.roverStatus}. ${d.roverArrayDust > 0.4 ? 'The dust on my array is the thing to watch — that is how Opportunity and InSight both ended, and a gust is the only thing that cleans it.' : 'Nothing I need from you.'}`,
      tone: d.roverBattery < 0.2 ? 'warning' : 'info',
    }),
  },
  {
    id: 'help',
    match: (t) => any(t, 'what can you do', 'help me', 'what do you know', 'commands',
      'who are you', 'what are you'),
    reply: () => ({
      text: 'I am MERV — a scout rover with a mast, six wheels and a radio. Two things I am good for. Ask me about where we are and I will answer from your live telemetry: whether you can keep going, how far home is, what the weather is doing, what is left on the objective list, what your dose is. Ask me about Mars itself and I will answer from forty-odd sourced entries — the air, the dust, radiation, water, power, time, navigation, how anybody gets home. I will also speak up on my own when something crosses a line, which is most of what I am actually for.',
      tone: 'info',
    }),
  },
  {
    id: 'joke',
    match: (t) => any(t, 'joke', 'funny', 'cheer me up', 'bored', 'say something'),
    reply: (d) => ({
      text: pick([
        `Two sols ago I calculated that at Perseverance's actual top speed, 0.042 metres per second, walking you back to that lander would take me ${(d.distanceFromLanderM / 0.042 / 3600).toFixed(1)} hours. I am faster than that. You are welcome, and please do not tell JPL.`,
        'I have been asked whether I get lonely. I have a 40-entry knowledge base, a solar array and a mast that can see 300 metres. I am the second least lonely thing on this planet. You are the first, because you have me.',
        'Good news: the atmosphere is 95 percent carbon dioxide, so every plant you ever killed would love it here. Bad news: everything else about here.',
        `My array is at ${pct(1 - d.roverArrayDust)} of clean output. On Earth that would be a reason to wash something. Here it is a reason to hope for wind. Those are very different feelings and I experience both daily.`,
      ], Math.round(d.evaMin * 7)),
      tone: 'info',
    }),
  },
]

/**
 * Topics whose subject is the planet's version of something the suit measures.
 * Reaching one of these with a question about yourself means the knowledge
 * base is about to answer the wrong question. See `respond`.
 */
const SHADOWED = new Set(['atmosphere', 'oxygen', 'water', 'power', 'co2', 'sol', 'food', 'windpower'])

/** Is the question about the player rather than about Mars? */
function selfReferential(t: string): boolean {
  return / (my|mine) /.test(t)
    || / (do|did|have|am|can|should) i /.test(t)
    || / i (have|got|need|carry|am carrying) /.test(t)
}

/** The four gauges, by the words a person uses for them out loud. */
const CONSUMABLES = [
  { id: 'o2', label: 'Oxygen', read: (d: Telemetry) => d.o2, keys: ['oxygen', 'o2', 'air'] },
  { id: 'scrubber', label: 'The CO2 scrubber', read: (d: Telemetry) => d.scrubber, keys: ['scrubber', 'co2', 'carbon dioxide'] },
  { id: 'battery', label: 'Battery', read: (d: Telemetry) => d.battery, keys: ['battery', 'power', 'charge', 'juice'] },
  { id: 'water', label: 'Water', read: (d: Telemetry) => d.water, keys: ['water', 'drink', 'drinking', 'thirsty'] },
] as const

/**
 * Answer a question about the suit's consumables from the suit.
 *
 * The shape of every answer is deliberate: the percentage first, because that
 * is what was asked, and then immediately the number that actually decides
 * anything, because a percentage of a tank tells you nothing about whether you
 * can get home. A player who learns only one thing from MERV should learn that
 * the gauge to watch is minutes of margin, not any single bar on the HUD.
 */
function consumableReply(d: Telemetry, t: string): Reply {
  const asked = CONSUMABLES.find((c) => any(t, ...c.keys))
  const limitLabel = d.limitingLabel
  const tight = marginIsThin(d.marginMin, d.walkHomeMin)
  const tone: Reply['tone'] = tight ? 'danger' : d.marginMin < d.walkHomeMin ? 'warning' : 'info'

  // The arithmetic that turns four percentages into one decision. Every
  // branch below ends with it, because it is the answer behind the question.
  const budget =
    `At the return workload the suit can supply ${m(d.enduranceMin)}, walk home is ${m(d.walkHomeMin)}, `
    + `so your margin is ${m(d.marginMin)} — ${m(d.reserveMarginMin)} of that above the mandated reserve.`

  if (asked && asked.id !== d.limiting) {
    return {
      text: `${asked.label} is at ${pct(asked.read(d))}. That is not what is going to end this EVA, though — ${limitLabel} is the limiting item at ${pct(limitingFrac(d))}, and the limiting item is the only one worth watching. ${budget} Four gauges exist precisely so that one of them can be comfortable while another one is killing you.`,
      tone,
      lesson: 'massIsLife',
    }
  }

  if (asked) {
    return {
      text: `${asked.label} is at ${pct(asked.read(d))}, and it is the limiting item right now — the first of the four to run out at this workload. ${budget} ${tight ? 'That margin is thin. Start back.' : 'Percent is the wrong unit for this decision; minutes are the right one.'}`,
      tone,
      lesson: 'massIsLife',
    }
  }

  // "How are my levels", "what is limiting me", "am I running low" — no single
  // gauge named, so read all four and name the one that matters.
  return {
    text: `Oxygen ${pct(d.o2)}, scrubber ${pct(d.scrubber)}, battery ${pct(d.battery)}, water ${pct(d.water)}. ${limitLabel} is limiting at ${pct(limitingFrac(d))}. ${budget} Status reads ${d.retStatus}.${tight ? ' And that margin is thin — turn for home.' : ''}`,
    tone,
    lesson: 'massIsLife',
  }
}

function limitingFrac(d: Telemetry): number {
  switch (d.limiting) {
    case 'o2': return d.o2
    case 'scrubber': return d.scrubber
    case 'battery': return d.battery
    default: return d.water
  }
}

/**
 * Answer one question.
 *
 * Situational intents first, then the sourced knowledge base, then an honest
 * refusal. The refusal is deliberate and it is the most important branch: a
 * companion that invents a radiation number is worse than no companion.
 */
export function respond(question: string, d: Telemetry): Reply {
  const t = norm(question)
  if (!t.trim()) return { text: pick(QUIPS.idle, Math.round(d.evaMin)), tone: 'info' }

  /**
   * Before step-out there is no EVA to report on.
   *
   * MERV is reachable from the title screen, the briefing and the planner,
   * because a survival guide you can interrogate before you are in danger is
   * more use than one you can only consult while dying. But the mission
   * telemetry is all zeros until the hatch opens, and quoting zeros as though
   * they were measurements would be the exact failure this project is built to
   * avoid. So the situational intents are held back and the question is
   * answered honestly instead.
   */
  const preEva = d.phase !== 'surface'
  const offSurfaceOk = new Set(['help', 'joke', 'roverself'])

  for (const intent of INTENTS) {
    if (!intent.match(t)) continue
    if (preEva && !offSurfaceOk.has(intent.id)) {
      // For these two the "general answer" from the knowledge base is about
      // the planet's air and the planet's day, which is not what was asked
      // about and reads as MERV missing the point. Answer them honestly.
      if (intent.id === 'consumables' || intent.id === 'clocknow') return preEvaReply(intent.id)
      /**
       * Before step-out, a question that looks situational is usually general.
       * "How much radiation will I take" asked in the planner wants the
       * sourced Curiosity figure, not a refusal — so the knowledge base gets
       * first refusal, and only a question with no sourced answer falls
       * through to "we are not outside yet".
       */
      const general = findTopic(question)
      if (general) {
        return {
          // The honest clause comes first and is not optional: the question
          // was about this EVA, and there is no EVA yet. What follows is the
          // general rule, which is the useful half of the answer.
          text: `We are not outside yet, so I have no live telemetry to read you. The general answer: ${general.answer}`,
          source: general.source,
          lesson: general.lesson,
          tone: 'science',
        }
      }
      return preEvaReply(intent.id)
    }
    return intent.reply(d, t)
  }

  const topic = findTopic(question)

  /**
   * The encyclopedia is not allowed to answer a question about this suit.
   *
   * Several topics describe the planetary version of something the suit also
   * measures: the air, water, power, the length of a day. A self-referential
   * question that reaches one of them gets a well-sourced answer to a
   * different question — "how much water do I have left" came back with the
   * depth of the polar ice caps. When the question is about the player and the
   * best topic is one of those, the telemetry answers instead.
   */
  if (topic && SHADOWED.has(topic.id) && selfReferential(t)) {
    return preEva
      ? preEvaReply('consumables')
      : consumableReply(d, t)
  }

  if (topic) {
    return { text: topic.answer, source: topic.source, lesson: topic.lesson, tone: 'science' }
  }

  return { text: pick(QUIPS.unknown, question.length), tone: 'info' }
}

/**
 * What MERV says to a mission question asked before the EVA has started.
 *
 * Each one points at the screen that actually answers it, which makes him
 * useful during planning rather than merely polite.
 */
function preEvaReply(intentId: string): Reply {
  const common =
    ' I have no live telemetry until the hatch opens — I will not read you numbers that do not exist yet.'
  switch (intentId) {
    case 'turnback':
    case 'status':
      return {
        text: `We are not outside yet.${common} What I can tell you now is the rule it will come down to: never go further out than you can get back from on what is left, and keep a reserve on top that you do not spend. Everything in the planner is about buying that reserve.`,
        tone: 'info',
        lesson: 'massIsLife',
      }
    case 'weathernow':
      return {
        text: `No local weather until we are standing in it.${common} The planner has the route forecast, and it is worth reading before you commit: dust season at Jezero is southern spring and summer, and what a storm takes from you is daylight and solar power, not wind damage.`,
        tone: 'info',
        lesson: 'dustIsTheHazard',
      }
    case 'whatnext':
      return {
        text: `Pick a route and an EVA start time, then step out.${common} The planner shows each route's range, its stations and how much margin it leaves you — and the margin is the part that decides whether the mission is a success or a story.`,
        tone: 'info',
      }
    case 'whereami':
      return {
        text: `Still in the lander, at Jezero crater — 18.4 north, 77.5 east, on the floor of a 45 kilometre crater that held a lake three and a half billion years ago.${common}`,
        tone: 'info',
      }
    case 'consumables':
      return {
        text: `The suit is on lander power and the gauges all read full, so quoting them at you now would be quoting a number that has not been spent yet.${common} What is worth knowing before you step out: there are four of them — oxygen, CO2 scrubber, battery, water — and they do not run down together. One will be your limiting item, it is usually the scrubber or the battery rather than oxygen, and the only figure that decides anything is how many minutes of margin you have left over after the walk home.`,
        tone: 'info',
        lesson: 'massIsLife',
      }
    case 'clocknow':
      return {
        text: `The EVA clock does not start until the hatch opens.${common} You pick the start time in the planner, and it matters more than it looks: it sets how much daylight you have, how much sun your array gets, and how cold it is when you are furthest from home.`,
        tone: 'info',
      }
    default:
      return {
        text: `That one needs us to be outside.${common} Ask me about Mars itself in the meantime — the air, the dust, radiation, water, power, how anybody gets home — and I will answer with a source.`,
        tone: 'info',
      }
  }
}

/** Questions worth offering as buttons, chosen for the situation. */
export function suggestions(d: Telemetry): string[] {
  const out: string[] = []
  if (d.phase !== 'surface') {
    return [
      'Why can I not breathe the air?',
      'How cold does it get?',
      'What does a dust storm actually do to me?',
      'How much radiation will I take?',
      'Is there water here?',
      'How does anybody get home from here?',
    ]
  }
  if (d.advisesAbort || d.advisesShelter) out.push('Should I turn back?')
  if (d.weatherKind !== 'clear') out.push('Is a storm coming?')
  if (d.nearStation) out.push('What is this rock?')
  if (d.sepPhase) out.push('How much radiation am I taking?')
  if (d.marginMin < d.walkHomeMin * 1.5) out.push('Can I keep going?')
  out.push('What should I do next?')
  out.push('Status report')
  if (!out.includes('Is a storm coming?')) out.push('What is the weather doing?')
  out.push('Why can I not breathe the air?')
  out.push('How does anybody get home from here?')
  return out.slice(0, 6)
}

// ---------------------------------------------------------------------------
//  Volunteering
// ---------------------------------------------------------------------------

export interface Advisory {
  /** Stable id, so each one is spoken exactly once per run. */
  id: string
  /** Higher wins when several fire together. */
  priority: number
  text: string
  tone: Reply['tone']
  lesson?: string
  /** Where the mast should point while this is said. */
  look?: 'jack' | 'storm' | 'horizon' | 'station' | 'sky'
}

/**
 * What MERV would say right now if nobody asked.
 *
 * Returns every advisory whose condition currently holds; the caller filters
 * against what has already been said and takes the highest priority. Written
 * as a pure function of telemetry so the trigger thresholds can be tested
 * without running a mission.
 */
export function advisories(d: Telemetry): Advisory[] {
  const out: Advisory[] = []

  /**
   * Is the return estimate worth warning about yet?
   *
   * At step-out the walk home is zero and the margin has not been computed, so
   * a naive threshold reads "margin thin" on the very first tick and MERV
   * opens the EVA by telling Jack to turn back before he has taken a step.
   * A warning that fires when nothing is wrong teaches the player to ignore
   * warnings, which is worse than having none — so the margin advisories wait
   * until there is both a mission clock and a walk to be short of.
   */
  const marginMeaningful = d.evaMin >= 1 && d.walkHomeMin > 0.2 && d.distanceFromLanderM > 25

  // ---- Life-critical, in order of how fast they kill ---------------------
  if (d.sepPhase === 'alert' || d.sepPhase === 'rising') {
    out.push({
      id: 'sep',
      priority: 100,
      tone: 'danger',
      look: 'sky',
      lesson: 'radiationShelter',
      text: `Particle rate is climbing — ${d.doseRateUSvH.toFixed(0)} microsieverts per hour against a background near 27. This is a solar particle event. Your suit stops almost none of it and the lander hull stops most of it. Go inside, and do not finish the station first.`,
    })
  }
  if (marginMeaningful && d.reserveMarginMin < 0) {
    out.push({
      id: 'reserveBreach',
      priority: 95,
      tone: 'danger',
      look: 'jack',
      lesson: 'massIsLife',
      text: `You are inside the reserve. Margin over the walk home is ${m(d.marginMin)} and the reserve is already spent. ${d.limitingLabel} is limiting. Walk, now, and do it on the shortest safe line rather than the planned route.`,
    })
  } else if (marginMeaningful && marginIsThin(d.marginMin, d.walkHomeMin)) {
    out.push({
      id: 'marginThin',
      priority: 80,
      tone: 'warning',
      look: 'jack',
      lesson: 'massIsLife',
      text: `Margin check. ${m(d.marginMin)} of margin against a walk home of ${m(d.walkHomeMin)}, ${d.limitingLabel} limiting. By the flight rule this mission runs on, that is thin — sheltering is no longer an option, because sheltering spends the consumables the walk needs. This is the decision point, not the emergency. Turning now costs you a station. Turning in twenty minutes costs you the reserve.`,
    })
  } else if (marginMeaningful && (d.retStatus === 'caution' || d.retStatus === 'warning')) {
    out.push({
      id: 'marginCaution',
      priority: 55,
      tone: 'warning',
      look: 'jack',
      lesson: 'massIsLife',
      text: `Heads up on the budget. ${m(d.marginMin)} of margin against a walk home of ${m(d.walkHomeMin)}, ${d.limitingLabel} limiting — the return estimate has moved to ${d.retStatus}. Nothing is wrong yet. I am telling you now so that the moment it is wrong, it is not also a surprise.`,
    })
  }
  if (d.advisesAbort) {
    out.push({
      id: 'stormAbort',
      priority: 90,
      tone: 'danger',
      look: 'storm',
      lesson: 'dustIsTheHazard',
      text: `Weather has made the call. ${d.weatherHeadline}. Optical depth ${d.tau.toFixed(2)}, ${pct(d.transmission)} of sunlight reaching the ground, visibility ${d.visibilityM.toFixed(0)} metres. Mission rules say abort. ${d.shelterName ? `${d.shelterName} is ${d.shelterDistM.toFixed(0)} metres out.` : ''}`,
    })
  } else if (d.advisesShelter) {
    out.push({
      id: 'stormShelter',
      priority: 70,
      tone: 'warning',
      look: 'storm',
      lesson: 'dustIsTheHazard',
      text: `${d.weatherHeadline}. Front bearing ${d.stormFromDeg.toFixed(0)} degrees, next phase change in about ${m(d.minutesToNextPhase)}. Rules say shelter or return. ${d.shelterName ? `Nearest useful cover is ${d.shelterName}, ${d.shelterDistM.toFixed(0)} metres.` : ''} Do not wait for Earth to agree with me — they are ${d.owltMin.toFixed(0)} minutes behind this conversation.`,
    })
  } else if (d.weatherKind === 'regional-storm' && d.weatherPhase === 'watch') {
    out.push({
      id: 'stormWatch',
      priority: 50,
      tone: 'warning',
      look: 'storm',
      text: `Heads up. I am seeing a regional dust front building on bearing ${d.stormFromDeg.toFixed(0)} degrees, about ${m(d.minutesToNextPhase)} before it changes phase. It is not a problem yet. It becomes one in the order darkness, then visibility, then power — and your consumables are on a clock the whole way through.`,
      lesson: 'dustIsTheHazard',
    })
  }
  if (d.scrubber < 0.35 && d.evaMin >= 1) {
    out.push({
      id: 'scrubber',
      priority: 85,
      tone: 'danger',
      look: 'jack',
      lesson: 'co2Kills',
      text: `Scrubber is at ${pct(d.scrubber)}. That is your limiting item and it is the one that does not warn you — carbon dioxide takes you out in minutes, not hours, and you do not feel it coming. Head in.`,
    })
  }
  if (d.tempC < -70 && d.battery < 0.45 && d.evaMin >= 1) {
    out.push({
      id: 'cold',
      priority: 60,
      tone: 'warning',
      look: 'jack',
      lesson: 'coldKills',
      text: `It is ${d.tempC.toFixed(0)} degrees out here and your heaters are drawing off a battery at ${pct(d.battery)}. Cold is a power problem on this planet, not a comfort problem, and the two bars fail together.`,
    })
  }
  if (d.visibilityM < 2500) {
    out.push({
      id: 'lowvis',
      priority: 65,
      tone: 'warning',
      look: 'horizon',
      lesson: 'noCompass',
      text: `Visibility is down to ${d.visibilityM.toFixed(0)} metres. No compass works here and there is no GPS, so what you just lost is the skyline and the sun — which is to say, both of your navigation references. Stay on the route line. I am holding dead reckoning at ${d.roverOdoM.toFixed(0)} metres travelled.`,
    })
  }

  // ---- My own problems ---------------------------------------------------
  if (d.roverArrayDust > 0.5) {
    out.push({
      id: 'roverDust',
      priority: 40,
      tone: 'warning',
      look: 'jack',
      text: `My array is ${pct(d.roverArrayDust)} dust-loaded and making ${d.roverArrayW.toFixed(0)} watts. This is exactly how Opportunity ended in 2018 and InSight in 2022 — not a failure, just dust settling faster than anything cleaned it off. I will keep up as long as I can and then sit in the sun.`,
    })
  }
  if (d.roverMode === 'lowpower') {
    out.push({
      id: 'roverLowPower',
      priority: 45,
      tone: 'warning',
      look: 'jack',
      text: `I am going into low-power hold at ${pct(d.roverBattery)}. The radio and the mast stay up; the wheels do not. Carry on without me — a vehicle that strands itself to keep up with you is worth less than one that is still here tomorrow.`,
    })
  }

  // ---- Teaching moments, lowest priority ---------------------------------
  if (d.dustFouling > 0.3) {
    out.push({
      id: 'fouling',
      priority: 25,
      tone: 'info',
      look: 'jack',
      lesson: 'dustIsTheHazard',
      text: `You are carrying ${pct(d.dustFouling)} dust fouling on the suit. It costs you seal integrity and visor clarity, and the ingress procedure will take longer because of it. Apollo crews wore through the outer layer of their suits in three days on a body with no wind at all.`,
    })
  }
  if (d.nearStation && d.stationNext) {
    out.push({
      id: `station-${d.nearStation}`,
      priority: 20,
      tone: 'science',
      look: 'station',
      text: `${d.nearStationName}, and my mast is on it. Next step is ${d.stationNext.toLowerCase()}. One thing before you start: abrade before you believe the surface. Everything exposed here has a weathering rind that tells you about the atmosphere rather than the rock.`,
      lesson: 'rind',
    })
  }
  if (d.atLander && d.evaMin > 5) {
    out.push({
      id: 'home',
      priority: 30,
      tone: 'info',
      look: 'jack',
      text: `You are back inside the lander radius with ${m(d.marginMin)} of margin left. That number is the whole scorecard — a successful EVA is one you walk away from with margin unspent. I will park on the sunward side and charge.`,
    })
  }

  return out
}
