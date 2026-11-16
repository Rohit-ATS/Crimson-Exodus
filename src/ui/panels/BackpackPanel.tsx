import { Chip, KV, Meter, Modal, Tag } from '../components/kit'
import { useStore } from '../../state/store'
import { JACK_SUIT } from '../../sim/consumables'
import { STATIONS } from '../../mission/site'
import { flagUrl } from '../../data/countries'

export default function BackpackPanel({ onClose }: { onClose?: () => void } = {}) {
  const s = useStore()
  const close = onClose ?? (() => s.setUi(null))

  return (
    <Modal title="Backpack — PLSS and field kit" onClose={close} width={900}>
      <div className="row gap16 wrap" style={{ alignItems: 'flex-start' }}>
        {/* Consumables */}
        <div className="stack gap8" style={{ width: 288, flex: '0 0 288px' }}>
          <div className="panel" style={{ padding: 11 }}>
            <div className="row between gap8" style={{ marginBottom: 8 }}>
              <span className="display cy" style={{ fontSize: 11 }}>PORTABLE LIFE SUPPORT</span>
              <Tag kind="game" />
            </div>
            {([
              ['O₂ tank', s.frac.o2, `${s.cons.o2Kg.toFixed(3)} / ${JACK_SUIT.o2Kg} kg`],
              ['CO₂ scrubber bed', s.frac.scrubber, `${(JACK_SUIT.scrubberKg - s.cons.co2AbsorbedKg).toFixed(3)} / ${JACK_SUIT.scrubberKg} kg capacity`],
              ['Battery', s.frac.battery, `${s.cons.batteryWh.toFixed(0)} / ${JACK_SUIT.batteryWh} Wh`],
              ['Feedwater', s.frac.water, `${s.cons.waterKg.toFixed(2)} / ${JACK_SUIT.waterKg} kg`],
            ] as const).map(([k, v, detail]) => (
              <div key={k} style={{ marginBottom: 9 }}>
                <div className="row between"><span className="label">{k}</span><span className="mono" style={{ fontSize: 11 }}>{(v * 100).toFixed(0)}%</span></div>
                <Meter value={v} reserve={JACK_SUIT.reserveFraction} height={7} />
                <div className="src">{detail}</div>
              </div>
            ))}
            <hr className="rule" />
            <KV rows={[
              ['Suit pressure', `${JACK_SUIT.suitPressureKPa.toFixed(1)} kPa`],
              ['Outside pressure', `${(s.env.pressurePa / 1000).toFixed(3)} kPa`],
              ['Pressure ratio', `${(JACK_SUIT.suitPressureKPa * 1000 / s.env.pressurePa).toFixed(0)}:1`],
              ['Dust fouling', `${(s.cons.dustFouling * 100).toFixed(0)}%`],
            ]} />
            <div className="src" style={{ marginTop: 5 }}>
              The suit is holding roughly {(JACK_SUIT.suitPressureKPa * 1000 / s.env.pressurePa).toFixed(0)} times
              the ambient pressure. That is the number that makes every glove joint hard work and
              adds about 22% to the metabolic cost of walking.
            </div>
          </div>
        </div>

        {/* Kit */}
        <div className="stack gap10 grow" style={{ minWidth: 320 }}>
          {/* Sample tubes */}
          <div className="panel" style={{ padding: 11 }}>
            <div className="row between gap8" style={{ marginBottom: 7 }}>
              <span className="display cy" style={{ fontSize: 11 }}>SAMPLE TUBES</span>
              <Chip tone={s.samples.length ? 'nominal' : 'info'}>{s.samples.length} / 4 sealed</Chip>
            </div>
            <div className="row gap6 wrap" style={{ marginBottom: 8 }}>
              {Array.from({ length: 4 }, (_, i) => {
                const sm = s.samples[i]
                return (
                  <div
                    key={i}
                    style={{
                      width: 30, height: 86,
                      border: `1px solid ${sm ? 'var(--lime)' : 'var(--line)'}`,
                      background: sm
                        ? 'linear-gradient(180deg, rgba(125,255,178,0.14), rgba(125,255,178,0.04))'
                        : 'rgba(255,255,255,0.025)',
                      position: 'relative',
                    }}
                    title={sm ? sm.name : 'empty'}
                  >
                    <div
                      style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0,
                        height: sm ? '62%' : 0,
                        background: '#7a5a42',
                      }}
                    />
                    <div className="mono faint" style={{ position: 'absolute', top: 3, left: 0, right: 0, textAlign: 'center', fontSize: 9 }}>
                      {i + 1}
                    </div>
                  </div>
                )
              })}
            </div>
            {s.samples.length === 0 ? (
              <div className="src">No cores sealed yet. Sample return is the one thing a human on the surface can do that no orbiter can.</div>
            ) : (
              <div className="stack gap6">
                {s.samples.map((sm) => {
                  const st = STATIONS.find((x) => x.id === sm.stationId)
                  return (
                    <div key={sm.id} style={{ borderLeft: `2px solid ${sm.contextGood ? 'var(--lime)' : 'var(--amber)'}`, paddingLeft: 8 }}>
                      <div className="row between gap8">
                        <span className="mono" style={{ fontSize: 12 }}>{sm.name}</span>
                        <span className="src">{sm.massG} g &middot; T+{(sm.evaSec / 60).toFixed(0)} min</span>
                      </div>
                      <div className="src">{st?.codename} &middot; {sm.contextGood ? 'field context recorded' : 'NO supporting observation — reduced value'}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Camera */}
          <div className="panel" style={{ padding: 11 }}>
            <div className="row between gap8" style={{ marginBottom: 7 }}>
              <span className="display cy" style={{ fontSize: 11 }}>FIELD CAMERA</span>
              <Chip tone="info">{s.photos.length} frames</Chip>
            </div>
            {s.photos.length === 0 ? (
              <div className="src">No frames captured. Press C on the surface. Illumination geometry is logged with every frame.</div>
            ) : (
              <div className="row gap6 wrap scroll" style={{ maxHeight: 190 }}>
                {s.photos.slice().reverse().map((p) => (
                  <div key={p.id} style={{ width: 132 }}>
                    <div
                      style={{
                        width: 132, height: 76, border: '1px solid var(--line)',
                        background: p.dataUrl ? `center/cover url(${p.dataUrl})` : 'linear-gradient(135deg,#3a2217,#17100c)',
                      }}
                    />
                    <div className="src" style={{ marginTop: 2, lineHeight: 1.35 }}>
                      {p.label}<br />
                      LTST {p.ltst.toFixed(2)} h &middot; sun {p.sunElevationDeg.toFixed(0)}&deg; &middot; &tau; {p.tau.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Flag + tools */}
          <div className="row gap10 wrap">
            <div className="panel grow" style={{ padding: 11, minWidth: 200 }}>
              <div className="display cy" style={{ fontSize: 11, marginBottom: 6 }}>FLAG CANISTER</div>
              {s.flag ? (
                <div className="row gap8" style={{ alignItems: 'center' }}>
                  <img
                    src={flagUrl(s.flag.code, 80)}
                    alt=""
                    style={{ width: 44, height: 29, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)' }}
                  />
                  <div>
                    <div style={{ fontSize: 13 }}>{s.flag.name}</div>
                    <div className="src">planted at {s.flag.x.toFixed(0)}, {s.flag.z.toFixed(0)} &middot; T+{(s.flag.evaSec / 60).toFixed(0)} min</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="src" style={{ marginBottom: 7 }}>One flag, unused. Press G anywhere on the surface.</div>
                  <button className="btn sm" onClick={() => s.setUi('flag')}>Choose a flag</button>
                </>
              )}
            </div>
            <div className="panel grow" style={{ padding: 11, minWidth: 200 }}>
              <div className="display cy" style={{ fontSize: 11, marginBottom: 6 }}>TOOLS</div>
              <div className="src" style={{ lineHeight: 1.6 }}>
                Geology hammer &middot; hand lens &middot; coring drill head &middot; sample bags &middot;
                tether &middot; brush. Carried, not simulated individually.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
