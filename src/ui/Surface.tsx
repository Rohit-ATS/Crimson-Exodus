import { useEffect } from 'react'
import SurfaceScene from '../three/SurfaceScene'
import Hud from './Hud'
import SciencePanel from './panels/SciencePanel'
import FlagPicker from './panels/FlagPicker'
import BackpackPanel from './panels/BackpackPanel'
import CommsPanel from './panels/CommsPanel'
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

export default function Surface() {
  useSimLoop()
  const ui = useStore((s) => s.ui)

  useEffect(() => installInput(), [])

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
          if (s.atLander) s.ingress()
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
