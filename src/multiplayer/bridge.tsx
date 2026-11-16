import { useEffect, useMemo, useState } from 'react'
import { STATIONS } from '../mission/site'
import { useStore, type State } from '../state/store'
import { live } from '../state/live'
import { useMultiplayer } from './client'
import { MULTIPLAYER_PROTOCOL, type MissionSnapshot, type OpsCommand } from './protocol'

function clamp01(value: number) { return Math.max(0, Math.min(1, value)) }

export function missionSnapshot(s: State): MissionSnapshot {
  const completedStations = STATIONS.filter((station) => {
    const state = s.stations[station.id]
    return state.abraded && state.inspected && !!state.choice && (!station.sampleable || state.sampled)
  }).length
  return {
    protocol: MULTIPLAYER_PROTOCOL,
    sentAt: Date.now(),
    phase: s.phase,
    route: { id: s.routeId, progress: s.path.length > 1 ? clamp01(s.pathIndex / (s.path.length - 1)) : 0 },
    mission: {
      evaSec: s.time.evaSec, timeScale: s.timeScale, paused: s.paused,
      activity: s.activity, procedure: s.proc?.def.title ?? null,
      aborting: s.aborting, sheltering: s.sheltering,
    },
    position: { x: s.jackX, z: s.jackZ, heading: s.jackHeading, atLander: s.atLander },
    lifeSupport: {
      o2: s.frac.o2, scrubber: s.frac.scrubber, battery: s.frac.battery, water: s.frac.water,
      limiting: s.frac.limiting, returnMarginMin: s.ret.marginMinutes,
      reserveMarginMin: s.ret.marginAfterReserveMinutes, returnStatus: s.ret.status,
    },
    environment: {
      weather: s.weather.kind, headline: s.weather.headline, dustOpacity: s.env.dustOpticalDepth,
      visibilityM: s.weather.visibilityM, airTempC: s.env.airTempC,
      radiation: s.radiation.sepPhase, doseMSv: s.doseMSv,
    },
    science: {
      nearStation: s.nearStation, samples: s.samples.length, photos: s.photos.length,
      completedStations, feedPackages: s.feed.length,
    },
    flag: s.flag ? { code: s.flag.code, name: s.flag.name, x: s.flag.x, z: s.flag.z } : null,
    flags: useMultiplayer.getState().flags,
    outcome: s.outcome ? { success: s.outcome.success, title: s.outcome.title } : null,
  }
}

export default function MultiplayerBridge() {
  const status = useMultiplayer((state) => state.status)
  const role = useMultiplayer((state) => state.role)

  useEffect(() => {
    if (status !== 'connected' || role !== 'ev') return
    let lastSent = 0
    const publish = (state: State, force = false) => {
      const now = performance.now()
      if (!force && now - lastSent < 250) return
      lastSent = now
      useMultiplayer.getState().publishSnapshot(missionSnapshot(state))
    }
    publish(useStore.getState(), true)
    return useStore.subscribe((state, previous) => {
      if (state.flag && state.flag !== previous.flag) {
        useMultiplayer.getState().plantFlag(state.flag.code, state.flag.name, state.flag.x, state.flag.z)
      }
      publish(state, state.phase !== previous.phase || state.outcome !== previous.outcome || state.flag !== previous.flag)
    })
  }, [role, status])

  useEffect(() => {
    if (status !== 'connected' || role !== 'ev') return
    const publish = () => {
      const j = live.jack
      const r = live.rover
      useMultiplayer.getState().publishPose({
        x: j.x, z: j.z, heading: j.heading, speedMs: j.speedMs,
        moving: j.moving, stride: j.stride, sentAt: Date.now(),
        rover: {
          x: r.x,
          z: r.z,
          heading: r.heading,
          speedMs: r.speedMs,
          moving: r.speedMs > 0.05 ? 1 : 0,
        },
      })
    }
    publish()
    const timer = setInterval(publish, 100)
    return () => clearInterval(timer)
  }, [role, status])

  return null
}

function recommendation(command: OpsCommand): { title: string; body: string; tone: string } {
  if (command.kind === 'return') return {
    title: 'HABCOM recommends RETURN',
    body: command.note || 'Terminate the current task block and execute the planned return traverse.',
    tone: 'var(--red)',
  }
  if (command.kind === 'hold') return {
    title: 'HABCOM requests HOLD',
    body: command.note || 'Pause mission time at the next safe breakpoint while HABCOM evaluates telemetry.',
    tone: 'var(--amber)',
  }
  return {
    title: 'HABCOM reports GO',
    body: command.note || 'Current telemetry supports continuing the active task block.',
    tone: 'var(--lime)',
  }
}

export function OpsAdvisory() {
  const role = useMultiplayer((state) => state.role)
  const commands = useMultiplayer((state) => state.commands)
  const procedureBusy = useStore((state) => !!state.proc || !!state.uplink)
  const pending = useMemo(() => commands.find((command) => command.status === 'pending'), [commands])
  if (role !== 'ev' || !pending) return null
  const copy = recommendation(pending)

  const answer = (accepted: boolean) => {
    const s = useStore.getState()
    if (accepted && pending.kind === 'hold' && s.phase === 'surface' && !s.paused) s.togglePause()
    if (accepted && pending.kind === 'return' && s.phase === 'surface' && !s.aborting) s.declareAbort()
    s.pushLog('comms', `HABCOM ${pending.kind.toUpperCase()} recommendation ${accepted ? 'ACCEPTED' : 'DECLINED'}.${pending.note ? ` ${pending.note}` : ''}`)
    useMultiplayer.getState().acknowledgeCommand(pending.id, accepted)
  }

  return (
    <div
      className="panel clipped brackets"
      role="alertdialog"
      aria-label={copy.title}
      style={{
        position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 170,
        width: 'min(92vw, 560px)', borderColor: copy.tone, background: 'rgba(5,9,15,0.96)',
        boxShadow: `0 0 28px ${copy.tone}33`,
      }}
    >
      <div className="panel-body">
        <div className="display" style={{ color: copy.tone, fontSize: 13, marginBottom: 5 }}>{copy.title}</div>
        <p style={{ fontSize: 13 }}>{copy.body}</p>
        <div className="row gap8" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost sm" onClick={() => answer(false)}>Decline</button>
          <button className="btn sm" disabled={procedureBusy} onClick={() => answer(true)}>
            {procedureBusy ? 'Available at procedure breakpoint' : 'Acknowledge & execute'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CrewLinkStatus() {
  const multiplayer = useMultiplayer()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (multiplayer.role !== 'ev') return null

  const send = () => {
    const clean = text.trim()
    if (!clean) return
    multiplayer.sendChat(clean)
    setText('')
  }

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 55, width: open ? 'min(92vw, 360px)' : 'auto' }}>
      {open && (
        <div className="panel clipped brackets" style={{ background: 'rgba(5,9,15,0.96)', marginBottom: 6 }}>
          <div className="panel-head">
            <h3>Local crew link</h3>
            <button className="btn ghost sm" onClick={() => setOpen(false)}>Minimise</button>
          </div>
          <div className="panel-body">
            <div className="row between gap8">
              <span className="label">Mission code</span>
              <span className="display cy" style={{ letterSpacing: '0.18em' }}>{multiplayer.roomCode}</span>
            </div>
            <div className="src" style={{ margin: '4px 0 8px' }}>
              {multiplayer.peerConnected ? 'CREW LINKED' : 'WAITING FOR CREW'}
              {multiplayer.latencyMs != null ? ` · ${multiplayer.latencyMs} ms` : ''}
            </div>
            <div className="scroll" style={{ height: 110, border: '1px solid var(--line-soft)', padding: 6 }}>
              {multiplayer.history.map((line) => (
                <div key={line.id} style={{ fontSize: 12, marginBottom: 5 }}>
                  <span className={line.from === 'ev' ? 'cy mono' : 'am mono'}>{line.from.toUpperCase()}</span> {line.text}
                </div>
              ))}
            </div>
            <div className="row gap6" style={{ marginTop: 7 }}>
              <input
                aria-label="Message crew" value={text} maxLength={240} onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') send() }}
                style={{ flex: 1, minWidth: 0, padding: '6px 8px', background: '#05080d', border: '1px solid var(--line)' }}
              />
              <button className="btn sm" onClick={send}>Send</button>
            </div>
            <button className="btn ghost sm block" style={{ marginTop: 8 }} onClick={multiplayer.leaveMission}>Close multiplayer room</button>
          </div>
        </div>
      )}
      {!open && (
        <button className="btn" onClick={() => setOpen(true)} style={{ background: 'rgba(5,9,15,0.94)' }}>
          CREW {multiplayer.roomCode} · {multiplayer.peerConnected ? 'LINKED' : 'WAITING'}
        </button>
      )}
    </div>
  )
}
