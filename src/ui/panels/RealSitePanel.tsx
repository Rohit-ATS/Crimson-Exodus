import { useMemo, useState } from 'react'
import { Chip, Modal, Tag } from '../components/kit'
import RealSiteMap, { type HoverInfo, type RealBase, type RealOverlay, type TileState } from '../map/RealSiteMap'
import {
  CONTEXT_MINERAL_MAP, CRISM_CAR, REAL_FEATURES, ROVER_IMAGES, TREK_JEZERO,
  elevAt, groundDistM, lonLatToGrid, slopeDegAt, type Dtm,
} from '../../data/realSite'
import { slopeLegend } from '../map/layers'
import { walkSpeed } from '../../mission/terrain'
import RoverImageCard from './RoverImageCard'

interface RouteStats {
  lengthM: number
  ascentM: number
  descentM: number
  maxSlopeDeg: number
  steepShare: number
  walkMin: number
  profile: Array<[number, number]>
}

/** Walk the route over the real DTM at its native 4 m spacing. */
function analyse(d: Dtm, route: Array<[number, number]>): RouteStats | null {
  if (route.length < 2) return null
  let lengthM = 0, ascentM = 0, descentM = 0, maxSlopeDeg = 0, steepM = 0, walkSec = 0
  const profile: Array<[number, number]> = []
  let prevZ: number | null = null
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i]
    const seg = groundDistM(a, b)
    const n = Math.max(1, Math.ceil(seg / 4))
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n
      const lon = a[0] + (b[0] - a[0]) * t, lat = a[1] + (b[1] - a[1]) * t
      const [gx, gy] = lonLatToGrid(d, lon, lat)
      const z = elevAt(d, gx, gy)
      const s = slopeDegAt(d, Math.min(d.meta.width - 1, Math.max(0, Math.floor(gx))), Math.min(d.meta.height - 1, Math.max(0, Math.floor(gy))))
      const ds = k === 0 ? 0 : seg / n
      if (prevZ !== null && ds > 0) {
        const dz = z - prevZ
        if (dz > 0) ascentM += dz; else descentM -= dz
        walkSec += ds / walkSpeed(0.92, dz / ds, 1.0)
        if (s > 15) steepM += ds
      }
      maxSlopeDeg = Math.max(maxSlopeDeg, s)
      lengthM += ds
      profile.push([lengthM, z])
      prevZ = z
    }
  }
  return { lengthM, ascentM, descentM, maxSlopeDeg, steepShare: steepM / Math.max(1, lengthM), walkMin: walkSec / 60, profile }
}

function Profile({ pts, width, height }: { pts: Array<[number, number]>; width: number; height: number }) {
  if (pts.length < 2) return null
  const L = pts[pts.length - 1][0]
  let lo = Infinity, hi = -Infinity
  for (const [, z] of pts) { lo = Math.min(lo, z); hi = Math.max(hi, z) }
  const pad = Math.max(5, (hi - lo) * 0.12)
  lo -= pad; hi += pad
  const X = (s: number) => 34 + (s / L) * (width - 40)
  const Y = (z: number) => 6 + (1 - (z - lo) / (hi - lo)) * (height - 24)
  const step = Math.max(1, Math.floor(pts.length / 400))
  const line = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(([s, z]) => `${X(s).toFixed(1)},${Y(z).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} style={{ display: 'block' }} role="img" aria-label="Elevation profile along the planned route">
      <polygon points={`${X(0)},${Y(lo)} ${line} ${X(L)},${Y(lo)}`} fill="rgba(110,215,255,0.14)" />
      <polyline points={line} fill="none" stroke="#6ed7ff" strokeWidth={1.6} />
      <text x={2} y={Y(hi - pad) + 4} fontSize={9} fill="var(--muted)" fontFamily="var(--mono)">{(hi - pad).toFixed(0)}</text>
      <text x={2} y={Y(lo + pad) + 4} fontSize={9} fill="var(--muted)" fontFamily="var(--mono)">{(lo + pad).toFixed(0)}</text>
      <text x={X(L) - 40} y={height - 3} fontSize={9} fill="var(--muted)" fontFamily="var(--mono)">{(L / 1000).toFixed(2)} km</text>
      <text x={34} y={height - 3} fontSize={9} fill="var(--muted)" fontFamily="var(--mono)">elev m (areoid)</text>
    </svg>
  )
}

/**
 * The science loop: lander, Séítah, the east foot of Kodiak (220 m east of the
 * summit, ~5° ground, picked from the DTM: you work a butte from its base, you
 * do not walk over it), Hogwallow Flats, and home.
 */
const PRESET: Array<[number, number]> = (['landing', 'seitah', 'kodiak-foot', 'hogwallow', 'landing'] as const).map((id) => {
  if (id === 'kodiak-foot') return [77.41197, 18.44025]
  const f = REAL_FEATURES.find((x) => x.id === id)!
  return [f.lon, f.lat]
})

const OVERLAYS: Array<[RealOverlay, string]> = [
  ['none', 'None'], ['shade', 'Hillshade (DTM)'], ['elev', 'Elevation (DTM)'], ['slope', 'Slope (DTM)'], ['crism', 'CRISM carbonate'],
]

export default function RealSitePanel({ onClose }: { onClose: () => void }) {
  const [base, setBase] = useState<RealBase>('hirise')
  const [overlay, setOverlay] = useState<RealOverlay>('slope')
  const [alpha, setAlpha] = useState(0.55)
  const [showTraverse, setShowTraverse] = useState(true)
  const [route, setRoute] = useState<Array<[number, number]>>(() => [...PRESET])
  const [selected, setSelected] = useState<string | null>('kodiak')
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [dtm, setDtm] = useState<Dtm | null>(null)
  const [tiles, setTiles] = useState<TileState>('loading')

  const stats = useMemo(() => (dtm ? analyse(dtm, route) : null), [dtm, route])
  const feature = REAL_FEATURES.find((f) => f.id === selected) ?? null
  const featureImages = feature?.stationId ? ROVER_IMAGES[feature.stationId] ?? [] : []
  const featureElev = useMemo(() => {
    if (!dtm || !feature) return null
    const [gx, gy] = lonLatToGrid(dtm, feature.lon, feature.lat)
    return elevAt(dtm, gx, gy)
  }, [dtm, feature])
  const baseMeta = TREK_JEZERO.find((l) => l.id === base)

  return (
    <Modal title="Real site — NASA data at traverse scale" onClose={onClose} width={1260}>
      <div className="row gap6 wrap" style={{ marginBottom: 8, alignItems: 'center' }}>
        <span className="label">Imagery</span>
        {TREK_JEZERO.map((l) => (
          <button key={l.id} className={`btn sm ${base === l.id ? 'on' : 'ghost'}`} onClick={() => setBase(l.id)}>
            {l.id === 'hirise' ? 'HiRISE 25 cm' : 'CTX 6 m'}
          </button>
        ))}
        <button className={`btn sm ${base === 'none' ? 'on' : 'ghost'}`} onClick={() => setBase('none')}>None</button>
        <span className="label" style={{ marginLeft: 10 }}>Layer</span>
        {OVERLAYS.map(([id, name]) => (
          <button key={id} className={`btn sm ${overlay === id ? 'on' : 'ghost'}`} onClick={() => setOverlay(id)}>{name}</button>
        ))}
        <label className="row gap4 src" style={{ alignItems: 'center', marginLeft: 6 }}>
          opacity
          <input type="range" min={0.1} max={1} step={0.05} value={alpha} onChange={(e) => setAlpha(+e.target.value)} />
        </label>
        <div className="grow" />
        <Chip tone={tiles === 'ok' ? 'nominal' : tiles === 'offline' ? 'critical' : 'caution'}>
          {base === 'none' ? 'no imagery' : tiles === 'ok' ? 'live Trek tiles' : tiles === 'offline' ? 'imagery offline' : tiles === 'partial' ? 'partial imagery' : 'loading imagery'}
        </Chip>
      </div>

      <div style={{ display: 'grid', gap: 12, alignItems: 'start', gridTemplateColumns: 'minmax(0, 780px) minmax(300px, 1fr)' }}>
        <div className="stack gap6">
          <RealSiteMap
            width={780}
            base={base}
            overlay={overlay}
            overlayAlpha={alpha}
            showTraverse={showTraverse}
            route={route}
            selected={selected}
            onSelect={setSelected}
            onAddPoint={(pt) => setRoute((r) => [...r, pt])}
            onHover={setHover}
            onDtm={setDtm}
            onTiles={setTiles}
          />
          <div className="row between gap8 wrap">
            <span className="mono" style={{ fontSize: 11.5 }}>
              {hover
                ? `${hover.lat.toFixed(5)}°N ${hover.lon.toFixed(5)}°E · ${hover.elevM.toFixed(1)} m · slope ${hover.slopeDeg.toFixed(1)}°`
                : 'Hover for real elevation and slope. Click the map to add a waypoint; click a pin to inspect it.'}
            </span>
            <div className="row gap6">
              <label className="row gap4 src" style={{ alignItems: 'center' }}>
                <input type="checkbox" checked={showTraverse} onChange={(e) => setShowTraverse(e.target.checked)} />
                Perseverance traverse
              </label>
              <button className="btn sm ghost" onClick={() => setRoute((r) => r.slice(0, -1))} disabled={!route.length}>Undo</button>
              <button className="btn sm ghost" onClick={() => setRoute([])}>Clear</button>
              <button className="btn sm ghost" onClick={() => setRoute([...PRESET])}>Science loop</button>
            </div>
          </div>
          <div className="src" style={{ lineHeight: 1.5 }}>
            {baseMeta && <>Imagery: {baseMeta.name}, {baseMeta.resolution}. {baseMeta.credit}, via <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer">NASA Mars Trek</a>. </>}
            Elevation: USGS Mars 2020 TRN HiRISE DTM, 1 m/post, averaged to 4 m (Fergason et al. 2020, <a href="https://doi.org/10.5066/P9REJ9JN" target="_blank" rel="noreferrer">doi:10.5066/P9REJ9JN</a>).
            Dashed white: Perseverance's localized waypoints, sols 13&ndash;714 (NASA/JPL-Caltech).
          </div>
        </div>

        <div className="stack gap10 scroll" style={{ minWidth: 0, maxHeight: '72vh' }}>
          <div className="panel" style={{ padding: 10 }}>
            <div className="row between gap8" style={{ marginBottom: 6 }}>
              <span className="display cy" style={{ fontSize: 11 }}>ROUTE ON REAL TERRAIN</span>
              <Tag kind="real" />
            </div>
            {stats ? (
              <>
                {([
                  ['Length (ground)', `${(stats.lengthM / 1000).toFixed(2)} km`],
                  ['Ascent / descent', `+${stats.ascentM.toFixed(0)} / −${stats.descentM.toFixed(0)} m`],
                  ['Steepest ground crossed', `${stats.maxSlopeDeg.toFixed(0)}°`],
                  ['Route over 15° slope', `${(stats.steepShare * 100).toFixed(0)}%`],
                  ['Walking time (suit model)', `${Math.floor(stats.walkMin / 60)} h ${String(Math.round(stats.walkMin % 60)).padStart(2, '0')} min`],
                ] as const).map(([k, v]) => (
                  <div className="row between gap8" key={k}>
                    <span className="label">{k}</span>
                    <span className="mono" style={{ fontSize: 11.5, color: k.startsWith('Steep') && stats.maxSlopeDeg > 22 ? 'var(--amber)' : undefined }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 6 }}><Profile pts={stats.profile} width={330} height={110} /></div>
                <div className="src" style={{ marginTop: 4 }}>
                  Terrain numbers are measured (HiRISE DTM). Walking time uses the game&apos;s suit
                  speed model (Tobler-style slope penalty), which is a game mechanic.
                </div>
              </>
            ) : (
              <div className="src">Click at least two points on the map, or load the science loop.</div>
            )}
          </div>

          {feature && (
            <div className="panel" style={{ padding: 10 }}>
              <div className="row between gap8" style={{ marginBottom: 4 }}>
                <span className="display am" style={{ fontSize: 11 }}>{feature.name.toUpperCase()}</span>
                <button className="btn sm ghost" onClick={() => setRoute((r) => [...r, [feature.lon, feature.lat]])}>+ route</button>
              </div>
              <div className="src">
                {feature.lat.toFixed(4)}°N {feature.lon.toFixed(4)}°E{featureElev !== null ? ` · ${featureElev.toFixed(0)} m` : ''}
              </div>
              <p style={{ fontSize: 12.5, margin: '4px 0' }}>{feature.what}</p>
              <div className="src" style={{ marginBottom: 6 }}>Position: {feature.locatedBy}</div>
              {featureImages.map((im) => <RoverImageCard key={im.id} image={im} />)}
            </div>
          )}

          <div className="panel" style={{ padding: 10 }}>
            <div className="display cy" style={{ fontSize: 11, marginBottom: 6 }}>LAYER</div>
            {overlay === 'slope' && (
              <>
                <div className="row gap6 wrap" style={{ marginBottom: 5 }}>
                  {slopeLegend().map(([label, c]) => (
                    <span key={label} className="row gap4" style={{ alignItems: 'center' }}>
                      <span style={{ width: 13, height: 9, background: c, display: 'inline-block' }} />
                      <span className="src">{label}</span>
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 12.5 }}>Slope computed from the real HiRISE DTM at 4 m spacing. It resolves scarps, butte flanks and ripple fields; it does not resolve individual boulders. Read it together with the 25 cm imagery, which does.</p>
              </>
            )}
            {overlay === 'elev' && <p style={{ fontSize: 12.5 }}>Elevation from the HiRISE DTM, relative to the MOLA areoid. The floor sits near −2570 m; the Kodiak summit and the delta top reach about −2475 m and −2455 m.</p>}
            {overlay === 'shade' && <p style={{ fontSize: 12.5 }}>Hillshade of the HiRISE DTM, lit from the north-west. Shading is not slope: switch to the slope layer before committing a route.</p>}
            {overlay === 'crism' && (
              <>
                <p style={{ fontSize: 12.5 }}>
                  CRISM {CRISM_CAR.product}, observation {CRISM_CAR.observation} ({CRISM_CAR.date}), about 18 m/pixel, placed with the projection in its PDS label.
                  Inside this window the carbonate signal is weak. The strongest carbonate signal in this observation sits roughly 8 km north-west, toward the delta and the western crater rim.
                </p>
                <div className="src" style={{ marginBottom: 6 }}>{CRISM_CAR.legend}</div>
                <div className="src">{CRISM_CAR.credit} &middot; <a href={CRISM_CAR.pdsUrl} target="_blank" rel="noreferrer">PDS product</a></div>
                <div style={{ marginTop: 8 }}><RoverImageCard image={CONTEXT_MINERAL_MAP} /></div>
              </>
            )}
            {overlay === 'none' && <p style={{ fontSize: 12.5 }}>Imagery only.</p>}
          </div>

          <div className="note" style={{ fontSize: 12 }}>
            This is the data a crew would actually plan on, and it is still not a certification
            that a boot can go on a given square metre. The 3D walk in this app uses a synthetic
            terrain shaped to this site; this panel is the real ground it is modelled on.
          </div>
        </div>
      </div>
    </Modal>
  )
}
