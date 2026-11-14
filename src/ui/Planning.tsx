import { useEffect, useMemo, useState } from 'react'
import { Chip, KV, Meter, Panel, Tag } from './components/kit'
import LocalMap from './map/LocalMap'
import ElevationProfile from './map/ElevationProfile'
import RegionalMap, { TREK_PRODUCTS, type LoadState, type TrekProductId } from './map/RegionalMap'
import { LAYERS, type LayerId } from './map/layers'
import { useStore } from '../state/store'
import { ROUTES, STATIONS } from '../mission/site'
import { samplePath, pathStats } from '../mission/path'
import { forecastRoute } from '../mission/forecast'
import { JACK_SUIT } from '../sim/consumables'
import { environment } from '../sim/mars'
import { solarIrradiance, sunTimes } from '../sim/orbits'
import { SITE } from '../mission/site'
import { openDataPanel } from './dataPanelBus'

export default function Planning() {
  const routeId = useStore((s) => s.routeId)
  const selectRoute = useStore((s) => s.selectRoute)
  const plannedStations = useStore((s) => s.plannedStations)
  const beginEva = useStore((s) => s.beginEva)
  const setPhase = useStore((s) => s.setPhase)
  const clock = useStore((s) => s.clock)
  const link = useStore((s) => s.link)
  const evaStartLtst = useStore((s) => s.evaStartLtst)
  const setEvaStart = useStore((s) => s.setEvaStart)

  const [layer, setLayer] = useState<LayerId>('relief')
  const [product, setProduct] = useState<TrekProductId>('viking')
  const [trekState, setTrekState] = useState<LoadState>('loading')
  const [hover, setHover] = useState<{ x: number; z: number; h: number; slope: number; rough: number } | null>(null)
  const [mapSize, setMapSize] = useState(560)

  useEffect(() => {
    const fit = () => setMapSize(Math.max(330, Math.min(620, window.innerHeight - 320)))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // The forecast is run for the PLANNED start time, not for the current instant.
  const startEnv = useMemo(() => {
    const el = sunElevationAt(clock.solarLongitudeDeg, SITE.latDeg, evaStartLtst)
    return environment({
      ls: clock.solarLongitudeDeg,
      ltst: evaStartLtst,
      elevationM: SITE.elevationM,
      toaIrradiance: solarIrradiance(link.marsSunAu),
      sunElevationDeg: el,
      solTime: clock.msd,
    })
  }, [clock.solarLongitudeDeg, clock.msd, evaStartLtst, link.marsSunAu])

  const sun = useMemo(() => sunTimes(clock.solarLongitudeDeg, SITE.latDeg), [clock.solarLongitudeDeg])

  // Light the traverse map with the sun as it will be at step-out.
  const planSun = useMemo(
    () => sunAt(clock.solarLongitudeDeg, SITE.latDeg, evaStartLtst),
    [clock.solarLongitudeDeg, evaStartLtst],
  )

  const forecasts = useMemo(() => {
    const envIn = { airTempC: startEnv.airTempC, irradiance: startEnv.directIrradiance }
    return Object.fromEntries(
      ROUTES.map((r) => {
        const p = samplePath(r.waypoints)
        return [r.id, { path: p, stats: pathStats(p), fc: forecastRoute(p, r.stations, envIn) }]
      }),
    )
  }, [startEnv.airTempC, startEnv.directIrradiance])

  const current = forecasts[routeId]
  const route = ROUTES.find((r) => r.id === routeId)!
  const layerMeta = LAYERS.find((l) => l.id === layer)!
  const productMeta = TREK_PRODUCTS.find((p) => p.id === product)!

  return (
    <div className="screen stack scanlines" style={{ background: 'var(--bg-0)' }}>
      {/* Header */}
      <div className="row between gap12 wrap" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line-soft)' }}>
        <div className="row gap16 wrap" style={{ alignItems: 'baseline' }}>
          <span className="display cy" style={{ fontSize: 15, letterSpacing: '0.26em' }}>TRAVERSE PLANNER</span>
          <span className="label">Phase 2 of 3 &middot; choose the route, then live with it</span>
        </div>
        <div className="row gap8 wrap">
          <Chip tone="info">Ls {clock.solarLongitudeDeg.toFixed(0)}&deg;</Chip>
          <Chip tone="info">LTST {clock.ltstHours.toFixed(2)} h</Chip>
          <Chip tone="info">Sun now {clock.sunElevationDeg.toFixed(0)}&deg;</Chip>
          <Chip tone={planSun.elDeg > 15 ? 'nominal' : 'caution'}>
            Sun at step-out {planSun.elDeg.toFixed(0)}&deg;
          </Chip>
          <button className="btn ghost sm" onClick={() => openDataPanel.open()}>Data details [K]</button>
          <button className="btn ghost sm" onClick={() => setPhase('briefing')}>&larr; Briefing</button>
        </div>
      </div>

      <div className="row grow" style={{ gap: 12, padding: 12, overflow: 'hidden', alignItems: 'stretch' }}>
        {/* ---- Left: route choices ------------------------------------- */}
        <div className="stack gap12 scroll" style={{ width: 352, flex: '0 0 352px' }}>
          <Panel title="EVA window">
            <div className="row between gap8" style={{ alignItems: 'baseline', marginBottom: 6 }}>
              <span className="label">Step out at local solar time</span>
              <span className="mono am" style={{ fontSize: 17 }}>
                {Math.floor(evaStartLtst)}:{String(Math.round((evaStartLtst % 1) * 60)).padStart(2, '0')}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={23.5}
              step={0.5}
              value={evaStartLtst}
              onChange={(e) => setEvaStart(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--amber)' }}
            />
            <div className="row between" style={{ marginTop: 2 }}>
              <span className="src">00:00</span>
              <span className="src">12:00</span>
              <span className="src">24:00</span>
            </div>

            <div style={{ position: 'relative', height: 26, marginTop: 8, border: '1px solid var(--line-soft)' }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${(sun.sunriseLtst / 24) * 100}%`,
                width: `${(sun.daylightHours / 24) * 100}%`,
                background: 'linear-gradient(90deg, rgba(255,178,74,0.25), rgba(255,210,150,0.4), rgba(255,178,74,0.25))',
              }} />
              <div style={{
                position: 'absolute', top: -3, bottom: -3,
                left: `${(evaStartLtst / 24) * 100}%`, width: 2, background: 'var(--cyan)',
              }} />
              <div style={{
                position: 'absolute', top: -3, bottom: -3,
                left: `${(((evaStartLtst + forecasts[routeId].fc.totalMinutes / 60 / 1.0275) % 24) / 24) * 100}%`,
                width: 2, background: 'var(--lime)',
              }} />
            </div>
            <div className="row between" style={{ marginTop: 3 }}>
              <span className="src">sunrise {sun.sunriseLtst.toFixed(2)} h</span>
              <span className="src">sunset {sun.sunsetLtst.toFixed(2)} h</span>
            </div>

            <hr className="rule" />
            <KV rows={[
              ['Sun at step-out', `${sunElevationAt(clock.solarLongitudeDeg, SITE.latDeg, evaStartLtst).toFixed(0)}\u00b0`],
              ['Sun at planned return', `${sunElevationAt(clock.solarLongitudeDeg, SITE.latDeg, (evaStartLtst + forecasts[routeId].fc.totalMinutes / 60 / 1.0275) % 24).toFixed(0)}\u00b0`],
              ['Air temp at step-out', `${startEnv.airTempC.toFixed(0)} \u00b0C`],
              ['Direct sun at step-out', `${startEnv.directIrradiance.toFixed(0)} W/m\u00b2`],
              ['Daylight remaining', `${Math.max(0, (sun.sunsetLtst - evaStartLtst)).toFixed(1)} h`],
            ]} />
            <div className="src" style={{ marginTop: 5 }}>
              Real EVAs are scheduled in daylight. Before sunrise the suit heaters alone drain
              the battery in about an hour; after sunset there is no solar gain at all. The
              Mars date, season, sun path and Earth light time are the real current ones — what
              you are choosing is the hour of the sol to step out, exactly as a flight plan does.
            </div>
          </Panel>

          <Panel title="Route options" pad={false}>
            <div className="stack">
              {ROUTES.map((r) => {
                const f = forecasts[r.id]
                const sel = r.id === routeId
                return (
                  <button
                    key={r.id}
                    onClick={() => selectRoute(r.id)}
                    style={{
                      textAlign: 'left',
                      background: sel ? 'rgba(79,232,255,0.1)' : 'transparent',
                      border: 0,
                      borderLeft: `3px solid ${sel ? 'var(--cyan)' : 'transparent'}`,
                      borderBottom: '1px solid var(--line-soft)',
                      padding: '10px 12px',
                      display: 'block',
                      width: '100%',
                    }}
                  >
                    <div className="row between gap8">
                      <span className="mono" style={{ fontSize: 11, color: sel ? 'var(--cyan)' : 'var(--muted)' }}>
                        {r.codename}
                      </span>
                      <Chip tone={r.hazard === 'low' ? 'nominal' : r.hazard === 'moderate' ? 'caution' : 'warning'}>
                        {r.hazard} hazard
                      </Chip>
                    </div>
                    <div className="display" style={{ fontSize: 14, color: sel ? '#fff' : 'var(--text)', margin: '3px 0 5px' }}>
                      {r.name}
                    </div>
                    <div className="row gap12 wrap" style={{ fontSize: 11 }}>
                      <span className="mono dim">{(f.stats.lengthM / 1000).toFixed(2)} km</span>
                      <span className="mono dim">+{f.stats.ascentM.toFixed(0)} m</span>
                      <span className="mono dim">{f.fc.totalMinutes.toFixed(0)} min</span>
                      <span className="mono dim">{r.stations.length} stations</span>
                    </div>
                    <div className="row gap6" style={{ marginTop: 6, alignItems: 'center' }}>
                      <span className="label" style={{ width: 52 }}>margin</span>
                      <div style={{ flex: 1 }}>
                        <Meter
                          value={Math.max(0, Math.min(1, f.fc.worstMarginMinutes / 90))}
                          height={6}
                          tone={f.fc.worstMarginMinutes < 18 ? 'var(--red)' : f.fc.worstMarginMinutes < 35 ? 'var(--amber)' : 'var(--lime)'}
                        />
                      </div>
                      <span className="mono" style={{ fontSize: 11, width: 46, textAlign: 'right' }}>
                        {f.fc.worstMarginMinutes.toFixed(0)}m
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel title={`${route.codename} — the trade`}>
            <p style={{ fontSize: 13.5 }}>{route.pitch}</p>
            <div className="label" style={{ marginTop: 8 }}>In favour</div>
            <ul style={{ fontSize: 12.5 }}>{route.pros.map((p) => <li key={p} className="li">{p}</li>)}</ul>
            <div className="label">Against</div>
            <ul style={{ fontSize: 12.5 }}>{route.cons.map((p) => <li key={p} style={{ color: '#f0b9a8' }}>{p}</li>)}</ul>
          </Panel>

          <Panel title="Stations on this route">
            <div className="stack gap8">
              {STATIONS.map((st) => {
                const on = route.stations.includes(st.id)
                return (
                  <div key={st.id} style={{ opacity: on ? 1 : 0.42, borderLeft: `2px solid ${on ? 'var(--amber)' : 'var(--faint)'}`, paddingLeft: 8 }}>
                    <div className="row between gap8">
                      <span className="mono" style={{ fontSize: 11, color: on ? 'var(--amber)' : 'var(--faint)' }}>
                        {st.codename}
                      </span>
                      <span className="src">{on ? `${st.workMinutes} min` : 'not on route'}</span>
                    </div>
                    <div style={{ fontSize: 12.5 }}>{st.tagline}</div>
                  </div>
                )
              })}
            </div>
            {route.stations.length < 3 && (
              <div className="note" style={{ marginTop: 9, fontSize: 12.5 }}>
                This route skips {3 - route.stations.length} station(s). That is a legitimate
                plan, not a failure: the science question can be partly answered, and the crew
                comes home. Only Route A answers all three objectives, and it costs the most.
              </div>
            )}
          </Panel>
        </div>

        {/* ---- Centre: the maps ---------------------------------------- */}
        <div className="stack gap12 grow" style={{ minWidth: 0 }}>
          <Panel
            pad={false}
            title="Traverse map — synthetic height field"
            right={
              <div className="row gap4 wrap">
                {LAYERS.map((l) => (
                  <button
                    key={l.id}
                    className={`btn sm ${layer === l.id ? 'on' : 'ghost'}`}
                    style={{ padding: '4px 8px', fontSize: 9 }}
                    onClick={() => setLayer(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            }
          >
            <div className="row gap12 wrap" style={{ padding: 10, alignItems: 'flex-start' }}>
              <div style={{ position: 'relative' }}>
                <LocalMap
                  layer={layer}
                  routeId={routeId}
                  showAllRoutes
                  sunAzDeg={planSun.azDeg}
                  sunElDeg={planSun.elDeg}
                  size={mapSize}
                  onHover={setHover}
                />
                <div
                  className="mono"
                  style={{
                    position: 'absolute', left: 8, bottom: 8,
                    background: 'rgba(4,7,12,0.82)', border: '1px solid var(--line)',
                    padding: '5px 8px', fontSize: 10.5, lineHeight: 1.5, minWidth: 186,
                  }}
                >
                  {hover ? (
                    <>
                      <div className="cy">{hover.x.toFixed(0)} E &nbsp; {hover.z.toFixed(0)} N &nbsp;(m, local)</div>
                      <div>elev <span className="am">{hover.h >= 0 ? '+' : ''}{hover.h.toFixed(1)} m</span> above pad</div>
                      <div>slope <span className={hover.slope > 20 ? 'rd' : hover.slope > 12 ? 'am' : 'li'}>{hover.slope.toFixed(1)}&deg;</span></div>
                      <div>roughness <span className="dim">{hover.rough.toFixed(2)}</span></div>
                    </>
                  ) : (
                    <span className="faint">move the cursor over the map</span>
                  )}
                </div>
              </div>

              <div className="stack gap8 grow" style={{ minWidth: 250 }}>
                <div className="panel" style={{ padding: 10 }}>
                  <div className="row between gap8" style={{ marginBottom: 4 }}>
                    <span className="display cy" style={{ fontSize: 11 }}>{layerMeta.name}</span>
                    <Tag kind="synth" />
                  </div>
                  <div className="src" style={{ marginBottom: 6 }}>real-world analogue: {layerMeta.analogue}</div>
                  <p style={{ fontSize: 12.5 }}>{layerMeta.reads}</p>
                  <div className="note danger" style={{ fontSize: 12 }}>{layerMeta.limit}</div>
                </div>

                <div className="panel" style={{ padding: 10 }}>
                  <div className="label" style={{ marginBottom: 6 }}>Route geometry</div>
                  <KV rows={[
                    ['Path length', `${current.stats.lengthM.toFixed(0)} m`],
                    ['Ground distance', `${current.stats.groundM.toFixed(0)} m`],
                    ['Total ascent', `${current.stats.ascentM.toFixed(0)} m`],
                    ['Total descent', `${current.stats.descentM.toFixed(0)} m`],
                    ['Steepest grade', `${current.stats.maxGradePct.toFixed(0)}%`],
                    ['Mean pace', `${current.stats.meanSpeedMs.toFixed(2)} m/s`],
                    ['Furthest from lander', `${current.stats.maxRangeM.toFixed(0)} m`],
                  ]} />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Elevation profile" pad={false}>
            <div style={{ padding: 8 }}>
              <ProfileAuto path={current.path} />
            </div>
          </Panel>
        </div>

        {/* ---- Right: NASA data and the budget ------------------------- */}
        <div className="stack gap12 scroll" style={{ width: 374, flex: '0 0 374px' }}>
          <Panel
            title="NASA orbital context"
            right={
              <Chip tone={trekState === 'ok' ? 'nominal' : trekState === 'offline' ? 'critical' : 'caution'}>
                {trekState === 'ok' ? 'live tiles' : trekState === 'partial' ? 'partial' : trekState === 'offline' ? 'offline' : 'loading'}
              </Chip>
            }
          >
            <div className="row gap4 wrap" style={{ marginBottom: 8 }}>
              {TREK_PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  className={`btn sm ${product === p.id ? 'on' : 'ghost'}`}
                  style={{ padding: '4px 8px', fontSize: 9 }}
                  onClick={() => setProduct(p.id)}
                >
                  {p.id === 'viking' ? 'Viking imagery' : p.id === 'mola' ? 'MOLA relief' : 'MOLA/HRSC'}
                </button>
              ))}
            </div>
            <div className="center row" style={{ marginBottom: 22 }}>
              <RegionalMap productId={product} size={330} onState={setTrekState} />
            </div>
            <div className="src" style={{ marginBottom: 6 }}>
              {productMeta.instrument} &middot; {productMeta.resolution} &middot; {productMeta.date}
            </div>
            <p style={{ fontSize: 12.5 }}>{productMeta.reads}</p>
            <div className="note danger" style={{ fontSize: 12.5 }}>
              Look at the orange box. That is the whole traverse at true scale on the best
              global basemap this app can fetch &mdash; a few pixels across. Orbital data gives you
              the crater, the delta and the regional elevation. It cannot tell you where to put
              your feet. That is why the traverse map beside it is labelled synthetic instead
              of pretending to be a NASA product.
            </div>
            <div className="src" style={{ marginTop: 6 }}>
              Tiles: <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer">NASA Mars Trek</a> &middot; <Tag kind="real" />
            </div>
          </Panel>

          <Panel title="Consumables forecast" right={<Tag kind="game" />}>
            <KV rows={[
              ['Walking', `${current.fc.walkMinutes.toFixed(0)} min`],
              ['Station work', `${current.fc.workMinutes.toFixed(0)} min`],
              ['Total EVA', `${current.fc.totalMinutes.toFixed(0)} min`],
              ['Metabolic energy', `${(current.fc.metabolicKJ / 1000).toFixed(1)} MJ`],
              ['Limiting consumable', current.fc.limiting.toUpperCase()],
              ['Worst margin', `${current.fc.worstMarginMinutes.toFixed(0)} min`],
              ['Spare on arrival', `${current.fc.spareMinutes.toFixed(0)} min`],
            ]} />

            <div className="stack gap6" style={{ marginTop: 10 }}>
              {([
                ['O₂', current.fc.endFractions.o2],
                ['CO₂ scrubber', current.fc.endFractions.scrubber],
                ['Battery', current.fc.endFractions.battery],
                ['Feedwater', current.fc.endFractions.water],
              ] as const).map(([k, v]) => (
                <div key={k}>
                  <div className="row between" style={{ marginBottom: 2 }}>
                    <span className="label">{k} at the hatch</span>
                    <span className="mono" style={{ fontSize: 11 }}>{(v * 100).toFixed(0)}%</span>
                  </div>
                  <Meter value={v} reserve={JACK_SUIT.reserveFraction} height={7} />
                </div>
              ))}
            </div>
            <div className="src" style={{ marginTop: 6 }}>
              The dashed band is the mandated {(JACK_SUIT.reserveFraction * 100).toFixed(0)}% reserve.
              Finishing inside it is a flight rule violation.
            </div>

            <div
              className={`note ${current.fc.feasible ? (current.fc.keepsReserve ? 'info' : '') : 'danger'}`}
              style={{ marginTop: 10, fontSize: 13 }}
            >
              {current.fc.verdict}
            </div>
            <div className="src" style={{ marginTop: 6 }}>
              Forecast assumes clear weather for the whole EVA. It will be wrong the moment a
              dust event starts, which is the point.
            </div>
          </Panel>
        </div>
      </div>

      {/* Footer */}
      <div className="row between gap12 wrap" style={{ padding: '12px 18px', borderTop: '1px solid var(--line-soft)' }}>
        <div className="row gap12 wrap" style={{ alignItems: 'center' }}>
          <span className="label">Committed plan</span>
          <span className="mono cy" style={{ fontSize: 13 }}>
            {route.codename} &middot; {route.name} &middot; {(current.stats.lengthM / 1000).toFixed(2)} km &middot;{' '}
            {plannedStations.length} stations &middot; {current.fc.totalMinutes.toFixed(0)} min
          </span>
        </div>
        <div className="row gap8 wrap">
          <button className="btn ghost" onClick={() => beginEva(true)} title="Guarantees a regional dust storm, for demos and judging">
            Demo run (storm guaranteed)
          </button>
          <button className="btn primary" style={{ padding: '12px 26px' }} onClick={() => beginEva(false)}>
            Depressurise &amp; step out &nbsp;&rarr;
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Sun position at a given local true solar time, for the planning readouts and
 * for lighting the map's hillshade. The planner must shade the terrain the way
 * it will look WHEN JACK STEPS OUT, not at the current real instant on Mars —
 * which is frequently the middle of the night and renders the map unreadable.
 */
function sunAt(lsDeg: number, latDeg: number, ltst: number): { elDeg: number; azDeg: number } {
  const D = Math.PI / 180
  const dec = Math.asin(Math.sin(25.19 * D) * Math.sin(lsDeg * D))
  const H = (ltst - 12) * 15 * D
  const lat = latDeg * D
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)))
  const y = -Math.cos(dec) * Math.sin(H)
  const x = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H)
  const az = ((Math.atan2(y, x) / D) % 360 + 360) % 360
  return { elDeg: el / D, azDeg: az }
}

function sunElevationAt(lsDeg: number, latDeg: number, ltst: number): number {
  return sunAt(lsDeg, latDeg, ltst).elDeg
}

function ProfileAuto({ path }: { path: ReturnType<typeof samplePath> }) {
  const [w, setW] = useState(600)
  const ref = (el: HTMLDivElement | null) => {
    if (el && Math.abs(el.clientWidth - w) > 4) setW(el.clientWidth)
  }
  useEffect(() => {
    const on = () => setW((v) => v) // trigger re-measure on resize
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <ElevationProfile path={path} width={w} height={150} />
    </div>
  )
}
