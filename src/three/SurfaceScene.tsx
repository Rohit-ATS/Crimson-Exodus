import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../state/store'
import { live } from '../state/live'
import { heightAt } from '../mission/terrain'
import Terrain from './Terrain'
import FarTerrain from './FarTerrain'
import Rocks from './Rocks'
import Jack from './Jack'
import Lander from './Lander'
import Sky from './Sky'
import RouteLine from './RouteLine'
import Markers from './Markers'
import FlagMesh from './FlagMesh'
import { DustDevil, DustField } from './Dust'

const DEG = Math.PI / 180

/**
 * Sun direction from the real solar azimuth and elevation at Jezero.
 * Azimuth is measured clockwise from north; +z is north and +x is east.
 */
function sunVector(azDeg: number, elDeg: number): THREE.Vector3 {
  const el = elDeg * DEG
  const az = azDeg * DEG
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  ).normalize()
}

export default function SurfaceScene() {
  const clock = useStore((s) => s.clock)
  const env = useStore((s) => s.env)
  const weather = useStore((s) => s.weather)
  const path = useStore((s) => s.path)
  const pathIndex = useStore((s) => s.pathIndex)
  const stations = useStore((s) => s.stations)
  const nearStation = useStore((s) => s.nearStation)
  const flag = useStore((s) => s.flag)
  const hazardOverlay = useStore((s) => s.hazardOverlay)
  const jackX = useStore((s) => s.jackX)
  const jackZ = useStore((s) => s.jackZ)
  const dustFouling = useStore((s) => s.cons.dustFouling)
  const cachesUsed = useStore((s) => s.cachesUsed)

  const sunDir = useMemo(
    () => sunVector(clock.sunAzimuthDeg, clock.sunElevationDeg),
    [clock.sunAzimuthDeg, clock.sunElevationDeg],
  )

  // Daylight factor: a smooth ramp through twilight rather than a hard cut.
  const dayness = Math.max(0, Math.min(1, (clock.sunElevationDeg + 6) / 12))
  const lowVis = weather.visibilityM < 420
  const lampsOn = lowVis || clock.sunElevationDeg < 4

  // Direct sunlight colour reddens hard as dust and airmass increase.
  const sunColor = useMemo(() => {
    const t = Math.min(1, env.dustOpticalDepth / 3)
    const lowSun = 1 - Math.min(1, Math.max(0, clock.sunElevationDeg) / 25)
    const k = Math.min(1, t * 0.7 + lowSun * 0.6)
    return new THREE.Color().setRGB(1, 0.86 - 0.26 * k, 0.72 - 0.42 * k)
  }, [env.dustOpticalDepth, clock.sunElevationDeg])

  // Fog colour must match the sky at the horizon or the join is visible.
  const fogColor = useMemo(() => {
    const d = Math.min(1, env.dustOpticalDepth / 3.4)
    const clear = new THREE.Color(0.74, 0.52, 0.36)
    const dusty = new THREE.Color(0.78, 0.47, 0.24)
    const thick = new THREE.Color(0.52, 0.29, 0.14)
    const night = new THREE.Color(0.05, 0.035, 0.032)
    return clear.lerp(dusty, Math.min(1, d * 1.6)).lerp(thick, Math.max(0, d - 0.45) / 0.55).lerp(night, 1 - dayness)
  }, [env.dustOpticalDepth, dayness])

  // Visibility -> fog density. Koschmieder: contrast threshold at 3.912/extinction.
  const fogDensity = 3.912 / Math.max(260, weather.visibilityM) * 0.85

  // Irradiance drives exposure. Direct beam at Jezero peaks near 500-600 W/m^2
  // in clear air and collapses to tens of W/m^2 in a storm.
  const sunIntensity = dayness * (0.18 + 2.6 * Math.min(1, env.directIrradiance / 480))
  // In heavy dust the sky becomes the light source: direct sun collapses, the
  // diffuse term rises, and shadows all but disappear. The total still falls.
  const dustLoad = Math.min(1, env.dustOpticalDepth / 3.4)
  const ambientIntensity = dayness * (0.26 + 0.62 * dustLoad) * (1 - 0.42 * dustLoad) + 0.06

  // Overall exposure tracks how much sunlight is actually reaching the ground.
  // Without this a storm renders as a brightly lit orange day.
  const exposure = 0.55 + 0.72 * Math.min(1, Math.pow(env.solarTransmission, 0.42))

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      camera={{ fov: 58, near: 0.1, far: 12000, position: [0, 6, 20] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        scene.background = null
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <fogExp2 attach="fog" color={fogColor} density={fogDensity} />
      <Exposure value={exposure} />

      <Sky sunDir={sunDir} tau={env.dustOpticalDepth} dayness={dayness} transmission={env.solarTransmission} />

      <SunLight dir={sunDir} color={sunColor} intensity={sunIntensity} />

      {/* Sky dome bounce: on Mars this is a strong, warm, very diffuse source. */}
      <hemisphereLight
        args={[fogColor.getHex(), 0x3a2318, ambientIntensity]}
      />
      <ambientLight intensity={0.1 + 0.2 * dayness} color={fogColor} />

      <Terrain dustFouling={dustFouling} />
      <FarTerrain />
      <Rocks dust={dustFouling} />
      <Lander dust={dustFouling} lightsOn />

      <RouteLine path={path} progressIndex={pathIndex} />
      <Markers
        stations={stations}
        nearStation={nearStation}
        showShelters={hazardOverlay || weather.advisesShelter}
        jackPos={[jackX, jackZ]}
        cachesUsed={cachesUsed}
      />

      {flag && <FlagMesh code={flag.code} x={flag.x} z={flag.z} />}

      <Jack dust={dustFouling} lampsOn={lampsOn} hidden={live.firstPerson} />

      <DustField
        intensity={Math.max(0.04, Math.min(1, Math.pow(env.dustOpticalDepth / 3.0, 0.8)))}
        windFromDeg={env.windFromDeg}
        windMs={env.windMs}
      />
      <DustDevil
        active={weather.kind === 'dust-devil'}
        intensity={weather.intensity}
        originX={jackX + Math.sin(weather.minutesToNextPhase) * 120 - 60}
        originZ={jackZ + Math.cos(weather.minutesToNextPhase) * 120 - 60}
        driftDeg={env.windFromDeg}
      />

      <CameraRig />
      <FrameCapture />
    </Canvas>
  )
}

/** Drives the renderer's tone-mapping exposure from the modelled light level. */
function Exposure({ value }: { value: number }) {
  const { gl } = useThree()
  useFrame((_, dt) => {
    // Ease it, the way an eye or an auto-exposure camera would.
    gl.toneMappingExposure += (value - gl.toneMappingExposure) * Math.min(1, dt * 0.9)
  })
  return null
}

/** Exposes a frame grab to the UI, for the photo log. */
function FrameCapture() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    // Bind to THIS renderer, and release it on unmount. Holding a stale closure
    // across a mission restart would have the camera photographing a disposed
    // canvas.
    live.captureFrame = () => {
      try {
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/jpeg', 0.82)
      } catch {
        return undefined
      }
    }
    return () => { live.captureFrame = null }
  }, [gl, scene, camera])
  return null
}

/** Directional sun with a shadow frustum that follows Jack so shadows stay crisp. */
function SunLight({ dir, color, intensity }: { dir: THREE.Vector3; color: THREE.Color; intensity: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const l = light.current
    if (!l) return
    const j = live.jack
    l.position.set(j.x + dir.x * 220, j.y + dir.y * 220, j.z + dir.z * 220)
    target.position.set(j.x, j.y, j.z)
    target.updateMatrixWorld()
    l.target = target
    l.color.copy(color)
    l.intensity = intensity
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={1}
        shadow-camera-far={520}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />
    </>
  )
}

/**
 * Chase camera with a first-person option. Collides softly with the terrain so
 * it never clips below the ground on a slope.
 */
function CameraRig() {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3())
  const pos = useRef(new THREE.Vector3(0, 6, 24))

  useFrame((_, dt) => {
    const j = live.jack
    const k = Math.min(1, dt * 5.2)

    if (live.firstPerson) {
      // Eye height inside the helmet.
      const eye = new THREE.Vector3(j.x, j.y + 1.58, j.z)
      const fwd = new THREE.Vector3(Math.sin(j.heading), 0, Math.cos(j.heading))
      pos.current.lerp(eye, Math.min(1, dt * 14))
      camera.position.copy(pos.current)
      look.current.lerp(
        new THREE.Vector3(j.x + fwd.x * 12, j.y + 1.5 - live.camPitch * 6, j.z + fwd.z * 12),
        Math.min(1, dt * 11),
      )
      camera.lookAt(look.current)
      return
    }

    const yaw = j.heading + Math.PI + live.camYaw
    const d = live.camDist
    const want = new THREE.Vector3(
      j.x + Math.sin(yaw) * d,
      j.y + 1.3 + Math.sin(live.camPitch) * d,
      j.z + Math.cos(yaw) * d,
    )
    // Keep the camera above the ground.
    const ground = heightAt(want.x, want.z) + 1.6
    if (want.y < ground) want.y = ground

    pos.current.lerp(want, k)
    camera.position.copy(pos.current)
    look.current.lerp(new THREE.Vector3(j.x, j.y + 1.35, j.z), Math.min(1, dt * 7))
    camera.lookAt(look.current)
  })

  return null
}
