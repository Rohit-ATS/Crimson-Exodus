import { useMemo } from 'react'
import { Chip, Meter } from './components/kit'
import { useStore } from '../state/store'
import { JACK_SUIT, CONSUMABLE_LABEL } from '../sim/consumables'
import { formatHours, seasonName } from '../sim/orbits'
import { formatDelay } from '../sim/comms'
import { CACHES, STATIONS } from '../mission/site'
import LocalMap from './map/LocalMap'
import AudioToggle from './AudioToggle'
import { GCR_UGY_PER_H } from '../sim/radiation'

const fmtMin = (m: number) => {
  if (!isFinite(m)) return '--'
  const s = m < 0 ? '-' : ''
  const a = Math.abs(m)
  return `${s}${Math.floor(a / 60)}:${String(Math.floor(a % 60)).padStart(2, '0')}`
}

export default function Hud() {
  const s = useStore()
  const near = s.nearStation ? STATIONS.find((x) => x.id === s.nearStation)! : null
  const cache = s.nearCache ? CACHES.find((c) => c.id === s.nearCache)! : null
  const undelivered = s.messages.filter((m) => !m.delivered)
  const inbox = s.messages.filter((m) => m.dir === 'uplink' && m.delivered)
  const recentLog = s.log.slice(-4)

  const retTone =
    s.ret.status === 'critical' ? 'critical' :
    s.ret.status === 'warning' ? 'warning' :
    s.ret.status === 'caution' ? 'caution' : 'nominal'

  const stormBanner = s.weather.kind !== 'clear'

  const sunUp = s.clock.sunElevationDeg > 0

  const panelStyle: React.CSSProperties = {
    background: 'rgba(7,11,18,0.78)',
    border: '1px solid var(--line)',
    backdropFilter: 'blur(7px)',
    padding: 9,
    pointerEvents: 'auto',
  }

  return (
    <div className="screen" style={{ pointerEvents: 'none', zIndex: 20 }}>
      {/* ================= TOP BAR ================= */}
      <div
        className="row between gap12 wrap"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 10, alignItems: 'flex-start' }}
      >
        {/* Clocks */}
        <div style={{ ...panelStyle, minWidth: 252 }} className="clipped">
          <div className="row between gap12" style={{ marginBottom: 5 }}>
            <span className="label">EVA elapsed</span>
            <span className="mono am" style={{ fontSize: 17, lineHeight: 1 }}>
              {fmtMin(s.time.evaSec / 60)}
            </span>
          </div>
          <div className="row between gap12">
            <span className="label">Local true solar time</span>
            <span className="mono" style={{ fontSize: 12 }}>{formatHours(s.clock.ltstHours)}</span>
          </div>
          <div className="row between gap12">
            <span className="label">Sol / Ls</span>
            <span className="mono dim" style={{ fontSize: 11 }}>
              {s.clock.siteSol} &middot; {s.clock.solarLongitudeDeg.toFixed(1)}&deg; {seasonName(s.clock.solarLongitudeDeg).split(' ')[1]}
            </span>
          </div>
          <div className="row between gap12">
            <span className="label">Sun</span>
            <span className="mono dim" style={{ fontSize: 11 }}>
              {sunUp ? `${s.clock.sunElevationDeg.toFixed(0)}° alt / ${s.clock.sunAzimuthDeg.toFixed(0)}° az` : 'below horizon'}
            </span>
          </div>
          <hr className="rule" style={{ margin: '7px 0' }} />
          <div className="row between gap6" style={{ alignItems: 'center' }}>
            <span className="label">Time compression</span>
            <div className="row gap4">
              {[1, 10, 30].map((t) => (
                <button
                  key={t}
                  className={`btn sm ${s.timeScale === t ? 'on' : 'ghost'}`}
                  style={{ padding: '2px 6px', fontSize: 9 }}
                  onClick={() => s.setTimeScale(t)}
                >
                  {t}&times;
                </button>
              ))}
              <button
                className={`btn sm ${s.paused ? 'on' : 'ghost'}`}
                style={{ padding: '2px 6px', fontSize: 9 }}
                onClick={s.togglePause}
              >
                {s.paused ? 'RESUME' : 'PAUSE'}
              </button>
              <AudioToggle />
            </div>
          </div>
        </div>

        {/* Weather banner */}
        {stormBanner && (
          <div
            className="clipped"
            style={{
              ...panelStyle,
              flex: '1 1 340px',
              maxWidth: 560,
              borderColor: s.weather.advisesAbort ? 'var(--red)' : 'var(--amber)',
              background: s.weather.advisesAbort ? 'rgba(42,8,10,0.86)' : 'rgba(34,22,6,0.84)',
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
              <Readout label="visibility" v={`${s.weather.visibilityM < 1000 ? s.weather.visibilityM.toFixed(0) + ' m' : (s.weather.visibilityM / 1000).toFixed(1) + ' km'}`} />
              <Readout label="gust" v={`${s.env.gustMs.toFixed(1)} m/s`} />
              <Readout label="sunlight" v={`${(s.env.solarTransmission * 100).toFixed(0)}%`} />
            </div>
          </div>
        )}

        {/* Solar particle event banner */}
        {s.radiation.sepPhase && (
          <div
            className="clipped"
            style={{
              ...panelStyle,
              flex: '1 1 300px',
              maxWidth: 460,
              borderColor: s.radiation.advisesReturn ? 'var(--magenta)' : 'var(--amber)',
              background: 'rgba(30,8,32,0.86)',
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

        {/* Earth link */}
        <div style={{ ...panelStyle, minWidth: 212 }} className="clipped">
          <div className="row between gap8" style={{ marginBottom: 4 }}>
            <span className="display cy" style={{ fontSize: 10.5 }}>EARTH LINK</span>
            {s.link.nearConjunction
              ? <Chip tone="critical">conjunction</Chip>
              : <Chip tone="nominal">locked</Chip>}
          </div>
          <div className="row between"><span className="label">One-way</span><span className="mono" style={{ fontSize: 12 }}>{formatDelay(s.link.owltSec)}</span></div>
          <div className="row between"><span className="label">Round trip</span><span className="mono" style={{ fontSize: 12 }}>{formatDelay(s.link.rttSec)}</span></div>
          <div className="row between"><span className="label">Distance</span><span className="mono dim" style={{ fontSize: 11 }}>{(s.link.distanceKm / 1e6).toFixed(2)} M km</span></div>
          <button
            className="btn sm block"
            style={{ marginTop: 6, fontSize: 9 }}
            onClick={() => s.setUi('comms')}
          >
            Comms feed [T]
            {undelivered.length > 0 && <span className="am"> &middot; {undelivered.length} in flight</span>}
            {inbox.length > 0 && <span className="li"> &middot; {inbox.length} received</span>}
          </button>
        </div>
      </div>

      {/* ================= LEFT: consumables ================= */}
      <div
        className="stack gap8 clipped"
        style={{ ...panelStyle, position: 'absolute', left: 10, top: 186, width: 252 }}
      >
        <div className="row between gap8">
          <span className="display cy" style={{ fontSize: 10.5 }}>LIFE SUPPORT</span>
          <Chip tone={retTone}>{s.frac.limiting.toUpperCase()} LIMITS</Chip>
        </div>

        {([
          ['o2', 'O₂', `${s.cons.o2Kg.toFixed(3)} kg`, `${s.rates.o2KgPerHour.toFixed(3)} kg/h`],
          ['scrubber', 'CO₂ SCRUBBER', `${((1 - s.frac.scrubber) * JACK_SUIT.scrubberKg).toFixed(3)} kg used`, `${s.rates.co2KgPerHour.toFixed(3)} kg/h`],
          ['battery', 'BATTERY', `${s.cons.batteryWh.toFixed(0)} Wh`, `${s.rates.electricalW.toFixed(0)} W`],
          ['water', 'FEEDWATER', `${s.cons.waterKg.toFixed(2)} kg`, `${s.rates.waterKgPerHour.toFixed(2)} kg/h`],
        ] as const).map(([k, label, amount, rate]) => (
          <div key={k}>
            <div className="row between" style={{ marginBottom: 2 }}>
              <span className="label" style={{ color: s.frac.limiting === k ? 'var(--amber)' : undefined }}>{label}</span>
              <span className="mono" style={{ fontSize: 11 }}>{(s.frac[k] * 100).toFixed(0)}%</span>
            </div>
            <Meter value={s.frac[k]} reserve={JACK_SUIT.reserveFraction} height={7} />
            <div className="row between">
              <span className="src">{amount}</span>
              <span className="src">{rate}</span>
            </div>
          </div>
        ))}

        <hr className="rule" style={{ margin: '2px 0' }} />
        <div className="row between"><span className="label">Metabolic</span><span className="mono" style={{ fontSize: 11 }}>{s.rates.metabolicW.toFixed(0)} W</span></div>
        <div className="row between"><span className="label">Suit heater</span><span className="mono" style={{ fontSize: 11, color: s.rates.heaterW > 60 ? 'var(--amber)' : undefined }}>{s.rates.heaterW.toFixed(0)} W</span></div>
        <div className="row between"><span className="label">Dust fouling</span><span className="mono" style={{ fontSize: 11, color: s.cons.dustFouling > 0.4 ? 'var(--amber)' : undefined }}>{(s.cons.dustFouling * 100).toFixed(0)}%</span></div>
      </div>

      {/* ================= RIGHT: environment ================= */}
      <div
        className="stack gap4 clipped"
        style={{ ...panelStyle, position: 'absolute', right: 10, top: 186, width: 226 }}
      >
        <div className="row between gap8" style={{ marginBottom: 2 }}>
          <span className="display cy" style={{ fontSize: 10.5 }}>ENVIRONMENT</span>
          <span className="tag model" style={{ fontSize: 8 }}>MODEL</span>
        </div>
        {([
          ['Pressure', `${s.env.pressurePa.toFixed(0)} Pa`],
          ['Air temp', `${s.env.airTempC.toFixed(0)} °C`],
          ['Ground temp', `${s.env.groundTempC.toFixed(0)} °C`],
          ['Density', `${s.env.densityKgM3.toFixed(4)} kg/m³`],
          ['Wind / gust', `${s.env.windMs.toFixed(1)} / ${s.env.gustMs.toFixed(1)} m/s`],
          ['Wind from', `${s.env.windFromDeg.toFixed(0)}°`],
          ['Dust opacity', s.env.dustOpticalDepth.toFixed(2)],
          ['Direct sun', `${s.env.directIrradiance.toFixed(0)} W/m²`],
          ['Visibility', s.weather.visibilityM < 1000 ? `${s.weather.visibilityM.toFixed(0)} m` : `${(s.weather.visibilityM / 1000).toFixed(1)} km`],
          ['Gust ≈ Earth', `${s.env.windEarthEquivMs.toFixed(1)} m/s`],
        ] as const).map(([k, v]) => (
          <div className="row between gap8" key={k}>
            <span className="label">{k}</span>
            <span className="mono" style={{ fontSize: 11 }}>{v}</span>
          </div>
        ))}
        <div className="src" style={{ marginTop: 4, lineHeight: 1.4 }}>
          That last row is why a Mars storm cannot blow you over.
        </div>
        <hr className="rule" style={{ margin: '5px 0 3px' }} />
        <div className="row between gap8" style={{ marginBottom: 2 }}>
          <span className="display cy" style={{ fontSize: 10.5 }}>RADIATION</span>
          <span className="tag real" style={{ fontSize: 8 }}>CURIOSITY RAD</span>
        </div>
        {([
          ['Dose rate', `${s.radiation.doseRateUSvH.toFixed(s.radiation.doseRateUSvH < 100 ? 1 : 0)} µSv/h`, s.radiation.sepShare > 0.5],
          ['EVA dose', `${s.doseMSv.toFixed(3)} mSv`, false],
          ['Source', s.radiation.sepPhase ? 'GCR + solar protons' : 'cosmic-ray background', s.radiation.sepPhase !== null],
        ] as const).map(([k, v, hot]) => (
          <div className="row between gap8" key={k}>
            <span className="label">{k}</span>
            <span className="mono" style={{ fontSize: 11, color: hot ? 'var(--magenta)' : undefined }}>{v}</span>
          </div>
        ))}
      </div>

      {/* ================= BOTTOM LEFT: return estimate ================= */}
      <div
        className="stack gap6 clipped"
        style={{
          ...panelStyle,
          position: 'absolute', left: 10, bottom: 10, width: 300,
          borderColor: retTone === 'critical' ? 'var(--red)' : retTone === 'warning' ? '#ff8a3d' : 'var(--line)',
        }}
      >
        <div className="row between gap8">
          <span className="display cy" style={{ fontSize: 10.5 }}>RETURN ESTIMATE</span>
          <Chip tone={retTone}>{s.ret.status}</Chip>
        </div>

        <div className="row gap12" style={{ alignItems: 'flex-end' }}>
          <div className="stack">
            <span className="label">margin</span>
            <span
              className="mono"
              style={{ fontSize: 24, lineHeight: 1, color: retTone === 'critical' ? 'var(--red)' : retTone === 'nominal' ? 'var(--lime)' : 'var(--amber)' }}
            >
              {fmtMin(s.ret.marginMinutes)}
            </span>
          </div>
          <div className="stack grow">
            <div className="row between"><span className="label">walk home</span><span className="mono" style={{ fontSize: 11 }}>{fmtMin(s.ret.walkMinutes)}</span></div>
            <div className="row between"><span className="label">endurance</span><span className="mono" style={{ fontSize: 11 }}>{fmtMin(s.ret.enduranceMinutes)}</span></div>
            <div className="row between"><span className="label">after reserve</span><span className="mono" style={{ fontSize: 11, color: s.ret.marginAfterReserveMinutes < 0 ? 'var(--red)' : undefined }}>{fmtMin(s.ret.marginAfterReserveMinutes)}</span></div>
            <div className="row between"><span className="label">range</span><span className="mono dim" style={{ fontSize: 11 }}>{Math.hypot(s.jackX, s.jackZ).toFixed(0)} m</span></div>
          </div>
        </div>

        <Meter
          value={Math.max(0, Math.min(1, s.ret.marginMinutes / Math.max(20, s.ret.enduranceMinutes)))}
          reserve={JACK_SUIT.reserveFraction}
          height={9}
          tone={retTone === 'critical' ? 'var(--red)' : retTone === 'nominal' ? 'var(--lime)' : 'var(--amber)'}
        />
        <div className="src">
          {CONSUMABLE_LABEL[s.ret.limiting]} runs out first on the way home.
          {s.aborting ? ' Direct line to the lander.' : ' Along the planned route.'}
        </div>

        {s.advice && (
          <div
            className={`note ${s.advice.isAbort ? 'danger' : ''}`}
            style={{ fontSize: 12, marginTop: 2 }}
          >
            <div className="display" style={{ fontSize: 10.5, marginBottom: 3, color: s.advice.isAbort ? 'var(--red)' : 'var(--amber)' }}>
              {s.advice.isAbort ? 'RECOMMEND ABORT' : `RECOMMEND SHELTER — ${s.advice.shelter.name.toUpperCase()}`}
            </div>
            {s.advice.rationale}
          </div>
        )}

        <div className="row gap6 wrap" style={{ marginTop: 2 }}>
          <button
            className={`btn sm ${s.aborting ? 'on' : 'danger'}`}
            onClick={s.declareAbort}
            disabled={s.aborting}
          >
            {s.aborting ? 'ABORTING' : 'DECLARE ABORT'}
          </button>
          <button
            className={`btn sm ${s.sheltering ? 'on' : 'ghost'}`}
            onClick={() => s.setSheltering(!s.sheltering)}
          >
            {s.sheltering ? 'SHELTERING' : 'SHELTER IN PLACE'}
          </button>
          <button
            className={`btn sm ${s.autoTraverse ? 'on' : 'ghost'}`}
            onClick={s.toggleAutoTraverse}
          >
            AUTO-TRAVERSE
          </button>
        </div>
      </div>

      {/* ================= BOTTOM CENTRE: action prompt ================= */}
      <div
        style={{
          position: 'absolute', left: 322, right: 322, bottom: 12,
          pointerEvents: 'auto', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        }}
      >
        {/* Rolling log, in the same column so nothing overlaps */}
        <div className="stack gap4" style={{ marginBottom: 8, pointerEvents: 'none' }}>
          {recentLog.map((l, i) => (
            <div
              key={`${l.evaSec}-${i}`}
              style={{
                background: 'rgba(5,8,13,0.78)',
                borderLeft: `2px solid ${
                  l.kind === 'danger' ? 'var(--red)' :
                  l.kind === 'warning' ? 'var(--amber)' :
                  l.kind === 'science' ? 'var(--lime)' :
                  l.kind === 'comms' ? 'var(--cyan)' :
                  l.kind === 'decision' ? 'var(--magenta)' : 'var(--faint)'
                }`,
                padding: '4px 9px',
                fontSize: 11.5,
                lineHeight: 1.4,
                textAlign: 'left',
                opacity: 0.5 + (i / Math.max(1, recentLog.length - 1)) * 0.5,
              }}
            >
              <span className="mono faint" style={{ marginRight: 6 }}>T+{fmtMin(l.evaSec / 60)}</span>
              {l.text.length > 180 ? l.text.slice(0, 180) + '\u2026' : l.text}
            </div>
          ))}
        </div>

        {s.atLander && s.time.evaSec > 20 && (
          <div
            className="clipped"
            style={{ ...panelStyle, borderColor: 'var(--lime)', marginBottom: 8, animation: 'fadeUp .2s' }}
          >
            <div className="row between gap8">
              <span className="display li" style={{ fontSize: 11 }}>AT THE LANDER</span>
              <span className="src">
                {s.samples.length} tube(s) &middot; {Object.values(s.stations).filter((x) => x.choice).length}/3 stations worked
              </span>
            </div>
            <div style={{ fontSize: 13, margin: '3px 0 6px' }}>
              Ladder and airlock in reach. Ending the EVA here banks everything Jack is
              carrying.
            </div>
            <div className="row gap6 center wrap">
              <button className="btn sm primary" onClick={s.ingress}>
                Ingress &amp; end EVA [Enter]
              </button>
              <span className="src">or walk back out while the margin holds</span>
            </div>
          </div>
        )}

        {cache && (
          <div
            className="clipped"
            style={{ ...panelStyle, borderColor: 'var(--magenta)', marginBottom: 8, animation: 'fadeUp .2s' }}
          >
            <div className="row between gap8">
              <span className="display" style={{ fontSize: 11, color: 'var(--magenta)' }}>
                {cache.name.toUpperCase()} IN REACH
              </span>
              <span className="src">{cache.swapMinutes} min to swap</span>
            </div>
            <div style={{ fontSize: 13, margin: '3px 0 6px' }}>{cache.why}</div>
            <div className="row gap6 center wrap">
              <button className="btn sm primary" onClick={s.useCache}>Swap consumables [R]</button>
              <span className="src">single use &middot; costs {cache.swapMinutes} min of clock</span>
            </div>
          </div>
        )}

        {near && (
          <div
            className="clipped"
            style={{ ...panelStyle, borderColor: 'var(--amber)', marginBottom: 8, animation: 'fadeUp .2s' }}
          >
            <div className="row between gap8">
              <span className="display am" style={{ fontSize: 11 }}>{near.codename} IN REACH</span>
              <span className="src">{near.workMinutes} min of station work</span>
            </div>
            <div style={{ fontSize: 13, margin: '3px 0 6px' }}>{near.tagline}</div>
            <div className="row gap6 center wrap">
              <button className="btn sm primary" onClick={() => s.setUi('science')}>
                Work the station [F]
              </button>
              <button className="btn sm" onClick={() => s.setUi('flag')} disabled={s.flagsRemaining <= 0}>
                Plant flag [G]
              </button>
            </div>
          </div>
        )}

        <div className="row center gap6 wrap">
          <Key k="WASD" v="walk" />
          <Key k="Q/E" v="camera" />
          <Key k="V" v="view" />
          <Key k="C" v="photo" />
          <Key k="B" v="backpack" />
          <Key k="M" v="map" />
          <Key k="H" v="hazard" />
          <Key k="T" v="comms" />
          <Key k="K" v="data" />
        </div>

        <div className="row center gap8" style={{ marginTop: 6 }}>
          <span className="mono dim" style={{ fontSize: 11 }}>
            {s.activity.toUpperCase()} &middot; {s.speedMs.toFixed(2)} m/s &middot; {(s.timeScale)}&times; time
          </span>
        </div>
      </div>

      {/* ================= BOTTOM RIGHT: minimap ================= */}
      <div
        className="clipped"
        style={{ ...panelStyle, position: 'absolute', right: 10, bottom: 10, padding: 7 }}
      >
        <div className="row between gap8" style={{ marginBottom: 5 }}>
          <span className="display cy" style={{ fontSize: 10 }}>
            {s.hazardOverlay ? 'HAZARD CUE' : 'TRAVERSE'}
          </span>
          <div className="row gap4">
            <button
              className={`btn sm ${s.hazardOverlay ? 'on' : 'ghost'}`}
              style={{ padding: '2px 6px', fontSize: 8.5 }}
              onClick={s.toggleHazardOverlay}
            >
              HAZARD [H]
            </button>
            <button
              className="btn sm ghost"
              style={{ padding: '2px 6px', fontSize: 8.5 }}
              onClick={() => s.setUi('map')}
            >
              FULL [M]
            </button>
          </div>
        </div>
        <MiniMap />
        {s.hazardOverlay && (
          <div className="src" style={{ marginTop: 4, maxWidth: 196, lineHeight: 1.4 }}>
            Planning cue only. Nothing at orbital resolution certifies a footpath.
          </div>
        )}
      </div>

      {/* Pause veil, which doubles as the in-mission menu */}
      {s.paused && (
        <div
          className="screen center"
          style={{ background: 'rgba(3,5,9,0.72)', pointerEvents: 'auto', backdropFilter: 'blur(3px)' }}
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
              <button
                className="btn danger"
                onClick={() => {
                  if (confirmRestart()) s.restart()
                }}
              >
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
  armedUntil = now + 4000
  useStore.getState().pushLog('warning', 'Restart armed. Click Restart mission again within four seconds to discard this EVA.')
  return false
}

function Key({ k, v }: { k: string; v: string }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        padding: '2px 6px',
        border: '1px solid var(--line)',
        background: 'rgba(5,8,13,0.6)',
        color: 'var(--muted)',
      }}
    >
      <span className="cy">{k}</span> {v}
    </span>
  )
}

function Readout({ label, v }: { label: string; v: string }) {
  return (
    <span className="stack">
      <span className="label">{label}</span>
      <span className="mono" style={{ fontSize: 12 }}>{v}</span>
    </span>
  )
}

function MiniMap() {
  const routeId = useStore((s) => s.routeId)
  const jackX = useStore((s) => s.jackX)
  const jackZ = useStore((s) => s.jackZ)
  const heading = useStore((s) => s.jackHeading)
  const weather = useStore((s) => s.weather)
  const stormFromDeg = useStore((s) => s.stormFromDeg)
  const clock = useStore((s) => s.clock)
  const hazardOverlay = useStore((s) => s.hazardOverlay)
  const stations = useStore((s) => s.stations)
  const flag = useStore((s) => s.flag)
  const cachesUsed = useStore((s) => s.cachesUsed)

  const visited = useMemo(
    () => Object.fromEntries(Object.entries(stations).map(([k, v]) => [k, !!v.choice])),
    [stations],
  )

  return (
    <LocalMap
      compact
      size={200}
      layer={hazardOverlay ? 'hazard' : 'relief'}
      routeId={routeId}
      jack={{ x: jackX, z: jackZ, heading }}
      weather={weather}
      stormFromDeg={stormFromDeg}
      sunAzDeg={clock.sunAzimuthDeg}
      sunElDeg={clock.sunElevationDeg}
      visitedStations={visited}
      flag={flag}
      cachesUsed={cachesUsed}
    />
  )
}
