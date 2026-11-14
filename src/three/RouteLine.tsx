import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { SampledPoint } from '../mission/path'

/**
 * The planned route, drawn on the ground.
 *
 * This is the link between the planning map and the walk: the line Jack sees
 * underfoot is the same sampled polyline the planner costed, read from the same
 * array. Choosing a different route in the planner changes this line, changes the
 * waypoint order, and changes the return estimate, because all three read the
 * same `path`.
 */
/**
 * Fades a basic material out within a few metres of the camera. Without this the
 * guide line passes directly under the chase camera and a 26 cm tube at arm's
 * length fills a third of the screen.
 */
function nearFade(mat: THREE.Material, start: number, end: number) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n varying float vCamDist;`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n vCamDist = -mvPosition.z;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n varying float vCamDist;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n diffuseColor.a *= smoothstep(${start.toFixed(1)}, ${end.toFixed(1)}, vCamDist);`,
      )
  }
  mat.needsUpdate = true
  return mat
}

export default function RouteLine({ path, progressIndex }: { path: SampledPoint[]; progressIndex: number }) {
  const pulse = useRef<THREE.Mesh>(null)

  const shellMat = useMemo(
    () => nearFade(new THREE.MeshBasicMaterial({ color: '#1fb6d8', transparent: true, opacity: 0.3, depthWrite: false }), 5, 22),
    [],
  )
  const coreMat = useMemo(
    () => nearFade(new THREE.MeshBasicMaterial({ color: '#8df4ff', transparent: true, opacity: 0.42, depthWrite: false }), 5, 22),
    [],
  )

  const { geo, geoCore, points } = useMemo(() => {
    const step = Math.max(1, Math.floor(path.length / 320))
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < path.length; i += step) {
      pts.push(new THREE.Vector3(path[i].x, path[i].h + 0.35, path[i].z))
    }
    const last = path[path.length - 1]
    pts.push(new THREE.Vector3(last.x, last.h + 0.35, last.z))
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2)
    const segs = Math.min(900, pts.length * 3)
    return {
      geo: new THREE.TubeGeometry(curve, segs, 0.26, 8, false),
      geoCore: new THREE.TubeGeometry(curve, segs, 0.085, 6, false),
      points: pts,
    }
  }, [path])

  useFrame(({ clock }) => {
    if (!pulse.current || points.length < 2) return
    const t = (clock.elapsedTime * 0.08) % 1
    const i = Math.min(points.length - 1, Math.floor(t * (points.length - 1)))
    pulse.current.position.copy(points[i])
    pulse.current.position.y += 0.25
  })

  const done = Math.min(1, progressIndex / Math.max(1, path.length - 1))

  return (
    <group>
      <mesh geometry={geo} material={shellMat} renderOrder={5} />
      {/* A brighter core so the line reads against bright regolith without glare */}
      <mesh geometry={geoCore} material={coreMat} renderOrder={6} />
      {/* A travelling pulse so the route reads as a direction, not just a line */}
      <mesh ref={pulse}>
        <sphereGeometry args={[0.42, 14, 10]} />
        <meshBasicMaterial color="#cdf6ff" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      {/* Waypoint pylons every ~120 m */}
      {points
        .filter((_, i) => i % 18 === 0)
        .map((p, i) => (
          <group key={i} position={[p.x, p.y - 0.3, p.z]}>
            <mesh position={[0, 0.65, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 1.3, 6]} />
              <meshBasicMaterial
                color={i / (points.length / 18) < done ? '#7dffb2' : '#6ff2ff'}
                transparent
                opacity={0.75}
              />
            </mesh>
            <mesh position={[0, 1.38, 0]}>
              <sphereGeometry args={[0.1, 10, 8]} />
              <meshBasicMaterial color="#cdf6ff" />
            </mesh>
          </group>
        ))}
    </group>
  )
}
