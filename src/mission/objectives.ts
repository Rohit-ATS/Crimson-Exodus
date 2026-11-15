/**
 * objectives.ts — What you are actually trying to do out here.
 *
 * A player who does not know what the mission wants will wander, click things,
 * and conclude the game is a walking simulator with charts. So the mission is
 * stated explicitly and tracked continuously, in three tiers:
 *
 *   CRITICAL  Jack comes home alive, on the reserve, with the suit intact.
 *             Nothing else counts if this one fails. There is no partial
 *             credit for a dead astronaut holding good rocks.
 *   PRIMARY   The reason the EVA was flown: answer the science question with
 *             evidence that will survive review on Earth, and get it off the
 *             planet. One primary objective is enough for mission success,
 *             which is deliberate — a real EVA that achieves one of its
 *             objectives and walks home is a successful EVA.
 *   BONUS     Everything a well-run EVA also picks up: a second and third
 *             station, a flag, using the depot well, sheltering correctly.
 *
 * Every objective carries a SURVIVAL line: why this matters if you are the one
 * standing there. That is the actual point of the project. A player should
 * finish this able to say what kills you on Mars and in what order.
 *
 * This module is pure: it reads the mission state and returns a list. It owns
 * no state of its own.
 */

import type { State } from '../state/store'
import { CACHES, STATIONS } from './site'

export type ObjectiveTier = 'critical' | 'primary' | 'bonus'

export interface Objective {
  id: string
  tier: ObjectiveTier
  title: string
  /** What doing it involves, in one line. */
  detail: string
  /** Why it matters to somebody who is actually there. */
  survival: string
  /** 0-1. Partial progress is shown; it is not all or nothing. */
  progress: number
  done: boolean
  /** Why it cannot be done right now, if it cannot. */
  blocked?: string
  /** The single next thing to do toward it. */
  next?: string
  /**
   * Shown instead of a percentage. "97% of the way to surviving" is nonsense:
   * the critical objective is not a progress bar, it is a state you are either
   * holding or losing, so it reports that state instead.
   */
  statusLabel?: string
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * How complete one station's field work is, as a fraction of its four steps.
 * A station that cannot be cored counts out of three.
 */
export function stationProgress(s: State, id: string): { frac: number; next: string; steps: number; done: number } {
  const st = STATIONS.find((x) => x.id === id)!
  const ss = s.stations[id]
  const steps: Array<[boolean, string]> = [
    [ss.abraded, 'Abrade a patch through the weathering rind'],
    [ss.inspected, 'Put the hand lens on the prepared patch'],
    [!!ss.choice, 'Record your interpretation'],
  ]
  if (st.sampleable) steps.push([ss.sampled, `Seal a core — ${st.sampleName}`])
  const done = steps.filter(([d]) => d).length
  const next = steps.find(([d]) => !d)?.[1] ?? 'Complete'
  return { frac: done / steps.length, next, steps: steps.length, done }
}

/** True when a station's whole field procedure is finished. */
export function stationComplete(s: State, id: string): boolean {
  return stationProgress(s, id).frac >= 1
}

export function objectives(s: State): Objective[] {
  const out: Objective[] = []
  const distanceM = Math.hypot(s.jackX, s.jackZ)

  // --- CRITICAL ------------------------------------------------------------
  const marginOk = s.ret.marginAfterReserveMinutes >= 0
  out.push({
    id: 'survive',
    tier: 'critical',
    title: 'Get back inside alive, with the reserve unspent',
    detail:
      s.outcome
        ? 'EVA ended.'
        : `Walk home is ${s.ret.walkMinutes.toFixed(0)} min. You have ${s.ret.enduranceMinutes.toFixed(0)} min of endurance, ` +
          `${s.ret.limiting.toUpperCase()} limiting, ${s.ret.marginMinutes.toFixed(0)} min of margin.`,
    survival:
      'The reserve is not a resource. It is the margin that lets a surprise — a dust front, a soft slope, a fall — ' +
      'not become a fatality. Spending it to finish a task means the next surprise has nowhere to come out of. ' +
      'Turning back with science undone is a successful EVA. There is no partial credit for a suit that ran out.',
    progress: s.outcome?.success ? 1 : clamp01(1 - distanceM / 900),
    done: !!s.outcome?.success,
    statusLabel: s.outcome
      ? (s.outcome.success ? 'came home' : 'failed')
      : marginOk
        ? `${s.ret.status} \u00b7 ${s.ret.marginMinutes.toFixed(0)} min margin`
        : 'reserve breached',
    blocked: marginOk ? undefined : 'RESERVE BREACHED — you are now spending the margin that keeps you alive.',
    next: s.atLander
      ? (s.time.evaSec < 180
        ? 'Head out along the planned route. Auto-traverse [P] walks it for you; every decision is still yours.'
        : 'You are at the ladder. Ingress [Enter] ends the EVA and banks everything you are carrying.')
      : `Keep the walk home inside the margin. ${distanceM.toFixed(0)} m out, ${s.ret.walkMinutes.toFixed(0)} min back.`,
  })

  // --- PRIMARY: the science question ---------------------------------------
  const supported = STATIONS.filter((st) => {
    const c = s.stations[st.id].choice
    return !!c && !!st.observation.options.find((o) => o.id === c)?.supported
  })
  const confident = supported.filter((st) => s.stations[st.id].choiceConfident)
  out.push({
    id: 'answer',
    tier: 'primary',
    title: 'Answer the science question with evidence that survives review',
    detail:
      `Record an interpretation at a station, on a surface you prepared first. ` +
      `${confident.length} supported call(s) on prepared rock, ${supported.length - confident.length} caveated.`,
    survival:
      'An observation made on a dusty, oxidised surface is a guess with a good story attached. ' +
      'On Mars nobody can go back and check it for you, so the discipline of preparing the surface ' +
      'before you believe what you see is the difference between data and an opinion.',
    progress: clamp01(confident.length / 1),
    done: confident.length >= 1,
    next: confident.length >= 1
      ? 'Done. A second station would make the answer much harder to argue with.'
      : 'Reach a station, abrade, inspect, then record. All four steps are in the station panel [F].',
  })

  // --- PRIMARY: get it off the planet --------------------------------------
  const sent = s.feed.length
  const published = s.feed.filter((f) => f.published).length
  out.push({
    id: 'downlink',
    tier: 'primary',
    title: 'Get the data off the planet',
    detail: sent === 0
      ? 'Nothing sent yet. Completing a station’s field work downlinks its whole package automatically.'
      : `${sent} package(s) sent, ${published} received on Earth.`,
    survival:
      'Nothing you do on Mars is science until it reaches Earth, and the trip takes minutes at the speed of light ' +
      'through an orbiter that is not always overhead. Data sitting in a suit that does not come home is data that never existed.',
    progress: clamp01(sent / 1),
    done: sent >= 1,
    next: sent >= 1 ? 'Sent. It publishes itself when the light arrives.' : 'Finish all the steps at one station.',
  })

  // --- PRIMARY: bring something back ---------------------------------------
  const goodCores = s.samples.filter((x) => x.contextGood).length
  out.push({
    id: 'sample',
    tier: 'primary',
    title: 'Seal at least one core with its field context recorded',
    detail: `${s.samples.length} tube(s) sealed, ${goodCores} with a supported observation behind them.`,
    survival:
      'A human on the surface can do one thing no orbiter ever will: pick up the right rock and bring it home. ' +
      'But a tube with no recorded field context arrives on Earth as a rock with no story, worth a fraction of the same rock with one. ' +
      'The observation is what gives the sample its meaning, and the observation has to happen before you drill.',
    progress: clamp01(goodCores / 1),
    done: goodCores >= 1,
    next: goodCores >= 1 ? 'Done.' : 'Record a supported interpretation first, then core at the same station.',
  })

  // --- BONUS: the other stations -------------------------------------------
  for (const st of STATIONS) {
    const p = stationProgress(s, st.id)
    out.push({
      id: `station-${st.id}`,
      tier: 'bonus',
      title: `Work ${st.codename} — ${st.name}`,
      detail: `${p.done} of ${p.steps} steps. ${st.tagline}`,
      survival: st.realFeature,
      progress: p.frac,
      done: p.frac >= 1,
      next: p.frac >= 1 ? 'Complete.' : p.next,
    })
  }

  // --- BONUS: the depot ----------------------------------------------------
  const depot = CACHES[0]
  out.push({
    id: 'cache',
    tier: 'bonus',
    title: `Use ${depot.name}`,
    detail: s.cachesUsed.includes(depot.id)
      ? 'Swapped. Range extended.'
      : `A single consumables swap, ${depot.swapMinutes} min, off the direct route.`,
    survival:
      'Walking range is not how far you can walk. It is how far you can walk and still walk back on what you carry. ' +
      'The only way to beat that limit is to put supplies out on the surface before you need them.',
    progress: s.cachesUsed.includes(depot.id) ? 1 : 0,
    done: s.cachesUsed.includes(depot.id),
    next: 'Detour to the depot marker on the map [M] and press R when it is in reach.',
  })

  // --- BONUS: the flag -----------------------------------------------------
  out.push({
    id: 'flag',
    tier: 'bonus',
    title: 'Plant a commemorative flag',
    detail: s.flag ? `${s.flag.name} emplaced.` : 'Any of 249 flags, at any point on the traverse.',
    survival:
      'Outer Space Treaty Article II: no celestial body is subject to national appropriation. ' +
      'A flag on Mars marks that people came. It claims nothing, and at 6 millibars it needs a spar to hold it out at all.',
    progress: s.flag ? 1 : 0,
    done: !!s.flag,
    next: 'Press G anywhere on the surface.',
  })

  // --- BONUS: weather judgement -------------------------------------------
  const stormHappened = s.weatherEvents.some((e) => e.kind === 'regional-storm')
  out.push({
    id: 'weather',
    tier: 'bonus',
    title: 'Handle the weather without spending the reserve',
    detail: stormHappened
      ? (s.reserveBreached
        ? 'A front came through and the reserve was breached.'
        : 'A front is scheduled this EVA. Keep the margin positive through it.')
      : 'No regional event scheduled this EVA. Convective dust devils are still possible.',
    survival:
      'A Mars storm cannot blow you over — the air is too thin to carry the force. What it does is take away your ' +
      'sunlight, your visibility and your landmarks, and load your seals and radiators with dust. It is a margin ' +
      'problem and a navigation problem, not a wind problem, and the right response is shelter or abort, not endurance.',
    progress: s.reserveBreached ? 0 : stormHappened ? 0.5 : 1,
    done: !s.reserveBreached && !!s.outcome?.success,
    next: 'Watch the opacity and the visibility rows. Shelter advice appears on the left when it applies.',
  })

  return out
}

export interface MissionStatus {
  /** Objectives that must not fail. */
  critical: Objective[]
  primary: Objective[]
  bonus: Objective[]
  primaryDone: number
  primaryTotal: number
  bonusDone: number
  bonusTotal: number
  /** True once at least one primary objective is achieved. */
  successPossible: boolean
  /** The single most useful thing to do next. */
  nextUp: Objective | null
}

export function missionStatus(s: State): MissionStatus {
  const all = objectives(s)
  const critical = all.filter((o) => o.tier === 'critical')
  const primary = all.filter((o) => o.tier === 'primary')
  const bonus = all.filter((o) => o.tier === 'bonus')
  const primaryDone = primary.filter((o) => o.done).length
  const bonusDone = bonus.filter((o) => o.done).length
  // Point at the first unfinished primary; if they are all done, the next
  // useful thing is the most nearly finished bonus.
  const nextUp =
    primary.find((o) => !o.done) ??
    bonus.filter((o) => !o.done).sort((a, b) => b.progress - a.progress)[0] ??
    null
  return {
    critical,
    primary,
    bonus,
    primaryDone,
    primaryTotal: primary.length,
    bonusDone,
    bonusTotal: bonus.length,
    successPossible: primaryDone >= 1,
    nextUp,
  }
}
