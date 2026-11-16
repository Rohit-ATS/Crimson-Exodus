import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useStore } from './state/store'
import { useSettings } from './state/settings'
import TitleScreen from './ui/TitleScreen'
import Briefing from './ui/Briefing'

// The planner pulls in the map rasteriser and the surface pulls in all of
// Three.js. Splitting them keeps the title screen's first paint small, which
// matters when a judge opens the link on conference wifi.
const Planning = lazy(() => import('./ui/Planning'))
const Surface = lazy(() => import('./ui/Surface'))
const Debrief = lazy(() => import('./ui/Debrief'))
const MissionControl = lazy(() => import('./multiplayer/MissionControl'))
const CoopSurface = lazy(() => import('./multiplayer/CoopSurface'))
import DataPanel from './ui/panels/DataPanel'
import { openDataPanel } from './ui/dataPanelBus'
import ErrorBoundary from './ui/ErrorBoundary'
import Coach from './ui/Coach'
import RoverPanel from './ui/panels/RoverPanel'
import MultiplayerBridge, { CrewLinkStatus, OpsAdvisory } from './multiplayer/bridge'
import { useMultiplayer } from './multiplayer/client'

/**
 * A short wipe between phases. It hides the frame where a screen mounts and the
 * first terrain raster or 3D scene is still rasterising, which otherwise shows
 * as a flash of empty panels.
 */
function PhaseTransition({ phase }: { phase: string }) {
  const [token, setToken] = useState(0)
  const prev = useRef(phase)
  useEffect(() => {
    if (prev.current !== phase) {
      prev.current = phase
      setToken((t) => t + 1)
    }
  }, [phase])
  if (token === 0) return null
  return (
    <div
      key={token}
      className="screen"
      style={{
        background: 'var(--bg-0)',
        zIndex: 150,
        pointerEvents: 'none',
        animation: 'phaseWipe 520ms ease-out forwards',
      }}
    >
      <div
        style={{
          position: 'absolute', left: 0, right: 0, height: '34%',
          background: 'linear-gradient(180deg, transparent, rgba(79,232,255,0.14), transparent)',
          animation: 'phaseScan 520ms ease-out forwards',
        }}
      />
    </div>
  )
}

function Booting({ phase }: { phase: string }) {
  if (phase === 'title' || phase === 'briefing') return null
  const what =
    phase === 'planning' ? 'LOADING TRAVERSE PLANNER'
      : phase === 'surface' ? 'INITIALISING SURFACE SIMULATION'
        : 'COMPILING DEBRIEF'
  return (
    <div className="screen center grid-bg" style={{ background: 'var(--bg-0)', zIndex: 40 }}>
      <div className="stack center gap12">
        <div className="display cy sweep" style={{ fontSize: 13, letterSpacing: '0.3em', padding: '10px 22px', border: '1px solid var(--line)' }}>
          {what}
        </div>
        <span className="src">building terrain, shaders and environment model</span>
      </div>
    </div>
  )
}

export default function App() {
  const phase = useStore((s) => s.phase)
  const reducedMotion = useSettings((s) => s.reducedMotion)
  const multiplayerRole = useMultiplayer((s) => s.role)
  const multiplayerStatus = useMultiplayer((s) => s.status)

  // Reduced motion is a document-level switch so it reaches every screen,
  // including the ones rendered through portals and lazy chunks.
  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion)
  }, [reducedMotion])
  const [data, setData] = useState(false)
  // MERV is reachable from every screen, not only the surface. Being able to
  // interrogate the survival guide before you are in danger is the point.
  const [rover, setRover] = useState(false)
  // Bumping this remounts the lazy subtree, which retries a failed chunk fetch.
  const [boundaryKey, setBoundaryKey] = useState(0)

  // Any screen can ask for the provenance panel through a tiny event bus.
  useEffect(() => openDataPanel.subscribe(() => setData(true)), [])

  // Global shortcuts available on every screen: the provenance panel and the
  // rover comms link.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (phase !== 'surface') {
        if (e.code === 'KeyK') setData((v) => !v)
        // The panel brings the link up itself on mount.
        if (e.code === 'KeyJ') setRover((v) => !v)
      }
      if (e.code === 'Escape') { setData(false); setRover(false) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phase])

  if (multiplayerRole === 'habcom' && (multiplayerStatus === 'connected' || multiplayerStatus === 'reconnecting')) {
    return (
      <Suspense fallback={<div className="screen center grid-bg"><span className="display cy">OPENING HABCOM CONSOLE</span></div>}>
        <MissionControl />
      </Suspense>
    )
  }

  if (multiplayerRole === 'ev2' && (multiplayerStatus === 'connected' || multiplayerStatus === 'reconnecting')) {
    return (
      <Suspense fallback={<div className="screen center grid-bg"><span className="display cy">OPENING EV-2 SURFACE LINK</span></div>}>
        <CoopSurface />
      </Suspense>
    )
  }

  return (
    <>
      <MultiplayerBridge />
      {phase === 'title' && <TitleScreen />}
      {phase === 'briefing' && <Briefing />}
      <ErrorBoundary
        key={boundaryKey}
        onReset={() => setBoundaryKey((k) => k + 1)}
      >
        <Suspense fallback={<Booting phase={phase} />}>
          {phase === 'planning' && <Planning />}
          {phase === 'surface' && <Surface />}
          {phase === 'debrief' && <Debrief />}
        </Suspense>
      </ErrorBoundary>

      {/* After the screens, so the card is never painted over by one of them.
          The surface mounts its own copy inside the HUD column instead. */}
      {(phase === 'briefing' || phase === 'planning') && <Coach placement="screen" />}

      {data && phase !== 'surface' && <DataPanel onClose={() => setData(false)} />}

      {rover && phase !== 'surface' && <RoverPanel onClose={() => setRover(false)} />}

      <PhaseTransition phase={phase} />
      <OpsAdvisory />
      <CrewLinkStatus />
    </>
  )
}
