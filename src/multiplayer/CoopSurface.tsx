import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EXTENT, gradeAlong, heightAt, roughnessAt, walkSpeed } from '../mission/terrain'
import { input, installInput } from '../state/input'
import { live } from '../state/live'
import FarTerrain from '../three/FarTerrain'
import Jack from '../three/Jack'
import Lander from '../three/Lander'
import NearClasts from '../three/NearClasts'
import NetworkJack from '../three/NetworkJack'
import Rocks from '../three/Rocks'
import Terrain from '../three/Terrain'
import { Chip } from '../ui/components/kit'
import { useMultiplayer } from './client'
import type { CrewPose } from './protocol'

function CoopCamera() {
  const { camera } = useThree()
  const position = useRef(new THREE.Vector3(0, 6, 20))
  const look = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    const j = live.jack
    const yaw = live.camYaw + Math.PI
    const wanted = new THREE.Vector3(
      j.x + Math.sin(yaw) * live.camDist,
      j.y + 1.3 + Math.sin(live.camPitch) * live.camDist,
      j.z + Math.cos(yaw) * live.camDist,
    )
    wanted.y = Math.max(wanted.y, heightAt(wanted.x, wanted.z) + 1.6)
    position.current.lerp(wanted, Math.min(1, dt * 5.2))
    look.current.lerp(new THREE.Vector3(j.x, j.y + 1.35, j.z), Math.min(1, dt * 7))
    camera.position.copy(position.current)
    camera.lookAt(look.current)
  })
  return null
}

function SurfaceWorld({ ev1, dust }: { ev1: CrewPose; dust: number }) {
  return (
    <Canvas shadows dpr={[1, 1.6]} camera={{ fov: 58, near: 0.1, far: 12000, position: [0, 6, 20] }}>
      <color attach="background" args={['#9a6548']} />
      <fogExp2 attach="fog" args={['#9a6548', 0.0012 + dust * 0.0005]} />
      <hemisphereLight args={[0xd8aa82, 0x3a2318, 1.1]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[180, 260, 120]} intensity={2.2} castShadow />
      <Terrain dustFouling={Math.min(1, dust / 4)} />
      <FarTerrain />
      <Rocks dust={Math.min(1, dust / 4)} />
      <NearClasts dust={Math.min(1, dust / 4)} />
      <Lander dust={Math.min(1, dust / 4)} lightsOn />
      <Jack source={live.jack} variant="ev2" dust={Math.min(1, dust / 4)} />
      <NetworkJack pose={ev1} variant="ev1" dust={Math.min(1, dust / 4)} />
      <CoopCamera />
    </Canvas>
  )
}

export default function CoopSurface() {
  const multiplayer = useMultiplayer()
  const snapshot = multiplayer.snapshot
  const [message, setMessage] = useState('')
  const initialized = useRef(false)
  const ev1 = useMemo<CrewPose | null>(() => multiplayer.poses.ev ?? (snapshot ? {
    x: snapshot.position.x, z: snapshot.position.z, heading: snapshot.position.heading,
    speedMs: 0, moving: 0, stride: 0, sentAt: snapshot.sentAt,
  } : null), [multiplayer.poses.ev, snapshot])

  useEffect(() => installInput(), [])

  useEffect(() => {
    if (snapshot?.phase !== 'surface') initialized.current = false
  }, [snapshot?.phase])

  useEffect(() => {
    if (!ev1 || snapshot?.phase !== 'surface' || initialized.current) return
    initialized.current = true
    live.jack.x = Math.max(-EXTENT + 20, Math.min(EXTENT - 20, ev1.x + 2.2))
    live.jack.z = Math.max(-EXTENT + 20, Math.min(EXTENT - 20, ev1.z + 1.8))
    live.jack.y = heightAt(live.jack.x, live.jack.z)
    live.jack.heading = ev1.heading
    live.jack.speedMs = 0
    live.jack.moving = 0
    live.jack.stride = 0
    live.camYaw = ev1.heading
    live.camPitch = 0.26
    live.camDist = 9
  }, [ev1, snapshot?.phase])

  useEffect(() => {
    if (snapshot?.phase !== 'surface') return
    let raf = 0
    let last = performance.now()
    let lastSent = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const j = live.jack
      let ix = 0; let iz = 0
      if (!snapshot.mission.paused && !snapshot.outcome) {
        if (input.forward) iz += 1
        if (input.back) iz -= 1
        if (input.left) ix -= 1
        if (input.right) ix += 1
        if (input.turnLeft) live.camYaw += dt * 1.6
        if (input.turnRight) live.camYaw -= dt * 1.6
      }
      if (ix || iz) {
        const c = Math.cos(live.camYaw); const sn = Math.sin(live.camYaw)
        const wx = iz * sn - ix * c; const wz = iz * c + ix * sn
        const len = Math.hypot(wx, wz) || 1
        const dx = wx / len; const dz = wz / len
        const speed = walkSpeed(0.92, gradeAlong(j.x, j.z, dx, dz), roughnessAt(j.x, j.z))
        const step = speed * dt * Math.max(1, Math.min(30, snapshot.mission.timeScale))
        j.x = Math.max(-EXTENT + 20, Math.min(EXTENT - 20, j.x + dx * step))
        j.z = Math.max(-EXTENT + 20, Math.min(EXTENT - 20, j.z + dz * step))
        j.heading = Math.atan2(dx, dz)
        j.speedMs = speed
        j.stride += dt * (2 + speed * 2.8)
        j.moving = Math.min(1, j.moving + dt * 5)
      } else {
        j.speedMs = 0
        j.moving = Math.max(0, j.moving - dt * 4)
      }
      j.y = heightAt(j.x, j.z)
      if (now - lastSent >= 100) {
        lastSent = now
        multiplayer.publishPose({ x: j.x, z: j.z, heading: j.heading, speedMs: j.speedMs, moving: j.moving, stride: j.stride, sentAt: Date.now() })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [multiplayer.publishPose, snapshot])

  useEffect(() => {
    let dragging = false; let x = 0; let y = 0
    const down = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.panel')) return
      dragging = true; x = event.clientX; y = event.clientY
    }
    const move = (event: MouseEvent) => {
      if (!dragging) return
      live.camYaw -= (event.clientX - x) * 0.005
      live.camPitch = Math.max(-0.12, Math.min(0.95, live.camPitch + (event.clientY - y) * 0.004))
      x = event.clientX; y = event.clientY
    }
    const up = () => { dragging = false }
    const wheel = (event: WheelEvent) => { live.camDist = Math.max(3.2, Math.min(42, live.camDist + event.deltaY * 0.012)) }
    window.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); window.addEventListener('wheel', wheel, { passive: true })
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('wheel', wheel) }
  }, [])

  const send = () => {
    const clean = message.trim()
    if (!clean) return
    multiplayer.sendChat(clean); setMessage('')
  }

  if (!snapshot || snapshot.phase !== 'surface' || !ev1) return (
    <div className="screen center grid-bg">
      <div className="panel clipped brackets" style={{ padding: 24, width: 'min(90vw, 600px)', textAlign: 'center' }}>
        <div className="display cy" style={{ fontSize: 18 }}>EV-2 SURFACE LINK READY</div>
        <p style={{ marginTop: 10 }}>Waiting for EV-1 to start the EVA. The 3D surface opens automatically.</p>
        <div className="src">Room {multiplayer.roomCode} · {multiplayer.status}</div>
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={multiplayer.leaveMission}>Leave mission</button>
      </div>
    </div>
  )

  return (
    <div className="screen">
      <SurfaceWorld ev1={ev1} dust={snapshot.environment.dustOpacity} />
      <div className="screen scanlines vignette" style={{ pointerEvents: 'none', zIndex: 10 }} />
      <div className="panel clipped" style={{ position: 'fixed', left: 12, top: 12, zIndex: 20, padding: 10, width: 'min(92vw, 390px)', background: 'rgba(5,9,15,.9)' }}>
        <div className="row between gap8 wrap">
          <span className="display cy">EV-2 / {multiplayer.callsign}</span>
          <div className="row gap6"><Chip tone={multiplayer.status === 'connected' ? 'nominal' : 'caution'}>{multiplayer.status}</Chip><Chip tone="info">{multiplayer.roomCode}</Chip></div>
        </div>
        <div className="src" style={{ marginTop: 5 }}>WASD move · drag camera · Q/E turn · wheel zoom</div>
        <div className="kv" style={{ marginTop: 7 }}>
          <dt>Mission</dt><dd>{snapshot.mission.paused ? 'HOLD' : snapshot.mission.activity}</dd>
          <dt>EV time</dt><dd>{Math.floor(snapshot.mission.evaSec / 60)} min</dd>
          <dt>O₂ / battery</dt><dd>{(snapshot.lifeSupport.o2 * 100).toFixed(0)}% / {(snapshot.lifeSupport.battery * 100).toFixed(0)}%</dd>
          <dt>EV-1 range</dt><dd>{Math.hypot(live.jack.x - ev1.x, live.jack.z - ev1.z).toFixed(0)} m</dd>
        </div>
      </div>
      <div className="panel clipped" style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 20, padding: 8, width: 'min(92vw, 340px)', background: 'rgba(5,9,15,.9)' }}>
        <div className="scroll" style={{ height: 90, marginBottom: 6 }}>
          {multiplayer.history.slice(-8).map((line) => <div key={line.id} style={{ fontSize: 11 }}><span className="mono cy">{line.from.toUpperCase()}</span> {line.text}</div>)}
        </div>
        <div className="row gap6"><input aria-label="Crew message" value={message} maxLength={240} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} style={{ flex: 1, minWidth: 0, background: '#05080d', border: '1px solid var(--line)', padding: 6 }} /><button className="btn sm" onClick={send}>Send</button></div>
      </div>
    </div>
  )
}
