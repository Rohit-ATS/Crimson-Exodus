/**
 * settings.ts — Player preferences, kept out of mission state.
 *
 * These are not part of the mission and must survive a restart, so they live
 * in their own tiny store backed by localStorage rather than in the mission
 * state machine, which is deliberately wiped every run.
 *
 * The defaults matter more than the options. A judge at a Space Apps table
 * opens this on an unknown laptop, gives it ninety seconds, and never touches
 * a settings panel. So the defaults are: quality on AUTO (measure the machine
 * and adapt), hints ON (the first run explains itself), audio OFF (nobody wants
 * a laptop to start making noise in a crowded room), and motion full (reduced
 * motion is opt-in, but honoured from the OS if the OS asks for it).
 */

import { create } from 'zustand'

export type QualityMode = 'auto' | 'high' | 'balanced' | 'performance'

/** Resolved render tier. 2 is everything on, 0 is the lowest. */
export type RenderTier = 0 | 1 | 2

export interface QualityTier {
  tier: RenderTier
  label: string
  /** Device pixel ratio ceiling. */
  dprMax: number
  /** Directional shadow map edge, px. 0 disables shadows entirely. */
  shadowMap: number
  /** Whether the boot-scale grit layer is drawn. */
  grit: boolean
  /** Radius multiplier for the camera-following clast layers. */
  clastScale: number
}

export const TIERS: Record<RenderTier, QualityTier> = {
  2: { tier: 2, label: 'High', dprMax: 2, shadowMap: 4096, grit: true, clastScale: 1 },
  1: { tier: 1, label: 'Balanced', dprMax: 1.5, shadowMap: 2048, grit: true, clastScale: 0.8 },
  0: { tier: 0, label: 'Performance', dprMax: 1, shadowMap: 1024, grit: false, clastScale: 0.6 },
}

export interface Settings {
  quality: QualityMode
  /** Set by the adaptive controller when quality is 'auto'. */
  autoTier: RenderTier
  /** Measured median frame time, ms. Shown in the settings panel. */
  frameMs: number
  reducedMotion: boolean
  /** HUD scale multiplier, for projectors and small laptop screens. */
  hudScale: number
  audio: boolean
  /** First-run guidance. Off once the player has been through it. */
  hints: boolean
  /** True while the player has never completed a run. */
  firstRun: boolean
  /** Guidance cards already seen or satisfied. Persisted, so a returning
   *  player is never taught the same thing twice. */
  seenHints: string[]
}

export interface SettingsActions {
  setQuality: (q: QualityMode) => void
  setAutoTier: (t: RenderTier) => void
  setFrameMs: (ms: number) => void
  setReducedMotion: (v: boolean) => void
  setHudScale: (v: number) => void
  setAudio: (v: boolean) => void
  setHints: (v: boolean) => void
  markRunComplete: () => void
  markHintSeen: (ids: string[]) => void
  resetHints: () => void
  /** Resolved tier, honouring a manual override. */
  tier: () => QualityTier
}

const KEY = 'jack-marswalk:settings:v1'

function load(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as Partial<Settings>
    return o && typeof o === 'object' ? o : {}
  } catch {
    // Private browsing, blocked site data, or a corrupted value. The game has
    // to work without persistence, so a failure here is simply "no settings".
    return {}
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      quality: s.quality,
      reducedMotion: s.reducedMotion,
      hudScale: s.hudScale,
      audio: s.audio,
      hints: s.hints,
      firstRun: s.firstRun,
      seenHints: s.seenHints,
    }))
  } catch { /* nothing we can do, and nothing that should break the game */ }
}

/** Honour the OS accessibility preference as the initial default. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

const saved = load()

export const useSettings = create<Settings & SettingsActions>((set, get) => ({
  quality: saved.quality ?? 'auto',
  // Start at balanced while the adaptive controller measures. Starting at the
  // highest tier makes the first seconds stutter on integrated GPUs, before
  // the controller has enough samples to react.
  autoTier: 1,
  frameMs: 0,
  reducedMotion: saved.reducedMotion ?? prefersReducedMotion(),
  hudScale: saved.hudScale ?? 1,
  audio: saved.audio ?? false,
  hints: saved.hints ?? true,
  firstRun: saved.firstRun ?? true,
  seenHints: Array.isArray(saved.seenHints) ? saved.seenHints : [],

  setQuality: (quality) => { set({ quality }); save(get()) },
  setAutoTier: (autoTier) => set({ autoTier }),
  setFrameMs: (frameMs) => set({ frameMs }),
  setReducedMotion: (reducedMotion) => { set({ reducedMotion }); save(get()) },
  setHudScale: (hudScale) => { set({ hudScale }); save(get()) },
  setAudio: (audio) => { set({ audio }); save(get()) },
  setHints: (hints) => { set({ hints }); save(get()) },
  markRunComplete: () => { set({ firstRun: false }); save(get()) },
  markHintSeen: (ids) => {
    const cur = get().seenHints
    const add = ids.filter((i) => !cur.includes(i))
    if (!add.length) return
    set({ seenHints: [...cur, ...add] })
    save(get())
  },
  resetHints: () => { set({ seenHints: [], hints: true }); save(get()) },

  tier: () => {
    const s = get()
    if (s.quality === 'auto') return TIERS[s.autoTier]
    if (s.quality === 'high') return TIERS[2]
    if (s.quality === 'balanced') return TIERS[1]
    return TIERS[0]
  },
}))

/**
 * Mutable mirror of the resolved tier.
 *
 * The 3D scene reads this every frame from inside `useFrame`, where going
 * through a React subscription would mean re-rendering the whole scene graph
 * to change a number. The store remains the source of truth; this is kept in
 * step by the adaptive controller.
 */
export const renderTier: { current: QualityTier } = { current: TIERS[1] }
