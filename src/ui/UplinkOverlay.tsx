/**
 * UplinkOverlay.tsx — Sending it home.
 *
 * Finishing an objective on Mars is only half of it. This shows the other
 * half: the packet being assembled, the relay orbiter acquired, the bar
 * filling while each product transfers in turn with its thumbnail appearing
 * as it completes, the orbiter storing and forwarding, and then the part
 * nobody can speed up — the flight time to Earth at the speed of light,
 * counted down live from the real planetary geometry.
 *
 * The transfer is animated faster than real. The real modelled transfer time
 * is printed next to it, along with how long the same packet would take on a
 * direct-to-Earth link, because the thousandfold difference between those two
 * numbers is the entire reason Mars missions fly relay orbiters.
 */

import { useEffect } from 'react'
import { useStore } from '../state/store'
import {
  STAGES, activeStage, dteSeconds, formatBytes, formatDuration, itemsSent,
} from '../sim/downlink'
import { Chip, Meter } from './components/kit'
import { GALLERY } from '../data/nasaGallery'

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** The relay geometry, drawn as a function of progress. */
function LinkDiagram({ p, station }: { p: number; station: string }) {
  const toOrbiter = clamp01((p - 0.18) / 0.62)
  const away = clamp01((p - 0.9) / 0.1)
  const orbAngle = -0.5 + p * 0.9
  const ox = 88 + Math.cos(orbAngle) * 58
  const oy = 96 - Math.sin(orbAngle) * 46
  return (
    <svg viewBox="0 0 176 176" style={{ width: '100%', aspectRatio: '1', display: 'block', background: 'radial-gradient(circle at 50% 75%, #141c24, #05080c 72%)' }}>
      <defs>
        <radialGradient id="marsBall" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0%" stopColor="#d08a52" />
          <stop offset="100%" stopColor="#5e3016" />
        </radialGradient>
      </defs>

      {/* Mars */}
      <circle cx={88} cy={148} r={54} fill="url(#marsBall)" />
      <ellipse cx={88} cy={148} rx={56} ry={56} fill="none" stroke="#c98a5a" strokeWidth={0.6} opacity={0.35} />

      {/* Jack on the surface */}
      <circle cx={88} cy={94} r={3.4} fill="#7dffb2" />
      <circle cx={88} cy={94} r={7 + 4 * Math.sin(p * 18)} fill="none" stroke="#7dffb2" strokeWidth={0.8} opacity={0.4} />

      {/* UHF beam up to the orbiter */}
      {toOrbiter > 0 && (
        <>
          <line x1={88} y1={94} x2={ox} y2={oy} stroke="#4fe8ff" strokeWidth={1.1} opacity={0.55} />
          {[0, 1, 2, 3].map((i) => {
            const t = ((p * 3.2 + i * 0.25) % 1)
            return (
              <circle key={i}
                cx={88 + (ox - 88) * t} cy={94 + (oy - 94) * t}
                r={2} fill="#4fe8ff" opacity={(1 - t) * 0.9 * toOrbiter} />
            )
          })}
        </>
      )}

      {/* The relay orbiter */}
      <g transform={`translate(${ox} ${oy})`}>
        <rect x={-5} y={-4} width={10} height={8} fill="#9aa7b5" />
        <rect x={-14} y={-2} width={8} height={4} fill="#2f5ea8" />
        <rect x={6} y={-2} width={8} height={4} fill="#2f5ea8" />
        <circle cx={0} cy={-8} r={4} fill="none" stroke="#dfe9f2" strokeWidth={1.2} />
      </g>
      <text x={ox} y={oy - 16} fill="#7b8794" fontSize={6.5} fontFamily="monospace" textAnchor="middle">RELAY</text>

      {/* X-band away to Earth */}
      {away > 0 && (
        <>
          <line x1={ox} y1={oy} x2={172} y2={14} stroke="#ffb24a" strokeWidth={1} opacity={0.6} strokeDasharray="4 3" />
          <circle cx={166} cy={18} r={4} fill="#5aa0ff" />
          <text x={150} y={34} fill="#ffb24a" fontSize={6.5} fontFamily="monospace" textAnchor="middle">{station.toUpperCase()}</text>
        </>
      )}
    </svg>
  )
}

export default function UplinkOverlay() {
  const s = useStore()
  const u = s.uplink

  useEffect(() => {
    if (!u) return
    const onKey = (e: KeyboardEvent) => {
      // A relay pass is not something you stop half way through. The overlay
      // only releases the keyboard once the packet is away.
      if (u.complete && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) {
        e.preventDefault()
        useStore.getState().dismissUplink()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [u?.complete, !!u])

  if (!u) return null

  const si = activeStage(u.progress)
  const transferFrac = clamp01((u.progress - 0.18) / 0.62)
  const sent = itemsSent(u.items, transferFrac)
  const bytesSent = u.items.slice(0, sent).reduce((a, i) => a + i.bytes, 0)
  const post = s.feed[s.feed.length - 1]
  const inFlight = u.complete && post && !post.published
  const remainSec = post ? Math.max(0, post.arriveEvaSec - s.time.evaSec) : 0
  const compression = Math.max(1, Math.round(u.modelledSec / (u.realSec * 0.62)))

  return (
    <div
      className="screen center"
      style={{
        background: 'rgba(2,4,8,0.92)',
        backdropFilter: 'blur(6px)',
        zIndex: 85,
        padding: 18,
        animation: 'fadeUp 0.16s ease-out',
      }}
    >
      <div className="panel clipped brackets stack" style={{ width: 'min(100%, 1040px)', maxHeight: '92vh' }}>
        <div className="panel-head">
          <h3>{u.complete ? 'Packet away' : 'Downlink to Earth'}</h3>
          <span className="row gap8 wrap" style={{ justifyContent: 'flex-end' }}>
            {!u.complete && compression >= 2 && u.progress > 0.18 && u.progress < 0.8 && (
              <Chip tone="caution">transfer &times;{compression}</Chip>
            )}
            <Chip tone={u.complete ? 'nominal' : 'info'}>
              {u.complete ? 'in flight' : `${formatBytes(bytesSent)} / ${formatBytes(u.bytes)}`}
            </Chip>
          </span>
        </div>

        <div className="panel-body scroll grow">
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(210px, 280px) 1fr', alignItems: 'start' }}>
            <div className="stack gap8">
              <div style={{ border: '1px solid var(--line)' }} className="scanlines">
                <LinkDiagram p={u.progress} station={u.station.name} />
              </div>
              <div className="kv" style={{ fontSize: 11 }}>
                <dt>Packet</dt><dd>{formatBytes(u.bytes)}</dd>
                <dt>Products</dt><dd>{u.items.length}</dd>
                <dt>UHF relay</dt><dd>2 Mbit/s</dd>
                <dt>Real transfer</dt><dd>{formatDuration(u.modelledSec)}</dd>
                <dt>If sent direct</dt><dd className="am">{formatDuration(dteSeconds(u.bytes))}</dd>
                <dt>Receiving</dt><dd>{u.station.name}</dd>
                <dt>One-way light</dt><dd>{formatDuration(u.owltSec)}</dd>
              </div>
              <div className="src" style={{ lineHeight: 1.5 }}>
                {u.station.name} &mdash; {u.station.place}. One of three Deep Space Network complexes
                about 120&deg; apart in longitude, so that something on Earth is always facing Mars.
              </div>
            </div>

            <div className="stack gap10">
              <div>
                <div className="label" style={{ marginBottom: 4 }}>{u.title}</div>
                <div className="src">{u.subtitle}</div>
              </div>

              {/* The stages */}
              <div className="stack gap5">
                {STAGES.map((st, i) => {
                  const done = i < si || u.complete
                  const active = i === si && !u.complete
                  return (
                    <div
                      key={st.id}
                      style={{
                        border: `1px solid ${active ? 'rgba(79,232,255,0.45)' : 'var(--line-soft)'}`,
                        borderLeft: `3px solid ${done ? 'var(--lime)' : active ? 'var(--cyan)' : 'var(--faint)'}`,
                        background: active ? 'rgba(79,232,255,0.07)' : 'transparent',
                        padding: '6px 10px',
                        opacity: !done && !active ? 0.42 : 1,
                        transition: 'background 0.25s, opacity 0.3s',
                      }}
                    >
                      <div className="row gap8" style={{ alignItems: 'baseline' }}>
                        <span className="mono" style={{ fontSize: 11, width: 14, color: done ? 'var(--lime)' : active ? 'var(--cyan)' : 'var(--faint)' }}>
                          {done ? '✓' : i + 1}
                        </span>
                        <span style={{ fontSize: 13, color: active ? 'var(--text)' : 'var(--muted)' }}>{st.label}</span>
                      </div>
                      {active && <div className="src" style={{ marginTop: 3, lineHeight: 1.55, color: '#cfe3d6' }}>{st.detail}</div>}
                    </div>
                  )
                })}
              </div>

              {/* The transfer bar, filling with the products as they go */}
              <div>
                <div className="row between" style={{ marginBottom: 3 }}>
                  <span className="label">Products transferred</span>
                  <span className="src">{Math.min(sent, u.items.length)} / {u.items.length}</span>
                </div>
                <Meter value={u.complete ? 1 : transferFrac} tone="var(--cyan)" height={12} />
                <div
                  style={{
                    display: 'grid', gap: 6, marginTop: 8,
                    gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                  }}
                >
                  {u.items.map((it, i) => {
                    const done = i < sent || u.complete
                    const now = i === sent && !u.complete
                    return (
                      <div
                        key={it.id}
                        title={it.note}
                        style={{
                          border: `1px solid ${done ? 'rgba(125,255,178,0.5)' : now ? 'var(--cyan)' : 'var(--line-soft)'}`,
                          background: done ? 'rgba(125,255,178,0.06)' : 'rgba(255,255,255,0.02)',
                          padding: 5,
                          opacity: done ? 1 : now ? 0.9 : 0.35,
                          transition: 'opacity 0.3s, border-color 0.3s',
                        }}
                      >
                        <div
                          style={{
                            height: 52, border: '1px solid var(--line-soft)', overflow: 'hidden',
                            background: '#0a0f14', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {it.thumb ? (
                            <img
                              src={it.thumb} alt=""
                              style={{
                                width: '100%', height: '100%', objectFit: 'cover',
                                filter: done ? 'none' : 'grayscale(1) brightness(0.5)',
                                clipPath: now ? `inset(${(1 - clamp01(transferFrac * u.items.length - i)) * 100}% 0 0 0)` : undefined,
                              }}
                            />
                          ) : (
                            <span className="mono" style={{ fontSize: 9, color: done ? 'var(--lime)' : 'var(--faint)', letterSpacing: '0.1em' }}>
                              {it.kind.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="src" style={{ marginTop: 3, fontSize: 9.5, lineHeight: 1.3 }}>
                          {it.label}
                        </div>
                        <div className="mono" style={{ fontSize: 8.5, color: done ? 'var(--lime)' : 'var(--faint)' }}>
                          {formatBytes(it.bytes)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {inFlight && (
                <div className="note info" style={{ fontSize: 13 }}>
                  <div className="row between gap8 wrap" style={{ marginBottom: 4 }}>
                    <span className="display cy" style={{ fontSize: 11 }}>IN FLIGHT TO EARTH</span>
                    <span className="mono am" style={{ fontSize: 15 }}>{formatDuration(remainSec)}</span>
                  </div>
                  Your data is crossing {(s.link.distanceAu * 149.6).toFixed(1)} million km at the
                  speed of light. It reaches {u.station.name} in {formatDuration(remainSec)}, and the
                  team sees it a few minutes after that. Nothing you or they do can make that number
                  smaller. Go back to work &mdash; the EVA does not wait for the feed.
                </div>
              )}

              {u.complete && post?.published && (
                <div className="note" style={{ borderColor: 'var(--lime)', fontSize: 13 }}>
                  <span className="display li" style={{ fontSize: 11 }}>RECEIVED AT {post.station.toUpperCase()}</span>
                  <div style={{ marginTop: 4 }}>
                    Published to the feed. {formatBytes(post.bytes)}, {post.items.length} products.
                  </div>
                </div>
              )}

              {u.complete && (
                <figure style={{ margin: 0 }}>
                  <img
                    src={GALLERY.dsnMadrid.file}
                    alt={GALLERY.dsnMadrid.title}
                    loading="lazy"
                    style={{ width: '100%', maxHeight: 190, objectFit: 'cover', border: '1px solid var(--line)' }}
                  />
                  <figcaption className="src" style={{ marginTop: 3, lineHeight: 1.45 }}>
                    <span style={{ color: 'var(--text)' }}>{GALLERY.dsnMadrid.title}</span> &middot;{' '}
                    {GALLERY.dsnMadrid.date} &middot; {GALLERY.dsnMadrid.credit}
                    <br />{GALLERY.dsnMadrid.caption}
                  </figcaption>
                </figure>
              )}
            </div>
          </div>
        </div>

        <div className="panel-head" style={{ borderBottom: 0, borderTop: '1px solid var(--line-soft)' }}>
          <span className="src">
            {u.complete
              ? 'The packet is away. The feed updates itself when it lands.'
              : STAGES[si].label}
          </span>
          <button
            className={`btn ${u.complete ? 'primary' : 'ghost sm'}`}
            onClick={() => u.complete && s.dismissUplink()}
            disabled={!u.complete}
          >
            {u.complete ? 'Back to the surface [Enter]' : 'Transferring\u2026'}
          </button>
        </div>
      </div>
    </div>
  )
}
