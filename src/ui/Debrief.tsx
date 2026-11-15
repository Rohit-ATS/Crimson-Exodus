import { useEffect, useMemo, useState } from 'react'
import Starfield from './Starfield'
import { Chip, KV, Meter, Panel, Tag } from './components/kit'
import LocalMap from './map/LocalMap'
import ElevationProfile from './map/ElevationProfile'
import DataPanel from './panels/DataPanel'
import { scienceScore, useStore } from '../state/store'
import { JACK_SUIT } from '../sim/consumables'
import { ROUTES, STATIONS } from '../mission/site'
import { flagUrl } from '../data/countries'
import { formatDelay } from '../sim/comms'
import { formatBytes } from '../sim/downlink'
import { LESSONS } from '../mission/activity'
import { missionStatus } from '../mission/objectives'
import { useSettings } from '../state/settings'

export default function Debrief() {
  const s = useStore()
  const restart = useStore((x) => x.restart)
  const [showData, setShowData] = useState(false)
  const o = s.outcome
  const sci = useMemo(() => scienceScore(s), [s])
  const route = ROUTES.find((r) => r.id === s.routeId)!
  const mission = useMemo(() => missionStatus(s), [s])
  const markRunComplete = useSettings((x) => x.markRunComplete)
  // Reaching a debrief means this player has been all the way through once.
  useEffect(() => { markRunComplete() }, [markRunComplete])
  const learned = s.lessons.map((id) => LESSONS[id]).filter(Boolean)

  const visited = useMemo(
    () => Object.fromEntries(Object.entries(s.stations).map(([k, v]) => [k, !!v.choice])),
    [s.stations],
  )

  if (!o) return null

  const tone = o.code === 'returned-nominal' ? 'var(--lime)'
    : o.code === 'returned-reserve-breach' ? 'var(--amber)' : 'var(--red)'

  return (
    <div className="screen scanlines vignette stack">
      <Starfield marsLimb={false} />

      <div className="grow scroll" style={{ padding: 'clamp(14px, 3vw, 30px)', position: 'relative' }}>
        {/* Headline */}
        <div style={{ maxWidth: 1420, margin: '0 auto' }}>
          <div className="label" style={{ letterSpacing: '0.4em', marginBottom: 6 }}>Phase 3 of 3 &mdash; Debrief</div>
          <h1
            className="display"
            style={{ fontSize: 'clamp(22px, 3.4vw, 40px)', color: tone, letterSpacing: '0.05em', lineHeight: 1.08 }}
          >
            {o.title}
          </h1>
          <p style={{ fontSize: 'clamp(14px, 1.3vw, 17px)', maxWidth: 940, marginTop: 8 }}>{o.summary}</p>

          <div className="row gap10 wrap" style={{ margin: '18px 0 20px' }}>
            <ScoreCard label="Science returned" value={`${o.scienceScore}`} of={`/ ${o.maxScienceScore}`} tone="var(--cyan)" />
            <ScoreCard label="Decision quality" value={`${o.decisionScore}`} of="/ 100" tone="var(--amber)" />
            <ScoreCard label="Samples sealed" value={`${s.samples.length}`} of="/ 4" tone="var(--lime)" />
            <ScoreCard label="Stations worked" value={`${Object.values(s.stations).filter((x) => x.choice).length}`} of="/ 3" tone="var(--magenta)" />
            <ScoreCard label="EVA duration" value={`${(s.time.evaSec / 60).toFixed(0)}`} of="min" tone="var(--text)" />
            <ScoreCard label="Distance walked" value={`${(s.distanceWalkedM / 1000).toFixed(2)}`} of="km" tone="var(--text)" />
          </div>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            {/* The route walked */}
            <Panel title="The route you walked" pad={false}>
              <div style={{ padding: 10 }}>
                <MapFit visited={visited} />
                <div style={{ marginTop: 8 }}>
                  <ElevationProfileFit />
                </div>
                <KV rows={[
                  ['Plan', `${route.codename} — ${route.name}`],
                  ['Planned length', `${(s.pathStats.lengthM / 1000).toFixed(2)} km`],
                  ['Total ascent', `${s.pathStats.ascentM.toFixed(0)} m`],
                  ['Furthest from lander', `${s.maxRangeReachedM.toFixed(0)} m`],
                  ['Worst margin seen', `${isFinite(s.worstMarginMin) ? s.worstMarginMin.toFixed(0) : '—'} min`],
                  ['Reserve breached', s.reserveBreached ? 'YES — flight rule violation' : 'no'],
                  ['Radiation dose (EVA)', `${s.doseMSv.toFixed(3)} mSv${s.sepEvent ? ' · solar particle event' : ' · cosmic-ray background'}`],
                ]} />
              </div>
            </Panel>

            {/* Science */}
            <Panel title="Science record">
              {sci.breakdown.length === 0 ? (
                <div className="src">Nothing recorded. The EVA ended before any observation was logged.</div>
              ) : (
                <div className="stack gap7">
                  {sci.breakdown.map((b, i) => (
                    <div key={i} style={{ borderLeft: `2px solid ${b.points > 0 ? 'var(--lime)' : 'var(--faint)'}`, paddingLeft: 9 }}>
                      <div className="row between gap8">
                        <span className="mono" style={{ fontSize: 12 }}>{b.label}</span>
                        <span className="mono li" style={{ fontSize: 12 }}>+{b.points}</span>
                      </div>
                      <div className="src" style={{ lineHeight: 1.45 }}>{b.note}</div>
                    </div>
                  ))}
                </div>
              )}

              <hr className="rule" />
              <div className="label" style={{ marginBottom: 5 }}>Answering the science question</div>
              <div className="stack gap6">
                {STATIONS.map((st) => {
                  const state = s.stations[st.id]
                  const opt = st.observation.options.find((x) => x.id === state.choice)
                  return (
                    <div key={st.id} className="row gap8" style={{ alignItems: 'flex-start' }}>
                      <Chip tone={opt?.supported ? 'nominal' : state.choice ? 'caution' : 'info'}>
                        {opt?.supported ? 'answered' : state.choice ? 'recorded' : 'unanswered'}
                      </Chip>
                      <span style={{ fontSize: 12.5, flex: 1 }}>
                        <span className="am">{st.codename}</span> &mdash; {st.observation.prompt.split('.')[0]}.
                      </span>
                    </div>
                  )
                })}
              </div>
            </Panel>

            {/* Consumables at the hatch */}
            <Panel title="Suit state at the hatch" right={<Tag kind="game" />}>
              <div className="stack gap8">
                {([
                  ['O₂', s.frac.o2], ['CO₂ scrubber', s.frac.scrubber],
                  ['Battery', s.frac.battery], ['Feedwater', s.frac.water],
                ] as const).map(([k, v]) => (
                  <div key={k}>
                    <div className="row between"><span className="label">{k}</span><span className="mono" style={{ fontSize: 11 }}>{(v * 100).toFixed(0)}%</span></div>
                    <Meter value={v} reserve={JACK_SUIT.reserveFraction} height={8} />
                  </div>
                ))}
              </div>
              <div className="src" style={{ marginTop: 7 }}>
                Dashed band is the mandated {(JACK_SUIT.reserveFraction * 100).toFixed(0)}% reserve.
                Limiting consumable: <span className="am">{s.ret.limiting.toUpperCase()}</span>.
                Dust fouling reached {(s.cons.dustFouling * 100).toFixed(0)}%.
              </div>

              <hr className="rule" />
              <div className="label" style={{ marginBottom: 4 }}>Weather encountered</div>
              <div style={{ fontSize: 12.5 }}>
                {s.weatherEvents.length === 0 ? 'Clear throughout.' : s.weatherEvents.map((e, i) => (
                  <div key={i} className="row between gap8">
                    <span>{e.kind === 'regional-storm' ? 'Regional dust storm' : 'Dust devil'}</span>
                    <span className="src">
                      T+{e.startMin.toFixed(0)}–{(e.startMin + e.durationMin).toFixed(0)} min &middot; peak opacity +{e.peakTau.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Comms */}
            <Panel title="The Earth link">
              <KV rows={[
                ['Distance at EVA start', `${(s.link.distanceKm / 1e6).toFixed(2)} M km`],
                ['One-way light time', formatDelay(s.link.owltSec)],
                ['Round trip', formatDelay(s.link.rttSec)],
                ['Messages downlinked', `${s.messages.filter((m) => m.dir === 'downlink').length}`],
                ['Replies received', `${s.messages.filter((m) => m.dir === 'uplink' && m.delivered).length}`],
                ['Still in flight at the end', `${s.messages.filter((m) => !m.delivered).length}`],
              ]} />
              <div className="note info" style={{ fontSize: 12.5, marginTop: 9 }}>
                Every decision that mattered on this EVA had to be made and acted on inside
                {' '}{formatDelay(s.link.rttSec)} &mdash; the time it takes to ask Earth anything and
                hear back. That is not a game constraint. That is the speed of light and the
                current geometry of two orbits.
              </div>
              {s.flag && (
                <div className="row gap8" style={{ alignItems: 'center', marginTop: 10 }}>
                  <img src={flagUrl(s.flag.code, 80)} alt="" style={{ width: 44, height: 29, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)' }} />
                  <div>
                    <div style={{ fontSize: 13 }}>Flag of {s.flag.name} emplaced</div>
                    <div className="src">Commemorative only. Outer Space Treaty Article II: no claim of sovereignty.</div>
                  </div>
                </div>
              )}
            </Panel>

            {/* Objectives: what the mission asked for, and what it got */}
            <Panel
              title="Mission objectives"
              style={{ gridColumn: '1 / -1' }}
              right={
                <Chip tone={mission.primaryDone >= 1 ? 'nominal' : 'caution'}>
                  {mission.primaryDone}/{mission.primaryTotal} primary &middot;{' '}
                  {mission.bonusDone}/{mission.bonusTotal} bonus
                </Chip>
              }
            >
              <div style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))' }}>
                {[...mission.critical, ...mission.primary, ...mission.bonus].map((ob) => (
                  <div
                    key={ob.id}
                    style={{
                      borderLeft: `3px solid ${ob.done ? 'var(--lime)' : 'var(--faint)'}`,
                      paddingLeft: 9, opacity: ob.done ? 1 : 0.62,
                    }}
                  >
                    <div className="row gap6" style={{ alignItems: 'baseline' }}>
                      <span className="mono" style={{ fontSize: 11, color: ob.done ? 'var(--lime)' : 'var(--faint)' }}>
                        {ob.done ? '\u2713' : '\u2014'}
                      </span>
                      <span style={{ fontSize: 13 }}>{ob.title}</span>
                    </div>
                    <div className="src">{ob.detail}</div>
                  </div>
                ))}
              </div>
              <div className="src" style={{ marginTop: 8 }}>
                One primary objective is mission success. A real EVA that achieves one of its
                objectives and walks home is a successful EVA.
              </div>
            </Panel>

            {/* What went to Earth */}
            {s.feed.length > 0 && (
              <Panel title="What reached Earth" style={{ gridColumn: '1 / -1' }}>
                <div className="stack gap6">
                  {s.feed.map((f) => (
                    <div key={f.id} style={{ borderLeft: `3px solid ${f.published ? 'var(--lime)' : 'var(--amber)'}`, paddingLeft: 9 }}>
                      <div className="row between gap8 wrap">
                        <span style={{ fontSize: 13 }}>{f.title}</span>
                        <span className="src">
                          {f.published ? `received at ${f.station}` : 'still in flight at ingress'}
                        </span>
                      </div>
                      <div className="src">
                        {f.items.length} products &middot; {formatBytes(f.bytes)} &middot; sent T+
                        {Math.floor(f.sentEvaSec / 60)} min &middot; light time {formatDelay(f.owltSec)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="src" style={{ marginTop: 7 }}>
                  Anything still in flight when the hatch closed still arrives. Nothing you
                  downlinked can be lost by anything that happens to you afterwards &mdash; which
                  is the entire argument for sending data home as you go rather than at the end.
                </div>
              </Panel>
            )}

            {/* Lessons */}
            <Panel title="What this run showed" style={{ gridColumn: '1 / -1' }}>
              <ul style={{ fontSize: 13.5 }}>
                {o.lessons.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </Panel>

            {/* The field guide: the part meant to outlast the game */}
            <Panel
              title="Your Mars field guide"
              style={{ gridColumn: '1 / -1' }}
              right={<Chip tone="info">{learned.length} of {Object.keys(LESSONS).length} earned</Chip>}
            >
              {learned.length === 0 ? (
                <div className="src">
                  No procedures were carried out this run, so there is nothing here. The guide
                  only fills up from work actually done in the field.
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                    {learned.map((l, i) => (
                      <div
                        key={l.id}
                        style={{
                          border: '1px solid rgba(255,178,74,0.35)',
                          borderLeft: '3px solid var(--amber)',
                          background: 'rgba(255,178,74,0.045)',
                          padding: '9px 11px',
                        }}
                      >
                        <div className="row between gap8">
                          <span className="mono am" style={{ fontSize: 10, letterSpacing: '0.14em' }}>
                            {String(i + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, marginTop: 2 }}>{l.headline}</div>
                        <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.55 }}>{l.body}</p>
                        <div className="src" style={{ marginTop: 3 }}>Source: {l.source}</div>
                      </div>
                    ))}
                  </div>
                  <div className="src" style={{ marginTop: 9, lineHeight: 1.6 }}>
                    This is the part meant to outlast the game. If you remember nothing else:
                    the reserve is what keeps a surprise from becoming a fatality, dust is the
                    thing that actually breaks equipment and lungs, and Earth cannot help you
                    with the next ten minutes.
                  </div>
                </>
              )}
            </Panel>

            {/* Full log */}
            <Panel title="Mission log" style={{ gridColumn: '1 / -1' }} pad={false}>
              <div className="scroll" style={{ maxHeight: 280, padding: 10 }}>
                {s.log.map((l, i) => (
                  <div
                    key={i}
                    style={{
                      borderLeft: `2px solid ${
                        l.kind === 'danger' ? 'var(--red)' :
                        l.kind === 'warning' ? 'var(--amber)' :
                        l.kind === 'science' ? 'var(--lime)' :
                        l.kind === 'comms' ? 'var(--cyan)' :
                        l.kind === 'decision' ? 'var(--magenta)' : 'var(--faint)'
                      }`,
                      padding: '5px 10px',
                      marginBottom: 4,
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      background: 'rgba(255,255,255,0.018)',
                    }}
                  >
                    <span className="mono faint" style={{ marginRight: 7 }}>
                      T+{Math.floor(l.evaSec / 60)}:{String(Math.floor(l.evaSec % 60)).padStart(2, '0')}
                    </span>
                    {l.text}
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="note" style={{ marginTop: 16, fontSize: 13 }}>
            <strong className="am">Honest framing.</strong> This is a prototype and an educational
            planning interface, not an operationally safe route planner for real astronauts. The
            season, the sun angle and the Earth light time in this debrief are real. The terrain
            is synthetic, the suit is a game mechanic, and the hazard scoring is a planning cue.
            Saying so is what makes the rest of it worth believing.
          </div>
        </div>
      </div>

      <div className="row between gap12 wrap" style={{ padding: '13px 22px', borderTop: '1px solid var(--line-soft)', position: 'relative' }}>
        <span className="mono" style={{ fontSize: 13, color: tone }}>{o.verdict}</span>
        <div className="row gap8 wrap">
          <button className="btn ghost" onClick={() => setShowData(true)}>Data details &amp; disclosure</button>
          <button className="btn" onClick={() => useStore.setState({ phase: 'planning', outcome: null, paused: false })}>
            Re-plan the traverse
          </button>
          <button className="btn primary" onClick={restart}>New mission</button>
        </div>
      </div>

      {showData && <DataPanel onClose={() => setShowData(false)} />}
    </div>
  )
}

function ScoreCard({ label, value, of, tone }: { label: string; value: string; of: string; tone: string }) {
  return (
    <div className="panel clipped" style={{ padding: '10px 16px', minWidth: 150 }}>
      <div className="label">{label}</div>
      <div className="row gap4" style={{ alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: 28, lineHeight: 1.1, color: tone }}>{value}</span>
        <span className="src">{of}</span>
      </div>
    </div>
  )
}

function MapFit({ visited }: { visited: Record<string, boolean> }) {
  const s = useStore()
  return (
    <LocalMap
      layer="relief"
      routeId={s.routeId}
      jack={{ x: s.jackX, z: s.jackZ, heading: s.jackHeading }}
      sunAzDeg={s.clock.sunAzimuthDeg}
      sunElDeg={s.clock.sunElevationDeg}
      size={330}
      visitedStations={visited}
      flag={s.flag}
    />
  )
}

function ElevationProfileFit() {
  const path = useStore((s) => s.path)
  const idx = useStore((s) => s.pathIndex)
  return <ElevationProfile path={path} width={330} height={120} progressIndex={idx} />
}
