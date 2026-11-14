import { useEffect, useState } from 'react'
import Starfield from './Starfield'
import { Chip, Panel } from './components/kit'
import { useStore } from '../state/store'
import { linkGeometry, marsClock, formatHours, seasonName } from '../sim/orbits'
import { SITE } from '../mission/site'
import { formatDelay } from '../sim/comms'
import { openDataPanel } from './dataPanelBus'

export default function TitleScreen() {
  const startBriefing = useStore((s) => s.startBriefing)
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
  }, [startBriefing])

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
        <div className="row between wrap gap12" style={{ animation: 'fadeUp .5s ease-out' }}>
          <div className="row gap12" style={{ alignItems: 'baseline' }}>
            <span className="label" style={{ color: 'var(--cyan)' }}>NASA Space Apps Challenge 2026</span>
            <span className="label">// Mission Computer v2.6</span>
          </div>
          <div className="row gap8 wrap">
            <Chip tone="nominal">Live ephemeris</Chip>
            <Chip tone="info">{SITE.name}</Chip>
            <button className="btn ghost sm" onClick={() => openDataPanel.open()}>Data details [K]</button>
          </div>
        </div>

        {/* Hero */}
        <div style={{ maxWidth: 940, animation: 'glowIn .9s ease-out' }}>
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
            JACK
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
            MARSWALK
          </div>

          <p style={{ fontSize: 'clamp(15px, 1.5vw, 19px)', maxWidth: 700, color: '#c3d8e6' }}>
            Plan a route across real NASA Mars data, walk it in a pressure suit, make the
            observations, and get the astronaut home with the science. The Mars season, the
            local solar time, the sun angle and the Earth light time are all computed for
            right now. Everything else is a decision you have to make yourself, because
            Earth is <span className="cy mono">{formatDelay(link.owltSec)}</span> away and
            cannot answer in time.
          </p>

          <div className="row gap12 wrap" style={{ marginTop: 26 }}>
            <button
              className="btn primary"
              style={{ padding: '15px 34px', fontSize: 14, letterSpacing: '0.2em' }}
              onClick={startBriefing}
            >
              &#9656;&nbsp; Start Marswalk <span className="mono" style={{ fontSize: 10, opacity: 0.75 }}>[Enter]</span>
            </button>
            <button className="btn ghost" style={{ padding: '15px 22px' }} onClick={() => setShowControls((v) => !v)}>
              {showControls ? 'Hide controls' : 'Controls & mission rules [?]'}
            </button>
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
