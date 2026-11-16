/**
 * panels.tsx — The contents of the HUD windows.
 *
 * These are the panels that used to be bolted to the four corners of the
 * screen. Nothing about what they show has changed; they are just no longer
 * all visible at once. Each one subscribes narrowly to the store so that an
 * open window costs a re-render only when its own numbers move.
 */

import { useMemo } from 'react'
import { Chip, Meter } from '../components/kit'
import { useStore } from '../../state/store'
import { CONSUMABLE_LABEL, JACK_SUIT } from '../../sim/consumables'
import { formatHours, seasonName } from '../../sim/orbits'
import { formatDelay } from '../../sim/comms'
import LocalMap from '../map/LocalMap'
import AudioToggle from '../AudioToggle'

export const fmtMin = (m: number): string => {
  if (!isFinite(m)) return '--'
  const s = m < 0 ? '-' : ''
  const a = Math.abs(m)
  return `${s}${Math.floor(a / 60)}:${String(Math.floor(a % 60)).padStart(2, '0')}`
}

export function returnTone(status: string): string {
  return status === 'critical' ? 'critical'
    : status === 'warning' ? 'warning'
      : status === 'caution' ? 'caution' : 'nominal'
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="row between gap8">
      <span className="label">{k}</span>
      <span className="mono" style={{ fontSize: 11, color }}>{v}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function LifeSupportBody() {
  const s = useStore()
  return (
    <div className="stack gap8">
      <div className="row between gap8">
        <span className="label">Limiting item</span>
        <Chip tone={returnTone(s.ret.status)}>{s.frac.limiting.toUpperCase()}</Chip>
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
      <Row k="Metabolic" v={`${s.rates.metabolicW.toFixed(0)} W`} />
      <Row k="Suit heater" v={`${s.rates.heaterW.toFixed(0)} W`} color={s.rates.heaterW > 60 ? 'var(--amber)' : undefined} />
      <Row k="Dust fouling" v={`${(s.cons.dustFouling * 100).toFixed(0)}%`} color={s.cons.dustFouling > 0.4 ? 'var(--amber)' : undefined} />
    </div>
  )
}

// ---------------------------------------------------------------------------

export function EnvironmentBody() {
  const s = useStore()
  return (
    <div className="stack gap4">
      <div className="row between gap8" style={{ marginBottom: 2 }}>
        <span className="label">Modelled conditions</span>
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
      ] as const).map(([k, v]) => <Row key={k} k={k} v={v} />)}
      <div className="src" style={{ marginTop: 4, lineHeight: 1.4 }}>
        That last row is why a Mars storm cannot blow you over.
      </div>

      <hr className="rule" style={{ margin: '5px 0 3px' }} />
      <div className="row between gap8" style={{ marginBottom: 2 }}>
        <span className="label">Radiation</span>
        <span className="tag real" style={{ fontSize: 8 }}>CURIOSITY RAD</span>
      </div>
      <Row
        k="Dose rate"
        v={`${s.radiation.doseRateUSvH.toFixed(s.radiation.doseRateUSvH < 100 ? 1 : 0)} µSv/h`}
        color={s.radiation.sepShare > 0.5 ? 'var(--magenta)' : undefined}
      />
      <Row k="EVA dose" v={`${s.doseMSv.toFixed(3)} mSv`} />
      <Row
        k="Source"
        v={s.radiation.sepPhase ? 'GCR + solar protons' : 'cosmic-ray background'}
        color={s.radiation.sepPhase ? 'var(--magenta)' : undefined}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ReturnBody() {
  const s = useStore()
  const tone = returnTone(s.ret.status)
  const color = tone === 'critical' ? 'var(--red)' : tone === 'nominal' ? 'var(--lime)' : 'var(--amber)'

  return (
    <div className="stack gap6">
      <div className="row between gap8">
        <span className="label">Status</span>
        <Chip tone={tone}>{s.ret.status}</Chip>
      </div>

      <div className="row gap12" style={{ alignItems: 'flex-end' }}>
        <div className="stack">
          <span className="label">margin</span>
          <span className="mono" style={{ fontSize: 24, lineHeight: 1, color }}>
            {fmtMin(s.ret.marginMinutes)}
          </span>
        </div>
        <div className="stack grow">
          <Row k="walk home" v={fmtMin(s.ret.walkMinutes)} />
          <Row k="endurance" v={fmtMin(s.ret.enduranceMinutes)} />
          <Row
            k="after reserve"
            v={fmtMin(s.ret.marginAfterReserveMinutes)}
            color={s.ret.marginAfterReserveMinutes < 0 ? 'var(--red)' : undefined}
          />
          <Row k="range" v={`${Math.hypot(s.jackX, s.jackZ).toFixed(0)} m`} />
        </div>
      </div>

      <Meter
        value={Math.max(0, Math.min(1, s.ret.marginMinutes / Math.max(20, s.ret.enduranceMinutes)))}
        reserve={JACK_SUIT.reserveFraction}
        height={9}
        tone={color}
      />
      <div className="src">
        {CONSUMABLE_LABEL[s.ret.limiting]} runs out first on the way home.
        {s.aborting ? ' Direct line to the lander.' : ' Along the planned route.'}
      </div>

      {s.advice && (
        <div className={`note ${s.advice.isAbort ? 'danger' : ''}`} style={{ fontSize: 12, marginTop: 2 }}>
          <div
            className="display"
            style={{ fontSize: 10.5, marginBottom: 3, color: s.advice.isAbort ? 'var(--red)' : 'var(--amber)' }}
          >
            {s.advice.isAbort ? 'RECOMMEND ABORT' : `RECOMMEND SHELTER — ${s.advice.shelter.name.toUpperCase()}`}
          </div>
          {s.advice.rationale}
        </div>
      )}

      <div className="row gap6 wrap" style={{ marginTop: 2 }}>
        <button className={`btn sm ${s.aborting ? 'on' : 'danger'}`} onClick={s.declareAbort} disabled={s.aborting}>
          {s.aborting ? 'ABORTING' : 'DECLARE ABORT'}
        </button>
        <button
          className={`btn sm ${s.sheltering ? 'on' : 'ghost'}`}
          onClick={() => (s.sheltering ? s.setSheltering(false) : s.beginShelter())}
        >
          {s.sheltering ? 'SHELTERING' : 'SHELTER IN PLACE'}
        </button>
        <button className={`btn sm ${s.autoTraverse ? 'on' : 'ghost'}`} onClick={s.toggleAutoTraverse}>
          AUTO-TRAVERSE
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function EarthLinkBody() {
  const s = useStore()
  const undelivered = s.messages.filter((m) => !m.delivered)
  const inbox = s.messages.filter((m) => m.dir === 'uplink' && m.delivered)
  return (
    <div className="stack gap4">
      <div className="row between gap8" style={{ marginBottom: 2 }}>
        <span className="label">Link</span>
        {s.link.nearConjunction ? <Chip tone="critical">conjunction</Chip> : <Chip tone="nominal">locked</Chip>}
      </div>
      <Row k="One-way" v={formatDelay(s.link.owltSec)} />
      <Row k="Round trip" v={formatDelay(s.link.rttSec)} />
      <Row k="Distance" v={`${(s.link.distanceKm / 1e6).toFixed(2)} M km`} />
      <div className="src" style={{ marginTop: 4, lineHeight: 1.45 }}>
        Nobody on Earth can help with the next ten minutes. That is the whole reason
        the decision authority out here is you.
      </div>
      <button className="btn sm block" style={{ marginTop: 6, fontSize: 9 }} onClick={() => s.setUi('comms')}>
        Comms feed [T]
        {undelivered.length > 0 && <span className="am"> &middot; {undelivered.length} in flight</span>}
        {inbox.length > 0 && <span className="li"> &middot; {inbox.length} received</span>}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ClocksBody() {
  const s = useStore()
  const sunUp = s.clock.sunElevationDeg > 0
  return (
    <div className="stack gap4">
      <div className="row between gap12" style={{ marginBottom: 3 }}>
        <span className="label">EVA elapsed</span>
        <span className="mono am" style={{ fontSize: 17, lineHeight: 1 }}>{fmtMin(s.time.evaSec / 60)}</span>
      </div>
      <Row k="Local true solar time" v={formatHours(s.clock.ltstHours)} />
      <Row
        k="Sol / Ls"
        v={`${s.clock.siteSol} · ${s.clock.solarLongitudeDeg.toFixed(1)}° ${seasonName(s.clock.solarLongitudeDeg).split(' ')[1]}`}
      />
      <Row
        k="Sun"
        v={sunUp ? `${s.clock.sunElevationDeg.toFixed(0)}° alt / ${s.clock.sunAzimuthDeg.toFixed(0)}° az` : 'below horizon'}
      />
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
          <AudioToggle />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function MapBody() {
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
  const setUi = useStore((s) => s.setUi)
  const toggleHazard = useStore((s) => s.toggleHazardOverlay)

  const visited = useMemo(
    () => Object.fromEntries(Object.entries(stations).map(([k, v]) => [k, !!v.choice])),
    [stations],
  )

  return (
    <div className="stack gap6">
      <div className="row between gap4">
        <button
          className={`btn sm ${hazardOverlay ? 'on' : 'ghost'}`}
          style={{ padding: '2px 6px', fontSize: 8.5 }}
          onClick={toggleHazard}
        >
          HAZARD [H]
        </button>
        <button
          className="btn sm ghost"
          style={{ padding: '2px 6px', fontSize: 8.5 }}
          onClick={() => setUi('map')}
        >
          FULL [M]
        </button>
      </div>
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
      {hazardOverlay && (
        <div className="src" style={{ lineHeight: 1.4 }}>
          Planning cue only. Nothing at orbital resolution certifies a footpath.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function LogBody() {
  const log = useStore((s) => s.log)
  const recent = log.slice(-40).reverse()
  return (
    <div className="stack gap4">
      {recent.length === 0 && <span className="src">Nothing logged yet.</span>}
      {recent.map((l, i) => (
        <div
          key={`${l.evaSec}-${i}`}
          style={{
            borderLeft: `2px solid ${
              l.kind === 'danger' ? 'var(--red)'
                : l.kind === 'warning' ? 'var(--amber)'
                  : l.kind === 'science' ? 'var(--lime)'
                    : l.kind === 'comms' ? 'var(--cyan)'
                      : l.kind === 'decision' ? 'var(--magenta)' : 'var(--faint)'
            }`,
            padding: '3px 8px',
            fontSize: 11.5,
            lineHeight: 1.45,
          }}
        >
          <span className="mono faint" style={{ marginRight: 6 }}>T+{fmtMin(l.evaSec / 60)}</span>
          {l.text}
        </div>
      ))}
    </div>
  )
}
