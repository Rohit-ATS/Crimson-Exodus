/**
 * store.ts — Mission state machine.
 *
 * One store holds the whole mission: phase, route, clocks, environment, Jack's
 * consumables, the science record, the backpack, the Earth link and the log.
 * The sim loop calls `tick` at a fixed rate; everything else is player action.
 */

import { create } from 'zustand'
import {
  linkGeometry, marsClock, solarIrradiance, seasonName, dustSeasonFactor,
  secondsUntilLtst, sunTimes,
  type LinkGeometry, type MarsClock,
} from '../sim/orbits'
import { environment, type Environment } from '../sim/mars'
import {
  CLEAR, scheduleWeather, weatherAt, type ScheduledEvent, type WeatherEvent,
} from '../sim/weather'
import {
  JACK_SUIT, consume, freshConsumables, fractions, loadRates, returnEstimate,
  type Activity, type Consumables, type Fractions, type LoadRates, type ReturnEstimate,
} from '../sim/consumables'
import {
  RADIATION_CLEAR, radiationAt, scheduleSep,
  type RadiationState, type ScheduledSep,
} from '../sim/radiation'
import { hazardAt, shelterAdvice, type HazardSample, type ShelterAdvice } from '../sim/hazard'
import {
  CACHES, ROUTES, SITE, STATIONS, type Route, type Station,
} from '../mission/site'
import { EXTENT, gradeAlong, heightAt, roughnessAt, walkSpeed } from '../mission/terrain'
import {
  directToHome, nearestIndex, pathStats, remainingToHome, samplePath,
  type PathStats, type SampledPoint,
} from '../mission/path'
import {
  ADVISORIES, OUTGOING, advisory, transmit,
  type CommsMessage, type OutgoingTemplate, type ReplyContext,
} from '../sim/comms'
import {
  abradeActivity, activeBeat, cacheActivity, coreActivity, flagActivity,
  lensActivity, photoActivity, recordActivity, shelterActivity,
  type ActivityDef,
} from '../mission/activity'
import { live, resetLive } from './live'
import { input } from './input'
import { findCountry } from '../data/countries'

export type Phase = 'title' | 'briefing' | 'planning' | 'surface' | 'debrief'

/**
 * What a running procedure will apply to the mission when it finishes.
 *
 * Procedures are animated and take real seconds to play, during which the
 * mission clock runs compressed so the full minute cost is actually charged.
 * Nothing is committed until the procedure completes, so an abort mid-procedure
 * costs the time spent and gains nothing — which is how it works in the field.
 */
export type ProcCommit =
  | { type: 'abrade'; stationId: string }
  | { type: 'lens'; stationId: string }
  | { type: 'record'; stationId: string; choiceId: string }
  | { type: 'core'; stationId: string }
  | { type: 'photo'; label: string; dataUrl?: string }
  | { type: 'flag'; code: string }
  | { type: 'cache'; cacheId: string }
  | { type: 'shelter' }

export interface ProcRun {
  def: ActivityDef
  commit: ProcCommit
  /** 0-1 through the procedure. */
  progress: number
  /** Real seconds elapsed. */
  elapsed: number
  /** True once the work is done and the result card is showing. */
  complete: boolean
  /** Time scale to restore when the procedure ends. */
  prevTimeScale: number
  /** EVA seconds when it started, so the card can show what it cost. */
  startEvaSec: number
  /** Snapshot of consumable fractions at the start, for the cost readout. */
  startFrac: { o2: number; battery: number; scrubber: number }
  /** Beat index that has been narrated into the log already. */
  narrated: number
  /** Panel to reopen when the result card is dismissed. */
  returnUi: UiPanel
}

export interface StationState {
  reached: boolean
  /**
   * The field procedure, in the order a geologist actually works a target:
   * clear the weathering rind, inspect the fresh patch, then commit to an
   * interpretation, then core. Perseverance follows the same sequence — abrade,
   * image and analyse the patch, then decide whether the rock is worth a tube.
   */
  abraded: boolean
  inspected: boolean
  /** Observation option the player recorded, if any. */
  choice: string | null
  /** Was the call made on a prepared, inspected surface, or on a dusty one? */
  choiceConfident: boolean
  sampled: boolean
  photos: number
  flagPlanted: boolean
  /** Seconds of station work accumulated. */
  workSec: number
}

export interface Photo {
  id: string
  stationId: string | null
  label: string
  evaSec: number
  /** Local solar time at capture. */
  ltst: number
  sunElevationDeg: number
  tau: number
  /** Data URL of the captured frame, filled in by the scene. */
  dataUrl?: string
}

export interface Sample {
  id: string
  stationId: string
  name: string
  evaSec: number
  massG: number
  /** Whether the observation at that station was the supported one. */
  contextGood: boolean
}

export interface FlagPlant {
  code: string
  name: string
  stationId: string | null
  x: number
  z: number
  evaSec: number
}

export interface LogEntry {
  evaSec: number
  kind: 'info' | 'science' | 'warning' | 'danger' | 'comms' | 'decision'
  text: string
}

export type UiPanel = null | 'comms' | 'backpack' | 'science' | 'flag' | 'data' | 'rules' | 'map' | 'realsite'

export type OutcomeCode =
  | 'returned-nominal'
  | 'returned-reserve-breach'
  | 'life-support-exhausted'
  | 'stranded-in-storm'

export interface Outcome {
  code: OutcomeCode
  success: boolean
  title: string
  summary: string
  scienceScore: number
  maxScienceScore: number
  decisionScore: number
  verdict: string
  lessons: string[]
}

interface MissionTime {
  /** Real wall-clock instant at which the EVA started. */
  startedAt: Date
  /** EVA elapsed seconds (sim time, not real time). */
  evaSec: number
  /** Simulated Mars instant = startedAt + evaSec. */
  now: Date
}

export interface State {
  phase: Phase
  // --- plan ---
  routeId: string
  /** Sampled path for the selected route, with terrain attached. */
  path: SampledPoint[]
  pathStats: PathStats
  /** Station ids the player has chosen to include. */
  plannedStations: string[]
  /**
   * Local true solar time at which the EVA steps out, hours.
   *
   * This is a real planning decision, not a cheat around the clock. Surface EVAs
   * are scheduled in daylight: before sunrise the suit heaters alone would drain
   * the battery in about an hour, and after sunset there is no solar gain at all.
   * The Mars DATE is real — the current sol, the current season, the sun's actual
   * path across the sky and the Earth light time all come from the real instant.
   * What the planner chooses is the hour of the sol to step out, the same thing a
   * flight plan chooses.
   */
  evaStartLtst: number
  hazardOverlay: boolean
  // --- clocks and environment ---
  time: MissionTime
  timeScale: number
  paused: boolean
  link: LinkGeometry
  clock: MarsClock
  env: Environment
  weatherEvents: ScheduledEvent[]
  weather: WeatherEvent
  stormFromDeg: number
  /** Scheduled solar particle event for this EVA, or null. */
  sepEvent: ScheduledSep | null
  radiation: RadiationState
  /** Cumulative EVA dose equivalent, mSv. */
  doseMSv: number
  /** True if Jack was outside the lander while an SEP event dominated the dose. */
  sepExposed: boolean
  hazard: HazardSample
  advice: ShelterAdvice | null
  // --- Jack ---
  jackX: number
  jackZ: number
  jackHeading: number
  activity: Activity
  speedMs: number
  autoTraverse: boolean
  /** Index into `path` Jack is nearest to. */
  pathIndex: number
  // --- life support ---
  cons: Consumables
  frac: Fractions
  rates: LoadRates
  ret: ReturnEstimate
  /** Ground distance Jack has actually covered, metres. */
  distanceWalkedM: number
  /** Furthest Jack actually got from the lander, metres. */
  maxRangeReachedM: number
  /** Lowest margin seen, for the debrief. */
  worstMarginMin: number
  reserveBreached: boolean
  // --- science ---
  stations: Record<string, StationState>
  /** Station currently in range, if any. */
  nearStation: string | null
  /** True when Jack is close enough to the lander to climb the ladder and repress. */
  atLander: boolean
  /** Cache in reach, if any. */
  nearCache: string | null
  /** Caches already used. Each one is a single swap. */
  cachesUsed: string[]
  photos: Photo[]
  samples: Sample[]
  flag: FlagPlant | null
  flagsRemaining: number
  /** The procedure currently playing, if any. */
  proc: ProcRun | null
  /** Ids of survival lessons the player has reached, in the order they got them. */
  lessons: string[]
  // --- comms ---
  messages: CommsMessage[]
  sentAdvisories: string[]
  // --- bookkeeping ---
  log: LogEntry[]
  ui: UiPanel
  aborting: boolean
  sheltering: boolean
  heededAdvice: number
  ignoredAdvice: number
  outcome: Outcome | null
  demoMode: boolean
  seed: number
}

export interface Actions {
  setPhase: (p: Phase) => void
  startBriefing: () => void
  openPlanning: () => void
  selectRoute: (id: string) => void
  setEvaStart: (ltst: number) => void
  toggleHazardOverlay: () => void
  beginEva: (demo?: boolean) => void
  tick: (dtRealSec: number) => void
  setTimeScale: (s: number) => void
  togglePause: () => void
  setUi: (p: UiPanel) => void
  toggleAutoTraverse: () => void
  declareAbort: () => void
  /** Climb the ladder and end the EVA. Available any time Jack is at the lander. */
  ingress: () => void
  /** Swap consumables at the cache in reach. */
  useCache: () => void
  setSheltering: (v: boolean) => void
  /** Clear the weathering rind with the brush and abrader. */
  abradeStation: (stationId: string) => void
  /** Close hand-lens inspection of the prepared patch. */
  inspectStation: (stationId: string) => void
  recordObservation: (stationId: string, choiceId: string) => void
  collectSample: (stationId: string) => void
  takePhoto: (label: string, dataUrl?: string) => void
  plantFlag: (code: string) => void
  // --- procedures: the animated form of every action above -----------------
  /** Start an animated procedure. Nothing is committed until it completes. */
  startProcedure: (def: ActivityDef, commit: ProcCommit) => void
  /** Advance the running procedure. Called from the sim tick with real seconds. */
  tickProcedure: (dtRealSec: number) => void
  /** Dismiss the result card and hand control back. */
  dismissProcedure: () => void
  // Each of these builds the right procedure for the current situation and
  // starts it. The UI never assembles a procedure itself.
  beginAbrade: (stationId: string) => void
  beginLens: (stationId: string) => void
  beginRecord: (stationId: string, choiceId: string) => void
  beginCore: (stationId: string) => void
  beginPhoto: (label: string, dataUrl?: string) => void
  beginFlag: (code: string) => void
  beginCache: () => void
  beginShelter: () => void
  sendMessage: (templateId: string) => void
  finishEva: (code?: OutcomeCode) => void
  restart: () => void
  pushLog: (kind: LogEntry['kind'], text: string) => void
}

export type Store = State & Actions

/**
 * How close Jack has to be to the lander to reach the ladder. The pad markings
 * are drawn at 7.4-8.0 m; this is generous enough that walking "back to the
 * lander" always counts.
 */
const LANDER_RADIUS = 38

const ROUTE_BY_ID = (id: string): Route => ROUTES.find((r) => r.id === id) ?? ROUTES[0]
const STATION_BY_ID = (id: string): Station => STATIONS.find((s) => s.id === id)!

function freshStations(): Record<string, StationState> {
  const out: Record<string, StationState> = {}
  for (const s of STATIONS) {
    out[s.id] = {
      reached: false, abraded: false, inspected: false,
      choice: null, choiceConfident: false,
      sampled: false, photos: 0, flagPlanted: false, workSec: 0,
    }
  }
  return out
}

/** Build the environment snapshot for an instant. */
function envSnapshot(now: Date, weather: WeatherEvent) {
  const link = linkGeometry(now)
  const clock = marsClock(now, SITE.eastLonDeg, SITE.latDeg)
  const toa = solarIrradiance(link.marsSunAu)
  const env = environment({
    ls: clock.solarLongitudeDeg,
    ltst: clock.ltstHours,
    elevationM: SITE.elevationM,
    toaIrradiance: toa,
    sunElevationDeg: clock.sunElevationDeg,
    stormTau: weather.tau,
    stormWindFactor: weather.windFactor,
    solTime: clock.msd,
  })
  return { link, clock, env }
}

const now0 = new Date()
const snap0 = envSnapshot(now0, CLEAR)
const path0 = samplePath(ROUTES[0].waypoints)

function initialState(seed = Math.floor(Math.random() * 1e9)): State {
  return {
    phase: 'title',
    routeId: ROUTES[0].id,
    path: path0,
    pathStats: pathStats(path0),
    plannedStations: [...ROUTES[0].stations],
    evaStartLtst: 9.5,
    hazardOverlay: false,
    time: { startedAt: now0, evaSec: 0, now: now0 },
    timeScale: 10,
    paused: false,
    link: snap0.link,
    clock: snap0.clock,
    env: snap0.env,
    weatherEvents: [],
    weather: CLEAR,
    stormFromDeg: 225,
    sepEvent: null,
    radiation: RADIATION_CLEAR,
    doseMSv: 0,
    sepExposed: false,
    hazard: hazardAt(0, 0, CLEAR, 225),
    advice: null,
    jackX: 0,
    jackZ: 34,
    jackHeading: Math.PI,
    activity: 'idle',
    speedMs: 0,
    autoTraverse: false,
    pathIndex: 0,
    cons: freshConsumables(JACK_SUIT),
    frac: fractions(JACK_SUIT, freshConsumables(JACK_SUIT)),
    rates: loadRates(JACK_SUIT, {
      activity: 'idle', speedMs: 0, grade: 0, roughness: 1,
      airTempC: snap0.env.airTempC, irradiance: snap0.env.directIrradiance, dustFouling: 0,
    }),
    ret: {
      walkMinutes: 0, enduranceMinutes: 0, marginMinutes: 0,
      marginAfterReserveMinutes: 0, status: 'nominal', limiting: 'o2',
    },
    distanceWalkedM: 0,
    maxRangeReachedM: 0,
    worstMarginMin: Infinity,
    reserveBreached: false,
    stations: freshStations(),
    nearStation: null,
    atLander: true,
    nearCache: null,
    cachesUsed: [],
    photos: [],
    samples: [],
    flag: null,
    flagsRemaining: 1,
    proc: null,
    lessons: [],
    messages: [],
    sentAdvisories: [],
    log: [],
    ui: null,
    aborting: false,
    sheltering: false,
    heededAdvice: 0,
    ignoredAdvice: 0,
    outcome: null,
    demoMode: false,
    seed,
  }
}

export const useStore = create<Store>((set, get) => ({
  ...initialState(),

  setPhase: (p) => set({ phase: p }),

  startBriefing: () => set({ phase: 'briefing' }),

  openPlanning: () => set({ phase: 'planning' }),

  selectRoute: (id) => {
    const route = ROUTE_BY_ID(id)
    const p = samplePath(route.waypoints)
    set({ routeId: id, path: p, pathStats: pathStats(p), plannedStations: [...route.stations] })
  },

  setEvaStart: (ltst) => set({ evaStartLtst: Math.max(0, Math.min(23.9, ltst)) }),
  toggleHazardOverlay: () => set({ hazardOverlay: !get().hazardOverlay }),

  beginEva: (demo = false) => {
    const s = get()
    const route = ROUTE_BY_ID(s.routeId)
    // Step out at the planned local solar time on the real current Mars sol.
    const realNow = new Date()
    const offsetSec = secondsUntilLtst(realNow, SITE.eastLonDeg, SITE.latDeg, s.evaStartLtst)
    const startedAt = new Date(realNow.getTime() + offsetSec * 1000)
    const clock = marsClock(startedAt, SITE.eastLonDeg, SITE.latDeg)
    const plannedMin = s.pathStats.walkMinutes +
      s.plannedStations.reduce((a, id) => a + STATION_BY_ID(id).workMinutes, 0)
    const events = scheduleWeather(s.seed, clock.solarLongitudeDeg, plannedMin, demo)
    const first = events.find((e) => e.kind === 'regional-storm')

    resetLive()
    // Face Jack down the first leg of the chosen route.
    const [x1, z1] = route.waypoints[1] ?? [0, -1]
    live.jack.heading = Math.atan2(x1, z1)
    // Start with the camera behind Jack, looking down the first leg.
    live.camYaw = live.jack.heading
    live.jack.x = 0
    live.jack.z = 26
    live.jack.y = heightAt(0, 26)

    const cons = freshConsumables(JACK_SUIT)
    set({
      phase: 'surface',
      demoMode: demo,
      time: { startedAt, evaSec: 0, now: startedAt },
      weatherEvents: events,
      weather: CLEAR,
      stormFromDeg: first?.fromDeg ?? 225,
      sepEvent: scheduleSep(s.seed, plannedMin, demo),
      radiation: RADIATION_CLEAR, doseMSv: 0, sepExposed: false,
      cons,
      frac: fractions(JACK_SUIT, cons),
      jackX: 0, jackZ: 26, jackHeading: live.jack.heading,
      stations: freshStations(),
      photos: [], samples: [], flag: null, flagsRemaining: 1, cachesUsed: [], nearCache: null,
      proc: null, lessons: [],
      messages: [], sentAdvisories: [], log: [],
      aborting: false, sheltering: false, outcome: null,
      distanceWalkedM: 0, maxRangeReachedM: 0,
      worstMarginMin: Infinity, reserveBreached: false,
      heededAdvice: 0, ignoredAdvice: 0,
      paused: false, ui: null, autoTraverse: false, pathIndex: 0,
    })
    get().pushLog('info',
      `EVA START. ${route.codename} — ${route.name}. Planned ${s.pathStats.lengthM.toFixed(0)} m, ` +
      `${plannedMin.toFixed(0)} min including station work. Ls ${clock.solarLongitudeDeg.toFixed(1)}° ` +
      `(${seasonName(clock.solarLongitudeDeg)}), local true solar time ${clock.ltstHours.toFixed(2)} h, sun ` +
      `${clock.sunElevationDeg.toFixed(1)}° above the horizon.`)
    get().pushLog('comms',
      `Earth link acquired. One-way light time ${(get().link.owltSec / 60).toFixed(1)} min at ` +
      `${(get().link.distanceAu).toFixed(3)} AU. Round trip ${(get().link.rttSec / 60).toFixed(1)} min. ` +
      `You are the flight director for anything that happens faster than that.`)
    if (get().link.nearConjunction) {
      get().pushLog('warning',
        'Solar conjunction geometry: Sun-Earth-Mars angle under 3°. Real missions suspend commanding in this window.')
    }
  },

  // -------------------------------------------------------------------------
  // The sim tick. Fixed-rate, called from the render loop.
  // -------------------------------------------------------------------------
  tick: (dtRealSec) => {
    const s = get()
    if (s.phase !== 'surface' || s.paused || s.outcome) return

    const dt = Math.min(dtRealSec, 0.1) // clamp so a tab-switch cannot teleport Jack
    const dtEva = dt * s.timeScale
    const evaSec = s.time.evaSec + dtEva
    const now = new Date(s.time.startedAt.getTime() + evaSec * 1000)

    // --- weather and environment ------------------------------------------
    const clockPre = marsClock(now, SITE.eastLonDeg, SITE.latDeg)
    const baseTau = 0.45 + 0.2 * Math.sin(((clockPre.solarLongitudeDeg - 230) * Math.PI) / 180)
    const weather = weatherAt(s.weatherEvents, evaSec / 60, Math.max(0.1, baseTau))
    const { link, clock, env } = envSnapshot(now, weather)

    // --- Jack's motion -----------------------------------------------------
    const j = live.jack
    let activity: Activity = s.sheltering ? 'shelter' : 'idle'
    let moveX = 0, moveZ = 0
    let stepped = 0

    if (s.sheltering) {
      j.moving = Math.max(0, j.moving - dt * 4)
      j.speedMs = 0
    } else {
      // Station work overrides locomotion.
      const working = j.working > 0
      if (working) {
        activity = 'work'
        j.moving = Math.max(0, j.moving - dt * 4)
        j.working = Math.max(0, j.working - dtEva)
        if (j.working <= 0) j.tool = 'none'
      } else {
        // Direction input, relative to the camera yaw so forward is "away from camera".
        let ix = 0, iz = 0
        if (!live.inputLocked) {
          if (input.forward) iz += 1
          if (input.back) iz -= 1
          if (input.left) ix -= 1
          if (input.right) ix += 1
          // camYaw is the camera's look direction (0 = +z). Increasing it
          // turns the view to the left.
          if (input.turnLeft) live.camYaw += dt * 1.6
          if (input.turnRight) live.camYaw -= dt * 1.6
        }

        if (s.autoTraverse) {
          if (s.aborting) {
            // An abort is a straight line at the lander, which is what the
            // return estimate switched to the moment it was declared.
            ix = -j.x
            iz = -j.z
          } else {
            // Follow the planned route toward the next waypoint.
            const idx = Math.min(s.path.length - 1, s.pathIndex)
            const target = s.path[Math.min(s.path.length - 1, idx + 4)]
            ix = target.x - j.x
            iz = target.z - j.z
          }
          const len = Math.hypot(ix, iz) || 1
          ix /= len; iz /= len
          // Let the camera swing round behind Jack so the view follows the walk.
          const dYaw = Math.atan2(Math.sin(Math.atan2(ix, iz) - live.camYaw), Math.cos(Math.atan2(ix, iz) - live.camYaw))
          live.camYaw += dYaw * Math.min(1, dt * 1.5)
        } else if (ix || iz) {
          // Rotate input into world space relative to where the camera looks.
          // Camera forward is (sin θ, cos θ); screen-right is (-cos θ, sin θ).
          const c = Math.cos(live.camYaw), sn = Math.sin(live.camYaw)
          const wx = iz * sn - ix * c
          const wz = iz * c + ix * sn
          ix = wx; iz = wz
          const len = Math.hypot(ix, iz) || 1
          ix /= len; iz /= len
        }

        if (ix || iz) {
          const grade = gradeAlong(j.x, j.z, ix, iz)
          const rough = roughnessAt(j.x, j.z)
          const base = 0.92
          const sp = walkSpeed(base, grade, rough)
          activity = grade > 0.18 ? 'climb' : 'walk'
          // World motion uses EVA seconds, so distance and consumables stay consistent
          // with the mission clock no matter what time compression is selected.
          const step = sp * dtEva
          moveX = ix * step
          moveZ = iz * step
          const nx = Math.max(-EXTENT + 20, Math.min(EXTENT - 20, j.x + moveX))
          const nz = Math.max(-EXTENT + 20, Math.min(EXTENT - 20, j.z + moveZ))
          stepped = Math.hypot(nx - j.x, nz - j.z)
          j.x = nx; j.z = nz
          j.speedMs = sp
          j.heading = Math.atan2(ix, iz)
          j.stride += dt * (2.0 + sp * 2.8)
          j.moving = Math.min(1, j.moving + dt * 5)
        } else {
          j.speedMs = 0
          j.moving = Math.max(0, j.moving - dt * 4)
        }
      }
    }
    j.y = heightAt(j.x, j.z)

    // --- consumables -------------------------------------------------------
    const lowVis = weather.visibilityM < 320
    const rates = loadRates(JACK_SUIT, {
      activity,
      speedMs: j.speedMs,
      grade: gradeAlong(j.x, j.z, Math.sin(j.heading), Math.cos(j.heading)),
      roughness: roughnessAt(j.x, j.z),
      airTempC: env.airTempC,
      irradiance: env.directIrradiance,
      dustFouling: s.cons.dustFouling,
      lowVisibility: lowVis,
    })
    // Dust accumulates far faster in a storm, and faster still if you keep moving.
    const dustRate = 0.004 + weather.tau * 0.075 * (s.sheltering ? 0.25 : 1)
    const cons = consume(s.cons, rates, dtEva / 3600, dustRate)
    const frac = fractions(JACK_SUIT, cons)

    // --- route progress and return estimate -------------------------------
    const pathIndex = nearestIndex(s.path, j.x, j.z)
    const alongRoute = remainingToHome(s.path, pathIndex)
    const direct = directToHome(j.x, j.z)
    // Aborting means walking straight at the lander. Otherwise the plan is the route.
    const useDirect = s.aborting || direct.minutes < alongRoute.minutes
    const returnDistanceM = useDirect ? direct.distanceM : alongRoute.distanceM
    const returnSpeed = useDirect ? direct.meanSpeedMs : Math.max(0.2, returnDistanceM / Math.max(1, alongRoute.minutes * 60))

    const returnRates = loadRates(JACK_SUIT, {
      activity: 'walk',
      speedMs: returnSpeed,
      grade: 0.02,
      roughness: 1.15,
      airTempC: env.airTempC,
      irradiance: env.directIrradiance,
      dustFouling: cons.dustFouling,
      lowVisibility: lowVis,
    })
    const ret = returnEstimate(JACK_SUIT, cons, returnDistanceM, returnSpeed, returnRates)

    // --- hazard and advice -------------------------------------------------
    const hazard = hazardAt(j.x, j.z, weather, s.stormFromDeg)
    let advice: ShelterAdvice | null = null
    if (weather.advisesShelter || ret.status === 'warning' || ret.status === 'critical') {
      advice = shelterAdvice(
        j.x, j.z, s.stormFromDeg, ret.walkMinutes, ret.marginMinutes, returnSpeed,
        weather.kind === 'regional-storm',
      )
    }

    // --- station proximity -------------------------------------------------
    const atLander = Math.hypot(j.x, j.z) < LANDER_RADIUS
    let nearCache: string | null = null
    for (const c of CACHES) {
      if (!s.cachesUsed.includes(c.id) && Math.hypot(j.x - c.x, j.z - c.z) < c.radius) {
        nearCache = c.id
        break
      }
    }
    let nearStation: string | null = null
    for (const st of STATIONS) {
      if (Math.hypot(j.x - st.x, j.z - st.z) < st.radius) { nearStation = st.id; break }
    }
    const stations = { ...s.stations }
    let arrivedAt: string | null = null
    if (nearStation && !stations[nearStation].reached) {
      stations[nearStation] = { ...stations[nearStation], reached: true }
      arrivedAt = nearStation
    }

    // --- radiation -----------------------------------------------------------
    const radiation = radiationAt(s.sepEvent, evaSec / 60, atLander, s.sheltering)
    const doseMSv = s.doseMSv + (radiation.doseRateUSvH * dtEva) / 3600 / 1000
    const sepExposed = s.sepExposed || (radiation.sepShare > 0.5 && !atLander)
    if (radiation.advisesReturn && !atLander && !advice?.isAbort) {
      // An SEP event outranks any terrain shelter: rock blocks part of the sky,
      // the cabin wall stops most of the protons.
      const home = shelterAdvice(j.x, j.z, s.stormFromDeg, ret.walkMinutes, 0, returnSpeed, true)!
      advice = {
        ...home,
        isAbort: true,
        rationale:
          (radiation.sepPhase === 'alert'
            ? `Solar flare seen; protons expected in about ${radiation.minutesToNextPhase.toFixed(0)} min. The walk home is ${ret.walkMinutes.toFixed(0)} min. `
            : `Solar particle event under way at ${(radiation.doseRateUSvH / 1000).toFixed(2)} mSv/h. `) +
          'A suit and a rock face stop little of it; the lander cabin stops most of it. Abort to the lander.',
      }
    }

    // --- comms delivery ----------------------------------------------------
    let messages = s.messages
    if (messages.some((m) => !m.delivered && m.arriveEvaSec <= evaSec)) {
      messages = messages.map((m) =>
        !m.delivered && m.arriveEvaSec <= evaSec ? { ...m, delivered: true } : m)
    }

    // --- Earth advisories, delayed by the real light time ------------------
    const sentAdvisories = [...s.sentAdvisories]
    const ctx = replyContext(get(), ret, weather, env)
    const pushMsg: CommsMessage[] = []
    const stormEvent = s.weatherEvents.find((e) => e.kind === 'regional-storm')
    if (stormEvent && !sentAdvisories.includes('stormSeen') && evaSec / 60 >= stormEvent.startMin) {
      sentAdvisories.push('stormSeen')
      pushMsg.push(advisory(ADVISORIES.stormSeen, stormEvent.startMin * 60, link.owltSec, ctx))
    }
    if (!sentAdvisories.includes('marginLow') && ret.marginAfterReserveMinutes < 0) {
      sentAdvisories.push('marginLow')
      pushMsg.push(advisory(ADVISORIES.marginLow, evaSec, link.owltSec, ctx))
    }
    if (s.sepEvent && !sentAdvisories.includes('solarFlare') && evaSec / 60 >= s.sepEvent.flareMin + 1) {
      sentAdvisories.push('solarFlare')
      // Earth sees the flare directly, so its warning costs one light time
      // plus think time, not a round trip.
      pushMsg.push(advisory(ADVISORIES.solarFlare, s.sepEvent.flareMin * 60 - link.owltSec, link.owltSec, ctx, 120))
    }
    if (!sentAdvisories.includes('conjunction') && link.nearConjunction) {
      sentAdvisories.push('conjunction')
      pushMsg.push(advisory(ADVISORIES.conjunction, 0, link.owltSec, ctx))
    }
    if (pushMsg.length) messages = [...messages, ...pushMsg]

    // --- smoothed visuals --------------------------------------------------
    const targetDust = Math.min(1, weather.tau / 2.6)
    live.dustVisual += (targetDust - live.dustVisual) * Math.min(1, dt * 0.9)
    const targetLight = Math.max(0.06, env.solarTransmission)
    live.lightVisual += (targetLight - live.lightVisual) * Math.min(1, dt * 0.9)

    // --- warnings to the log ----------------------------------------------
    const newLog: LogEntry[] = []
    if (weather.headline !== s.weather.headline && weather.kind !== 'clear') {
      newLog.push({ evaSec, kind: weather.advisesAbort ? 'danger' : 'warning', text: `${weather.headline}. ${weather.detail}` })
    }
    if (radiation.headline !== s.radiation.headline && radiation.sepPhase) {
      newLog.push({ evaSec, kind: radiation.advisesReturn ? 'danger' : 'warning', text: `${radiation.headline}. ${radiation.detail}` })
    }
    if (s.ret.status !== 'critical' && ret.status === 'critical') {
      newLog.push({ evaSec, kind: 'danger', text: `RETURN MARGIN CRITICAL. ${ret.limiting.toUpperCase()} limiting. Walk home is ${ret.walkMinutes.toFixed(0)} min and you have ${ret.enduranceMinutes.toFixed(0)} min of endurance. Move now.` })
    } else if (s.ret.status === 'nominal' && ret.status === 'caution') {
      newLog.push({ evaSec, kind: 'warning', text: `Return margin has crossed into the mandated reserve. ${ret.limiting.toUpperCase()} is limiting. The reserve exists so that a surprise does not become a fatality.` })
    }
    const routeComplete =
      s.autoTraverse && !s.aborting && atLander && evaSec > 120 &&
      pathIndex >= s.path.length - 4
    if (routeComplete) {
      newLog.push({
        evaSec,
        kind: 'decision',
        text: 'Route complete \u2014 Jack is back at the lander. Auto-traverse disengaged. ' +
          'Ingress to end the EVA, or go back out while the margin holds.',
      })
    }
    if (arrivedAt) {
      const st = STATION_BY_ID(arrivedAt)
      newLog.push({
        evaSec,
        kind: 'science',
        text: `ARRIVED \u2014 ${st.codename}, ${st.name}. ${st.tagline} Press F to work the station. ` +
          (s.autoTraverse && !s.aborting
            ? 'Auto-traverse disengaged: the decision to stop and work is yours.'
            : ''),
      })
    }
    if (!s.reserveBreached && ret.marginAfterReserveMinutes < 0) {
      newLog.push({ evaSec, kind: 'warning', text: 'FLIGHT RULE: reserve breached. This is recorded against the mission even if Jack walks home fine.' })
    }

    // --- termination conditions -------------------------------------------
    const home = Math.hypot(j.x, j.z) < LANDER_RADIUS
    if (frac.limitingFraction <= 0) {
      set({ time: { startedAt: s.time.startedAt, evaSec, now }, cons, frac, ret, env, clock, link, weather, hazard, advice, messages, sentAdvisories, stations, jackX: j.x, jackZ: j.z, jackHeading: j.heading, activity, speedMs: j.speedMs, rates, pathIndex, nearStation, atLander, nearCache, distanceWalkedM: s.distanceWalkedM + stepped, maxRangeReachedM: Math.max(s.maxRangeReachedM, Math.hypot(j.x, j.z)), reserveBreached: s.reserveBreached || ret.marginAfterReserveMinutes < 0, worstMarginMin: Math.min(s.worstMarginMin, ret.marginMinutes), log: newLog.length ? [...s.log, ...newLog] : s.log })
      get().finishEva(weather.advisesAbort ? 'stranded-in-storm' : 'life-support-exhausted')
      return
    }

    set({
      time: { startedAt: s.time.startedAt, evaSec, now },
      link, clock, env, weather, hazard, advice,
      radiation, doseMSv, sepExposed,
      cons, frac, rates, ret,
      jackX: j.x, jackZ: j.z, jackHeading: j.heading,
      activity, speedMs: j.speedMs, pathIndex, nearStation, atLander, nearCache,
      stations, messages, sentAdvisories,
      autoTraverse: (arrivedAt && !s.aborting) || routeComplete ? false : s.autoTraverse,
      distanceWalkedM: s.distanceWalkedM + stepped,
      maxRangeReachedM: Math.max(s.maxRangeReachedM, Math.hypot(j.x, j.z)),
      worstMarginMin: Math.min(s.worstMarginMin, ret.marginMinutes),
      reserveBreached: s.reserveBreached || ret.marginAfterReserveMinutes < 0,
      log: newLog.length ? [...s.log, ...newLog] : s.log,
    })

    // --- the running procedure, advanced on real time ---------------------
    // Done last so it sees the sim state this tick produced, and so the
    // commit it may apply is not overwritten by the set above.
    if (s.proc) get().tickProcedure(dt)

    if (home && s.aborting) get().finishEva()
    else if (home && evaSec > 120 && allWorkDone(get()) && !get().proc) get().finishEva()
  },

  setTimeScale: (t) => set({ timeScale: t }),
  togglePause: () => set({ paused: !get().paused }),
  setUi: (p) => {
    live.inputLocked = p !== null
    set({ ui: p })
  },
  toggleAutoTraverse: () => {
    const v = !get().autoTraverse
    set({ autoTraverse: v })
    get().pushLog('info', v ? 'Auto-traverse engaged: Jack follows the planned route. You keep every decision.' : 'Auto-traverse disengaged: manual control.')
  },

  ingress: () => {
    const s = get()
    if (s.outcome) return
    if (Math.hypot(s.jackX, s.jackZ) >= LANDER_RADIUS) return
    get().pushLog('decision',
      `INGRESS at ${(s.time.evaSec / 60).toFixed(0)} min. Jack is on the ladder. EVA complete.`)
    get().finishEva()
  },

  useCache: () => {
    const s = get()
    const cache = CACHES.find((c) => c.id === s.nearCache)
    if (!cache || s.cachesUsed.includes(cache.id)) return

    // Top up toward a full load, never beyond it.
    const cons: Consumables = {
      ...s.cons,
      o2Kg: Math.min(JACK_SUIT.o2Kg, s.cons.o2Kg + JACK_SUIT.o2Kg * cache.restore.o2),
      batteryWh: Math.min(JACK_SUIT.batteryWh, s.cons.batteryWh + JACK_SUIT.batteryWh * cache.restore.battery),
      waterKg: Math.min(JACK_SUIT.waterKg, s.cons.waterKg + JACK_SUIT.waterKg * cache.restore.water),
      co2AbsorbedKg: Math.max(0, s.cons.co2AbsorbedKg - JACK_SUIT.scrubberKg * cache.restore.scrubber),
      // Opening the suit's service panels in a dust-laden environment does not help.
      dustFouling: Math.min(1, s.cons.dustFouling + 0.05),
    }
    live.jack.tool = 'none'
    set({ cons, frac: fractions(JACK_SUIT, cons), cachesUsed: [...s.cachesUsed, cache.id] })
    get().pushLog('decision',
      `${cache.name}: consumables swapped, ${cache.swapMinutes} min. ` +
      `O\u2082 ${(cons.o2Kg / JACK_SUIT.o2Kg * 100).toFixed(0)}%, battery ${(cons.batteryWh / JACK_SUIT.batteryWh * 100).toFixed(0)}%, ` +
      `scrubber ${((1 - cons.co2AbsorbedKg / JACK_SUIT.scrubberKg) * 100).toFixed(0)}%, water ${(cons.waterKg / JACK_SUIT.waterKg * 100).toFixed(0)}%. ` +
      `The cache is now empty \u2014 there is no second swap.`)
  },

  declareAbort: () => {
    const s = get()
    if (s.aborting) return
    // Hand Jack the walk home automatically: the decision was the hard part,
    // and the player should be watching the margin, not steering.
    set({ aborting: true, sheltering: false, autoTraverse: true })
    if (s.advice?.isAbort || s.weather.advisesAbort || s.radiation.advisesReturn || s.ret.status !== 'nominal') {
      set({ heededAdvice: s.heededAdvice + 1 })
    }
    get().pushLog('decision',
      `ABORT DECLARED at ${(s.time.evaSec / 60).toFixed(0)} min, ${Math.hypot(s.jackX, s.jackZ).toFixed(0)} m from the lander. ` +
      `Return estimate now uses the direct line home, and Jack is walking it. Margin ${s.ret.marginMinutes.toFixed(0)} min, ${s.ret.limiting.toUpperCase()} limiting. Take manual control any time with WASD.`)
    get().sendMessage('emergency')
  },

  setSheltering: (v) => {
    const s = get()
    set({ sheltering: v, autoTraverse: false })
    if (v) {
      set({ heededAdvice: s.heededAdvice + 1 })
      get().pushLog('decision',
        `Sheltering in place. Metabolic load drops to resting, dust accumulation drops to a quarter. ` +
        `The clock does not stop: this costs margin, it just costs less than walking.`)
    } else {
      get().pushLog('decision', 'Resuming traverse.')
    }
  },

  abradeStation: (stationId) => {
    const s = get()
    const st = STATION_BY_ID(stationId)
    if (s.stations[stationId].abraded) return
    set({ stations: { ...s.stations, [stationId]: { ...s.stations[stationId], abraded: true } } })
    get().pushLog('science',
      `${st.codename}: abraded patch cut, ${st.abradeMinutes} min. ${st.abradeReveal}`)
  },

  inspectStation: (stationId) => {
    const s = get()
    const st = STATION_BY_ID(stationId)
    const state = s.stations[stationId]
    if (state.inspected) return
    set({ stations: { ...s.stations, [stationId]: { ...state, inspected: true } } })
    get().pushLog('science',
      `${st.codename}: hand lens on ${state.abraded ? 'the abraded patch' : 'the weathered outside'}, ${st.lensMinutes} min. ` +
      (state.abraded
        ? st.lensReveal
        : 'Through the dust coating and the oxidised rind, very little resolves. Clearing the rind first is what makes a lens worth the minutes.'))
  },

  recordObservation: (stationId, choiceId) => {
    const s = get()
    const st = STATION_BY_ID(stationId)
    const opt = st.observation.options.find((o) => o.id === choiceId)
    const state = s.stations[stationId]
    if (!opt || state.choice) return
    // A call made on a dusty, oxidised surface is a guess with a good story.
    const confident = state.abraded && state.inspected
    const stations = {
      ...s.stations,
      [stationId]: { ...state, choice: choiceId, choiceConfident: confident },
    }
    set({ stations })
    get().pushLog('science',
      `${st.codename}: recorded "${opt.text}" — ${opt.supported ? 'SUPPORTED by the published observations' : 'NOT supported'}. ${opt.feedback}` +
      (confident
        ? ''
        : ' Recorded on an unprepared surface, so it goes in the log with a confidence caveat: a weathering rind can hide or fake almost any texture.'))
  },

  collectSample: (stationId) => {
    const s = get()
    const st = STATION_BY_ID(stationId)
    if (!st.sampleable || s.stations[stationId].sampled) return
    const contextGood = (() => {
      const c = s.stations[stationId].choice
      const o = st.observation.options.find((x) => x.id === c)
      return !!o?.supported
    })()
    const sample: Sample = {
      id: `${stationId}-core`,
      stationId,
      name: st.sampleName,
      evaSec: s.time.evaSec,
      massG: 14 + Math.round(Math.random() * 6),
      contextGood,
    }
    set({
      samples: [...s.samples, sample],
      stations: { ...s.stations, [stationId]: { ...s.stations[stationId], sampled: true } },
    })
    get().pushLog('science',
      `${st.codename}: core sealed — ${sample.name}, ${sample.massG} g. ` +
      (contextGood
        ? 'Field context recorded correctly, so the tube is worth the mass budget.'
        : 'No supported observation recorded here, so this tube arrives on Earth without the field context that gives it meaning. The rock is still useful. It is worth much less.'))
  },

  takePhoto: (label, dataUrl) => {
    const s = get()
    const photo: Photo = {
      id: `ph-${s.photos.length + 1}`,
      stationId: s.nearStation,
      label,
      evaSec: s.time.evaSec,
      ltst: s.clock.ltstHours,
      sunElevationDeg: s.clock.sunElevationDeg,
      tau: s.env.dustOpticalDepth,
      dataUrl,
    }
    const stations = { ...s.stations }
    if (s.nearStation) {
      stations[s.nearStation] = { ...stations[s.nearStation], photos: stations[s.nearStation].photos + 1 }
    }
    set({ photos: [...s.photos, photo], stations })
    get().pushLog('science',
      `Mastcam-class frame captured: ${label}. Sun ${s.clock.sunElevationDeg.toFixed(0)}° elevation, ` +
      `τ ${s.env.dustOpticalDepth.toFixed(2)}, LTST ${s.clock.ltstHours.toFixed(2)} h. Illumination geometry logged with the frame.`)
  },

  plantFlag: (code) => {
    const s = get()
    if (s.flagsRemaining <= 0) return
    const c = findCountry(code)
    if (!c) return
    // Plant it a stride in front of Jack rather than through him.
    const ahead = 1.35
    const plant: FlagPlant = {
      code,
      name: c.name,
      stationId: s.nearStation,
      x: live.jack.x + Math.sin(live.jack.heading) * ahead,
      z: live.jack.z + Math.cos(live.jack.heading) * ahead,
      evaSec: s.time.evaSec,
    }
    const stations = { ...s.stations }
    if (s.nearStation) stations[s.nearStation] = { ...stations[s.nearStation], flagPlanted: true }
    set({ flag: plant, flagsRemaining: s.flagsRemaining - 1, stations })
    get().pushLog('science',
      `Flag emplaced: ${c.name}. Commemorative only — Outer Space Treaty Article II means this is not a territorial claim.`)
    get().sendMessage('flag')
  },

  sendMessage: (templateId) => {
    const s = get()
    const tpl: OutgoingTemplate | undefined = OUTGOING.find((t) => t.id === templateId)
    if (!tpl) return
    const ctx = replyContext(s, s.ret, s.weather, s.env)
    const { down, up } = transmit(tpl, s.time.evaSec, s.link.owltSec, ctx)
    set({ messages: [...s.messages, down, up] })
    get().pushLog('comms',
      `DOWNLINK: ${tpl.subject}. Reaches Earth in ${(s.link.owltSec / 60).toFixed(1)} min. ` +
      `Earliest possible reply lands at EVA +${((s.time.evaSec + 2 * s.link.owltSec + tpl.earthThinkSec) / 60).toFixed(0)} min.`)
  },

  // -------------------------------------------------------------------------
  // Procedures. Every player action that costs mission time runs through here
  // so that it is shown being done rather than silently applied.
  // -------------------------------------------------------------------------

  startProcedure: (def, commit) => {
    const s = get()
    if (s.proc || s.outcome) return
    // The full minute cost is charged while the animation plays: the mission
    // clock is compressed so that `def.minutes` of mission time really do pass
    // in `def.realSec` of the player's time. The compression factor is shown on
    // screen, so the player can see the clock is not being given to them free.
    const scale = Math.max(1, (def.minutes * 60) / def.realSec)
    live.jack.working = def.minutes * 60
    live.jack.tool = def.tool
    live.inputLocked = true
    set({
      ui: null,
      autoTraverse: false,
      timeScale: scale,
      proc: {
        def,
        commit,
        progress: 0,
        elapsed: 0,
        complete: false,
        prevTimeScale: s.timeScale,
        startEvaSec: s.time.evaSec,
        startFrac: { o2: s.frac.o2, battery: s.frac.battery, scrubber: s.frac.scrubber },
        narrated: -1,
        returnUi: s.ui,
      },
    })
    get().pushLog('science',
      `PROCEDURE START \u2014 ${def.title}. ${def.subtitle}. Budgeted ${def.minutes} min of mission time.`)
  },

  tickProcedure: (dtRealSec) => {
    const s = get()
    const p = s.proc
    if (!p || p.complete) return

    const elapsed = p.elapsed + dtRealSec
    const progress = Math.min(1, elapsed / p.def.realSec)

    // Narrate each beat into the mission log as it happens, so the log reads
    // like a real voice loop afterwards instead of a list of outcomes.
    let narrated = p.narrated
    const bi = activeBeat(p.def, progress)
    if (bi > narrated) {
      narrated = bi
      const b = p.def.beats[bi]
      get().pushLog('science', `${p.def.title}: ${b.label}. ${b.detail}`)
    }

    if (progress < 1) {
      set({ proc: { ...p, elapsed, progress, narrated } })
      return
    }

    // --- the procedure finished: restore the clock, then commit ------------
    live.jack.working = 0
    live.jack.tool = 'none'
    set({
      timeScale: p.prevTimeScale,
      proc: { ...p, elapsed, progress: 1, complete: true, narrated },
    })

    const c = p.commit
    switch (c.type) {
      case 'abrade': get().abradeStation(c.stationId); break
      case 'lens': get().inspectStation(c.stationId); break
      case 'record': get().recordObservation(c.stationId, c.choiceId); break
      case 'core': get().collectSample(c.stationId); break
      case 'photo': get().takePhoto(c.label, c.dataUrl); break
      case 'flag': get().plantFlag(c.code); break
      case 'cache': get().useCache(); break
      case 'shelter': get().setSheltering(true); break
    }

    const lid = p.def.lesson.id
    if (!get().lessons.includes(lid)) set({ lessons: [...get().lessons, lid] })
  },

  beginAbrade: (stationId) => {
    const st = STATION_BY_ID(stationId)
    if (get().stations[stationId].abraded) return
    get().startProcedure(abradeActivity(st), { type: 'abrade', stationId })
  },

  beginLens: (stationId) => {
    const st = STATION_BY_ID(stationId)
    const state = get().stations[stationId]
    if (state.inspected) return
    get().startProcedure(lensActivity(st, state.abraded), { type: 'lens', stationId })
  },

  beginRecord: (stationId, choiceId) => {
    const st = STATION_BY_ID(stationId)
    const state = get().stations[stationId]
    if (state.choice) return
    get().startProcedure(
      recordActivity(st, state.abraded && state.inspected),
      { type: 'record', stationId, choiceId },
    )
  },

  beginCore: (stationId) => {
    const st = STATION_BY_ID(stationId)
    const s = get()
    if (!st.sampleable || s.stations[stationId].sampled || s.samples.length >= 4) return
    get().startProcedure(coreActivity(st), { type: 'core', stationId })
  },

  beginPhoto: (label, dataUrl) => {
    if (get().proc) return
    get().startProcedure(photoActivity(label), { type: 'photo', label, dataUrl })
  },

  beginFlag: (code) => {
    const s = get()
    if (s.flagsRemaining <= 0) return
    const c = findCountry(code)
    if (!c) return
    get().startProcedure(flagActivity(c.name), { type: 'flag', code })
  },

  beginCache: () => {
    const s = get()
    const cache = CACHES.find((c) => c.id === s.nearCache)
    if (!cache || s.cachesUsed.includes(cache.id)) return
    get().startProcedure(cacheActivity(cache.name, cache.swapMinutes), { type: 'cache', cacheId: cache.id })
  },

  beginShelter: () => {
    const s = get()
    if (s.sheltering || s.proc) return
    get().startProcedure(shelterActivity(s.advice?.shelter.name ?? 'local terrain'), { type: 'shelter' })
  },

  dismissProcedure: () => {
    const p = get().proc
    if (!p) return
    if (!p.complete) {
      // Walking away part-way through costs the time already spent and gains
      // nothing, which is exactly what happens in the field.
      get().pushLog('warning',
        `${p.def.title} abandoned at ${(p.progress * 100).toFixed(0)}% after ` +
        `${((get().time.evaSec - p.startEvaSec) / 60).toFixed(1)} min. Nothing recorded.`)
    }
    live.jack.working = 0
    live.jack.tool = 'none'
    live.inputLocked = p.returnUi !== null
    set({ proc: null, ui: p.returnUi, timeScale: p.prevTimeScale })
  },

  finishEva: (code) => {
    const s = get()
    if (s.outcome) return
    set({ outcome: buildOutcome(s, code), phase: 'debrief', paused: true })
  },

  restart: () => {
    resetLive()
    set({ ...initialState(Math.floor(Math.random() * 1e9)), phase: 'title' })
  },

  pushLog: (kind, text) =>
    set((st) => ({ log: [...st.log, { evaSec: st.time.evaSec, kind, text }] })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function replyContext(s: State, ret: ReturnEstimate, w: WeatherEvent, env: Environment): ReplyContext {
  return {
    owltSec: s.link.owltSec,
    stationsWorked: Object.values(s.stations).filter((x) => x.choice).length,
    samplesHeld: s.samples.length,
    marginMinutes: ret.marginMinutes,
    limiting: ret.limiting.toUpperCase(),
    weatherHeadline: w.headline,
    dustTau: env.dustOpticalDepth,
    routeName: ROUTE_BY_ID(s.routeId).name,
    distanceFromLanderM: Math.hypot(s.jackX, s.jackZ),
    scienceScore: scienceScore(s).score,
  }
}

function allWorkDone(s: State): boolean {
  return s.plannedStations.every((id) => {
    const st = s.stations[id]
    return st.choice !== null
  })
}

export function scienceScore(s: State): { score: number; max: number; breakdown: Array<{ label: string; points: number; note: string }> } {
  const breakdown: Array<{ label: string; points: number; note: string }> = []
  let score = 0
  let max = 0

  for (const st of STATIONS) {
    // observation + preparation + inspection + core + imagery
    max += st.value + 5 + 6 + 12 + 4
    const state = s.stations[st.id]
    if (!state) continue

    if (state.abraded) {
      score += 5
      breakdown.push({
        label: `${st.codename} abraded patch`,
        points: 5,
        note: 'Weathering rind cleared, so the interpretation rests on fresh rock rather than on a dust coating.',
      })
    }
    if (state.inspected) {
      const pts = state.abraded ? 6 : 2
      score += pts
      breakdown.push({
        label: `${st.codename} hand lens`,
        points: pts,
        note: state.abraded
          ? 'Close inspection of a prepared surface. This is the step that turns a guess into a measurement.'
          : 'Lens used on an unprepared surface. Little resolves through a rind, so only partial credit.',
      })
    }

    const opt = st.observation.options.find((o) => o.id === state.choice)
    if (opt?.supported) {
      const pts = state.choiceConfident ? st.value : Math.round(st.value * 0.6)
      score += pts
      breakdown.push({
        label: `${st.codename} observation`,
        points: pts,
        note: state.choiceConfident
          ? 'Supported interpretation, recorded on a prepared and inspected surface. Full value.'
          : 'Supported interpretation, but recorded without preparing the surface. The call was right; the procedure was not, so the team cannot lean on it as hard.',
      })
    } else if (opt) {
      const partial = Math.round(st.value * 0.25)
      score += partial
      breakdown.push({
        label: `${st.codename} observation`,
        points: partial,
        note: 'Observation recorded but not the interpretation the data supports. Partial credit: a wrong reading in the field is still a logged reading, and the team can revisit it.',
      })
    } else if (state.reached) {
      breakdown.push({
        label: `${st.codename}`,
        points: 0,
        note: 'Station reached but no observation recorded. Touching a marker is not science.',
      })
    }

    if (state.sampled) {
      const pts = opt?.supported ? (state.choiceConfident ? 12 : 9) : 6
      score += pts
      breakdown.push({
        label: `${st.codename} sample`,
        points: pts,
        note: opt?.supported
          ? (state.choiceConfident
            ? 'Sealed core with a prepared surface and a supported interpretation behind it. This is what a returned tube is supposed to look like.'
            : 'Sealed core with a supported interpretation, but taken from an unprepared target.')
          : 'Sealed core without supporting field context.',
      })
    }
    if (state.photos > 0) {
      score += 4
      breakdown.push({
        label: `${st.codename} imagery`,
        points: 4,
        note: `${state.photos} frame(s) with illumination geometry logged.`,
      })
    }
  }
  return { score, max, breakdown }
}

function buildOutcome(s: State, code?: OutcomeCode): Outcome {
  const sci = scienceScore(s)
  const home = Math.hypot(s.jackX, s.jackZ) < 36
  const worked = Object.values(s.stations).filter((x) => x.choice).length
  const lessons: string[] = []

  let resolved: OutcomeCode
  if (code) resolved = code
  else if (!home) resolved = 'life-support-exhausted'
  else resolved = s.reserveBreached ? 'returned-reserve-breach' : 'returned-nominal'

  const decisionScore = Math.max(
    0,
    Math.min(100,
      55 + s.heededAdvice * 14 - s.ignoredAdvice * 18 +
      (resolved === 'returned-nominal' ? 25 : 0) +
      (s.reserveBreached ? -20 : 0) +
      (resolved === 'life-support-exhausted' || resolved === 'stranded-in-storm' ? -45 : 0)),
  )

  const titles: Record<OutcomeCode, string> = {
    'returned-nominal': 'EVA COMPLETE — CREW AND SCIENCE RECOVERED',
    'returned-reserve-breach': 'EVA COMPLETE — RESERVE BREACHED',
    'life-support-exhausted': 'EVA TERMINATED — LIFE SUPPORT EXHAUSTED',
    'stranded-in-storm': 'EVA TERMINATED — STRANDED IN DUST STORM',
  }

  const summaries: Record<OutcomeCode, string> = {
    'returned-nominal':
      `Jack is back inside with ${(s.frac.limitingFraction * 100).toFixed(0)}% of the limiting consumable (${s.ret.limiting.toUpperCase()}) untouched and ${s.samples.length} sealed tube(s) in the rack. This is what a good EVA looks like: the science came home because the astronaut did.`,
    'returned-reserve-breach':
      `Jack made it to the airlock, but the suit crossed into its mandated reserve at ${(s.worstMarginMin).toFixed(0)} min of worst-case margin. The crew is fine and the flight rule was still violated. Reserves are not a resource to be spent; they are the budget for the thing you did not predict.`,
    'life-support-exhausted':
      `${s.ret.limiting.toUpperCase()} ran out ${Math.hypot(s.jackX, s.jackZ).toFixed(0)} m from the lander. In this game that ends the EVA. On Mars it ends the astronaut. The margin indicator was the whole mechanism for preventing this, and the return estimate was on screen the entire time.`,
    'stranded-in-storm':
      `The suit ran dry during a dust storm, ${Math.hypot(s.jackX, s.jackZ).toFixed(0)} m from the lander, with visibility at ${s.weather.visibilityM.toFixed(0)} m. The storm did not do this with wind — the air is too thin to push a person over. It did it by taking the solar input, driving the heater load up, coating the radiator, and eating the margin while the decision was deferred.`,
  }

  if (resolved === 'returned-nominal' && worked === 3) {
    lessons.push('All three stations worked and the crew came home with reserve intact. That is the maximum-value outcome and it is deliberately hard to reach — it usually needs the Floor Traverse and an early start.')
  }
  if (s.reserveBreached) {
    lessons.push('Reserve breach: the model flagged the crossing in the log the moment it happened. Watch for the return-margin bar entering the reserve band and turn earlier.')
  }
  if (s.ignoredAdvice > 0) {
    lessons.push(`${s.ignoredAdvice} shelter or abort advisory was issued and not acted on. The advisory is generated locally from the hazard model, which is the only kind of advice available on a ${(s.link.owltSec / 60).toFixed(0)}-minute light-time delay.`)
  }
  if (s.sepEvent && s.sepExposed) {
    lessons.push(`Radiation: Jack was outside the lander while a solar particle event dominated the dose, and took ${s.doseMSv.toFixed(2)} mSv this EVA. SEP protons are soft enough that a cabin wall stops most of them, so the warning time between the flare and the protons is the whole defence. Turn for the lander on the flare, not on the dose.`)
  } else if (s.sepEvent) {
    lessons.push(`Radiation: a solar particle event occurred and Jack stayed out of the worst of it. EVA dose ${s.doseMSv.toFixed(2)} mSv, against NASA's 600 mSv career limit.`)
  } else {
    lessons.push(`Radiation: EVA dose ${s.doseMSv.toFixed(3)} mSv from the galactic cosmic-ray background Curiosity RAD measures on the surface (0.64 mSv per sol). A suit stops almost none of it; that is a mission-length budget, not an EVA hazard.`)
  }
  if (!s.samples.length) {
    lessons.push('No sample returned. Observations are valuable, but sample return is the one thing a human on the surface can do that no orbiter can.')
  }
  const rushed = STATIONS.filter((st) => {
    const x = s.stations[st.id]
    return x?.choice && !x.choiceConfident
  })
  for (const st of rushed) {
    lessons.push(`${st.codename}: the interpretation was recorded without abrading and inspecting the target first. On Mars the outside of every rock is a dust coating over an oxidised rind — Perseverance abrades a patch and images it before deciding whether a rock is worth a tube, and for the same reason.`)
  }
  const unsupported = STATIONS.filter((st) => {
    const c = s.stations[st.id]?.choice
    const o = st.observation.options.find((x) => x.id === c)
    return c && !o?.supported
  })
  for (const st of unsupported) {
    lessons.push(`${st.codename}: the recorded interpretation is not the one the published Perseverance observations support. See the station briefing for what the data actually shows.`)
  }
  if (s.photos.length === 0) {
    lessons.push('No imagery captured. Illumination geometry logged with a frame is what lets the science team reconcile a field observation with orbital mapping.')
  }
  if (!s.flag) {
    lessons.push('No flag emplaced. Purely commemorative, no science value — but it is the moment the public remembers.')
  }
  lessons.push('Everything about the suit, the consumable rates and the hazard scoring in this debrief is a game model. The Mars season, local solar time, sun angle and Earth light time are computed from real ephemerides. The terrain you walked is synthetic.')

  return {
    code: resolved,
    success: resolved === 'returned-nominal' || resolved === 'returned-reserve-breach',
    title: titles[resolved],
    summary: summaries[resolved],
    scienceScore: sci.score,
    maxScienceScore: sci.max,
    decisionScore,
    verdict:
      resolved === 'returned-nominal'
        ? `${sci.score}/${sci.max} science, crew safe, reserve intact.`
        : resolved === 'returned-reserve-breach'
          ? `${sci.score}/${sci.max} science, crew safe, flight rule violated.`
          : `${sci.score}/${sci.max} science recorded. Crew not recovered.`,
    lessons,
  }
}

/** Route and station lookups re-exported for the UI. */
export { ROUTES, STATIONS, ROUTE_BY_ID, STATION_BY_ID }
export { JACK_SUIT }
export { dustSeasonFactor, seasonName, sunTimes }
