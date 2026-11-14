import { useMemo } from 'react'
import * as THREE from 'three'
import { heightAt, roughnessAt, slopeDeg } from '../mission/terrain'

/**
 * Scattered clasts.
 *
 * Rock abundance on Mars is not uniform: it is high on talus below a scarp, on
 * the flanks of a resistant butte, and on wind-scoured bedrock, and low on dust
 * mantles and in active ripple fields where sand buries everything. Placement
 * here is driven by the same slope and roughness functions the traverse cost
 * model uses, so the scene and the plan agree about where the ground is blocky.
 *
 * Size distribution follows the observed pattern of many small clasts and few
 * large blocks (a steep power law), which is what gives Martian plains their
 * characteristic texture in rover panoramas.
 */

const COUNT = 4200

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An angular clast: an icosahedron with its vertices pushed around. */
function clastGeometry(detail: number, jitter: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const rand = mulberry(seed)
  const pos = g.attributes.position as THREE.BufferAttribute
  const seen = new Map<string, [number, number, number]>()
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let d = seen.get(key)
    if (!d) {
      d = [
        1 + (rand() - 0.5) * jitter,
        1 + (rand() - 0.5) * jitter,
        1 + (rand() - 0.5) * jitter,
      ]
      seen.set(key, d)
    }
    pos.setXYZ(i, pos.getX(i) * d[0], pos.getY(i) * d[1], pos.getZ(i) * d[2])
  }
  g.computeVertexNormals()
  return g
}

export default function Rocks({ dust = 0 }: { dust?: number }) {
  const { geoA, geoB, geoC, matrices } = useMemo(() => {
    const rand = mulberry(90210)
    const out: { a: THREE.Matrix4[]; b: THREE.Matrix4[]; c: THREE.Matrix4[] } = { a: [], b: [], c: [] }

    let placed = 0
    let guard = 0
    while (placed < COUNT && guard < COUNT * 40) {
      guard++
      const x = (rand() * 2 - 1) * 1180
      const z = (rand() * 2 - 1) * 1180

      // Keep the landing pad clear.
      if (Math.hypot(x, z) < 34) continue

      const sl = slopeDeg(x, z)
      const rg = roughnessAt(x, z)
      // Probability of a clast here: talus and scoured ground, not dune fields.
      const p = Math.min(1, 0.09 + (sl / 32) * 0.78 + (rg - 1) * 0.6)
      if (rand() > p) continue

      // Steep power-law size distribution: lots of cobbles, few blocks.
      const u = rand()
      const scale = 0.14 + 2.1 * Math.pow(u, 5.2) + (sl > 16 ? Math.pow(rand(), 3) * 1.0 : 0)

      const y = heightAt(x, z) - scale * (0.22 + rand() * 0.3) // partly buried

      const m = new THREE.Matrix4()
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI),
      )
      // Flatten some clasts into slabs; Mars has plenty of platy float.
      const sv = new THREE.Vector3(
        scale * (0.75 + rand() * 0.5),
        scale * (rand() < 0.3 ? 0.3 + rand() * 0.3 : 0.7 + rand() * 0.5),
        scale * (0.75 + rand() * 0.5),
      )
      m.compose(new THREE.Vector3(x, y, z), q, sv)

      const bucket = scale > 1.3 ? 'a' : scale > 0.5 ? 'b' : 'c'
      out[bucket].push(m)
      placed++
    }

    return {
      geoA: clastGeometry(1, 0.7, 11),
      geoB: clastGeometry(1, 0.55, 22),
      geoC: clastGeometry(0, 0.8, 33),
      matrices: out,
    }
  }, [])

  const mat = useMemo(() => {
    const base = new THREE.Color(0x634a35)
    const dusty = new THREE.Color(0x8a6343)
    return new THREE.MeshStandardMaterial({
      color: base.clone().lerp(dusty, 0.42 + dust * 0.3),
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    })
  }, [dust])

  return (
    <group>
      <Instances geometry={geoA} material={mat} matrices={matrices.a} castShadow />
      <Instances geometry={geoB} material={mat} matrices={matrices.b} castShadow />
      <Instances geometry={geoC} material={mat} matrices={matrices.c} castShadow={false} />
    </group>
  )
}

function Instances({
  geometry, material, matrices, castShadow,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrices: THREE.Matrix4[]
  castShadow?: boolean
}) {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length))
    matrices.forEach((m, i) => im.setMatrixAt(i, m))
    im.instanceMatrix.needsUpdate = true
    im.castShadow = !!castShadow
    im.receiveShadow = true
    im.frustumCulled = false
    return im
  }, [geometry, material, matrices, castShadow])
  return <primitive object={mesh} />
}
