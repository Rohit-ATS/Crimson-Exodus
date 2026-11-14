import { useMemo, useState } from 'react'
import { Chip, Modal, Tag } from '../components/kit'
import LocalMap from '../map/LocalMap'
import ElevationProfile from '../map/ElevationProfile'
import { LAYERS, slopeLegend, type LayerId } from '../map/layers'
import { useStore } from '../../state/store'
import { SHELTERS } from '../../mission/site'
import { protectionAt } from '../../sim/hazard'

export default function MapPanel() {
  const s = useStore()
  const [layer, setLayer] = useState<LayerId>(s.hazardOverlay ? 'hazard' : 'relief')
  const meta = LAYERS.find((l) => l.id === layer)!

  const visited = useMemo(
    () => Object.fromEntries(Object.entries(s.stations).map(([k, v]) => [k, !!v.choice])),
    [s.stations],
  )

  const shelters = useMemo(
    () =>
      SHELTERS.map((sh) => {
        const d = Math.hypot(s.jackX - sh.x, s.jackZ - sh.z)
        const p = protectionAt(sh.x, sh.z, s.stormFromDeg).protection
        return { ...sh, dist: d, prot: Math.max(p, sh.effectiveness * 0.9), mins: d / 0.75 / 60 }
      }).sort((a, b) => a.dist - b.dist),
    [s.jackX, s.jackZ, s.stormFromDeg],
  )

  return (
    <Modal title="Mission map" onClose={() => s.setUi(null)} width={1180}>
      <div className="row gap6 wrap" style={{ marginBottom: 10 }}>
        {LAYERS.map((l) => (
          <button key={l.id} className={`btn sm ${layer === l.id ? 'on' : 'ghost'}`} onClick={() => setLayer(l.id)}>
            {l.name}
          </button>
        ))}
        <div className="grow" />
        <Chip tone={s.weather.kind === 'clear' ? 'nominal' : s.weather.advisesAbort ? 'critical' : 'caution'}>
          {s.weather.headline}
        </Chip>
      </div>

      {/* An explicit grid rather than a wrapping flex row: the map has a fixed
          pixel size, and letting flex decide whether the sidebar fits beside it
          made the layout flip to stacked at widths where it clearly did fit. */}
      <div
        style={{
          display: 'grid',
          gap: 12,
          alignItems: 'start',
          gridTemplateColumns: 'minmax(0, 560px) minmax(280px, 1fr)',
        }}
      >
        <LocalMap
          layer={layer}
          routeId={s.routeId}
          jack={{ x: s.jackX, z: s.jackZ, heading: s.jackHeading }}
          weather={s.weather}
          stormFromDeg={s.stormFromDeg}
          sunAzDeg={s.clock.sunAzimuthDeg}
          sunElDeg={s.clock.sunElevationDeg}
          size={560}
          visitedStations={visited}
          flag={s.flag}
          cachesUsed={s.cachesUsed}
        />

        <div className="stack gap10" style={{ minWidth: 0 }}>
          <div className="panel" style={{ padding: 10 }}>
            <div className="row between gap8" style={{ marginBottom: 4 }}>
              <span className="display cy" style={{ fontSize: 11 }}>{meta.name}</span>
              <Tag kind="synth" />
            </div>
            <div className="src" style={{ marginBottom: 5 }}>analogue: {meta.analogue}</div>
            <p style={{ fontSize: 12.5 }}>{meta.reads}</p>
            <div className="note danger" style={{ fontSize: 12 }}>{meta.limit}</div>
            {layer === 'slope' && (
              <div className="row gap6 wrap" style={{ marginTop: 8 }}>
                {slopeLegend().map(([label, c]) => (
                  <span key={label} className="row gap4" style={{ alignItems: 'center' }}>
                    <span style={{ width: 13, height: 9, background: c, display: 'inline-block' }} />
                    <span className="src">{label}</span>
                  </span>
                ))}
              </div>
            )}
            {layer === 'hazard' && (
              <div className="row gap4" style={{ marginTop: 8, alignItems: 'center' }}>
                <span className="src">low</span>
                <div style={{ flex: 1, height: 9, background: 'linear-gradient(90deg,#101c24,#1a6c78,#78b05c,#eece56,#f07c30,#ec2a40)' }} />
                <span className="src">high</span>
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: 10 }}>
            <div className="display cy" style={{ fontSize: 11, marginBottom: 7 }}>SHELTER OPTIONS FROM HERE</div>
            <div className="stack gap7">
              {shelters.map((sh) => (
                <div key={sh.id} style={{ borderLeft: `2px solid ${sh.id === 'lander' ? 'var(--rust)' : 'var(--magenta)'}`, paddingLeft: 8 }}>
                  <div className="row between gap8">
                    <span className="mono" style={{ fontSize: 12 }}>{sh.name}</span>
                    <span className="src">{sh.dist.toFixed(0)} m &middot; ~{sh.mins.toFixed(0)} min</span>
                  </div>
                  <div className="row gap6" style={{ alignItems: 'center', margin: '2px 0' }}>
                    <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${sh.prot * 100}%`, height: '100%', background: 'var(--magenta)' }} />
                    </div>
                    <span className="src">{(sh.prot * 100).toFixed(0)}% cover</span>
                  </div>
                  <div className="src" style={{ lineHeight: 1.4 }}>{sh.why}</div>
                </div>
              ))}
            </div>
            <div className="src" style={{ marginTop: 7 }}>
              Cover figures account for the shelter sitting between you and the current dust
              front bearing of {s.stormFromDeg.toFixed(0)}&deg;.
            </div>
          </div>

          <div className="panel" style={{ padding: 10 }}>
            <div className="display cy" style={{ fontSize: 11, marginBottom: 6 }}>ROUTE PROGRESS</div>
            <ElevationProfile path={s.path} width={300} height={140} progressIndex={s.pathIndex} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
