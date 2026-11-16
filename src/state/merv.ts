/**
 * merv.ts — The rover's conversational state.
 *
 * Everything the player can see or hear MERV do passes through here: the
 * transcript, the microphone, the speech queue, the link tier and the
 * unprompted advisories. It is deliberately the only module that knows which
 * tier is running, so the panel renders the same way whether MERV is answering
 * from the offline knowledge base or from a hosted language model.
 *
 * Two rules shape the design.
 *
 *  - NOTHING HERE MAY THROW INTO THE MISSION. A refused microphone, an expired
 *    token, a dropped socket and a browser with no speech engine are all
 *    ordinary outcomes, and every one of them ends with a rover that still
 *    talks in text. The mission loop never learns that anything went wrong.
 *
 *  - ADVISORIES ARE RATE-LIMITED IN REAL TIME, NOT MISSION TIME. The mission
 *    clock runs up to thirty times real, and a companion that fires six
 *    warnings a second because the player pressed Shift is not a companion,
 *    it is an alarm.
 */

import { create } from 'zustand'
import {
  advisories, respond, snapshot, suggestions,
  type Advisory, type Reply, type Telemetry,
} from '../ai/brain'
import { findTopic, pick, QUIPS } from '../ai/knowledge'
import { FUNCTIONS, GREETING, buildPrompt } from '../ai/agentPrompt'
import {
  PcmPlayer, credential, forgetCredential, openAgent, openMic, readConfig,
  resolveTier, speakDeepgram, speakLocally, transcribe,
  type AgentSession, type Credential, type MicStream, type Transcriber,
  type VoiceConfig, type VoiceTier,
} from '../ai/voice'
import { installDebugGlobals, type DebugGlobalTarget } from './debugGlobals'
import { live } from './live'
import { useSettings } from './settings'
import { useStore } from './store'

export type Speaker = 'jack' | 'merv' | 'system'
export type LinkState = 'local' | 'connecting' | 'live' | 'error'

export interface Line {
  id: string
  who: Speaker
  text: string
  source?: string
  tone: Reply['tone']
  /** EVA seconds, so the transcript can be read against the mission clock. */
  at: number
  /** True when this was MERV speaking unprompted. */
  volunteered?: boolean
}

export interface MervState {
  /** Set once the comms link has been brought up for this run. */
  booted: boolean
  tier: VoiceTier
  link: LinkState
  error: string | null
  /** One line describing exactly how this is wired, for the panel footer. */
  diagnostic: string
  /** True when a microphone is physically available to us. */
  micAvailable: boolean

  lines: Line[]
  /** Partial transcript while Jack is still speaking. */
  interim: string
  listening: boolean
  micLevel: number
  speaking: boolean
  thinking: boolean

  /** Advisory ids already spoken this run. */
  said: string[]
  /** Lines the player has not seen because the panel was shut. */
  unread: number
  /** Voice output off — transcript only. */
  muted: boolean
  /** Unprompted advisories off. */
  advise: boolean
  /** Questions to offer as buttons, refreshed from the situation. */
  prompts: string[]
}

export interface MervActions {
  boot: () => Promise<void>
  shutdown: () => void
  reset: () => void
  ask: (question: string) => Promise<void>
  say: (text: string, opts?: Partial<Line>) => void
  tick: (dtRealSec: number) => void
  startTalking: () => Promise<void>
  stopTalking: () => void
  stopSpeaking: () => void
  setMuted: (v: boolean) => void
  setAdvise: (v: boolean) => void
  markRead: () => void
}

// ---------------------------------------------------------------------------
//  Module-scope plumbing. Not state: these are handles, not values, and
//  putting them in the store would re-render the panel every audio frame.
// ---------------------------------------------------------------------------

const cfg: VoiceConfig = readConfig(
  (import.meta as unknown as { env: Record<string, string> }).env ?? {},
)
let cred: Credential | null = null
let player: PcmPlayer | null = null
let mic: MicStream | null = null
let stt: Transcriber | null = null
let agent: AgentSession | null = null
let localStop: (() => void) | null = null
/** Browser speech recognition, used only on the local tier. */
let recog: { stop: () => void } | null = null
/** Real seconds since the last unprompted line. */
let sinceAdvisory = 99
/** Real seconds since the telemetry snapshot was last rebuilt. */
let sinceSnapshot = 99
let tel: Telemetry | null = null
/** Real seconds since the agent's prompt was refreshed with new telemetry. */
let sincePromptPush = 0
let seq = 0

const nextId = () => `l${++seq}`

/** Shortest real-time gap between two unprompted lines, seconds. */
const ADVISORY_GAP_S = 14
/** How often the telemetry snapshot is rebuilt, real seconds. */
const SNAPSHOT_EVERY_S = 0.8
/** How often the hosted model's prompt is refreshed, real seconds. */
const PROMPT_EVERY_S = 20

function evaNow(): number {
  return useStore.getState().time.evaSec
}

/** Current telemetry, rebuilt at most a few times a second. */
function telemetry(): Telemetry {
  if (!tel) tel = snapshot(useStore.getState())
  return tel
}

/**
 * Browser speech recognition, where it exists.
 *
 * This is the local tier's ears. It is disclosed in the comms panel because on
 * most browsers that ship it, the audio is sent to the vendor's own service —
 * so it is not offline in the way the rest of the local tier is, and saying so
 * is the only honest way to offer it.
 */
function browserRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
}

export const useMerv = create<MervState & MervActions>((set, get) => ({
  booted: false,
  tier: 'local',
  link: 'local',
  error: null,
  diagnostic: 'Offline knowledge base. No external service configured.',
  micAvailable: false,
  lines: [],
  interim: '',
  listening: false,
  micLevel: 0,
  speaking: false,
  thinking: false,
  said: [],
  unread: 0,
  muted: false,
  advise: true,
  prompts: [],

  // -------------------------------------------------------------------------
  boot: async () => {
    if (get().booted) return
    set({ booted: true, link: 'connecting' })

    const hasMic = typeof navigator !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia
    set({ micAvailable: hasMic || !!browserRecognition() })

    // Does a credential exist, and is it one we are willing to use here?
    try {
      cred = await credential(cfg, {
        hostname: window.location.hostname,
        dev: !!(import.meta as unknown as { env: { DEV?: boolean } }).env?.DEV,
      })
    } catch {
      cred = null
    }

    const tier = resolveTier(cfg, !!cred)
    const diag = describe(tier, cred)

    if (tier === 'agent' && cred) {
      // The hosted model gets its own socket and does its own listening.
      try {
        mic = await openMic()
        agent = openAgent(cred, cfg, {
          micRate: mic.rate,
          prompt: buildPrompt(telemetry()),
          greeting: GREETING,
          functions: FUNCTIONS,
        }, {
          onReady: () => set({ link: 'live', error: null }),
          onUserText: (text) => {
            get().say(text, { who: 'jack', tone: 'info' })
            set({ interim: '' })
          },
          onAgentText: (text) => get().say(text, { who: 'merv', tone: 'info' }),
          onUserStarted: () => { live.rover.listening = 1 },
          onThinking: () => { set({ thinking: true }); live.rover.thinking = 1 },
          onSpeakStart: () => {
            set({ thinking: false, speaking: true })
            live.rover.thinking = 0
            live.rover.talking = 1
          },
          onAudio: (pcm) => { ensurePlayer().push(pcm) },
          onAudioDone: () => {
            set({ speaking: false })
            live.rover.talking = 0
          },
          onFunction: (name, args) => Promise.resolve(callFunction(name, args)),
          onError: (e) => fallBack(set, `voice agent: ${e}`),
          onClose: (code) => {
            // 1008/4001-ish closes are authentication; drop the token so the
            // next attempt fetches a fresh one rather than retrying a dead one.
            if (code === 1008 || code === 4001 || code === 4008) forgetCredential()
            if (get().link === 'live') fallBack(set, 'voice agent link closed')
          },
        })
        // Microphone is open-mic in agent mode: the agent does its own
        // endpointing and barge-in detection, which is the whole point of it.
        mic.onPcm((pcm, peak) => {
          agent?.send(pcm)
          set({ micLevel: peak })
        })
        mic.mute(false)
        set({ tier: 'agent', diagnostic: diag, listening: true })
      } catch (err) {
        console.warn('[MERV] agent tier unavailable:', err)
        fallBack(set, 'microphone or agent unavailable')
      }
    } else {
      set({
        tier,
        link: tier === 'local' ? 'local' : 'live',
        diagnostic: diag,
      })
    }

    // The greeting is a line in the transcript either way. On the agent tier
    // the model speaks its own greeting, so this is not spoken again.
    const g = pick(QUIPS.greeting, Math.round(evaNow()))
    get().say(g, { who: 'merv', tone: 'info' })
    if (get().tier !== 'agent') void speakOut(g, set, get)

    /**
     * Audio is off by default across this whole project, deliberately: the
     * usual venue is a crowded room and nobody wants a laptop to start making
     * noise. But a companion who can talk and silently does not is a feature
     * nobody discovers, so he says once, in text, that he has a voice.
     */
    if (!useSettings.getState().audio) {
      get().say(
        'My voice is muted — audio is off by default so this does not start talking at a judging table. Press VOICE ON above and I will read these out loud.',
        { who: 'system', tone: 'info' },
      )
    }
    set({ prompts: suggestions(telemetry()) })
  },

  shutdown: () => {
    try { stt?.close() } catch { /* ignore */ }
    try { agent?.close() } catch { /* ignore */ }
    try { mic?.close() } catch { /* ignore */ }
    try { player?.close() } catch { /* ignore */ }
    try { recog?.stop() } catch { /* ignore */ }
    localStop?.()
    stt = null; agent = null; mic = null; player = null; recog = null; localStop = null
    set({ listening: false, speaking: false, thinking: false, link: 'local' })
    live.rover.talking = 0
    live.rover.listening = 0
    live.rover.thinking = 0
  },

  reset: () => {
    get().shutdown()
    cred = null
    tel = null
    sinceAdvisory = 99
    sinceSnapshot = 99
    set({
      booted: false, lines: [], said: [], unread: 0, interim: '',
      error: null, link: 'local', tier: 'local', prompts: [],
    })
  },

  say: (text, opts = {}) => {
    const line: Line = {
      id: nextId(),
      who: opts.who ?? 'merv',
      text,
      source: opts.source,
      tone: opts.tone ?? 'info',
      at: evaNow(),
      volunteered: opts.volunteered,
    }
    set((s) => ({
      // The transcript is capped: a long run must not grow without bound, and
      // nobody scrolls back past fifty lines of radio traffic.
      lines: [...s.lines, line].slice(-80),
      unread: line.who === 'merv' ? s.unread + 1 : s.unread,
    }))
  },

  /**
   * Answer a typed or transcribed question.
   *
   * On the agent tier the hosted model owns the conversation, so a typed
   * question is injected into it rather than answered here — otherwise the
   * player would get two different replies to the same question.
   */
  ask: async (question) => {
    const q = question.trim()
    if (!q) return
    get().say(q, { who: 'jack', tone: 'info' })
    set({ interim: '' })

    if (get().tier === 'agent' && agent?.ready) {
      // InjectUserMessage makes the model treat it as something Jack said.
      agent.inject(`Jack typed: "${q}". Answer him.`, 'interrupt')
      return
    }

    set({ thinking: true })
    live.rover.thinking = 1
    const d = telemetry()
    const reply = respond(q, d)
    // A beat of thought. Instant answers read as a lookup table, which is
    // exactly what a bad version of this would be.
    await new Promise((r) => setTimeout(r, 260))
    set({ thinking: false })
    live.rover.thinking = 0

    get().say(reply.text, { who: 'merv', tone: reply.tone, source: reply.source })
    awardLesson(reply.lesson)
    set({ prompts: suggestions(d) })
    void speakOut(reply.text, set, get)
  },

  /**
   * Hold-to-talk pressed.
   *
   * Agent tier is already open-mic, so this only has work to do on the two
   * lower tiers. On 'grounded' it opens a Deepgram transcription socket; on
   * 'local' it uses the browser's own recognition engine if there is one.
   */
  startTalking: async () => {
    if (get().listening || get().tier === 'agent') return
    const tier = get().tier

    if (tier === 'grounded' && cred) {
      try {
        mic = mic ?? await openMic()
        stt = transcribe(cred, cfg, mic.rate, {
          onOpen: () => set({ listening: true, error: null }),
          onInterim: (t) => set({ interim: t }),
          onFinal: (t) => { set({ interim: '' }); void get().ask(t) },
          onError: () => set({ error: 'Speech-to-text link failed. Type instead.' }),
          onClose: () => set({ listening: false }),
        })
        mic.onPcm((pcm, peak) => {
          stt?.send(pcm)
          set({ micLevel: peak })
          live.rover.listening = 1
        })
        mic.mute(false)
        set({ listening: true })
        return
      } catch (err) {
        console.warn('[MERV] microphone unavailable:', err)
        set({ error: 'Microphone refused. Type your question instead.' })
      }
    }

    const Recog = browserRecognition()
    if (!Recog) {
      set({ error: 'No speech input available in this browser. Type instead.' })
      return
    }
    try {
      const r = new Recog()
      r.lang = 'en-US'
      r.continuous = false
      r.interimResults = true
      r.onresult = (e) => {
        const res = e.results[e.results.length - 1]
        const text = res[0]?.transcript ?? ''
        if (res.isFinal) { set({ interim: '' }); void get().ask(text) }
        else set({ interim: text })
      }
      r.onerror = () => set({ listening: false, error: 'Speech input failed. Type instead.' })
      r.onend = () => { set({ listening: false }); live.rover.listening = 0 }
      r.start()
      recog = r
      set({ listening: true, error: null })
      live.rover.listening = 1
    } catch {
      set({ error: 'Speech input unavailable. Type instead.' })
    }
  },

  stopTalking: () => {
    if (get().tier === 'agent') return
    try { stt?.finish() } catch { /* ignore */ }
    try { recog?.stop() } catch { /* ignore */ }
    recog = null
    mic?.mute(true)
    set({ listening: false, micLevel: 0 })
    live.rover.listening = 0
  },

  stopSpeaking: () => {
    localStop?.()
    localStop = null
    player?.stop()
    set({ speaking: false })
    live.rover.talking = 0
  },

  setMuted: (muted) => {
    if (muted) get().stopSpeaking()
    set({ muted })
  },
  setAdvise: (advise) => set({ advise }),
  markRead: () => set({ unread: 0 }),

  /**
   * Called from the simulation loop.
   *
   * Rebuilds the telemetry snapshot a few times a second, decides whether MERV
   * has anything to volunteer, and keeps the hosted model's prompt current.
   */
  tick: (dtRealSec) => {
    const s = get()
    if (!s.booted) return

    sinceSnapshot += dtRealSec
    sinceAdvisory += dtRealSec
    sincePromptPush += dtRealSec

    if (sinceSnapshot >= SNAPSHOT_EVERY_S) {
      sinceSnapshot = 0
      tel = snapshot(useStore.getState())
    }
    const d = telemetry()

    // Keep the hosted model's view of the mission current. Cheap, and the
    // difference between a companion and a chatbot.
    if (s.tier === 'agent' && agent?.ready && sincePromptPush >= PROMPT_EVERY_S) {
      sincePromptPush = 0
      agent.updatePrompt(buildPrompt(d))
    }

    if (!s.advise || s.speaking || s.thinking || s.listening) return
    if (sinceAdvisory < ADVISORY_GAP_S) return

    const candidates = advisories(d).filter((a) => !s.said.includes(a.id))
    if (!candidates.length) return
    const top = candidates.reduce<Advisory>((a, b) => (b.priority > a.priority ? b : a), candidates[0])

    sinceAdvisory = 0
    set({ said: [...s.said, top.id], prompts: suggestions(d) })
    live.rover.mastIntent = top.look ?? 'jack'
    get().say(top.text, { who: 'merv', tone: top.tone, volunteered: true })
    awardLesson(top.lesson)

    // Mirror the serious ones into the mission log, so the debrief can show
    // that the warning was given and when.
    if (top.priority >= 70) {
      useStore.getState().pushLog(
        top.tone === 'danger' ? 'danger' : 'warning',
        `MERV: ${top.text.split('.')[0]}.`,
      )
    }

    if (s.tier === 'agent' && agent?.ready) agent.inject(top.text, 'interrupt')
    else void speakOut(top.text, set, get)
  },
}))

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

type Set = (p: Partial<MervState>) => void
type Get = () => MervState & MervActions

function ensurePlayer(): PcmPlayer {
  if (!player) player = new PcmPlayer()
  return player
}

function describe(tier: VoiceTier, c: Credential | null): string {
  switch (tier) {
    case 'agent':
      return `Deepgram Voice Agent — speech-to-text ${cfg.listenModel}, ${cfg.thinkProvider}/${cfg.thinkModel} for language, ${cfg.voice} for speech. Credential: ${c?.kind === 'token' ? 'short-lived token' : 'bundled key (development only)'}. Answers come from a hosted model grounded in this simulation's telemetry.`
    case 'grounded':
      return `Deepgram speech in and out (${cfg.listenModel} / ${cfg.voice}); every answer still comes from this project's own sourced knowledge base and live telemetry. Credential: ${c?.kind === 'token' ? 'short-lived token' : 'bundled key (development only)'}.`
    case 'local':
    default:
      return 'Offline tier: answers from this project\'s own sourced knowledge base and live telemetry, spoken by the browser\'s built-in speech engine. No external service, no key, nothing leaves this machine.'
  }
}

/** Drop to the lowest tier and say so, without breaking anything. */
function fallBack(set: Set, why: string): void {
  console.warn('[MERV] falling back to the local tier:', why)
  try { agent?.close() } catch { /* ignore */ }
  agent = null
  set({
    tier: 'local',
    link: 'error',
    error: `${why}. MERV is still here — answering from the offline knowledge base.`,
    diagnostic: describe('local', null),
    speaking: false,
    thinking: false,
  })
  live.rover.talking = 0
  live.rover.thinking = 0
}

/** Speak one line on whichever tier is running. Never throws. */
async function speakOut(text: string, set: Set, get: Get): Promise<void> {
  const s = get()
  if (s.muted || !useSettings.getState().audio) return

  if (s.tier === 'grounded' && cred) {
    try {
      set({ speaking: true })
      live.rover.talking = 1
      const pcm = await speakDeepgram(text, cred, cfg)
      ensurePlayer().push(pcm)
      // Release the talking flag when the queued audio has actually played.
      const ms = (pcm.length / 24000) * 1000 + 120
      window.setTimeout(() => {
        set({ speaking: false })
        live.rover.talking = 0
      }, ms)
      return
    } catch (err) {
      console.warn('[MERV] Deepgram speech failed, using the local engine:', err)
      forgetCredential()
    }
  }

  localStop?.()
  localStop = speakLocally(text, {
    onStart: () => { set({ speaking: true }); live.rover.talking = 1 },
    onEnd: () => { set({ speaking: false }); live.rover.talking = 0; localStop = null },
  })
}

/** Talking to MERV earns survival-guide entries, the same as doing the work. */
function awardLesson(id?: string): void {
  if (!id) return
  try { useStore.getState().awardLesson(id) } catch { /* mission not running */ }
}

/**
 * Answer a function call from the hosted model.
 *
 * Every one of these resolves through the same `brain.ts` code the offline
 * tier uses, so the two tiers cannot give contradictory advice about whether
 * it is safe to keep walking.
 */
function callFunction(name: string, args: Record<string, unknown>): unknown {
  const d = snapshot(useStore.getState())
  switch (name) {
    case 'get_mission_state':
      return d
    case 'assess_return': {
      const r = respond('should I turn back', d)
      return {
        verdict: r.text,
        walkHomeMinutes: Number(d.walkHomeMin.toFixed(1)),
        marginMinutes: Number(d.marginMin.toFixed(1)),
        marginAboveReserveMinutes: Number(d.reserveMarginMin.toFixed(1)),
        limitingConsumable: d.limitingLabel,
        status: d.retStatus,
        shelterAdvised: d.advisesShelter,
        abortAdvised: d.advisesAbort,
      }
    }
    case 'get_weather_assessment':
      return {
        kind: d.weatherKind,
        phase: d.weatherPhase,
        headline: d.weatherHeadline,
        opticalDepth: Number(d.tau.toFixed(2)),
        visibilityM: Math.round(d.visibilityM),
        sunlightReachingGroundPct: Math.round(d.transmission * 100),
        frontBearingDeg: Math.round(d.stormFromDeg),
        minutesToNextPhase: Math.round(d.minutesToNextPhase),
        shelterAdvised: d.advisesShelter,
        abortAdvised: d.advisesAbort,
        nearestShelter: d.shelterName,
        nearestShelterDistanceM: Math.round(d.shelterDistM),
      }
    case 'get_next_objective':
      return {
        primaryComplete: d.objectivesDone,
        primaryTotal: d.objectivesTotal,
        nextObjective: d.nextObjective,
        nextAction: d.nextObjectiveStep,
        criticalObjectiveStatus: d.criticalStatus,
        atStation: d.nearStationName,
        stationNextStep: d.stationNext,
      }
    case 'lookup_mars_fact': {
      const q = String(args.question ?? '')
      const t = findTopic(q)
      if (!t) {
        return {
          found: false,
          instruction:
            'This project has no sourced entry for that. Tell Jack you do not have a sourced answer rather than recalling one, and offer a topic you do have.',
        }
      }
      awardLesson(t.lesson)
      return { found: true, answer: t.answer, source: t.source }
    }
    default:
      return { error: `unknown function ${name}` }
  }
}

/**
 * Browser automation can inspect the transcript, the tier and the advisory
 * ledger. Opt-in through the same flag the mission store uses, so an ordinary
 * session publishes nothing.
 */
installDebugGlobals(
  import.meta.env,
  window as unknown as DebugGlobalTarget,
  useStore,
  live,
  useMerv,
)
