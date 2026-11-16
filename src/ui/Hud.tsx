/**
 * Hud.tsx — What is on screen while you are standing on Mars.
 *
 * ===========================================================================
 *  The screen belongs to the planet.
 *
 *  This HUD used to carry six panels bolted to the corners: clocks and time
 *  compression, the Earth link, life support, environment and radiation, the
 *  return estimate and the map. Every number in them is worth reading, and
 *  all of them at once left a letterbox of Mars in the middle.
 *
 *  So the panels are windows now — opened from the dock, dragged where you
 *  want them, remembered between runs, and closed by default.
 *
 *  Four things still refuse to move, and the reason is the same each time:
 *  you must not have to go looking for them.
 *
 *    1. THE STATUS BAR. The clock, the limiting consumable, the margin and
 *       the range. A survival simulation where you open a panel to discover
 *       you are out of oxygen has taught nobody anything.
 *    2. HAZARD BANNERS. A dust storm or a solar particle event is not
 *       something to find out about by clicking.
 *    3. THE ACTION PROMPT. When there is something to do in reach — a
 *       station, a depot, the airlock — the offer appears where you are
 *       looking.
 *    4. THE GUIDE, THE ROVER AND THE OBJECTIVE. One line each, and each one
 *       answers "what now".
 * ===========================================================================
 */

import { useEffect, useRef } from 'react'
import { missionStatus } from '../mission/objectives'
import Coach from './Coach'
import RoverDock from './RoverDock'
import { useStore } from '../state/store'
import { CACHES, STATIONS } from '../mission/site'
import { GCR_UGY_PER_H } from '../sim/radiation'
import { useHudScale } from './useHudScale'
import HudWindow from './hud/HudWindow'
import HudDock from './hud/HudDock'
import StatusBar from './hud/StatusBar'
import { useWindows, WINDOWS, type WindowId } from './hud/windows'
import {
  ClocksBody, EarthLinkBody, EnvironmentBody, LifeSupportBody, LogBody,
  MapBody, ReturnBody, fmtMin, returnTone,
} from './hud/panels'

const BODIES: Record<WindowId, () => JSX.Element> = {
  clocks: ClocksBody,
  life: LifeSupportBody,
  env: EnvironmentBody,
  return: ReturnBody,
  earth: EarthLinkBody,
  map: MapBody,
  log: LogBody,
}

export default function Hud() {
  const s = useStore()
  const hudScale = useHudScale()
  const open = useWindows((w) => w.open)
  const show = useWindows((w) => w.show)

  const near = s.nearStation ? STATIONS.find((x) => x.id === s.nearStation)! : null
  const cache = s.nearCache ? CACHES.find((c) => c.id === s.nearCache)! : null
  const tone = returnTone(s.ret.status)

  /**
   * The return window opens itself the first time the margin turns critical.
   *
   * Exactly once. A window that keeps reappearing after the player closes it
   * is not helping, it is arguing — and by then they have seen the number and
   * made their decision.
   */
  const poppedReturn = useRef(false)
  useEffect(() => {
    if (poppedReturn.current) return
    if (s.ret.status !== 'critical' && s.ret.marginAfterReserveMinutes >= 0) return
    poppedReturn.current = true
    show('return')
  }, [s.ret.status, s.ret.marginAfterReserveMinutes, show])

  const panelStyle: React.CSSProperties = {
    background: 'rgba(7,11,18,0.82)',
    border: '1px solid var(--line)',
    backdropFilter: 'blur(7px)',
    padding: 9,
    pointerEvents: 'auto',
  }

  return (
    <div className="screen" style={{ pointerEvents: 'none', zIndex: 20, ...hudScale }}>
      <StatusBar />

      {/* ================= HAZARDS: never hidden behind a button ========== */}
      <div
        className="stack gap6"
        style={{ position: 'absolute', top: 62, left: '50%', transform: 'translateX(-50%)', width: 'min(620px, calc(100vw - 24px))' }}
      >
        {s.weather.kind !== 'clear' && (
          <div
            className="clipped"
            style={{
              ...panelStyle,
              borderColor: s.weather.advisesAbort ? 'var(--red)' : 'var(--amber)',
              background: s.weather.advisesAbort ? 'rgba(42,8,10,0.88)' : 'rgba(34,22,6,0.86)',
            }}
          >
            <div className="row between gap8" style={{ marginBottom: 3 }}>
              <span
                className="display"
                style={{ fontSize: 13, color: s.weather.advisesAbort ? 'var(--red)' : 'var(--amber)' }}
              >
                {s.weather.headline}
              </span>
              <span className="mono dim" style={{ fontSize: 10 }}>
                {s.weather.phase.toUpperCase()} &middot; next phase in {s.weather.minutesToNextPhase.toFixed(0)} min
              </span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{s.weather.detail}</div>
            <div className="row gap12 wrap" style={{ marginTop: 5 }}>
              <Readout label="dust opacity" v={s.env.dustOpticalDepth.toFixed(2)} />
              <Readout label="visibility" v={s.weather.visibilityM < 1000 ? `${s.weather.visibilityM.toFixed(0)} m` : `${(s.weather.visibilityM / 1000).toFixed(1)} km`} />
              <Readout label="gust" v={`${s.env.gustMs.toFixed(1)} m/s`} />
              <Readout label="sunlight" v={`${(s.env.solarTransmission * 100).toFixed(0)}%`} />
            </div>
          </div>
        )}

        {s.radiation.sepPhase && (
          <div
            className="clipped"
            style={{
              ...panelStyle,
              borderColor: s.radiation.advisesReturn ? 'var(--magenta)' : 'var(--amber)',
              background: 'rgba(30,8,32,0.88)',
            }}
          >
            <div className="row between gap8" style={{ marginBottom: 3 }}>
              <span className="display" style={{ fontSize: 13, color: 'var(--magenta)' }}>
                &#9762; {s.radiation.headline}
              </span>
              <span className="mono dim" style={{ fontSize: 10 }}>
                {s.radiation.sepPhase === 'alert' ? 'protons in' : 'next phase in'} {s.radiation.minutesToNextPhase.toFixed(0)} min
              </span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{s.radiation.detail}</div>
            <div className="row gap12 wrap" style={{ marginTop: 5 }}>
              <Readout label="dose rate" v={`${(s.radiation.doseRateUSvH / 1000).toFixed(3)} mSv/h`} />
              <Readout label="× background" v={`${(s.radiation.doseRateUGyH / GCR_UGY_PER_H).toFixed(0)}×`} />
              <Readout label="EVA dose" v={`${s.doseMSv.toFixed(2)} mSv`} />
              <Readout label="shielding" v={s.atLander ? 'lander cabin' : s.sheltering ? 'terrain (partial)' : 'suit only'} />
            </div>
          </div>
        )}

        {/* The shelter or abort recommendation, when the model is making one
            and the return window is not already open to show it. */}
        {s.advice && !open.includes('return') && (
          <button
            className={`note ${s.advice.isAbort ? 'danger' : ''} clipped`}
            onClick={() => show('return')}
            style={{
              fontSize: 12, textAlign: 'left', cursor: 'pointer', pointerEvents: 'auto',
              fontFamily: 'inherit', width: '100%',
            }}
          >
            <div
              className="display"
              style={{ fontSize: 10.5, marginBottom: 3, color: s.advice.isAbort ? 'var(--red)' : 'var(--amber)' }}
            >
              {s.advice.isAbort ? 'RECOMMEND ABORT' : `RECOMMEND SHELTER — ${s.advice.shelter.name.toUpperCase()}`}
            </div>
            {s.advice.rationale}
          </button>
        )}
      </div>

      {/* ================= WINDOWS ======================================== */}
      {WINDOWS.filter((w) => open.includes(w.id)).map((w) => {
        const Body = BODIES[w.id]
        const alertTone =
          w.id === 'return' && (tone === 'critical' || tone === 'warning')
            ? (tone === 'critical' ? 'var(--red)' : '#ff8a3d')
            : undefined
        return (
          <HudWindow key={w.id} spec={w} tone={alertTone}>
            <Body />
          </HudWindow>
        )
      })}

      {/* ================= BOTTOM CENTRE: what now ======================== */}
      <div
        style={{
          position: 'absolute', left: 16, right: 16, bottom: 44,
          pointerEvents: 'none', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}
      >
        <div
          className="stack"
          style={{ width: 'min(680px, 100%)', pointerEvents: 'auto', alignItems: 'stretch' }}
        >
          <Coach placement="surface" />
          <RoverDock />
          <ObjectiveStrip />

          {s.atLander && s.time.evaSec > 20 && (
            <div className="clipped" style={{ ...panelStyle, borderColor: 'var(--lime)', marginBottom: 8, animation: 'fadeUp .2s' }}>
              <div className="row between gap8">
                <span className="display li" style={{ fontSize: 11 }}>AT THE LANDER</span>
                <span className="src">
                  {s.samples.length} tube(s) &middot; {Object.values(s.stations).filter((x) => x.choice).length}/3 stations worked
                </span>
              </div>
              <div style={{ fontSize: 13, margin: '3px 0 6px' }}>
                Ladder and airlock in reach. Ending the EVA here banks everything Jack is carrying.
              </div>
              <div className="row gap6 center wrap">
                <button className="btn sm primary" onClick={s.beginIngress}>Ingress &amp; end EVA [Enter]</button>
                <span className="src">or walk back out while the margin holds</span>
              </div>
            </div>
          )}

          {cache && (
            <div className="clipped" style={{ ...panelStyle, borderColor: 'var(--magenta)', marginBottom: 8, animation: 'fadeUp .2s' }}>
              <div className="row between gap8">
                <span className="display" style={{ fontSize: 11, color: 'var(--magenta)' }}>
                  {cache.name.toUpperCase()} IN REACH
                </span>
                <span className="src">{cache.swapMinutes} min to swap</span>
              </div>
              <div style={{ fontSize: 13, margin: '3px 0 6px' }}>{cache.why}</div>
              <div className="row gap6 center wrap">
                <button className="btn sm primary" onClick={s.beginCache}>Swap consumables [R]</button>
                <span className="src">single use &middot; costs {cache.swapMinutes} min of clock</span>
              </div>
            </div>
          )}

          {near && (
            <div className="clipped" style={{ ...panelStyle, borderColor: 'var(--amber)', marginBottom: 8, animation: 'fadeUp .2s' }}>
              <div className="row between gap8">
                <span className="display am" style={{ fontSize: 11 }}>{near.codename} IN REACH</span>
                <span className="src">{near.workMinutes} min of station work</span>
              </div>
              <div style={{ fontSize: 13, margin: '3px 0 6px' }}>{near.tagline}</div>
              <div className="row gap6 center wrap">
                <button className="btn sm primary" onClick={() => s.setUi('science')}>Work the station [F]</button>
                <button className="btn sm" onClick={() => s.setUi('flag')} disabled={s.flagsRemaining <= 0}>
                  Plant flag [G]
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <HudDock />

      {/* Pause veil, which doubles as the in-mission menu */}
      {s.paused && (
        <div
          className="screen center"
          style={{ background: 'rgba(3,5,9,0.72)', pointerEvents: 'auto', backdropFilter: 'blur(3px)', zIndex: 50 }}
        >
          <div className="stack center gap16">
            <div className="display" style={{ fontSize: 'clamp(28px, 4vw, 46px)', letterSpacing: '0.3em', color: 'var(--cyan)' }}>
              PAUSED
            </div>
            <div className="mono dim" style={{ fontSize: 12, textAlign: 'center', maxWidth: 440, lineHeight: 1.6 }}>
              EVA +{fmtMin(s.time.evaSec / 60)} &middot; {Math.hypot(s.jackX, s.jackZ).toFixed(0)} m from the lander
              &middot; {s.ret.marginMinutes.toFixed(0)} min of margin
            </div>
            <div className="row gap8 wrap center">
              <button className="btn primary" onClick={s.togglePause}>Resume [Space]</button>
              <button className="btn" onClick={() => s.setUi('data')}>Data details [K]</button>
              <button className="btn" onClick={() => s.setUi('map')}>Mission map [M]</button>
              <button className="btn danger" onClick={() => { if (confirmRestart()) s.restart() }}>
                Restart mission
              </button>
            </div>
            <div className="src" style={{ maxWidth: 440, textAlign: 'center' }}>
              Restarting throws away this EVA and returns to the title screen.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Two-step confirm, so a misclick does not discard a mission in progress. */
let armedUntil = 0
function confirmRestart(): boolean {
  const now = Date.now()
  if (now < armedUntil) { armedUntil = 0; return true }
  armedUntil = now + 3000
  return false
}

function Readout({ label, v }: { label: string; v: string }) {
  return (
    <div className="stack">
      <span className="label" style={{ fontSize: 8.5 }}>{label}</span>
      <span className="mono" style={{ fontSize: 12 }}>{v}</span>
    </div>
  )
}

/**
 * The always-on objective tracker.
 *
 * A player should never have to wonder what the game wants from them. One
 * line: whether mission success is banked yet, how many objectives are left,
 * and the single next action that moves the mission forward.
 */
function ObjectiveStrip() {
  const s = useStore()
  const m = missionStatus(s)
  const next = m.nextUp
  const critical = m.critical[0]
  const breached = !!critical?.blocked

  return (
    <div
      className="clipped"
      style={{
        background: 'rgba(5,8,13,0.86)',
        border: `1px solid ${breached ? 'rgba(255,77,77,0.6)' : m.successPossible ? 'rgba(125,255,178,0.36)' : 'rgba(255,178,74,0.4)'}`,
        borderLeft: `3px solid ${breached ? 'var(--red)' : m.successPossible ? 'var(--lime)' : 'var(--amber)'}`,
        padding: '6px 11px',
        marginBottom: 8,
        textAlign: 'left',
        pointerEvents: 'auto',
      }}
    >
      <div className="row between gap8 wrap" style={{ alignItems: 'baseline' }}>
        <span
          className="display"
          style={{ fontSize: 10.5, color: breached ? 'var(--red)' : m.successPossible ? 'var(--lime)' : 'var(--amber)' }}
        >
          {breached ? 'RESERVE BREACHED' : m.successPossible ? 'MISSION SUCCESS BANKED' : 'NO PRIMARY OBJECTIVE YET'}
        </span>
        <span className="row gap8" style={{ alignItems: 'center' }}>
          <span className="mono dim" style={{ fontSize: 10 }}>
            {m.primaryDone}/{m.primaryTotal} primary &middot; {m.bonusDone}/{m.bonusTotal} bonus
          </span>
          <button className="btn ghost" style={{ padding: '2px 7px', fontSize: 9 }} onClick={() => s.setUi('objectives')}>
            OBJECTIVES [O]
          </button>
        </span>
      </div>
      {next && (
        <div style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.4 }}>
          <span className="mono cy" style={{ fontSize: 9.5, letterSpacing: '0.14em', marginRight: 7 }}>NEXT</span>
          <span style={{ color: 'var(--text)' }}>{next.title}</span>
          <span className="faint"> &mdash; {next.next}</span>
        </div>
      )}
    </div>
  )
}
