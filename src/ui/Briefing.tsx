import { useState } from 'react'
import Starfield from './Starfield'
import { Chip, KV, Panel, Tag } from './components/kit'
import { useStore } from '../state/store'
import { MISSION_RULES, PROVENANCE, SCIENCE_QUESTION, SITE, STATIONS } from '../mission/site'
import { JACK_SUIT } from '../sim/consumables'
import { ARMSTRONG_LIMIT_PA, ATMOSPHERE_COMPOSITION, MARS_G, thinnerThanEarth } from '../sim/mars'
import { formatDelay } from '../sim/comms'
import { seasonName } from '../sim/orbits'
import { openDataPanel } from './dataPanelBus'
import { ROVER_IMAGES } from '../data/realSite'
import RoverImageCard from './panels/RoverImageCard'

export default function Briefing() {
  const openPlanning = useStore((s) => s.openPlanning)
  const setPhase = useStore((s) => s.setPhase)
  const env = useStore((s) => s.env)
  const clock = useStore((s) => s.clock)
  const link = useStore((s) => s.link)
  const [tab, setTab] = useState<'mission' | 'environment' | 'rules'>('mission')

  return (
    <div className="screen scanlines vignette stack">
      <Starfield marsLimb={false} />

      <div className="row between gap12" style={{ padding: '16px 22px', borderBottom: '1px solid var(--line-soft)', position: 'relative' }}>
        <div className="row gap16" style={{ alignItems: 'baseline' }}>
          <span className="display cy" style={{ fontSize: 15, letterSpacing: '0.26em' }}>MISSION BRIEFING</span>
          <span className="label">Phase 1 of 3 &nbsp;&middot;&nbsp; Brief &rarr; Plan &rarr; Walk</span>
        </div>
        <div className="row gap8">
          <button className="btn ghost sm" onClick={() => openDataPanel.open()}>Data details [K]</button>
          <button className="btn ghost sm" onClick={() => setPhase('title')}>&larr; Title</button>
        </div>
      </div>

      <div className="row gap8" style={{ padding: '10px 22px 0', position: 'relative' }}>
        {([['mission', 'The mission'], ['environment', 'The environment'], ['rules', 'Rules & provenance']] as const).map(
          ([id, label]) => (
            <button
              key={id}
              className={`btn sm ${tab === id ? 'on' : 'ghost'}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ),
        )}
      </div>

      <div className="grow scroll" style={{ padding: 22, position: 'relative' }}>
        {tab === 'mission' && (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', maxWidth: 1500 }}>
            <Panel title="The site">
              <p style={{ fontSize: 14 }}>{SITE.blurb}</p>
              <KV rows={[
                ['Site', SITE.name],
                ['Coordinates', `${SITE.latDeg.toFixed(4)}°N  ${SITE.eastLonDeg.toFixed(4)}°E`],
                ['Elevation', `${SITE.elevationM} m vs areoid`],
                ['Crater diameter', `${SITE.craterDiameterKm} km`],
                ['Traverse area', `${(SITE.areaM / 1000).toFixed(1)} km square`],
                ['Mission sol', `${clock.siteSol} (since Perseverance landing)`],
              ]} />
              <div style={{ marginTop: 8 }}><Tag kind="real" /></div>
            </Panel>

            <Panel title="The science question">
              <p className="am" style={{ fontSize: 15.5, fontWeight: 600 }}>{SCIENCE_QUESTION.short}</p>
              <p style={{ fontSize: 13.5 }}>{SCIENCE_QUESTION.long}</p>
              <div className="label" style={{ marginTop: 8, marginBottom: 4 }}>Objectives</div>
              <ul style={{ fontSize: 13 }}>
                {SCIENCE_QUESTION.objectives.map((o) => <li key={o}>{o}</li>)}
              </ul>
              <div style={{ marginTop: 8 }}><Tag kind="real" /></div>
            </Panel>

            <Panel title="Your crew member">
              <p style={{ fontSize: 14 }}>
                Jack is a field geologist. One excursion, on foot, with everything carried on
                the back. The backpack holds a camera, a flag canister, four sealed sample
                tubes, a geology hammer and the portable life support that keeps all of it
                pointless if it runs out.
              </p>
              <KV rows={[
                ['Suit pressure', `${JACK_SUIT.suitPressureKPa.toFixed(1)} kPa (~4.3 psi)`],
                ['Suit + PLSS mass', `${JACK_SUIT.suitMassKg} kg`],
                ['Weight on Mars', `${((JACK_SUIT.suitMassKg + JACK_SUIT.crewMassKg) * MARS_G).toFixed(0)} N`],
                ['Same mass on Earth', `${((JACK_SUIT.suitMassKg + JACK_SUIT.crewMassKg) * 9.807).toFixed(0)} N`],
                ['Mandated reserve', `${(JACK_SUIT.reserveFraction * 100).toFixed(0)}% of every consumable`],
              ]} />
              <div className="note" style={{ marginTop: 8, fontSize: 12.5 }}>
                No certified Mars surface EVA suit exists. Every number above is a reasoned
                game parameter, not a specification. <Tag kind="game" />
              </div>
            </Panel>

            <Panel title="The three stations">
              <div className="stack gap8">
                {STATIONS.map((st) => (
                  <div key={st.id} style={{ borderLeft: '2px solid var(--amber)', paddingLeft: 9 }}>
                    <div className="row between gap8">
                      <span className="mono am" style={{ fontSize: 11.5 }}>{st.codename}</span>
                      <span className="src">{st.workMinutes} min work &middot; {st.value} pts</span>
                    </div>
                    <div style={{ fontSize: 13.5 }}>{st.name} &mdash; {st.tagline}</div>
                    <div className="src" style={{ marginTop: 2 }}>modelled on: {st.realFeature}</div>
                    {ROVER_IMAGES[st.id]?.[0] && (
                      <div style={{ marginTop: 5, maxWidth: 360 }}>
                        <RoverImageCard image={ROVER_IMAGES[st.id][0]} compact />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Earth is not going to help you">
              <p style={{ fontSize: 14 }}>
                Mars is <span className="cy mono">{link.distanceAu.toFixed(3)} AU</span> away right now.
                A message takes <span className="cy mono">{formatDelay(link.owltSec)}</span> to reach Earth and the
                answer takes the same again. Ask mission control a question and the soonest
                you can hear back is <span className="am mono">{formatDelay(link.rttSec)}</span> later, plus
                however long they take to think.
              </p>
              <p style={{ fontSize: 14 }}>
                Every decision that matters on a Marswalk happens faster than that. The comms
                feed in this game applies the real delay and the replies say so. The point is
                not that Earth is useless. The point is that the astronaut is the flight
                director for anything urgent.
              </p>
              <div><Tag kind="model" /></div>
            </Panel>
          </div>
        )}

        {tab === 'environment' && (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', maxWidth: 1500 }}>
            <Panel title="Right now at Jezero">
              <KV rows={[
                ['Solar longitude Ls', `${clock.solarLongitudeDeg.toFixed(1)}° — ${seasonName(clock.solarLongitudeDeg)}`],
                ['Local true solar time', `${clock.ltstHours.toFixed(2)} h`],
                ['Sun elevation', `${clock.sunElevationDeg.toFixed(1)}°`],
                ['Sun azimuth', `${clock.sunAzimuthDeg.toFixed(0)}°`],
                ['Air temperature', `${env.airTempC.toFixed(0)} °C`],
                ['Ground temperature', `${env.groundTempC.toFixed(0)} °C`],
                ['Surface pressure', `${env.pressurePa.toFixed(0)} Pa (${env.pressureMbar.toFixed(1)} mbar)`],
                ['Air density', `${env.densityKgM3.toFixed(4)} kg/m³`],
                ['Wind / gust', `${env.windMs.toFixed(1)} / ${env.gustMs.toFixed(1)} m/s`],
                ['Dust optical depth', env.dustOpticalDepth.toFixed(2)],
                ['Speed of sound', `${env.speedOfSoundMs.toFixed(0)} m/s`],
              ]} />
              <div style={{ marginTop: 8 }}><Tag kind="model" /></div>
              <div className="src" style={{ marginTop: 5 }}>
                Season, local solar time and sun angle are computed from real ephemerides.
                Temperature, pressure and wind are a parameterised climatology anchored to
                MEDA observations at Jezero. Not a forecast, not telemetry.
              </div>
            </Panel>

            <Panel title="What that atmosphere actually is">
              <div className="stack gap4" style={{ marginBottom: 10 }}>
                {ATMOSPHERE_COMPOSITION.map((c) => (
                  <div key={c.symbol} className="row gap8" style={{ alignItems: 'center' }}>
                    <span className="mono" style={{ width: 54, fontSize: 12 }}>{c.symbol}</span>
                    <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{
                        width: `${Math.max(0.4, c.percent)}%`, height: '100%',
                        background: c.symbol === 'O2' ? 'var(--cyan)' : 'var(--rust)',
                      }} />
                    </div>
                    <span className="mono dim" style={{ width: 58, textAlign: 'right', fontSize: 11.5 }}>
                      {c.percent}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="note danger" style={{ fontSize: 13 }}>
                Oxygen is 0.16% of an atmosphere that is already{' '}
                <span className="mono">{thinnerThanEarth(env.pressurePa).toFixed(0)}&times;</span> thinner than
                Earth's. The partial pressure of oxygen outside the suit is about{' '}
                <span className="mono">{env.o2PartialPa.toFixed(2)} Pa</span>. Human lungs need roughly
                16,000 Pa. There is no breathing this, not even slowly.
              </div>
              <div className="note" style={{ fontSize: 13, marginTop: 8 }}>
                At {env.pressurePa.toFixed(0)} Pa, water boils at{' '}
                <span className="mono">{env.waterBoilingC.toFixed(0)} &deg;C</span>. The Armstrong
                limit &mdash; the pressure at which water boils at body temperature &mdash; is about{' '}
                {(ARMSTRONG_LIMIT_PA / 1000).toFixed(1)} kPa, roughly eight times the pressure here.
                The suit is not for comfort.
              </div>
            </Panel>

            <Panel title="Why a Mars storm is dangerous, and why it is not">
              <p style={{ fontSize: 14 }}>
                A famous film has a Mars windstorm tipping a rocket over. It cannot happen. Wind
                force scales with air density, and Mars air is about 1% as dense as Earth's.
              </p>
              <div className="note info" style={{ fontSize: 13 }}>
                At the current density of <span className="mono">{env.densityKgM3.toFixed(4)} kg/m&sup3;</span>,
                a {env.gustMs.toFixed(0)} m/s Martian gust carries the same push as an Earth breeze of about{' '}
                <span className="mono am">{env.windEarthEquivMs.toFixed(1)} m/s</span>. You would barely
                notice it on your face.
              </div>
              <p style={{ fontSize: 14, marginTop: 9 }}>
                What a dust storm actually does is take things away. It takes your visibility,
                so you cannot navigate. It takes your sunlight, so solar power collapses and the
                suit heaters run on battery. It coats the radiator and the visor in abrasive
                dust, so cooling degrades and feedwater burns faster. It does all of this over
                tens of minutes, while your margin shrinks and Earth is{' '}
                {formatDelay(link.rttSec)} from being able to say anything useful.
              </p>
              <p style={{ fontSize: 14 }}>
                That is why this game advises <span className="li">shelter or abort</span> rather than
                killing you. Turning back early is the winning move.
              </p>
            </Panel>

            <Panel title="Dust devils">
              <p style={{ fontSize: 14 }}>
                Convective vortices, metres to a hundred metres across, lasting minutes.
                Perseverance and Ingenuity imaged them routinely at Jezero, strongest in the
                early afternoon when the boundary layer is deepest. They gust, they lift dust,
                they drop the pressure a few pascals as the core passes.
              </p>
              <p style={{ fontSize: 14 }}>
                They are a nuisance, not an emergency: shield the optics, turn away, keep
                walking if the margin allows. They are also, genuinely, how Mars cleans the dust
                off solar panels.
              </p>
              <div><Tag kind="real" /></div>
            </Panel>
          </div>
        )}

        {tab === 'rules' && (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', maxWidth: 1500 }}>
            <Panel title="Mission rules">
              <ul style={{ fontSize: 13.5 }}>
                {MISSION_RULES.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Panel>
            <Panel title="Data provenance" style={{ gridColumn: 'span 1' }}>
              <div className="stack gap10">
                {PROVENANCE.map((p) => (
                  <div key={p.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 9 }}>
                    <div className="row between gap8 wrap">
                      <span className="mono cy" style={{ fontSize: 12 }}>{p.label}</span>
                      <Chip tone={p.kind === 'synthetic' ? 'warning' : p.kind === 'model' ? 'caution' : 'nominal'}>
                        {p.kind}
                      </Chip>
                    </div>
                    <div className="src">{p.instrument} &middot; {p.source} &middot; {p.date} &middot; {p.resolution}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{p.caveat}</div>
                    {p.url && <div className="src"><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></div>}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>

      <div
        className="row between gap12 wrap"
        style={{ padding: '14px 22px', borderTop: '1px solid var(--line-soft)', position: 'relative' }}
      >
        <span className="src">
          Read the environment tab before you plan. The storm mechanic is the whole game.
        </span>
        <button className="btn primary" onClick={openPlanning}>Open the planning map &nbsp;&rarr;</button>
      </div>
    </div>
  )
}
