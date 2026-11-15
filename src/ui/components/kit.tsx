import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'

export function Panel({
  title, right, children, style, className = '', pad = true, bracket = true,
}: {
  title?: string
  right?: ReactNode
  children: ReactNode
  style?: CSSProperties
  className?: string
  pad?: boolean
  bracket?: boolean
}) {
  return (
    <div className={`panel clipped ${bracket ? 'brackets' : ''} ${className}`} style={style}>
      {title && (
        <div className="panel-head">
          <h3>{title}</h3>
          {right}
        </div>
      )}
      <div className={pad ? 'panel-body' : ''} style={{ minHeight: 0 }}>{children}</div>
    </div>
  )
}

export function Readout({
  label, value, unit, tone, small,
}: { label: string; value: ReactNode; unit?: string; tone?: string; small?: boolean }) {
  return (
    <div className="readout">
      <span className="label">{label}</span>
      <span className={`v ${small ? 'sm' : ''}`} style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <span className="u" style={{ marginLeft: 4 }}>{unit}</span>}
      </span>
    </div>
  )
}

export function Meter({
  value, reserve, tone, height = 8,
}: { value: number; reserve?: number; tone?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value))
  const color = tone ?? (v > 0.5 ? 'var(--lime)' : v > 0.25 ? 'var(--amber)' : 'var(--red)')
  return (
    <div className="meter">
      <div className="meter-track" style={{ height }}>
        <div
          className="meter-fill"
          style={{
            width: `${v * 100}%`,
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
            boxShadow: `0 0 10px ${color}66`,
          }}
        />
        {reserve !== undefined && reserve > 0 && (
          <div className="meter-reserve" style={{ left: 0, width: `${Math.min(1, reserve) * 100}%` }} />
        )}
        <div className="meter-ticks" />
      </div>
    </div>
  )
}

export function Chip({ tone = 'info', children }: { tone?: string; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>
}

export function KV({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Modal({
  title, onClose, children, width = 820, footer,
}: { title: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  // Every modal says "Close [Esc]" on its header button, so every modal has to
  // honour Escape. The surface phase routes Escape through the game's own input
  // layer, but the title and debrief screens do not, and a dialog that lies
  // about its own keyboard shortcut is worse than one with no shortcut at all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="screen center"
      style={{
        background: 'rgba(2,4,8,0.78)',
        backdropFilter: 'blur(5px)',
        zIndex: 60,
        padding: 20,
        animation: 'fadeUp 0.16s ease-out',
      }}
      onClick={onClose}
    >
      <div
        className="panel clipped brackets stack"
        style={{ width: 'min(100%, ' + width + 'px)', maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>Close [Esc]</button>
        </div>
        <div className="panel-body scroll grow">{children}</div>
        {footer && (
          <div className="panel-head" style={{ borderBottom: 0, borderTop: '1px solid var(--line-soft)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function SourceLine({ children }: { children: ReactNode }) {
  return <div className="src" style={{ marginTop: 6, lineHeight: 1.5 }}>{children}</div>
}

/** A labelled provenance tag: REAL DATA / MODEL / SYNTHETIC / GAME MECHANIC. */
export function Tag({ kind }: { kind: 'real' | 'model' | 'synth' | 'game' }) {
  const text = {
    real: 'NASA observation',
    model: 'Model output',
    synth: 'Synthetic terrain',
    game: 'Game mechanic',
  }[kind]
  return <span className={`tag ${kind}`}>{text}</span>
}
