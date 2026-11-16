import { useEffect, useState } from 'react'
import Starfield from './Starfield'
import { Chip, Panel } from './components/kit'
import { useStore } from '../state/store'
import { linkGeometry, marsClock, formatHours, seasonName } from '../sim/orbits'
import { SITE } from '../mission/site'
import { formatDelay } from '../sim/comms'
import { GALLERY } from '../data/nasaGallery'
import SurvivalGuide from './panels/SurvivalGuide'
import RoverPanel from './panels/RoverPanel'
import MultiplayerLobby from '../multiplayer/MultiplayerLobby'

/** Four frames that say, without a word, what this is built on. */
const PROOF = ['abrasionPatches', 'watsonDourbes', 'coreInDrill', 'deltaPano'] as const
import { openDataPanel } from './dataPanelBus'

export default function TitleScreen() {
  const startBriefing = useStore((s) => s.startBriefing)
  const quickDemo = useStore((s) => s.quickDemo)
  const [showGuide, setShowGuide] = useState(false)
  const [showRover, setShowRover] = useState(false)
  const [showMultiplayer, setShowMultiplayer] = useState(false)
  const [, bump] = useState(0)
  const [showControls, setShowControls] = useState(false)

  useEffect(() => {
    const id = setInterval(() => bump((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('button, input, textarea, select, a, [contenteditable="true"]')) return

      // A dialog owns the keyboard while it is up. Without this, Enter starts
      // the mission behind an open survival guide.
      if (showGuide || showRover || showMultiplayer) return

      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault()
        startBriefing()
      } else if (event.code === 'Slash' && event.shiftKey) {
        event.preventDefault()
        setShowControls((visible) => !visible)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [startBriefing, showGuide, showRover, showMultiplayer])

  const now = new Date()
  const link = linkGeometry(now)
  const clock = marsClock(now, SITE.eastLonDeg, SITE.latDeg)

  return (
    <div className="screen scanlines vignette title-screen">
      <Starfield />

      <div
        className="screen stack title-screen-content"
        style={{ padding: 'max(18px, env(safe-area-inset-top)) clamp(18px, 4vw, 54px) max(18px, env(safe-area-inset-bottom))', justifyContent: 'space-between' }}
      >
        {/* Top bar */}
        <div
          className="row between wrap gap12"
          style={{ position: 'relative', zIndex: 1, animation: 'fadeUp .5s ease-out' }}
        >
          <div className="row gap12" style={{ alignItems: 'baseline' }}>
            <span className="label" style={{ color: 'var(--cyan)' }}>NASA Space Apps Challenge 2026</span>
            <span className="label">// Mission Computer v2.6</span>
          </div>
          {/* Its own backing: this group sits over the bright limb of the
              planet, where a ghost button simply disappears. */}
          <div
            className="row gap8 wrap"
            style={{
              background: 'rgba(4,7,11,0.62)',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: '4px 8px',
            }}
          >
            <Chip tone="nominal">Live ephemeris</Chip>
            <Chip tone="info">{SITE.name}</Chip>
            <button className="btn ghost sm" onClick={() => openDataPanel.open()}>Data details [K]</button>
          </div>
        </div>

        {/*
          A scrim behind the hero column. The Mars limb behind it is bright
          enough on the right-hand side that small low-contrast text sat on top
          of it was effectively unreadable. The gradient is horizontal so the
          planet is still fully visible where there is nothing over it.
        */}
        <div
          aria-hidden
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 'min(96vw, 1080px)',
            background: 'linear-gradient(90deg, rgba(4,7,11,0.86) 0%, rgba(4,7,11,0.74) 52%, rgba(4,7,11,0) 100%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Hero */}
        <div style={{ maxWidth: 940, position: 'relative', zIndex: 1, animation: 'glowIn .9s ease-out' }}>
          <div className="label" style={{ letterSpacing: '0.42em', marginBottom: 8 }}>
            Jezero Crater &nbsp;/&nbsp; 18.44&deg;N 77.45&deg;E &nbsp;/&nbsp; &minus;2571 m
          </div>

          <h1
            className="display"
            style={{
              fontSize: 'clamp(54px, 13vw, 168px)',
              lineHeight: 0.84,
              margin: '0 0 2px',
              letterSpacing: '0.02em',
              background: 'linear-gradient(180deg, #fff 0%, #ffd9c0 42%, #e2603a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 70px rgba(226,96,58,0.45)',
            }}
          >
            CRIMSON
          </h1>
          <div
            className="display"
            style={{
              fontSize: 'clamp(17px, 3.6vw, 40px)',
              letterSpacing: '0.34em',
              color: 'var(--cyan)',
              textShadow: '0 0 28px rgba(79,232,255,0.5)',
              marginBottom: 18,
            }}
          >
            EXODUS
          </div>

          <p style={{ fontSize: 'clamp(15px, 1.5vw, 19px)', maxWidth: 700, color: '#c3d8e6' }}>
            Plan a route across real NASA Mars data, walk it in a pressure suit, make the
            observations, and get the astronaut home with the science. The Mars season, the
            local solar time, the sun angle and the Earth light time are all computed for
            right now. Everything else is a decision you have to make yourself, because
            Earth is <span className="cy mono">{formatDelay(link.owltSec)}</span> away and
            cannot answer in time.
          </p>

          <p style={{ fontSize: 'clamp(13px, 1.25vw, 16px)', maxWidth: 700, color: '#9fb9cb', marginTop: -4 }}>
            You are not alone out there. <span className="cy">MERV</span>, a six-wheeled scout
            rover, keeps station off your left shoulder for the whole EVA. Talk to him — hold
            <span className="mono cy"> X </span> on the surface, or press
            <span className="mono cy"> J </span> anywhere, including here. He answers questions
            about Mars from a sourced knowledge base, reads your consumables and the weather
            straight out of the simulation, and speaks up on his own when something crosses a
            line. He will tell you when he does not know.
          </p>

          {/* What you will actually be looking at. Real photographs, on the
              first screen, because the single hardest thing to establish in
              five seconds is that the NASA data here is not decoration. */}
          <div style={{ marginTop: 22, maxWidth: 700 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              Real NASA imagery, revealed by doing the work
            </div>
            <div className="row gap8 wrap">
              {PROOF.map((k) => {
                const im = GALLERY[k]
                return (
                  <figure key={k} style={{ margin: 0, width: 128 }}>
                    <img
                      src={im.file}
                      alt={im.title}
                      loading="lazy"
                      style={{
                        width: 128, height: 76, objectFit: 'cover', display: 'block',
                        border: '1px solid var(--line)',
                      }}
                    />
                    <figcaption
                      className="mono"
                      style={{ fontSize: 8.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.3 }}
                    >
                      {im.id} &middot; NASA/JPL
                    </figcaption>
                  </figure>
                )
              })}
            </div>
          </div>

          <div className="row gap12 wrap" style={{ marginTop: 22 }}>
            <button
              className="btn primary"
              style={{ padding: '15px 34px', fontSize: 14, letterSpacing: '0.2em' }}
              onClick={startBriefing}
            >
              &#9656;&nbsp; Begin the EVA <span className="mono" style={{ fontSize: 10, opacity: 0.75 }}>[Enter]</span>
            </button>
            <button
              className="btn"
              style={{ padding: '15px 22px' }}
              onClick={quickDemo}
              title="Skips planning and drops you on the surface, walking, with a storm on the way."
            >
              Two-minute demo &#8594;
            </button>
            <button className="btn ghost" style={{ padding: '15px 22px' }} onClick={() => setShowGuide(true)}>
              Mars survival guide
            </button>
            <button
              className="btn ghost"
              style={{ padding: '15px 22px' }}
              onClick={() => setShowRover(true)}
            >
              Talk to MERV [J]
            </button>
            <button className="btn ghost" style={{ padding: '15px 22px' }} onClick={() => setShowMultiplayer(true)}>
              Multiplayer crew link
            </button>
            <button className="btn ghost" style={{ padding: '15px 22px' }} onClick={() => setShowControls((v) => !v)}>
              {showControls ? 'Hide controls' : 'Controls & mission rules [?]'}
            </button>
          </div>

          <div
            className="src"
            style={{ marginTop: 9, maxWidth: 640, lineHeight: 1.55, color: 'var(--muted)' }}
          >
            The survival guide is the whole educational payload, readable without playing.
            A full run is a briefing, a route plan and an EVA &mdash; about eight minutes.
            The two-minute demo skips straight to the surface with auto-traverse walking and a
            regional dust front already scheduled; press P at any time to take the controls.
          </div>

          {showControls && (
            <div className="panel clipped" style={{ marginTop: 16, maxWidth: 720, animation: 'fadeUp .22s' }}>
              <div className="panel-body">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(188px, 1fr))',
                    gap: '10px 22px',
                  }}
                >
                  {[
                    ['W A S D / Arrows', 'Walk'],
                    ['Q / E', 'Swing the camera'],
                    ['Shift (hold)', 'Time compression boost'],
                    ['F', 'Interact at a station'],
                    ['C', 'Capture a frame'],
                    ['G', 'Plant a flag'],
                    ['B', 'Backpack'],
                    ['M', 'Mission map'],
                    ['T', 'Earth comms feed'],
                    ['H', 'Hazard overlay'],
                    ['V', 'First / third person'],
                    ['Space', 'Pause'],
                    ['Esc', 'Close a panel'],
                  ].map(([k, v]) => (
                    <div className="row between gap8" key={k}>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--cyan)' }}>{k}</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <hr className="rule" />
                <p className="dim" style={{ fontSize: 13 }}>
                  There is no fail-by-ambush in this game. The return margin, the dust forecast
                  and the shelter recommendation are all on screen before they matter. Turning
                  back early is a winning move, not a losing one.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Live telemetry strip */}
        <div
          className="row gap12 wrap"
          style={{ alignItems: 'stretch', animation: 'fadeUp .7s ease-out' }}
        >
          <Panel title="Mars — now" style={{ flex: '1 1 260px', minWidth: 240 }}>
            <div className="stack gap6">
              <Live k="Local true solar time" v={formatHours(clock.ltstHours)} hint="Jezero" />
              <Live k="Mission sol at site" v={`${clock.siteSol}`} hint="since Perseverance landing" />
              <Live k="Solar longitude Ls" v={`${clock.solarLongitudeDeg.toFixed(1)}°`} hint={seasonName(clock.solarLongitudeDeg)} />
              <Live
                k="Sun elevation"
                v={`${clock.sunElevationDeg.toFixed(1)}°`}
                hint={clock.sunElevationDeg > 0 ? `azimuth ${clock.sunAzimuthDeg.toFixed(0)}°` : 'below the horizon'}
              />
            </div>
          </Panel>

          <Panel title="Earth link — now" style={{ flex: '1 1 260px', minWidth: 240 }}>
            <div className="stack gap6">
              <Live k="Distance" v={`${(link.distanceKm / 1e6).toFixed(2)} M km`} hint={`${link.distanceAu.toFixed(3)} AU`} />
              <Live k="One-way light time" v={formatDelay(link.owltSec)} hint="speed of light" />
              <Live k="Round trip" v={formatDelay(link.rttSec)} hint="ask and answer" />
              <Live
                k="Sun–Earth–Mars angle"
                v={`${link.sunEarthMarsDeg.toFixed(1)}°`}
                hint={link.nearConjunction ? 'SOLAR CONJUNCTION' : 'link geometry clear'}
              />
            </div>
          </Panel>

          <Panel title="What is real here" style={{ flex: '1 1 300px', minWidth: 260 }}>
            <div className="stack gap6" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <div><span className="tag real">NASA observation</span> <span className="dim">Jezero geology, instrument data, imagery context</span></div>
              <div><span className="tag model">Model output</span> <span className="dim">Ephemerides, Mars time, atmosphere, weather</span></div>
              <div><span className="tag synth">Synthetic terrain</span> <span className="dim">The metre-scale ground you walk on</span></div>
              <div><span className="tag game">Game mechanic</span> <span className="dim">Suit consumables, scoring, hazard weights</span></div>
              <div className="src" style={{ marginTop: 4 }}>
                Every number in the app carries one of these four labels. Full provenance in
                the Data Details panel.
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {showGuide && <SurvivalGuide onClose={() => setShowGuide(false)} />}
      {showRover && <RoverPanel onClose={() => setShowRover(false)} />}
      {showMultiplayer && <MultiplayerLobby onClose={() => setShowMultiplayer(false)} />}
    </div>
  )
}

function Live({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="row between gap8" style={{ alignItems: 'baseline' }}>
      <span className="label" style={{ flex: '0 1 auto' }}>{k}</span>
      <span style={{ textAlign: 'right' }}>
        <span className="mono" style={{ fontSize: 14, color: 'var(--text)' }}>{v}</span>
        {hint && <span className="src" style={{ display: 'block' }}>{hint}</span>}
      </span>
    </div>
  )
}
