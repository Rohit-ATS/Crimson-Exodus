/**
 * StatusBar.tsx — The only numbers that stay on screen.
 *
 * Everything else moved into windows the player opens when they want it. This
 * cannot, because a survival simulation where you have to open a panel to
 * find out that you are running out of oxygen is not teaching anybody
 * anything.
 *
 * So the strip carries exactly what kills you, in the order it kills you:
 * the clock you are spending, the consumable that will run out first, the
 * margin over the walk home, and how far out you are. Four numbers, one line,
 * and a colour that changes before the numbers do.
 */

import { useStore } from '../../state/store'
import { useWindows } from './windows'
import { fmtMin, returnTone } from './panels'
import { formatHours } from '../../sim/orbits'

const TONE_COLOR: Record<string, string> = {
  nominal: 'var(--lime)',
  caution: 'var(--amber)',
  warning: '#ff8a3d',
  critical: 'var(--red)',
}

function Cell({
  label, value, color, title, onClick,
}: {
  label: string
  value: string
  color?: string
  title?: string
  onClick?: () => void
}) {
  return (
    <button
      className="stack"
      title={title}
      onClick={onClick}
      style={{
        background: 'none',
        border: 0,
        padding: '0 10px',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        pointerEvents: onClick ? 'auto' : 'none',
        fontFamily: 'inherit',
      }}
    >
      <span className="label" style={{ fontSize: 8.5 }}>{label}</span>
      <span className="mono" style={{ fontSize: 15, lineHeight: 1.1, color: color ?? 'var(--text)' }}>
        {value}
      </span>
    </button>
  )
}

export default function StatusBar() {
  const s = useStore()
  const show = useWindows((st) => st.show)
  const tone = returnTone(s.ret.status)
  const color = TONE_COLOR[tone]
  const limitingPct = Math.round(s.frac.limitingFraction * 100)

  return (
    <div
      className="row clipped"
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        alignItems: 'stretch',
        background: 'rgba(7,11,18,0.86)',
        border: `1px solid ${tone === 'nominal' ? 'var(--line)' : color}`,
        backdropFilter: 'blur(7px)',
        padding: '5px 4px',
        pointerEvents: 'auto',
        maxWidth: 'calc(100vw - 24px)',
        overflowX: 'auto',
      }}
    >
      <Cell
        label="EVA"
        value={fmtMin(s.time.evaSec / 60)}
        color="var(--amber)"
        title="Elapsed EVA time. Open the clocks window for local solar time and the season."
        onClick={() => show('clocks')}
      />
      <Divider />
      <Cell
        label="LTST"
        value={formatHours(s.clock.ltstHours)}
        title="Local true solar time at Jezero, computed for right now."
        onClick={() => show('clocks')}
      />
      <Divider />
      <Cell
        label={`${s.frac.limiting} (limiting)`}
        value={`${limitingPct}%`}
        color={limitingPct < 25 ? 'var(--red)' : limitingPct < 50 ? 'var(--amber)' : undefined}
        title="The consumable that runs out first. It is not always the one with the smallest bar."
        onClick={() => show('life')}
      />
      <Divider />
      <Cell
        label="margin"
        value={fmtMin(s.ret.marginMinutes)}
        color={color}
        title="Minutes of consumables above the walk home. This is the number that decides whether the EVA ends well."
        onClick={() => show('return')}
      />
      <Divider />
      <Cell
        label="range"
        value={`${Math.hypot(s.jackX, s.jackZ).toFixed(0)} m`}
        title="Straight-line distance from the lander. The walk back is longer."
        onClick={() => show('map')}
      />
      <Divider />
      <Cell
        label={s.activity}
        value={`${s.speedMs.toFixed(2)} m/s`}
        title="What Jack is doing, and how fast. Walking speed falls with slope and roughness."
      />
      <Divider />
      <div className="row gap4" style={{ alignItems: 'center', padding: '0 6px' }}>
        {[1, 10, 30].map((t) => (
          <button
            key={t}
            className={`btn sm ${s.timeScale === t ? 'on' : 'ghost'}`}
            style={{ padding: '2px 6px', fontSize: 9 }}
            onClick={() => s.setTimeScale(t)}
            title="Time compression"
          >
            {t}&times;
          </button>
        ))}
        <button
          className={`btn sm ${s.paused ? 'on' : 'ghost'}`}
          style={{ padding: '2px 7px', fontSize: 9 }}
          onClick={s.togglePause}
        >
          {s.paused ? 'RESUME' : 'PAUSE'}
        </button>
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ width: 1, background: 'var(--line-soft)', margin: '2px 0' }} />
}
