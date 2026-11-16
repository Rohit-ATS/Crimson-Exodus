import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EXTENT, gradeAlong, heightAt, roughnessAt, walkSpeed } from '../mission/terrain'
import { CACHES, ROUTES, STATIONS } from '../mission/site'
import { samplePath, type SampledPoint } from '../mission/path'
import { input, installInput, onPress } from '../state/input'
import { live } from '../state/live'
import { MarsAudio, type AudioInputs } from '../sim/audio'
import { ROVER_IMAGES, type RoverImage } from '../data/realSite'
import FarTerrain from '../three/FarTerrain'
import Jack from '../three/Jack'
import Lander from '../three/Lander'
import NearClasts from '../three/NearClasts'
import NetworkJack from '../three/NetworkJack'
import Rocks from '../three/Rocks'
import Terrain from '../three/Terrain'
import Sky from '../three/Sky'
import MarsEnvironment from '../three/MarsEnvironment'
import RouteLine from '../three/RouteLine'
import Markers from '../three/Markers'
import Rover from '../three/Rover'
import FlagMesh from '../three/FlagMesh'
import FlagPicker from '../ui/panels/FlagPicker'
import { followTarget, stepRover } from '../sim/rover'
import { DustDevil, DustField } from '../three/Dust'
import { Chip, Meter, Modal, Tag } from '../ui/components/kit'
import RoverImageCard from '../ui/panels/RoverImageCard'
import { OutcropGraphic } from '../ui/panels/SciencePanel'
import LocalMap from '../ui/map/LocalMap'
import ElevationProfile from '../ui/map/ElevationProfile'
import { LAYERS, type LayerId } from '../ui/map/layers'
import RealSitePanel from '../ui/panels/RealSitePanel'
import RoverPanel from '../ui/panels/RoverPanel'
import DataPanel from '../ui/panels/DataPanel'
import ObjectivesPanel from '../ui/panels/ObjectivesPanel'
import { useMultiplayer } from './client'
import type { CrewPose } from './protocol'

const DEG = Math.PI / 180

function sunVector(azDeg: number, elDeg: number): THREE.Vector3 {
  const el = elDeg * DEG
  const az = azDeg * DEG
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  ).normalize()
}

interface CapturedPhoto {
  id: string
  url: string
  title: string
  time: string
  stationName: string | null
}

function CoopCamera({ firstPerson }: { firstPerson: boolean }) {
  const { camera, gl, scene } = useThree()
  const position = useRef(new THREE.Vector3(0, 6, 20))
  const look = useRef(new THREE.Vector3())
  const lookTarget = useRef(new THREE.Vector3())

  useEffect(() => {
    live.captureFrame = () => {
      try {
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/jpeg', 0.88)
      } catch {
        return undefined
      }
    }
    return () => { live.captureFrame = null }
  }, [gl, scene, camera])

  useFrame((_, dt) => {
    const j = live.jack
    if (firstPerson) {
      const eye = new THREE.Vector3(j.x, j.y + 1.58, j.z)
      const fwd = new THREE.Vector3(Math.sin(live.camYaw), 0, Math.cos(live.camYaw))
      position.current.lerp(eye, Math.min(1, dt * 14))
      camera.position.copy(position.current)
      lookTarget.current.set(j.x + fwd.x * 12, j.y + 1.5 - live.camPitch * 6, j.z + fwd.z * 12)
      look.current.lerp(lookTarget.current, Math.min(1, dt * 11))
      camera.lookAt(look.current)
      return
    }

    const yaw = live.camYaw + Math.PI
    const d = live.camDist
    const wanted = new THREE.Vector3(
      j.x + Math.sin(yaw) * d,
      j.y + 1.3 + Math.sin(live.camPitch) * d,
      j.z + Math.cos(yaw) * d,
    )
    wanted.y = Math.max(wanted.y, heightAt(wanted.x, wanted.z) + 1.6)
    position.current.lerp(wanted, Math.min(1, dt * 6.5))
    look.current.lerp(new THREE.Vector3(j.x, j.y + 1.35, j.z), Math.min(1, dt * 8))
    camera.position.copy(position.current)
    camera.lookAt(look.current)
  })
  return null
}

function CoopWorld({
  ev1, dust, path, progressIndex, nearStation, stationsState, firstPerson, allFlags,
}: {
  ev1: CrewPose
  dust: number
  path: SampledPoint[]
  progressIndex: number
  nearStation: string | null
  stationsState: Record<string, { choice?: string }>
  firstPerson: boolean
  allFlags: Array<{ code: string; x: number; z: number }>
}) {
  const sunAzDeg = 210
  const sunElDeg = 38
  const sunDir = useMemo(() => sunVector(sunAzDeg, sunElDeg), [])
  const dayness = 0.95
  const transmission = Math.exp(-dust * 0.4)
  const dustFouling = Math.min(1, dust / 4)

  const fogColor = useMemo(() => {
    const d = Math.min(1, dust / 3.4)
    const clear = new THREE.Color(0.74, 0.52, 0.36)
    const dusty = new THREE.Color(0.78, 0.47, 0.24)
    return clear.clone().lerp(dusty, d)
  }, [dust])

  return (
    <Canvas shadows dpr={[1, 1.6]} camera={{ fov: 58, near: 0.1, far: 12000, position: [0, 6, 20] }}>
      <color attach="background" args={[fogColor.getHex()]} />
      <fogExp2 attach="fog" args={[fogColor.getHex(), 0.0012 + dust * 0.0005]} />

      <Sky sunDir={sunDir} tau={dust} dayness={dayness} transmission={transmission} />
      <MarsEnvironment sunDir={sunDir} tau={dust} dayness={dayness} transmission={transmission} />

      <hemisphereLight args={[fogColor.getHex(), 0x3a2318, 1.1]} />
      <ambientLight intensity={0.28} color={fogColor} />
      <directionalLight position={[180, 260, 120]} intensity={2.2 * dayness} castShadow />

      <Terrain dustFouling={dustFouling} />
      <FarTerrain />
      <Rocks dust={dustFouling} />
      <NearClasts dust={dustFouling} />
      <Lander dust={dustFouling} lightsOn />

      {path.length > 1 && <RouteLine path={path} progressIndex={progressIndex} />}

      <Markers
        stations={stationsState as never}
        nearStation={nearStation}
        showShelters={false}
        jackPos={[live.jack.x, live.jack.z]}
        cachesUsed={[]}
      />

      <Rover dust={dustFouling} lampsOn={dust > 2.5} stationPos={null} stormFromDeg={0} />
      {ev1?.rover && <Rover pose={ev1.rover} dust={dustFouling} lampsOn={dust > 2.5} />}

      {allFlags.map((f, i) => (
        <FlagMesh key={`${f.code}-${f.x.toFixed(1)}-${f.z.toFixed(1)}-${i}`} code={f.code} x={f.x} z={f.z} />
      ))}

      <DustField
        intensity={Math.max(0.04, Math.min(1, Math.pow(dust / 3.0, 0.8)))}
        windFromDeg={90}
        windMs={12}
      />
      {dust > 2.2 && (
        <DustDevil
          active
          intensity={0.8}
          originX={live.jack.x + 80}
          originZ={live.jack.z + 80}
          driftDeg={90}
        />
      )}

      <Jack source={live.jack} variant="ev2" dust={dustFouling} hidden={firstPerson} />
      <NetworkJack pose={ev1} variant="ev1" dust={dustFouling} />

      <CoopCamera firstPerson={firstPerson} />
    </Canvas>
  )
}

function CompassTape({ headingDeg, bearingToEv1, bearingToLander }: {
  headingDeg: number
  bearingToEv1: number | null
  bearingToLander: number
}) {
  const diff = (target: number) => {
    let d = (target - headingDeg + 360) % 360
    if (d > 180) d -= 360
    return d
  }
  const ev1Offset = bearingToEv1 != null ? diff(bearingToEv1) : null
  const landerOffset = diff(bearingToLander)

  return (
    <div style={{
      position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
      width: 'min(90vw, 420px)', height: 38, zIndex: 25,
      background: 'rgba(5,9,15,0.85)', border: '1px solid var(--line)',
      borderRadius: 4, overflow: 'hidden', backdropFilter: 'blur(4px)',
    }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 2, height: '100%', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)' }} />
      </div>
      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="mono cy" style={{ fontSize: 13, fontWeight: 'bold', letterSpacing: '0.1em' }}>
          {String(Math.round(headingDeg)).padStart(3, '0')}°
        </span>
      </div>
      {ev1Offset != null && Math.abs(ev1Offset) < 90 && (
        <div style={{
          position: 'absolute', top: 4, left: `${50 + (ev1Offset / 90) * 44}%`,
          transform: 'translateX(-50%)', fontSize: 9.5, color: 'var(--amber)', fontWeight: 'bold',
        }}>
          ▼ EV-1
        </div>
      )}
      {Math.abs(landerOffset) < 90 && (
        <div style={{
          position: 'absolute', bottom: 4, left: `${50 + (landerOffset / 90) * 44}%`,
          transform: 'translateX(-50%)', fontSize: 9, color: 'var(--lime)',
        }}>
          ▲ LND
        </div>
      )}
    </div>
  )
}

export default function CoopSurface() {
  const multiplayer = useMultiplayer()
  const snapshot = multiplayer.snapshot
  const [chatInput, setChatInput] = useState('')
  const [ui, setUi] = useState<null | 'science' | 'map' | 'realsite' | 'backpack' | 'objectives' | 'rover' | 'data' | 'comms' | 'flag'>(null)
  const [selectedStationId, setSelectedStationId] = useState<string>('kodiak')
  const [firstPerson, setFirstPerson] = useState(false)
  const [flash, setFlash] = useState(false)
  const [photos, setPhotos] = useState<CapturedPhoto[]>([])
  const [observations, setObservations] = useState<Record<string, { optionId: string; note: string }>>({})
  const [mapLayer, setMapLayer] = useState<LayerId>('relief')

  const allFlags = useMemo(() => {
    const list: Array<{ code: string; x: number; z: number }> = []
    if (snapshot?.flag) list.push(snapshot.flag)
    if (Array.isArray(snapshot?.flags)) {
      for (const f of snapshot.flags) {
        if (!list.some((existing) => existing.code === f.code && Math.hypot(existing.x - f.x, existing.z - f.z) < 0.5)) {
          list.push(f)
        }
      }
    }
    for (const f of multiplayer.flags) {
      if (!list.some((existing) => existing.code === f.code && Math.hypot(existing.x - f.x, existing.z - f.z) < 0.5)) {
        list.push(f)
      }
    }
    return list
  }, [snapshot?.flag, snapshot?.flags, multiplayer.flags])

  const audioRef = useRef<MarsAudio | null>(null)
  const initialized = useRef(false)

  const ev1 = useMemo<CrewPose | null>(() => multiplayer.poses.ev ?? (snapshot ? {
    x: snapshot.position.x, z: snapshot.position.z, heading: snapshot.position.heading,
    speedMs: 0, moving: 0, stride: 0, sentAt: snapshot.sentAt,
  } : null), [multiplayer.poses.ev, snapshot])

  // Active route from snapshot
  const activeRoute = useMemo(() => {
    if (!snapshot) return ROUTES[0]
    return ROUTES.find((r) => r.id === snapshot.route.id) ?? ROUTES[0]
  }, [snapshot])

  const path = useMemo(() => samplePath(activeRoute.waypoints), [activeRoute])
  const progressIndex = snapshot ? Math.floor(snapshot.route.progress * (path.length - 1)) : 0

  // Near station & lander detection
  const nearStation = useMemo(() => {
    const j = live.jack
    for (const st of STATIONS) {
      if (Math.hypot(j.x - st.x, j.z - st.z) <= st.radius + 6) return st.id
    }
    return null
  }, [live.jack.x, live.jack.z])

  const atLander = useMemo(() => Math.hypot(live.jack.x, live.jack.z) <= 22, [live.jack.x, live.jack.z])

  const nearCache = useMemo(() => {
    const j = live.jack
    for (const c of CACHES) {
      if (Math.hypot(j.x - c.x, j.z - c.z) <= c.radius + 6) return c.id
    }
    return null
  }, [live.jack.x, live.jack.z])

  // Audio start on first click
  useEffect(() => {
    const audio = new MarsAudio()
    audioRef.current = audio
    const startAudio = () => { void audio.start() }
    window.addEventListener('click', startAudio, { once: true })
    window.addEventListener('keydown', startAudio, { once: true })
    return () => {
      audio.dispose()
      window.removeEventListener('click', startAudio)
      window.removeEventListener('keydown', startAudio)
    }
  }, [])

  useEffect(() => { installInput() }, [])

  useEffect(() => {
    if (snapshot?.phase !== 'surface') initialized.current = false
  }, [snapshot?.phase])

  // Spawn position
  useEffect(() => {
    if (!ev1 || snapshot?.phase !== 'surface' || initialized.current) return
    initialized.current = true
    live.jack.x = Math.max(-EXTENT + 20, Math.min(EXTENT - 20, ev1.x + 3.2))
    live.jack.z = Math.max(-EXTENT + 20, Math.min(EXTENT - 20, ev1.z + 2.8))
    live.jack.y = heightAt(live.jack.x, live.jack.z)
    live.jack.heading = ev1.heading
    live.jack.speedMs = 0
    live.jack.moving = 0
    live.jack.stride = 0
    live.camYaw = ev1.heading
    live.camPitch = 0.26
    live.camDist = 9

    const rTgt = followTarget(live.jack.x, live.jack.z, live.jack.heading)
    live.rover.x = rTgt.x
    live.rover.z = rTgt.z
    live.rover.heading = live.jack.heading
    live.rover.speedMs = 0
  }, [ev1, snapshot?.phase])

  // Update selected station when approaching
  useEffect(() => {
    if (nearStation) setSelectedStationId(nearStation)
  }, [nearStation])

  // Sim & Pose loop
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
      if (!snapshot.mission.paused && !snapshot.outcome && ui === null) {
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

      // Drive MERV to follow EV-2
      const r = live.rover
      const timeScale = Math.max(1, Math.min(30, snapshot.mission.timeScale || 1))
      const dtEva = dt * timeScale
      const t = followTarget(j.x, j.z, j.heading)
      stepRover(r, {
        targetX: t.x,
        targetZ: t.z,
        jackX: j.x,
        jackZ: j.z,
        hold: snapshot.mission.paused || snapshot.mission.sheltering,
        directIrradianceW: 590,
        tau: snapshot.environment.dustOpacity || 0.5,
        windMs: snapshot.environment.visibilityM < 500 ? 18 : 6,
      }, dtEva)

      // Audio loop update
      if (audioRef.current?.isRunning) {
        const inputs: AudioInputs = {
          densityKgM3: 0.015,
          speedOfSoundMs: 240,
          windMs: snapshot.environment.visibilityM < 500 ? 18 : 6,
          gustMs: snapshot.environment.visibilityM < 500 ? 24 : 10,
          dustTau: snapshot.environment.dustOpacity,
          speedMs: j.speedMs,
          working: false,
          tool: '',
          electricalW: 240,
          status: (snapshot.lifeSupport.returnStatus as never) || 'nominal',
        }
        audioRef.current.update(inputs, dt)
      }

      if (now - lastSent >= 100) {
        lastSent = now
        multiplayer.publishPose({
          x: j.x, z: j.z, heading: j.heading, speedMs: j.speedMs,
          moving: j.moving, stride: j.stride, sentAt: Date.now(),
          rover: {
            x: live.rover.x,
            z: live.rover.z,
            heading: live.rover.heading,
            speedMs: live.rover.speedMs,
            moving: live.rover.speedMs > 0.05 ? 1 : 0,
          },
        })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [multiplayer.publishPose, snapshot, ui])

  // Mouse orbit / look
  useEffect(() => {
    let dragging = false; let x = 0; let y = 0
    const down = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.panel, button, input, .modal')) return
      dragging = true; x = event.clientX; y = event.clientY
    }
    const move = (event: MouseEvent) => {
      if (!dragging) return
      live.camYaw -= (event.clientX - x) * 0.005
      live.camPitch = Math.max(-0.12, Math.min(0.95, live.camPitch + (event.clientY - y) * 0.004))
      x = event.clientX; y = event.clientY
    }
    const up = () => { dragging = false }
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('.panel, .modal')) return
      live.camDist = Math.max(3.2, Math.min(42, live.camDist + event.deltaY * 0.012))
    }
    window.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); window.addEventListener('wheel', wheel, { passive: true })
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('wheel', wheel) }
  }, [])

  // Action: Take photo
  const takePhoto = useCallback(() => {
    setFlash(true)
    setTimeout(() => setFlash(false), 240)
    const dataUrl = live.captureFrame?.()
    const st = nearStation ? STATIONS.find((s) => s.id === nearStation) : null
    const label = st ? `${st.name} survey` : 'Delta traverse outcrop'
    if (dataUrl) {
      const newPhoto: CapturedPhoto = {
        id: String(Date.now()),
        url: dataUrl,
        title: label,
        time: new Date().toLocaleTimeString(),
        stationName: st?.name ?? null,
      }
      setPhotos((prev) => [newPhoto, ...prev])
    }
    multiplayer.sendChat(`📸 [PHOTO SURVEY] EV-2 captured 4K survey frame at ${st?.name ?? 'field position'}`)
  }, [multiplayer, nearStation])

  // Hotkey dispatch
  useEffect(() => {
    return onPress((code) => {
      if (ui !== null && code !== 'Escape') return
      switch (code) {
        case 'Escape': setUi(null); break
        case 'KeyF': setUi((cur) => cur === 'science' ? null : 'science'); break
        case 'KeyM': setUi((cur) => cur === 'map' ? null : 'map'); break
        case 'KeyN': setUi((cur) => cur === 'realsite' ? null : 'realsite'); break
        case 'KeyB': setUi((cur) => cur === 'backpack' ? null : 'backpack'); break
        case 'KeyO': setUi((cur) => cur === 'objectives' ? null : 'objectives'); break
        case 'KeyG': setUi((cur) => cur === 'flag' ? null : 'flag'); break
        case 'KeyJ': setUi((cur) => cur === 'rover' ? null : 'rover'); break
        case 'KeyK': setUi((cur) => cur === 'data' ? null : 'data'); break
        case 'KeyT': setUi((cur) => cur === 'comms' ? null : 'comms'); break
        case 'KeyC': takePhoto(); break
        case 'KeyV':
          setFirstPerson((v) => {
            const next = !v
            live.firstPerson = next
            return next
          })
          break
        case 'Enter':
          if (atLander) multiplayer.sendChat('🏠 [STATUS] EV-2 reached lander airlock and is ready for ingress.')
          else if (nearStation) setUi('science')
          break
      }
    })
  }, [atLander, nearStation, takePhoto, ui, multiplayer])

  const sendChat = (textToSend?: string) => {
    const clean = (textToSend ?? chatInput).trim()
    if (!clean) return
    multiplayer.sendChat(clean)
    if (!textToSend) setChatInput('')
  }

  // Range and bearings
  const distToEv1 = ev1 ? Math.hypot(live.jack.x - ev1.x, live.jack.z - ev1.z) : 0
  const bearingToEv1 = ev1 ? (Math.atan2(ev1.x - live.jack.x, ev1.z - live.jack.z) * (180 / Math.PI) + 360) % 360 : null
  const distToLander = Math.hypot(live.jack.x, live.jack.z)
  const bearingToLander = (Math.atan2(-live.jack.x, -live.jack.z) * (180 / Math.PI) + 360) % 360
  const headingDeg = (live.jack.heading * (180 / Math.PI) + 360) % 360

  const activeStation = STATIONS.find((s) => s.id === selectedStationId) ?? STATIONS[0]
  const stationRoverImage: RoverImage | undefined = ROVER_IMAGES[activeStation.id]?.[0] ?? ROVER_IMAGES.kodiak?.[0]

  if (!snapshot || snapshot.phase !== 'surface' || !ev1) {
    return (
      <div className="screen center grid-bg">
        <div className="panel clipped brackets" style={{ padding: 24, width: 'min(90vw, 600px)', textAlign: 'center' }}>
          <div className="display cy" style={{ fontSize: 18 }}>EV-2 SURFACE LINK READY</div>
          <p style={{ marginTop: 10 }}>
            Waiting for EV-1 to start the EVA traverse. The 3D Jezero surface and full scientific suit HUD will engage automatically.
          </p>
          <div className="src" style={{ marginTop: 12 }}>Room {multiplayer.roomCode} · {multiplayer.status} · Role: EV-2</div>
          <button className="btn ghost" style={{ marginTop: 16 }} onClick={multiplayer.leaveMission}>Leave mission</button>
        </div>
      </div>
    )
  }

  const stationsState = STATIONS.reduce((acc, st) => {
    const isDone = observations[st.id] !== undefined
    acc[st.id] = { choice: isDone ? observations[st.id].optionId : undefined }
    return acc
  }, {} as Record<string, { choice?: string }>)

  return (
    <div className="screen" style={{ overflow: 'hidden', userSelect: 'none' }}>
      {/* 3D Surface View */}
      <CoopWorld
        ev1={ev1}
        dust={snapshot.environment.dustOpacity}
        path={path}
        progressIndex={progressIndex}
        nearStation={nearStation}
        stationsState={stationsState}
        firstPerson={firstPerson}
        allFlags={allFlags}
      />

      {/* Shutter Flash Animation */}
      {flash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
          background: 'rgba(255,255,255,0.7)', transition: 'opacity 200ms ease-out',
        }} />
      )}

      {/* Scanlines & Vignette */}
      <div className="screen scanlines vignette" style={{ pointerEvents: 'none', zIndex: 10 }} />

      {/* Top Nav Compass */}
      <CompassTape headingDeg={headingDeg} bearingToEv1={bearingToEv1} bearingToLander={bearingToLander} />

      {/* Top Right Quick Status */}
      <div style={{
        position: 'fixed', top: 12, right: 12, zIndex: 20, display: 'flex', gap: 6, alignItems: 'center',
      }}>
        <Chip tone={multiplayer.status === 'connected' ? 'nominal' : 'caution'}>{multiplayer.status}</Chip>
        <Chip tone="info">ROOM {multiplayer.roomCode}</Chip>
        <button
          className="btn sm ghost"
          onClick={() => {
            setFirstPerson((v) => {
              const next = !v
              live.firstPerson = next
              return next
            })
          }}
          title="Toggle First/Third Person [V]"
        >
          {firstPerson ? '1ST PERSON [V]' : 'CHASE CAM [V]'}
        </button>
      </div>

      {/* Left Telemetry HUD */}
      <div className="panel clipped" style={{
        position: 'fixed', left: 12, top: 12, zIndex: 20, padding: 12, width: 'min(92vw, 320px)',
        background: 'rgba(5,9,15,0.92)', backdropFilter: 'blur(6px)', border: '1px solid var(--line)',
      }}>
        <div className="row between gap8 wrap">
          <span className="display cy" style={{ fontSize: 13, letterSpacing: '0.12em' }}>
            EV-2 / {multiplayer.callsign}
          </span>
          <Chip tone="nominal">ACTIVE SUIT</Chip>
        </div>

        <div className="kv" style={{ marginTop: 8 }}>
          <dt>Mission Time</dt><dd className="mono cy">{Math.floor(snapshot.mission.evaSec / 60)} min</dd>
          <dt>O₂ Supply</dt>
          <dd>
            <Meter value={snapshot.lifeSupport.o2} height={6} />
          </dd>
          <dt>Suit Battery</dt>
          <dd>
            <Meter value={snapshot.lifeSupport.battery} height={6} />
          </dd>
          <dt>Return Margin</dt>
          <dd className="mono" style={{ color: snapshot.lifeSupport.reserveMarginMin < 0 ? 'var(--red)' : 'var(--lime)' }}>
            {snapshot.lifeSupport.returnMarginMin.toFixed(0)} min
          </dd>
        </div>

        <hr className="rule" style={{ margin: '8px 0' }} />

        {/* Tactical Radar */}
        <div className="label" style={{ marginBottom: 4 }}>Crew Radar & Targets</div>
        <div className="kv">
          <dt>EV-1 (Lead)</dt>
          <dd className="mono am">
            {distToEv1.toFixed(0)} m {bearingToEv1 != null ? `(${Math.round(bearingToEv1)}°)` : ''}
          </dd>
          <dt>Lander</dt>
          <dd className="mono">{distToLander.toFixed(0)} m</dd>
          <dt>Weather</dt>
          <dd>{snapshot.environment.headline}</dd>
          <dt>Dust Opacity</dt>
          <dd className="mono">{snapshot.environment.dustOpacity.toFixed(2)} τ</dd>
        </div>
      </div>

      {/* Action Prompt Banner (Center Screen) */}
      {(nearStation || atLander || nearCache) && ui === null && (
        <div style={{
          position: 'fixed', bottom: 82, left: '50%', transform: 'translateX(-50%)',
          zIndex: 25, textAlign: 'center', pointerEvents: 'auto',
        }}>
          <div className="panel clipped brackets" style={{
            padding: '10px 22px', background: 'rgba(4,7,12,0.94)', border: '1px solid var(--cyan)',
            boxShadow: '0 0 16px rgba(79,232,255,0.22)',
          }}>
            {nearStation && (
              <div className="row gap12" style={{ alignItems: 'center' }}>
                <span className="display cy" style={{ fontSize: 14 }}>
                  TARGET: {STATIONS.find((s) => s.id === nearStation)?.name.toUpperCase()}
                </span>
                <button className="btn primary sm" onClick={() => setUi('science')}>
                  [F] Field Science & Analysis
                </button>
                <button className="btn sm" onClick={takePhoto}>
                  [C] Survey Photo
                </button>
              </div>
            )}
            {atLander && !nearStation && (
              <div className="row gap12" style={{ alignItems: 'center' }}>
                <span className="display lm" style={{ fontSize: 14 }}>AT LANDER AIRLOCK</span>
                <button
                  className="btn primary sm"
                  onClick={() => multiplayer.sendChat('🏠 [STATUS] EV-2 reached lander airlock and is ready for ingress.')}
                >
                  [Enter] Report Ingress Ready
                </button>
              </div>
            )}
            {nearCache && !nearStation && (
              <div className="display am" style={{ fontSize: 13 }}>
                NEAR DEPOT CACHE: {CACHES.find((c) => c.id === nearCache)?.name}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Hotkey Dock */}
      <div style={{
        position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 22, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
        background: 'rgba(5,9,15,0.85)', padding: '6px 12px', border: '1px solid var(--line)',
        borderRadius: 4, backdropFilter: 'blur(6px)', width: 'max-content', maxWidth: '96vw',
      }}>
        <button className={`btn sm ${ui === 'science' ? 'on' : 'ghost'}`} onClick={() => setUi('science')}>
          [F] Science
        </button>
        <button className={`btn sm ${ui === 'map' ? 'on' : 'ghost'}`} onClick={() => setUi('map')}>
          [M] Map
        </button>
        <button className={`btn sm ${ui === 'realsite' ? 'on' : 'ghost'}`} onClick={() => setUi('realsite')}>
          [N] Real-Site
        </button>
        <button className={`btn sm ${ui === 'backpack' ? 'on' : 'ghost'}`} onClick={() => setUi('backpack')}>
          [B] Backpack {photos.length > 0 && `(${photos.length})`}
        </button>
        <button className={`btn sm ${ui === 'objectives' ? 'on' : 'ghost'}`} onClick={() => setUi('objectives')}>
          [O] Objectives
        </button>
        <button className={`btn sm ${ui === 'flag' ? 'on' : 'ghost'}`} onClick={() => setUi('flag')}>
          [G] Flag
        </button>
        <button className="btn sm primary" onClick={takePhoto}>
          [C] Photo
        </button>
        <button className={`btn sm ${ui === 'rover' ? 'on' : 'ghost'}`} onClick={() => setUi('rover')}>
          [J] Rover MERV
        </button>
        <button className={`btn sm ${ui === 'comms' ? 'on' : 'ghost'}`} onClick={() => setUi('comms')}>
          [T] Comms
        </button>
        <button className={`btn sm ${ui === 'data' ? 'on' : 'ghost'}`} onClick={() => setUi('data')}>
          [K] Data
        </button>
      </div>

      {/* Bottom Right Tactical Radio / Quick Chat */}
      <div className="panel clipped" style={{
        position: 'fixed', right: 12, bottom: 62, zIndex: 20, padding: 8, width: 'min(92vw, 340px)',
        background: 'rgba(5,9,15,0.92)', border: '1px solid var(--line)',
      }}>
        <div className="row between gap6" style={{ marginBottom: 4 }}>
          <span className="label">Crew Radio</span>
          <span className="src">Room {multiplayer.roomCode}</span>
        </div>
        <div className="scroll" style={{ height: 86, marginBottom: 6 }}>
          {multiplayer.history.slice(-8).map((line) => (
            <div key={line.id} style={{ fontSize: 11, marginBottom: 2 }}>
              <span className="mono cy" style={{ fontWeight: line.from === 'ev2' ? 'bold' : 'normal' }}>
                {line.from.toUpperCase()}:
              </span>{' '}
              {line.text}
            </div>
          ))}
        </div>
        <div className="row gap6">
          <input
            aria-label="Crew message"
            value={chatInput}
            maxLength={240}
            placeholder="Type crew radio message…"
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }}
            style={{ flex: 1, minWidth: 0, background: '#05080d', border: '1px solid var(--line)', padding: 6, fontSize: 12 }}
          />
          <button className="btn sm" onClick={() => sendChat()}>Send</button>
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* 1. Science Panel Modal for EV-2 */}
      {ui === 'science' && (
        <Modal title="Geological Investigation & Science Target" onClose={() => setUi(null)} width={980}>
          <div className="stack gap12">
            {/* Station selector */}
            <div className="row gap6 wrap">
              {STATIONS.map((st) => (
                <button
                  key={st.id}
                  className={`btn sm ${selectedStationId === st.id ? 'on' : 'ghost'}`}
                  onClick={() => setSelectedStationId(st.id)}
                >
                  {st.codename} {nearStation === st.id ? '(IN RANGE)' : ''}
                </button>
              ))}
              <div className="grow" />
              {nearStation === activeStation.id ? (
                <Chip tone="nominal">Standing at Outcrop</Chip>
              ) : (
                <Chip tone="caution">Remote (Telemetry View)</Chip>
              )}
            </div>

            <div className="row gap16 wrap" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 440px', minWidth: 300 }}>
                {/* Outcrop Schematic */}
                <div className="label" style={{ marginBottom: 4 }}>Cross-Section Stratigraphy</div>
                <OutcropGraphic station={activeStation} />

                {/* NASA Photograph */}
                <div className="label" style={{ marginTop: 12, marginBottom: 4 }}>NASA Rover Imaging (Perseverance Mastcam-Z)</div>
                {stationRoverImage && <RoverImageCard image={stationRoverImage} compact />}
              </div>

              <div className="stack gap10" style={{ flex: '1 1 420px', minWidth: 300 }}>
                <div className="panel" style={{ padding: 12 }}>
                  <div className="display cy" style={{ fontSize: 16 }}>{activeStation.name}</div>
                  <div className="src" style={{ marginTop: 4, lineHeight: 1.5 }}>{activeStation.briefing}</div>
                  <div className="note info" style={{ marginTop: 8 }}>
                    <strong>Real Target:</strong> {activeStation.realFeature}
                  </div>
                </div>

                {/* Field Observation Tool */}
                <div className="panel" style={{ padding: 12, border: '1px solid var(--cyan)' }}>
                  <div className="label" style={{ color: 'var(--cyan)', marginBottom: 6 }}>
                    EV-2 Field Observation & Stratigraphic Interpretation
                  </div>
                  <p style={{ fontSize: 12, marginBottom: 8 }}>{activeStation.observation.prompt}</p>

                  <div className="stack gap6">
                    {activeStation.observation.options.map((opt) => {
                      const isSelected = observations[activeStation.id]?.optionId === opt.id
                      return (
                        <div
                          key={opt.id}
                          onClick={() => {
                            setObservations((prev) => ({
                              ...prev,
                              [activeStation.id]: { optionId: opt.id, note: opt.text },
                            }))
                            sendChat(`🔬 [SCIENCE OBSERVATION] EV-2 analysed ${activeStation.name}: "${opt.text.slice(0, 80)}"`)
                          }}
                          style={{
                            padding: '8px 10px',
                            background: isSelected ? 'rgba(79,232,255,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${isSelected ? 'var(--cyan)' : 'var(--line)'}`,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          <div className="row between gap6">
                            <span>{opt.text}</span>
                            {isSelected && <Tag kind="game" />}
                          </div>
                          {isSelected && (
                            <div className="src" style={{ marginTop: 4, color: opt.supported ? 'var(--lime)' : 'var(--amber)' }}>
                              {opt.feedback}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="row gap8 wrap" style={{ marginTop: 12 }}>
                    <button
                      className="btn primary sm grow"
                      onClick={() => {
                        sendChat(`📍 [SAMPLE REQUEST] EV-2 recommends core drilling and sampling at ${activeStation.name}!`)
                      }}
                    >
                      Request Team Core Drilling Here
                    </button>
                    <button className="btn sm grow" onClick={takePhoto}>
                      [C] Take Outcrop Photo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 2. Map Modal */}
      {ui === 'map' && (
        <Modal title="Interactive Mission Map & Traverse Coordinates" onClose={() => setUi(null)} width={1100}>
          <div className="stack gap12">
            <div className="row gap6 wrap">
              {LAYERS.map((l: (typeof LAYERS)[number]) => (
                <button
                  key={l.id}
                  className={`btn sm ${mapLayer === l.id ? 'on' : 'ghost'}`}
                  onClick={() => setMapLayer(l.id)}
                >
                  {l.name}
                </button>
              ))}
              <div className="grow" />
              <button className="btn sm primary" onClick={() => setUi('realsite')}>Real-Site HiRISE [N]</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 520px) minmax(280px, 1fr)', gap: 14 }}>
              <LocalMap
                layer={mapLayer}
                routeId={activeRoute.id}
                jack={{ x: live.jack.x, z: live.jack.z, heading: live.jack.heading }}
                jack2={ev1 ? { x: ev1.x, z: ev1.z, heading: ev1.heading, label: 'EV-1' } : null}
                weather={{ kind: snapshot.environment.weather, headline: snapshot.environment.headline, tau: snapshot.environment.dustOpacity } as never}
                stormFromDeg={0}
                sunAzDeg={210}
                sunElDeg={38}
                size={520}
                flags={allFlags}
              />
              <div className="stack gap10">
                <div className="panel" style={{ padding: 12 }}>
                  <div className="display cy" style={{ fontSize: 14, marginBottom: 8 }}>Field Coordinates & Distance</div>
                  <div className="kv">
                    <dt>EV-2 Position</dt><dd className="mono cy">{live.jack.x.toFixed(0)} E / {live.jack.z.toFixed(0)} N</dd>
                    <dt>EV-1 Position</dt><dd className="mono am">{ev1.x.toFixed(0)} E / {ev1.z.toFixed(0)} N</dd>
                    <dt>Separation</dt><dd className="mono">{distToEv1.toFixed(0)} metres</dd>
                    <dt>Distance to Lander</dt><dd className="mono">{distToLander.toFixed(0)} metres</dd>
                    <dt>Traverse Route</dt><dd>{activeRoute.name}</dd>
                  </div>
                </div>
                <ElevationProfile path={path} width={340} progressIndex={progressIndex} />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Real-Site Modal */}
      {ui === 'realsite' && <RealSitePanel onClose={() => setUi(null)} />}

      {/* 4. Objectives Modal */}
      {ui === 'objectives' && <ObjectivesPanel onClose={() => setUi(null)} />}

      {/* 5. Rover MERV Modal */}
      {ui === 'rover' && <RoverPanel onClose={() => setUi(null)} />}

      {/* 6. Data / Provenance Modal */}
      {ui === 'data' && <DataPanel onClose={() => setUi(null)} />}

      {/* Flag Emplacement Modal */}
      {ui === 'flag' && (
        <FlagPicker
          onClose={() => setUi(null)}
          pos={{ x: live.jack.x, z: live.jack.z }}
          nearStation={activeStation?.name ?? null}
          onPlant={(code, name) => {
            const ahead = 1.35
            const fx = live.jack.x + Math.sin(live.jack.heading) * ahead
            const fz = live.jack.z + Math.cos(live.jack.heading) * ahead
            multiplayer.plantFlag(code, name, fx, fz)
            setUi(null)
          }}
        />
      )}

      {/* 7. Backpack & Field Kit Modal */}
      {ui === 'backpack' && (
        <Modal title="EV-2 Backpack — PLSS Consumables & Photo Survey Album" onClose={() => setUi(null)} width={920}>
          <div className="row gap16 wrap" style={{ alignItems: 'flex-start' }}>
            <div className="stack gap10" style={{ width: 300, flex: '0 0 300px' }}>
              <div className="panel" style={{ padding: 12 }}>
                <div className="display cy" style={{ fontSize: 13, marginBottom: 8 }}>PORTABLE LIFE SUPPORT (PLSS)</div>
                <div className="stack gap8">
                  <div>
                    <div className="row between"><span className="label">O₂ Supply</span><span className="mono">{(snapshot.lifeSupport.o2 * 100).toFixed(0)}%</span></div>
                    <Meter value={snapshot.lifeSupport.o2} height={6} />
                  </div>
                  <div>
                    <div className="row between"><span className="label">CO₂ Scrubber</span><span className="mono">{(snapshot.lifeSupport.scrubber * 100).toFixed(0)}%</span></div>
                    <Meter value={snapshot.lifeSupport.scrubber} height={6} />
                  </div>
                  <div>
                    <div className="row between"><span className="label">Battery</span><span className="mono">{(snapshot.lifeSupport.battery * 100).toFixed(0)}%</span></div>
                    <Meter value={snapshot.lifeSupport.battery} height={6} />
                  </div>
                  <div>
                    <div className="row between"><span className="label">Feedwater</span><span className="mono">{(snapshot.lifeSupport.water * 100).toFixed(0)}%</span></div>
                    <Meter value={snapshot.lifeSupport.water} height={6} />
                  </div>
                </div>
              </div>

              <div className="panel" style={{ padding: 12 }}>
                <div className="display cy" style={{ fontSize: 13, marginBottom: 6 }}>FIELD SCIENCE GEAR</div>
                <ul className="src" style={{ paddingLeft: 14, margin: 0, lineHeight: 1.6 }}>
                  <li><strong>PIXL:</strong> Planetary Instrument for X-ray Lithochemistry</li>
                  <li><strong>Mastcam-Z:</strong> Dual stereo multispectral survey camera</li>
                  <li><strong>Nitrogen Puff Tool:</strong> High-pressure regolith clearance</li>
                  <li><strong>Core Catcher:</strong> Titanium sample tube rack</li>
                </ul>
              </div>
            </div>

            {/* Captured Photos */}
            <div className="stack gap10 grow" style={{ minWidth: 320 }}>
              <div className="panel" style={{ padding: 12 }}>
                <div className="row between gap8" style={{ marginBottom: 10 }}>
                  <div className="display cy" style={{ fontSize: 13 }}>EV-2 SURVEY PHOTO ROLL ({photos.length})</div>
                  <button className="btn sm primary" onClick={takePhoto}>[C] Snap Frame Now</button>
                </div>
                {photos.length === 0 ? (
                  <p className="src" style={{ padding: 18, textAlign: 'center' }}>
                    No survey photos captured yet. Press <strong>[C]</strong> anywhere on the surface to capture high-resolution frames.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                    {photos.map((p) => (
                      <div key={p.id} style={{ border: '1px solid var(--line)', background: '#05080d', padding: 6 }}>
                        <img src={p.url} alt={p.title} style={{ width: '100%', height: 110, objectFit: 'cover' }} />
                        <div className="mono cy" style={{ fontSize: 11, marginTop: 4 }}>{p.title}</div>
                        <div className="src" style={{ fontSize: 10 }}>{p.time}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 8. Tactical Comms Modal */}
      {ui === 'comms' && (
        <Modal title="Crew Tactical Comms & Direct Dispatch" onClose={() => setUi(null)} width={680}>
          <div className="stack gap12">
            <div className="label">Quick Tactical Callouts</div>
            <div className="row gap6 wrap">
              <button className="btn sm" onClick={() => sendChat('📍 [STATUS] EV-2 is standing at target outcrop.')}>
                At Station
              </button>
              <button className="btn sm" onClick={() => sendChat('✅ [CHECK] Area is nominal, clear footing.')}>
                Area Clear
              </button>
              <button className="btn sm" onClick={() => sendChat('💨 [WEATHER] Dust rising, visibility dropping.')}>
                Dust Rising
              </button>
              <button className="btn sm" onClick={() => sendChat('⚠️ [REQUEST] Recommend holding position.')}>
                Recommend Hold
              </button>
              <button className="btn sm" onClick={() => sendChat('🏠 [STATUS] EV-2 heading back to lander.')}>
                Head to Lander
              </button>
              <button className="btn sm" onClick={() => sendChat('🔋 [REPORT] Consumables check: O2 and battery nominal.')}>
                Consumables Check
              </button>
            </div>
            <hr className="rule" />
            <div className="label">Full Mission Radio Log</div>
            <div className="panel scroll" style={{ height: 220, padding: 10, background: '#05080d' }}>
              {multiplayer.history.map((msg) => (
                <div key={msg.id} style={{ fontSize: 12, marginBottom: 5 }}>
                  <span className="mono cy" style={{ fontWeight: msg.from === 'ev2' ? 'bold' : 'normal' }}>
                    [{msg.from.toUpperCase()}]
                  </span>{' '}
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="row gap8">
              <input
                aria-label="Dispatch input"
                value={chatInput}
                maxLength={240}
                placeholder="Broadcast dispatch to EV-1 and HABCOM…"
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }}
                style={{ flex: 1, padding: 8, background: '#05080d', border: '1px solid var(--line)' }}
              />
              <button className="btn primary" onClick={() => sendChat()}>Broadcast</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
