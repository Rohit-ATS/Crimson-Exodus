/**
 * windows.ts — Which HUD windows are open, and where.
 *
 * The surface used to carry six fixed panels at once: clocks and time
 * compression top-left, Earth link top-right, life support down the left
 * edge, environment and radiation down the right, the return estimate
 * bottom-left and the map bottom-right. Every number in them is worth
 * reading, and all of them at once left a letterbox of actual Mars in the
 * middle of the screen.
 *
 * So they are windows now: closed by default, opened from a dock, dragged
 * wherever the player wants them, and remembered between runs. What stays on
 * screen permanently is only what you cannot afford to miss — the clock, the
 * limiting consumable, the margin, and any active hazard.
 */

import { create } from 'zustand'

export type WindowId = 'clocks' | 'life' | 'env' | 'return' | 'earth' | 'map' | 'log'

export interface WindowSpec {
  id: WindowId
  /** Dock button label. */
  label: string
  /** Title bar text. */
  title: string
  /** Default size. Height is a maximum; windows shrink to their content. */
  width: number
  /** Where it opens if the player has never moved it, as a screen fraction. */
  anchor: { x: number; y: number }
}

export const WINDOWS: WindowSpec[] = [
  { id: 'life', label: 'LIFE SUPPORT', title: 'Life support', width: 268, anchor: { x: 0.012, y: 0.14 } },
  { id: 'return', label: 'RETURN', title: 'Return estimate', width: 320, anchor: { x: 0.012, y: 0.52 } },
  { id: 'env', label: 'ENVIRONMENT', title: 'Environment & radiation', width: 240, anchor: { x: 0.80, y: 0.14 } },
  { id: 'earth', label: 'EARTH LINK', title: 'Earth link', width: 232, anchor: { x: 0.80, y: 0.60 } },
  { id: 'map', label: 'MAP', title: 'Traverse', width: 228, anchor: { x: 0.78, y: 0.30 } },
  { id: 'clocks', label: 'CLOCKS', title: 'Mission clocks', width: 264, anchor: { x: 0.30, y: 0.12 } },
  { id: 'log', label: 'LOG', title: 'Mission log', width: 420, anchor: { x: 0.30, y: 0.50 } },
]

export interface Pos { x: number; y: number }

interface WindowState {
  open: WindowId[]
  /** Pixel positions, once the player has dragged something. */
  pos: Partial<Record<WindowId, Pos>>
  /** Raise order: the last id is drawn on top. */
  stack: WindowId[]
}

interface WindowActions {
  toggle: (id: WindowId) => void
  show: (id: WindowId) => void
  hide: (id: WindowId) => void
  raise: (id: WindowId) => void
  move: (id: WindowId, pos: Pos) => void
  showAll: () => void
  hideAll: () => void
  /** Forget dragged positions and go back to the default layout. */
  resetLayout: () => void
}

const KEY = 'jack-marswalk:hud-windows:v1'

function load(): Partial<WindowState> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as Partial<WindowState>
    return o && typeof o === 'object' ? o : {}
  } catch {
    // Private browsing or blocked site data. The HUD must still work.
    return {}
  }
}

function save(s: WindowState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ open: s.open, pos: s.pos }))
  } catch { /* nothing we can do, and nothing that should break the game */ }
}

const saved = load()
const valid = (ids: unknown): WindowId[] =>
  Array.isArray(ids) ? ids.filter((i): i is WindowId => WINDOWS.some((w) => w.id === i)) : []

export const useWindows = create<WindowState & WindowActions>((set, get) => ({
  // Closed by default. The point of the redesign is an empty screen.
  open: valid(saved.open),
  pos: (saved.pos ?? {}) as Partial<Record<WindowId, Pos>>,
  stack: valid(saved.open),

  toggle: (id) => {
    const s = get()
    if (s.open.includes(id)) s.hide(id)
    else s.show(id)
  },
  show: (id) => {
    const s = get()
    if (s.open.includes(id)) { s.raise(id); return }
    set({ open: [...s.open, id], stack: [...s.stack.filter((w) => w !== id), id] })
    save(get())
  },
  hide: (id) => {
    set((s) => ({ open: s.open.filter((w) => w !== id) }))
    save(get())
  },
  raise: (id) => set((s) => ({ stack: [...s.stack.filter((w) => w !== id), id] })),
  move: (id, p) => {
    set((s) => ({ pos: { ...s.pos, [id]: p } }))
    save(get())
  },
  showAll: () => {
    const all = WINDOWS.map((w) => w.id)
    set({ open: all, stack: all })
    save(get())
  },
  hideAll: () => {
    set({ open: [] })
    save(get())
  },
  resetLayout: () => {
    set({ pos: {} })
    save(get())
  },
}))

/**
 * Where a window should sit, in pixels.
 *
 * A dragged position is kept but clamped back on screen, because a window
 * parked off the edge on a 27-inch monitor is unreachable on a laptop.
 */
export function windowPosition(
  spec: WindowSpec,
  dragged: Pos | undefined,
  viewport: { w: number; h: number },
): Pos {
  const x = dragged ? dragged.x : spec.anchor.x * viewport.w
  const y = dragged ? dragged.y : spec.anchor.y * viewport.h
  return {
    x: Math.max(4, Math.min(viewport.w - 90, x)),
    y: Math.max(4, Math.min(viewport.h - 54, y)),
  }
}
