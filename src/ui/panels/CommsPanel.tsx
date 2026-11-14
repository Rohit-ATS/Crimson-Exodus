import { Chip, Modal, Tag } from '../components/kit'
import { useStore } from '../../state/store'
import { OUTGOING, formatDelay } from '../../sim/comms'

/**
 * The Earth comms feed.
 *
 * Every message carries the real one-way light time computed from real planetary
 * positions. Messages in flight show a live countdown. Replies state, in their
 * own text, how stale they are by the time they arrive. The panel exists to make
 * one thing unmissable: on Mars, mission control is a correspondent, not a
 * controller.
 */
export default function CommsPanel() {
  const s = useStore()
  const now = s.time.evaSec

  const feed = [...s.messages].sort((a, b) => {
    const ta = a.dir === 'downlink' ? a.sentEvaSec : a.arriveEvaSec
    const tb = b.dir === 'downlink' ? b.sentEvaSec : b.arriveEvaSec
    return tb - ta
  })

  const fmt = (sec: number) => `T+${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

  return (
    <Modal title="Deep space link — Mars to Earth" onClose={() => s.setUi(null)} width={920}>
      {/* Link status */}
      <div
        className="row gap16 wrap between"
        style={{ padding: 11, border: '1px solid var(--line)', background: 'rgba(79,232,255,0.05)', marginBottom: 12 }}
      >
        <Stat k="Earth–Mars range" v={`${(s.link.distanceKm / 1e6).toFixed(2)} M km`} sub={`${s.link.distanceAu.toFixed(4)} AU`} />
        <Stat k="One-way light time" v={formatDelay(s.link.owltSec)} sub="at c, in vacuum" />
        <Stat k="Round trip" v={formatDelay(s.link.rttSec)} sub="question to answer" />
        <Stat k="Sun–Earth–Mars" v={`${s.link.sunEarthMarsDeg.toFixed(1)}°`} sub={s.link.nearConjunction ? 'CONJUNCTION — real missions stop commanding' : 'geometry clear'} />
        <div><Tag kind="model" /></div>
      </div>

      {/* Compose */}
      <div className="stack gap6" style={{ marginBottom: 12 }}>
        <div className="label">Downlink something</div>
        <div className="row gap6 wrap">
          {OUTGOING.map((t) => (
            <button key={t.id} className="btn sm" onClick={() => s.sendMessage(t.id)}>
              {t.subject}
            </button>
          ))}
        </div>
        <div className="src">
          Earth receives this {formatDelay(s.link.owltSec)} from now. If they answer immediately,
          the reply lands at EVA +{((now + s.link.rttSec) / 60).toFixed(0)} min. They will not answer
          immediately.
        </div>
      </div>

      {/* Feed */}
      <div className="stack gap8 scroll" style={{ maxHeight: '46vh' }}>
        {feed.length === 0 && (
          <div className="src">Nothing transmitted yet. The link is open and the delay is unavoidable.</div>
        )}
        {feed.map((m) => {
          const inFlight = !m.delivered
          const eta = Math.max(0, m.arriveEvaSec - now)
          const isDown = m.dir === 'downlink'
          const color = isDown ? 'var(--cyan)' : m.kind === 'advisory' ? 'var(--amber)' : 'var(--lime)'
          return (
            <div
              key={m.id}
              style={{
                border: `1px solid ${inFlight ? 'rgba(255,178,74,0.4)' : 'var(--line-soft)'}`,
                borderLeft: `3px solid ${color}`,
                background: inFlight ? 'rgba(255,178,74,0.05)' : 'rgba(255,255,255,0.022)',
                padding: '9px 11px',
                opacity: inFlight && !isDown ? 0.78 : 1,
              }}
            >
              <div className="row between gap8 wrap" style={{ marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 12, color }}>
                  {isDown ? '↑ MARS → EARTH' : '↓ EARTH → MARS'} &nbsp;&middot;&nbsp; {m.subject}
                </span>
                {inFlight ? (
                  <Chip tone="caution">
                    in flight &middot; arrives in {formatDelay(eta)}
                  </Chip>
                ) : (
                  <Chip tone={m.kind === 'advisory' ? 'warning' : 'nominal'}>
                    {isDown ? `received on Earth ${fmt(m.arriveEvaSec)}` : `received ${fmt(m.arriveEvaSec)}`}
                  </Chip>
                )}
              </div>

              {inFlight && (
                <div className="meter-track" style={{ height: 4, marginBottom: 6 }}>
                  <div
                    className="meter-fill"
                    style={{
                      width: `${Math.max(0, Math.min(1, 1 - eta / Math.max(1, m.arriveEvaSec - m.sentEvaSec))) * 100}%`,
                      background: 'var(--amber)',
                    }}
                  />
                </div>
              )}

              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                {inFlight && !isDown
                  ? <span className="faint">Composed on Earth, still crossing {((s.link.distanceKm) / 1e6).toFixed(1)} million km of vacuum. You cannot read it yet, and you should not wait for it.</span>
                  : m.body}
              </div>

              <div className="src" style={{ marginTop: 4 }}>
                sent {fmt(m.sentEvaSec)} &middot; light time {formatDelay(m.owltSec)}
              </div>
            </div>
          )
        })}
      </div>

      <div className="note info" style={{ marginTop: 12, fontSize: 12.5 }}>
        What is modelled: straight-line light time from real planetary positions, and a
        conjunction flag. What is not: Deep Space Network antenna scheduling, data rates,
        relay orbiter passes, or coding overhead. A real link budget is a much harder problem
        than a distance divided by the speed of light.
      </div>
    </Modal>
  )
}

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="stack">
      <span className="label">{k}</span>
      <span className="mono" style={{ fontSize: 15 }}>{v}</span>
      <span className="src">{sub}</span>
    </div>
  )
}
