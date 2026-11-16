import { useEffect, useRef, useState } from 'react'
import { Chip, Meter, Panel } from '../ui/components/kit'
import { useMultiplayer } from './client'
import type { OpsCommandKind } from './protocol'

const fmtTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function tone(status: string) {
  if (status === 'critical') return 'var(--red)'
  if (status === 'warning' || status === 'caution') return 'var(--amber)'
  return 'var(--lime)'
}

export default function MissionControl() {
  const multiplayer = useMultiplayer()
  const snapshot = multiplayer.snapshot
  const surfaceReady = multiplayer.peerConnected && snapshot?.phase === 'surface' && !snapshot.outcome
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const feed = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = feed.current
    if (element) element.scrollTop = element.scrollHeight
  }, [multiplayer.history])

  const command = (kind: OpsCommandKind) => {
    multiplayer.sendCommand(kind, note)
    setNote('')
  }
  const chat = () => {
    const text = message.trim()
    if (!text) return
    multiplayer.sendChat(text)
    setMessage('')
  }

  return (
    <div className="screen grid-bg" style={{ overflowY: 'auto', background: 'var(--bg-0)' }}>
      <div className="scanlines" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 30 }} />
      <div className="stack gap12" style={{ minHeight: '100%', padding: 'clamp(12px, 2vw, 24px)', position: 'relative', zIndex: 1 }}>
        <header className="row between gap12 wrap" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
          <div>
            <div className="label">Crimson Exodus / local Mars operations</div>
            <div className="display cy" style={{ fontSize: 'clamp(20px, 4vw, 36px)' }}>HABCOM CONSOLE</div>
          </div>
          <div className="row gap8 wrap">
            <Chip tone={multiplayer.status === 'connected' ? 'nominal' : 'critical'}>{multiplayer.status}</Chip>
            <Chip tone={multiplayer.peerConnected ? 'nominal' : 'caution'}>{multiplayer.peerConnected ? 'EV-1 linked' : 'EV-1 offline'}</Chip>
            <span className="mono am" style={{ fontSize: 18 }}>{multiplayer.roomCode}</span>
            {multiplayer.latencyMs != null && <span className="src">{multiplayer.latencyMs} ms</span>}
            <button className="btn ghost sm" onClick={multiplayer.leaveMission}>Leave console</button>
          </div>
        </header>

        {!snapshot ? (
          <div className="grow center">
            <div className="panel clipped brackets" style={{ padding: 24, width: 'min(90vw, 560px)', textAlign: 'center' }}>
              <div className="display am" style={{ fontSize: 16, marginBottom: 8 }}>Awaiting EV-1 telemetry</div>
              <p>The room is live. Telemetry begins as soon as the host link is connected.</p>
            </div>
          </div>
        ) : (
          <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 12, alignItems: 'start' }}>
            <Panel title="Mission state" right={<Chip tone={snapshot.mission.paused ? 'caution' : 'nominal'}>{snapshot.phase}</Chip>}>
              <div className="display am" style={{ fontSize: 30 }}>{fmtTime(snapshot.mission.evaSec)}</div>
              <div className="kv" style={{ marginTop: 10 }}>
                <dt>Route</dt><dd>{snapshot.route.id} / {(snapshot.route.progress * 100).toFixed(0)}%</dd>
                <dt>Activity</dt><dd>{snapshot.mission.activity}</dd>
                <dt>Procedure</dt><dd>{snapshot.mission.procedure ?? 'none'}</dd>
                <dt>Clock</dt><dd>{snapshot.mission.paused ? 'HOLD' : `${snapshot.mission.timeScale}×`}</dd>
                <dt>Position</dt><dd>{snapshot.position.x.toFixed(0)} E / {snapshot.position.z.toFixed(0)} N</dd>
                <dt>Lander</dt><dd>{snapshot.position.atLander ? 'in reach' : 'remote'}</dd>
              </div>
              {snapshot.mission.aborting && <div className="note danger" style={{ marginTop: 8 }}>RETURN procedure active</div>}
              {snapshot.outcome && <div className={snapshot.outcome.success ? 'note info' : 'note danger'} style={{ marginTop: 8 }}>{snapshot.outcome.title}</div>}
            </Panel>

            <Panel title="PLSS / return">
              {([
                ['O₂', snapshot.lifeSupport.o2], ['CO₂ scrubber', snapshot.lifeSupport.scrubber],
                ['Battery', snapshot.lifeSupport.battery], ['Feedwater', snapshot.lifeSupport.water],
              ] as const).map(([label, value]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div className="row between"><span className="label">{label}</span><span className="mono">{(value * 100).toFixed(0)}%</span></div>
                  <Meter value={value} reserve={0.3} />
                </div>
              ))}
              <hr className="rule" />
              <div className="row between"><span className="label">Limiting system</span><span className="mono am">{snapshot.lifeSupport.limiting}</span></div>
              <div className="row between"><span className="label">Return margin</span><span className="mono" style={{ color: tone(snapshot.lifeSupport.returnStatus), fontSize: 19 }}>{snapshot.lifeSupport.returnMarginMin.toFixed(0)} min</span></div>
              <div className="row between"><span className="label">After reserve</span><span className="mono" style={{ color: snapshot.lifeSupport.reserveMarginMin < 0 ? 'var(--red)' : 'var(--lime)' }}>{snapshot.lifeSupport.reserveMarginMin.toFixed(0)} min</span></div>
            </Panel>

            <Panel title="Environment / science">
              <div className="kv">
                <dt>Weather</dt><dd>{snapshot.environment.headline}</dd>
                <dt>Dust opacity</dt><dd>{snapshot.environment.dustOpacity.toFixed(2)}</dd>
                <dt>Visibility</dt><dd>{snapshot.environment.visibilityM < 1000 ? `${snapshot.environment.visibilityM.toFixed(0)} m` : `${(snapshot.environment.visibilityM / 1000).toFixed(1)} km`}</dd>
                <dt>Air</dt><dd>{snapshot.environment.airTempC.toFixed(0)} °C</dd>
                <dt>Radiation</dt><dd>{snapshot.environment.radiation ?? 'background'}</dd>
                <dt>EVA dose</dt><dd>{snapshot.environment.doseMSv.toFixed(2)} mSv</dd>
                <dt>Station</dt><dd>{snapshot.science.nearStation ?? 'none in reach'}</dd>
                <dt>Completed</dt><dd>{snapshot.science.completedStations} stations</dd>
                <dt>Samples / frames</dt><dd>{snapshot.science.samples} / {snapshot.science.photos}</dd>
                <dt>Downlinks</dt><dd>{snapshot.science.feedPackages}</dd>
              </div>
            </Panel>

            <Panel title="Operational recommendation" right={<Chip tone="info">EV-1 confirms</Chip>}>
              <p style={{ fontSize: 13 }}>Recommendations never seize the suit controls. EV-1 must acknowledge before HOLD or RETURN executes.</p>
              <label className="label" htmlFor="hab-note">Optional rationale</label>
              <input
                id="hab-note" value={note} maxLength={160} onChange={(event) => setNote(event.target.value)}
                style={{ width: '100%', margin: '6px 0 9px', padding: '8px 10px', background: '#05080d', border: '1px solid var(--line)' }}
              />
              <div className="row gap8 wrap">
                <button className="btn" disabled={!surfaceReady} onClick={() => command('go')} style={{ color: 'var(--lime)' }}>GO</button>
                <button className="btn" disabled={!surfaceReady} onClick={() => command('hold')} style={{ color: 'var(--amber)' }}>HOLD</button>
                <button className="btn" disabled={!surfaceReady} onClick={() => command('return')} style={{ color: 'var(--red)' }}>RETURN</button>
              </div>
              <div className="stack gap4" style={{ marginTop: 10 }}>
                {multiplayer.commands.slice(-4).reverse().map((item) => (
                  <div key={item.id} className="row between gap8" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 5 }}>
                    <span className="mono">{item.kind.toUpperCase()}</span>
                    <Chip tone={item.status === 'accepted' ? 'nominal' : item.status === 'declined' ? 'critical' : 'caution'}>{item.status}</Chip>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Local crew loop" style={{ gridColumn: 'span 1' }}>
              <div ref={feed} className="scroll" style={{ height: 190, border: '1px solid var(--line-soft)', padding: 8, marginBottom: 8 }}>
                {multiplayer.history.length === 0 && <div className="src">No crew messages yet.</div>}
                {multiplayer.history.map((line) => (
                  <div key={line.id} style={{ marginBottom: 7 }}>
                    <span className={`mono ${line.from === 'habcom' ? 'am' : 'cy'}`} style={{ fontSize: 10 }}>{line.from.toUpperCase()}</span>
                    <span style={{ marginLeft: 8, fontSize: 13 }}>{line.text}</span>
                  </div>
                ))}
              </div>
              <div className="row gap8">
                <input
                  aria-label="Crew message" value={message} maxLength={240} onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') chat() }}
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: '#05080d', border: '1px solid var(--line)' }}
                />
                <button className="btn sm" onClick={chat}>Send</button>
              </div>
            </Panel>
          </main>
        )}
      </div>
    </div>
  )
}
