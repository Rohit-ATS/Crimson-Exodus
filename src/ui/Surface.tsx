import { useEffect } from 'react'
import SurfaceScene from '../three/SurfaceScene'
import Hud from './Hud'
import SciencePanel from './panels/SciencePanel'
import FlagPicker from './panels/FlagPicker'
import BackpackPanel from './panels/BackpackPanel'
import CommsPanel from './panels/CommsPanel'
import RoverPanel from './panels/RoverPanel'
import DataPanel from './panels/DataPanel'
import MapPanel from './panels/MapPanel'
import RealSitePanel from './panels/RealSitePanel'
import ProcedureOverlay from './ProcedureOverlay'
import UplinkOverlay from './UplinkOverlay'
import ObjectivesPanel from './panels/ObjectivesPanel'
import SettingsPanel from './panels/SettingsPanel'
import { useStore } from '../state/store'
import { useSimLoop } from '../state/useSimLoop'
import { installInput, onPress } from '../state/input'
import { live } from '../state/live'
import { useMerv } from '../state/merv'

export default function Surface() {
  useSimLoop()
  const ui = useStore((s) => s.ui)

  useEffect(() => installInput(), [])

  /**
   * Bring MERV's comms link up for this EVA, and take it down on the way out.
   *
   * Reset first: `Surface` mounts once per run, so a second EVA must start
   * with an empty transcript and a fresh credential rather than inheriting the
   * last one's conversation.
   */
  useEffect(() => {
    // Keyed to this EVA's start time, so a second run gets a fresh transcript
    // and StrictMode's duplicate mount does not greet the player twice.
    const runKey = String(useStore.getState().time.startedAt.getTime())
    void useMerv.getState().boot(runKey)
    return () => useMerv.getState().shutdown()
  }, [])

  /**
   * Hold X to talk, from anywhere on the surface.
   *
   * Push-to-talk rather than open-mic on the lower tiers, because the usual
   * venue for this is a room with forty other people talking in it. The agent
   * tier ignores this and listens continuously — it does its own endpointing,
   * which is most of what you are paying it for.
   */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'KeyX' || e.repeat) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const s = useStore.getState()
      if (s.proc || s.uplink) return
      void useMerv.getState().startTalking()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'KeyX') return
      useMerv.getState().stopTalking()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    return onPress((code) => {
      const s = useStore.getState()
      // A running procedure owns the keyboard; ProcedureOverlay handles its own
      // Escape and Enter so that nothing else can fire underneath it.
      if (s.proc || s.uplink) return
      if (code === 'Escape') { s.setUi(null); return }
      if (s.ui !== null) return // panels own the keyboard while open

      switch (code) {
        case 'Enter':
        case 'NumpadEnter':
          if (s.atLander) s.beginIngress()
          break
        case 'KeyR':
          if (s.nearCache) s.beginCache()
          break
        case 'KeyF':
          if (s.nearStation) s.setUi('science')
          break
        case 'KeyC': {
          const url = live.captureFrame?.()
          s.beginPhoto(s.nearStation ? `${s.nearStation.toUpperCase()} frame` : 'Traverse frame', url)
          break
        }
        case 'KeyG':
          if (s.flagsRemaining > 0) s.setUi('flag')
          break
        case 'KeyO': s.setUi('objectives'); break
        case 'F1':
        case 'Slash': s.setUi('settings'); break
        case 'KeyB': s.setUi('backpack'); break
        case 'KeyM': s.setUi('map'); break
        case 'KeyT': s.setUi('comms'); break
        case 'KeyJ': s.setUi('rover'); break
        case 'KeyK': s.setUi('data'); break
        case 'KeyN': s.setUi('realsite'); break
        case 'KeyH': s.toggleHazardOverlay(); break
        case 'KeyV': live.firstPerson = !live.firstPerson; break
        case 'KeyP': s.toggleAutoTraverse(); break
        case 'Space': s.togglePause(); break
        default: break
      }
    })
  }, [])

  // Shift gives a temporary time-compression boost while held.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code.startsWith('Shift') && !e.repeat) {
        const s = useStore.getState()
        if (s.ui === null && s.timeScale < 30) {
          ;(window as unknown as { __prevScale?: number }).__prevScale = s.timeScale
          s.setTimeScale(30)
        }
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code.startsWith('Shift')) {
        const prev = (window as unknown as { __prevScale?: number }).__prevScale
        if (prev) useStore.getState().setTimeScale(prev)
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  // Mouse look: drag to orbit the camera.
  useEffect(() => {
    let dragging = false
    let lx = 0, ly = 0
    const down = (e: MouseEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('button, input, a, .panel')) return
      dragging = true; lx = e.clientX; ly = e.clientY
    }
    const move = (e: MouseEvent) => {
      if (!dragging) return
      live.camYaw -= (e.clientX - lx) * 0.005
      live.camPitch = Math.max(-0.12, Math.min(0.95, live.camPitch + (e.clientY - ly) * 0.004))
      lx = e.clientX; ly = e.clientY
    }
    const up = () => { dragging = false }
    const wheel = (e: WheelEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('.panel')) return
      live.camDist = Math.max(3.2, Math.min(42, live.camDist + e.deltaY * 0.012))
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('wheel', wheel, { passive: true })
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('wheel', wheel)
    }
  }, [])

  return (
    <div className="screen">
      <SurfaceScene />
      <div className="screen scanlines vignette" style={{ pointerEvents: 'none', zIndex: 10 }} />
      <Hud />
      {ui === 'science' && <SciencePanel />}
      {ui === 'flag' && <FlagPicker />}
      {ui === 'backpack' && <BackpackPanel />}
      {ui === 'comms' && <CommsPanel />}
      {ui === 'rover' && <RoverPanel />}
      {ui === 'map' && <MapPanel />}
      {ui === 'realsite' && <RealSitePanel onClose={() => useStore.getState().setUi(null)} />}
      {ui === 'data' && <DataPanel onClose={() => useStore.getState().setUi(null)} />}
      {ui === 'objectives' && <ObjectivesPanel />}
      {ui === 'settings' && <SettingsPanel />}
      <ProcedureOverlay />
      <UplinkOverlay />
    </div>
  )
}
