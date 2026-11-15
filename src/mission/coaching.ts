/**
 * coaching.ts — Teaching the game while it is being played.
 *
 * The hardest constraint on this project is not Mars, it is attention. Someone
 * opens the link, gives it ninety seconds, and decides. In that time they have
 * to get from a title screen to the thing that makes this worth looking at:
 * a real field procedure, a real NASA image, and a packet crossing the solar
 * system at the speed of light.
 *
 * A wall of instructions at the start does not survive that. Neither does a
 * modal tutorial that has to be clicked through before the game will start.
 * So guidance here is a single contextual card that:
 *
 *  - shows ONE thing at a time, chosen from the current mission state;
 *  - never blocks anything, and never covers what it is pointing at;
 *  - dismisses itself the moment the player does the thing, so a player who
 *    already knew is never made to click;
 *  - says WHY as well as what, because "press F" teaches nothing and "press F,
 *    because the station is where the whole mission actually happens" does;
 *  - can be turned off permanently from one visible control.
 *
 * Hints are evaluated in order and the first one that is relevant, unseen and
 * not already satisfied is the one shown. `done` is what retires a hint, so
 * hints retire by being acted on rather than by being read.
 */

import type { State } from '../state/store'
import { STATIONS } from './site'
import { stationComplete } from './objectives'

export type HintPlacement = 'surface' | 'screen'

export interface Hint {
  id: string
  /** Which phases this is relevant to. */
  phases: Array<State['phase']>
  /** Shown only when this is true. */
  when: (s: State) => boolean
  /** Retired, permanently, once this is true. */
  done: (s: State) => boolean
  title: string
  body: string
  /** The key that does the thing, if there is one. */
  key?: string
  /** Mark this one as important enough to draw the eye. */
  tone?: 'info' | 'action' | 'warning'
}

const anyStationStarted = (s: State) =>
  STATIONS.some((st) => {
    const x = s.stations[st.id]
    return x.abraded || x.inspected || !!x.choice || x.sampled
  })

export const HINTS: Hint[] = [
  // --- Before the walk -----------------------------------------------------
  {
    id: 'briefing',
    phases: ['briefing'],
    when: () => true,
    done: (s) => s.phase !== 'briefing',
    title: 'One question, one site, one suit',
    body:
      'This is a real place and a real open question that Perseverance is working right now. ' +
      'Read it if you like, or go straight to the planner — the mission will keep reminding you what it wants.',
    tone: 'info',
  },
  {
    id: 'planning-route',
    phases: ['planning'],
    when: () => true,
    done: (s) => s.phase !== 'planning',
    title: 'Pick a route, then look at the margin',
    body:
      'Three routes, three real trades. Switch between them and watch the forecast margin change: ' +
      'that number is how many minutes of life support you would have left over after walking home. ' +
      'It is computed with the same model the live walk uses, so the plan and the walk cannot disagree.',
    tone: 'action',
  },

  // --- First minutes on the surface ---------------------------------------
  {
    id: 'surface-walk',
    phases: ['surface'],
    when: (s) => s.time.evaSec < 600 && !s.autoTraverse && !anyStationStarted(s),
    done: (s) => s.autoTraverse || s.distanceWalkedM > 60,
    title: 'You are on Mars. Start walking.',
    body:
      'W A S D walks, the mouse looks around. Or press P and Jack follows the planned route by himself — ' +
      'auto-traverse moves his feet and nothing else. Every decision that matters is still yours.',
    key: 'P',
    tone: 'action',
  },
  {
    id: 'surface-clock',
    phases: ['surface'],
    when: (s) => s.distanceWalkedM > 80 && !anyStationStarted(s),
    done: (s) => anyStationStarted(s) || s.time.evaSec > 2400,
    title: 'The clock is the enemy, not the terrain',
    body:
      'Oxygen, the CO₂ scrubber, battery and water are all draining, and the walk home gets longer with every step out. ' +
      'The RETURN ESTIMATE on the left is the only number that decides whether this EVA ends well.',
    tone: 'info',
  },
  {
    id: 'station-reach',
    phases: ['surface'],
    when: (s) => !!s.nearStation && !anyStationStarted(s),
    done: (s) => anyStationStarted(s),
    title: 'A station is in reach — this is the game',
    body:
      'Press F. A station is not a pickup: it is four real field procedures, each costing minutes and consumables, ' +
      'each showing you the NASA image of that same operation being done on Mars for real.',
    key: 'F',
    tone: 'action',
  },
  {
    id: 'abrade-first',
    phases: ['surface'],
    when: (s) => s.ui === 'science' && !!s.nearStation && !s.stations[s.nearStation].abraded,
    done: (s) => STATIONS.some((st) => s.stations[st.id].abraded),
    title: 'Start by cutting through the rind',
    body:
      'Every rock on Mars wears dust over an oxidised weathering rind. Until you grind through it you are reading ' +
      'the planet’s paint, not its geology. Perseverance does exactly this before any instrument is allowed near a rock.',
    tone: 'action',
  },
  {
    id: 'after-first-procedure',
    phases: ['surface'],
    when: (s) => s.lessons.length >= 1 && s.lessons.length < 3 && !s.proc,
    done: (s) => s.lessons.length >= 3,
    title: 'That photograph was real',
    body:
      'Every procedure ends with the NASA image of the same operation on Mars, credited on the image, and one ' +
      'thing worth remembering if you were ever actually there. Those notes collect into a field guide you keep. ' +
      'Press O to see it, and to see what the mission still wants from you.',
    key: 'O',
    tone: 'info',
  },
  {
    id: 'finish-the-station',
    phases: ['surface'],
    when: (s) => anyStationStarted(s) && !STATIONS.some((st) => stationComplete(s, st.id)),
    done: (s) => STATIONS.some((st) => stationComplete(s, st.id)),
    title: 'Finish all four steps at one station',
    body:
      'Abrade, hand lens, record the interpretation, seal a core. Completing all four is what packages the station ' +
      'and sends it to Earth — and nothing you do on Mars is science until it is off the planet.',
    tone: 'action',
  },
  {
    id: 'in-flight',
    phases: ['surface'],
    when: (s) => s.feed.some((f) => !f.published),
    done: (s) => s.feed.some((f) => f.published),
    title: 'Your data is crossing the solar system',
    body:
      'It is in flight and there is nothing anyone can do to make it arrive sooner. That countdown is the real ' +
      'one-way light time for today’s actual planetary positions. Go back to work; the EVA does not wait for the feed.',
    tone: 'info',
  },

  // --- Danger --------------------------------------------------------------
  {
    id: 'weather',
    phases: ['surface'],
    when: (s) => s.weather.kind !== 'clear' && s.weather.intensity > 0.25,
    done: (s) => s.weather.kind === 'clear' && s.time.evaSec > 60,
    title: 'Weather. It will not blow you over.',
    body:
      'At six millibars there is not enough air to push you. What a Martian storm takes is your sunlight, your ' +
      'visibility and your landmarks, and it loads your seals and radiators with dust. It is a margin problem, ' +
      'not a wind problem — so the answer is shelter or turn back, never endurance.',
    tone: 'warning',
  },
  {
    id: 'margin',
    phases: ['surface'],
    when: (s) => s.ret.status !== 'nominal' && !s.aborting,
    done: (s) => s.aborting || !!s.outcome,
    title: 'The reserve is not a resource',
    body:
      'Your margin has crossed into the reserve. That reserve exists so the next surprise has somewhere to come out of. ' +
      'Turning back with science undone is a successful EVA. There is no partial credit for a suit that ran out.',
    tone: 'warning',
  },
  {
    id: 'ingress',
    phases: ['surface'],
    when: (s) => s.atLander && s.time.evaSec > 300,
    done: (s) => !!s.outcome,
    title: 'You are at the ladder',
    body:
      'Press Enter to climb in and end the EVA. Everything you are carrying is banked, and anything already ' +
      'downlinked arrives whatever happens next. Or walk back out, if the margin still covers it.',
    key: 'Enter',
    tone: 'action',
  },
]

/** The one hint to show right now, or null. */
export function activeHint(s: State, seen: ReadonlySet<string>): Hint | null {
  for (const h of HINTS) {
    if (seen.has(h.id)) continue
    if (!h.phases.includes(s.phase)) continue
    if (h.done(s)) continue
    if (!h.when(s)) continue
    return h
  }
  return null
}

/**
 * Retire a hint that has been shown and is now satisfied.
 *
 * This deliberately only applies to hints the player has actually been shown.
 * An earlier version retired any hint whose `done` was true, which quietly
 * destroyed most of the guidance: `done` is false only in the narrow situation
 * the hint is about, so on the briefing screen every surface hint looked
 * "already satisfied" and was thrown away before it could ever appear.
 */
export function shouldRetire(id: string, s: State): boolean {
  const h = HINTS.find((x) => x.id === id)
  return !!h && h.done(s)
}
