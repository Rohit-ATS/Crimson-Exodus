/**
 * HudDock.tsx — One row of buttons, and the screen stays clear.
 *
 * Two kinds of thing live here and they behave differently, which the styling
 * has to make obvious:
 *
 *  - WINDOWS stay open while you keep playing, and can be dragged and stacked.
 *    Their buttons latch on.
 *  - PANELS are full-screen modals that take the keyboard — the science
 *    panel, the map, the comms feed. Their buttons do not latch, because the
 *    panel is gone the moment you press Escape.
 *
 * A window whose contents are currently reporting a problem pulses, so the
 * player is pointed at the number that matters without that number having to
 * sit on screen all mission.
 */

import { useStore } from '../../state/store'
import { useWindows, WINDOWS, type WindowId } from './windows'

interface DockButton {
  label: string
  hint?: string
  onClick: () => void
  active?: boolean
  /** Draw attention: this window has something wrong in it. */
  alert?: boolean
}

/**
 * One dock button.
 *
 * Declared at module scope. Defining it inside `HudDock` gave it a new
 * identity on every render, and React treats a new identity as a different
 * component — so every button in the dock was unmounted and rebuilt twenty
 * times a second. That is not only wasteful: a button that is detached and
 * replaced between the press and the release can swallow the click, which is
 * a HUD that intermittently ignores you.
 */
function Btn({ b }: { b: DockButton }) {
  return (
    <button
      className={`btn sm ${b.active ? 'on' : 'ghost'}`}
      onClick={b.onClick}
      style={{
        padding: '4px 9px',
        fontSize: 9,
        borderColor: b.alert && !b.active ? 'var(--amber)' : undefined,
        color: b.alert && !b.active ? 'var(--amber)' : undefined,
        animation: b.alert && !b.active ? 'pulse 1.6s ease-in-out infinite' : undefined,
      }}
    >
      {b.label}
      {b.hint && <span className="faint" style={{ marginLeft: 5 }}>[{b.hint}]</span>}
    </button>
  )
}

export default function HudDock() {
  const s = useStore()
  const open = useWindows((w) => w.open)
  const toggle = useWindows((w) => w.toggle)
  const showAll = useWindows((w) => w.showAll)
  const hideAll = useWindows((w) => w.hideAll)

  /** Which windows are currently worth looking at. */
  const alerts: Partial<Record<WindowId, boolean>> = {
    return: s.ret.status === 'warning' || s.ret.status === 'critical' || !!s.advice,
    life: s.frac.limitingFraction < 0.3,
    env: !!s.radiation.sepPhase || s.weather.kind !== 'clear',
  }

  const windowButtons: DockButton[] = WINDOWS.map((w) => ({
    label: w.label,
    onClick: () => toggle(w.id),
    active: open.includes(w.id),
    alert: alerts[w.id],
  }))

  const panelButtons: DockButton[] = [
    { label: 'OBJECTIVES', hint: 'O', onClick: () => s.setUi('objectives') },
    { label: 'MERV', hint: 'J', onClick: () => s.setUi('rover') },
    { label: 'COMMS', hint: 'T', onClick: () => s.setUi('comms') },
    { label: 'BACKPACK', hint: 'B', onClick: () => s.setUi('backpack') },
    { label: 'NASA SITE', hint: 'N', onClick: () => s.setUi('realsite') },
    { label: 'DATA', hint: 'K', onClick: () => s.setUi('data') },
    { label: 'SETTINGS', hint: 'F1', onClick: () => s.setUi('settings') },
  ]

  const anyOpen = open.length > 0

  return (
    <div
      className="row center gap6 wrap"
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 8,
        pointerEvents: 'auto',
      }}
    >
      {windowButtons.map((b) => <Btn key={b.label} b={b} />)}
      <div style={{ width: 1, height: 18, background: 'var(--line-soft)', margin: '0 3px' }} />
      {panelButtons.map((b) => <Btn key={b.label} b={b} />)}
      <button
        className="btn ghost sm"
        style={{ padding: '4px 9px', fontSize: 9 }}
        onClick={() => (anyOpen ? hideAll() : showAll())}
        title={anyOpen
          ? 'Close every window and leave nothing but the planet'
          : 'Open every window — the dense layout, for when you want all of it at once'}
      >
        {anyOpen ? 'CLEAR SCREEN' : 'SHOW ALL'}
      </button>
    </div>
  )
}
