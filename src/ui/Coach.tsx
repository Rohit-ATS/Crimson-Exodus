/**
 * Coach.tsx — One card, in the place the player is already looking.
 *
 * It never blocks input, never covers the control it is talking about, and
 * retires itself the instant the player does the thing. Two placements:
 * inside the HUD's bottom-centre column on the surface, where the eye already
 * is, and pinned under the header on the planning and briefing screens.
 *
 * Both the dismiss and the permanent off switch are on the card itself,
 * because guidance you cannot turn off is not guidance.
 */

import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { useSettings } from '../state/settings'
import { activeHint, shouldRetire, type HintPlacement } from '../mission/coaching'

const TONE = {
  info: { line: 'var(--cyan)', tint: 'rgba(79,232,255,0.07)', label: 'GUIDE' },
  action: { line: 'var(--amber)', tint: 'rgba(255,178,74,0.08)', label: 'DO THIS' },
  warning: { line: 'var(--red)', tint: 'rgba(255,77,77,0.08)', label: 'HEADS UP' },
} as const

export default function Coach({ placement }: { placement: HintPlacement }) {
  const s = useStore()
  const hints = useSettings((x) => x.hints)
  const seenList = useSettings((x) => x.seenHints)
  const markSeen = useSettings((x) => x.markHintSeen)
  const setHints = useSettings((x) => x.setHints)

  const seen = useRef<Set<string>>(new Set())
  seen.current = new Set(seenList)

  // The last card actually put in front of the player.
  const shown = useRef<string | null>(null)
  const hint = hints ? activeHint(s, seen.current) : null

  // A card retires when the player does the thing it asked for. Only cards
  // that were actually shown can retire this way: a hint nobody has seen is
  // not "already satisfied", it is simply not relevant yet.
  useEffect(() => {
    const prev = shown.current
    if (prev && prev !== hint?.id && shouldRetire(prev, s)) markSeen([prev])
    if (hint) shown.current = hint.id
  })

  if (!hints || !hint) return null

  const tone = TONE[hint.tone ?? 'info']

  const card = (
    <div
      className="clipped"
      role="status"
      style={{
        background: 'rgba(5,8,13,0.9)',
        border: `1px solid ${tone.line}`,
        borderLeft: `3px solid ${tone.line}`,
        boxShadow: `0 0 22px ${tone.tint}`,
        padding: '8px 12px',
        textAlign: 'left',
        pointerEvents: 'auto',
        animation: 'fadeUp 0.2s ease-out',
      }}
    >
      <div className="row between gap8 wrap" style={{ alignItems: 'baseline' }}>
        <span className="row gap8" style={{ alignItems: 'baseline', minWidth: 0 }}>
          <span className="display" style={{ fontSize: 9.5, color: tone.line, letterSpacing: '0.2em' }}>
            {tone.label}
          </span>
          <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{hint.title}</span>
        </span>
        <span className="row gap6" style={{ alignItems: 'center', flex: '0 0 auto' }}>
          {hint.key && (
            <span
              className="mono"
              style={{
                fontSize: 11, color: tone.line, border: `1px solid ${tone.line}`,
                padding: '1px 8px', letterSpacing: '0.08em',
              }}
            >
              {hint.key}
            </span>
          )}
          <button
            className="btn ghost"
            style={{ padding: '2px 7px', fontSize: 9 }}
            onClick={() => markSeen([hint.id])}
          >
            GOT IT
          </button>
          <button
            className="btn ghost"
            style={{ padding: '2px 7px', fontSize: 9 }}
            title="Turn off all guidance. You can switch it back on in the settings panel."
            onClick={() => setHints(false)}
          >
            TURN OFF
          </button>
        </span>
      </div>
      <div style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5, color: 'var(--muted)' }}>
        {hint.body}
      </div>
    </div>
  )

  if (placement === 'surface') {
    // Rendered inside the HUD's bottom-centre column, so it stacks with the
    // objective strip and the log instead of floating over them.
    return <div style={{ marginBottom: 8 }}>{card}</div>
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        // Clear of the planner's committed-plan bar and the briefing footer.
        bottom: 74,
        width: 'min(92vw, 760px)',
        zIndex: 45,
        pointerEvents: 'none',
      }}
    >
      {card}
    </div>
  )
}
