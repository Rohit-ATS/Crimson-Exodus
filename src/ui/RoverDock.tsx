/**
 * RoverDock.tsx — MERV on the HUD.
 *
 * The comms panel is where you go to have a conversation. This is what tells
 * you there is one to have.
 *
 * It stays out of the way: a one-line status strip with the push-to-talk hint,
 * and above it the most recent thing MERV said — which fades out after a few
 * seconds unless it was a warning, because a hazard call should stay on screen
 * until it is read. Nothing here is permanent furniture; the surface already
 * has enough panels competing for the middle of the screen.
 */

import { useEffect, useRef, useState } from 'react'
import { useMerv } from '../state/merv'
import { useStore } from '../state/store'

/** How long a routine line stays up, ms. Warnings stay until superseded. */
const DWELL_MS = 13_000

const TONE: Record<string, { line: string; text: string }> = {
  info: { line: 'var(--cyan)', text: '#cfeaf5' },
  science: { line: 'var(--lime)', text: '#d7ffe8' },
  warning: { line: 'var(--amber)', text: '#ffe6c4' },
  danger: { line: 'var(--red)', text: '#ffd4d4' },
}

export default function RoverDock() {
  const lines = useMerv((s) => s.lines)
  const listening = useMerv((s) => s.listening)
  const speaking = useMerv((s) => s.speaking)
  const thinking = useMerv((s) => s.thinking)
  const interim = useMerv((s) => s.interim)
  const unread = useMerv((s) => s.unread)
  const setUi = useStore((s) => s.setUi)

  // Only things MERV actually said. System notes belong in the panel.
  const last = [...lines].reverse().find((l) => l.who === 'merv')
  const [visibleId, setVisibleId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!last) return
    setVisibleId(last.id)
    if (timer.current) clearTimeout(timer.current)
    // A warning or a danger call is not something to blink past.
    if (last.tone === 'warning' || last.tone === 'danger') return
    timer.current = setTimeout(() => setVisibleId(null), DWELL_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [last?.id, last?.tone])

  const showCard = !!last && visibleId === last.id
  const tone = TONE[last?.tone ?? 'info'] ?? TONE.info

  const state = listening ? 'LISTENING' : thinking ? 'COMPOSING' : speaking ? 'TRANSMITTING' : 'STANDING BY'
  const dot = listening ? 'var(--lime)' : thinking ? 'var(--amber)' : speaking ? 'var(--cyan)' : 'var(--faint)'

  return (
    <div className="stack gap6" style={{ marginBottom: 8, pointerEvents: 'auto' }}>
      {showCard && (
        <div
          key={last.id}
          className="clipped"
          style={{
            background: 'rgba(5,8,13,0.86)',
            border: '1px solid var(--line-soft)',
            borderLeft: `3px solid ${tone.line}`,
            padding: '8px 11px',
            textAlign: 'left',
            animation: 'fadeUp 0.22s ease-out',
          }}
        >
          <div className="row between gap8" style={{ marginBottom: 3 }}>
            <span className="display" style={{ fontSize: 9.5, letterSpacing: '0.18em', color: tone.line }}>
              MERV{last.volunteered ? ' · UNPROMPTED' : ''}
            </span>
            {last.source && <span className="src" style={{ fontSize: 9.5 }}>{last.source}</span>}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: tone.text }}>{last.text}</div>
        </div>
      )}

      {interim && (
        <div
          style={{
            background: 'rgba(5,8,13,0.8)',
            borderRight: '3px solid var(--faint)',
            padding: '5px 10px',
            fontSize: 12,
            fontStyle: 'italic',
            color: 'var(--muted)',
            textAlign: 'right',
          }}
        >
          {interim}…
        </div>
      )}

      <button
        onClick={() => setUi('rover')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          background: 'rgba(5,8,13,0.86)',
          border: `1px solid ${unread > 0 ? 'var(--cyan)' : 'var(--line-soft)'}`,
          color: 'var(--text)',
          font: '11px var(--mono)',
          letterSpacing: '0.1em',
          padding: '5px 11px',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 7, height: 7, borderRadius: '50%', background: dot,
            boxShadow: `0 0 7px ${dot}`,
            animation: listening || speaking || thinking ? 'pulse 0.9s ease-in-out infinite' : undefined,
          }}
        />
        <span style={{ color: 'var(--cyan)' }}>MERV</span>
        <span className="dim">{state}</span>
        <span className="faint" style={{ fontSize: 10 }}>HOLD [X] TO TALK &middot; [J] TRANSCRIPT</span>
        {unread > 0 && <span className="chip info" style={{ padding: '0 5px' }}>{unread}</span>}
      </button>
    </div>
  )
}
