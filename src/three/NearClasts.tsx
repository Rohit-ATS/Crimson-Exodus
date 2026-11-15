/**
 * NearClasts.tsx — The ground under your boots.
 *
 * Scattering a few thousand rocks over a 2.4 km square puts almost none of
 * them within twenty metres of the camera, so the near field reads as a smooth
 * painted plain and the whole scene looks like a render instead of a place.
 * Every rover panorama ever returned shows the opposite: the ground within a
 * few metres of the camera is covered in centimetre-scale clasts, and it is
 * that litter, more than any distant landform, that makes an image of Mars
 * look like Mars.
 *
 * So this is a second clast layer that FOLLOWS the camera. A grid of cells is
 * laid over the ground around Jack; each cell either holds a clast or does
 * not, decided by hashing the cell's integer coordinates. Because the decision
 * comes from the coordinates and not from a random sequence, a rock stays
 * exactly where it is when you walk away and come back, and the window can be
 * slid without anything swimming or popping into a new arrangement.
 *
 * Two layers:
 *   COBBLES  1.2 m cells out to ~40 m, clasts 3-26 cm. The litter that casts
 *            visible shadows and gives the ground its scale.
 *   GRIT     0.34 m cells out to ~11 m, clasts 8-30 mm. Boot-scale granules,
 *            below the resolution of any texture, present only near the
 *            camera where they are actually resolvable.
 *
 * Density is driven by the same `roughnessAt` and `slopeDeg` the traverse cost
 * model uses, so the ground looks blocky exactly where the planner says the
 * walking is slow. The scene and the plan never disagree.
 *
 * LABEL: synthetic terrain. Real Jezero clast abundance comes from HiRISE and
 * rover imagery; this is a procedural stand-in with a plausible size
 * distribution, not a measured one.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { heightAt, roughnessAt, slopeDeg } from '../mission/terrain'
import { live } from '../state/live'
import { renderTier } from '../state/settings'

/** Integer hash. Math.imul keeps every product inside 32 bits. */
function hash3(x: number, y: number, k: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k | 0, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** An angular clast: an icosahedron with its vertices pushed around. */
function clast(detail: number, jitter: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const pos = g.attributes.position as THREE.BufferAttribute
  const seen = new Map<string, [number, number, number]>()
  let n = seed
  const r = () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296 }
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let d = seen.get(key)
    if (!d) {
      d = [1 + (r() - 0.5) * jitter, 1 + (r() - 0.5) * jitter, 1 + (r() - 0.5) * jitter]
      seen.set(key, d)
    }
    pos.setXYZ(i, pos.getX(i) * d[0], pos.getY(i) * d[1], pos.getZ(i) * d[2])
  }
  g.computeVertexNormals()
  return g
}

interface LayerSpec {
  /** Cell size, metres. */
  cell: number
  /** Half-width of the window, in cells. */
  half: number
  /** Clast size range, metres. */
  minR: number
  maxR: number
  /** Base probability a cell holds a clast on flat, smooth ground. */
  base: number
  /** Hard ceiling on density, and the cheap first rejection test. */
  maxP: number
  /** Density never falls below this: bare ground on Mars is not actually bare. */
  floor: number
  /**
   * Whether density follows the terrain. The cobble layer does, because where
   * the ground is blocky matters to the player. The grit layer does not: it is
   * everywhere, and sampling the height field for thousands of cells several
   * times a second to decide otherwise is not worth the frame time.
   */
  terrainDriven: boolean
  /**
   * Rebuild granularity, in cells. The whole window is rebuilt when it slides,
   * so sliding it every single cell makes a visible hitch once a second while
   * walking. Snapping the window origin to every Nth cell cuts that by N, and
   * the only cost is that the far edge of the layer steps in N-cell jumps
   * forty metres away, where nothing can see it.
   */
  stride: number
  /** True for the boot-scale layer, which the lowest tier drops. */
  gritLayer: boolean
  seed: number
  geometry: THREE.BufferGeometry
  castShadow: boolean
}

function Layer({ spec, material }: { spec: LayerSpec; material: THREE.Material }) {
  const n = (spec.half * 2 + 1) * (spec.half * 2 + 1)
  const mesh = useRef<THREE.InstancedMesh>(null)
  const lastMesh = useRef<THREE.InstancedMesh | null>(null)
  const origin = useRef<[number, number]>([NaN, NaN])
  const halfRef = useRef(0)

  const scratch = useMemo(() => ({
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    e: new THREE.Euler(),
    p: new THREE.Vector3(),
    s: new THREE.Vector3(),
    hidden: new THREE.Matrix4().makeScale(0, 0, 0),
  }), [])

  useFrame(() => {
    const im = mesh.current
    if (!im) return
    // React Three Fiber may replace an object when one of its constructor
    // args changes. A replacement has empty instance matrices, so invalidate
    // the spatial cache and repopulate it even when Jack has not crossed a
    // window boundary since the previous frame.
    if (lastMesh.current !== im) {
      lastMesh.current = im
      origin.current = [NaN, NaN]
      halfRef.current = 0
    }
    // A low tier draws a tighter window, and skips the grit layer entirely.
    const q = renderTier.current
    if (spec.gritLayer && !q.grit) {
      if (im.count !== 0) { im.count = 0; im.instanceMatrix.needsUpdate = true }
      origin.current = [NaN, NaN]
      return
    }
    const half = Math.max(6, Math.round(spec.half * q.clastScale))
    const st = spec.stride
    const cx = Math.round(live.jack.x / spec.cell / st) * st
    const cz = Math.round(live.jack.z / spec.cell / st) * st
    // Only rebuild when the window has actually slid to a new cell.
    if (origin.current[0] === cx && origin.current[1] === cz && halfRef.current === half) return
    origin.current = [cx, cz]
    halfRef.current = half

    let i = 0
    for (let gz = -half; gz <= half; gz++) {
      for (let gx = -half; gx <= half; gx++) {
        const ix = cx + gx
        const iz = cz + gz
        const x = ix * spec.cell
        const z = iz * spec.cell

        // Circular window, so the layer has no visible square edge.
        if (gx * gx + gz * gz > half * half) { im.setMatrixAt(i++, scratch.hidden); continue }

        // Keep the landing pad itself swept.
        if (Math.hypot(x, z) < 9) { im.setMatrixAt(i++, scratch.hidden); continue }

        const h0 = hash3(ix, iz, spec.seed)
        // Cheap rejection first: most cells are empty, and the terrain
        // functions are noise sums that are not worth evaluating for a cell
        // that is about to be thrown away.
        if (h0 > spec.maxP) { im.setMatrixAt(i++, scratch.hidden); continue }
        if (spec.terrainDriven) {
          // Talus and scoured ground are blocky; dune fields bury everything.
          // The floor matters: even the smoothest Martian plain in any rover
          // image is littered with clasts, so density thins but never reaches
          // zero.
          const p = Math.min(spec.maxP, Math.max(
            spec.floor, spec.base + (slopeDeg(x, z) / 30) * 0.5 + (roughnessAt(x, z) - 1) * 0.55))
          if (h0 > p) { im.setMatrixAt(i++, scratch.hidden); continue }
        } else if (h0 > spec.base) {
          im.setMatrixAt(i++, scratch.hidden); continue
        }

        const h1 = hash3(ix, iz, spec.seed + 7)
        const h2 = hash3(ix, iz, spec.seed + 23)
        const h3 = hash3(ix, iz, spec.seed + 71)
        const h4 = hash3(ix, iz, spec.seed + 137)

        // Jitter inside the cell so the grid never shows.
        const jx = x + (h1 - 0.5) * spec.cell * 0.92
        const jz = z + (h2 - 0.5) * spec.cell * 0.92

        // Steep power law: many small clasts, very few large ones.
        const r = spec.minR + (spec.maxR - spec.minR) * Math.pow(h3, 3.4)
        // Partly buried, as every clast on a regolith surface is.
        const y = heightAt(jx, jz) - r * (0.2 + h4 * 0.34)

        scratch.e.set(h1 * Math.PI, h2 * Math.PI * 2, h3 * Math.PI)
        scratch.q.setFromEuler(scratch.e)
        scratch.p.set(jx, y, jz)
        // Platy float is common on Mars, so flatten roughly a third of them.
        scratch.s.set(
          r * (0.8 + h4 * 0.4),
          r * (h2 < 0.33 ? 0.3 + h3 * 0.25 : 0.72 + h3 * 0.45),
          r * (0.8 + h1 * 0.4),
        )
        scratch.m.compose(scratch.p, scratch.q, scratch.s)
        im.setMatrixAt(i++, scratch.m)
      }
    }
    im.count = i
    im.instanceMatrix.needsUpdate = true
    im.computeBoundingSphere()
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[spec.geometry, material, n]}
      castShadow={spec.castShadow}
      receiveShadow
      frustumCulled={false}
    />
  )
}

export default function NearClasts({ dust = 0 }: { dust?: number }) {
  const geoCobble = useMemo(() => clast(1, 0.62, 4821), [])
  const geoGrit = useMemo(() => clast(0, 0.85, 9137), [])

  // Keep the material identity stable. Passing a freshly-created material in
  // `args` makes R3F reconstruct the InstancedMesh; the old spatial cache then
  // incorrectly says its matrices are already populated, producing the
  // all-at-once rock flicker seen while the dust value changes during motion.
  const material = useMemo(() => {
    // Clasts at Jezero are basaltic: darker than the dust that coats
    // everything, which is exactly why a swept rock reads dark against a
    // dusty plain.
    return new THREE.MeshStandardMaterial({
      color: 0x5b4433,
      roughness: 0.94,
      metalness: 0,
      flatShading: true,
      envMapIntensity: 0.7,
    })
  }, [])

  useEffect(() => {
    const base = new THREE.Color(0x5b4433)
    const dusty = new THREE.Color(0x8c6545)
    material.color.copy(base).lerp(dusty, 0.34 + dust * 0.32)
  }, [dust, material])

  const specs = useMemo<LayerSpec[]>(() => [
    {
      cell: 1.1, half: 36, minR: 0.03, maxR: 0.3,
      base: 0.26, floor: 0.17, maxP: 0.9, terrainDriven: true, stride: 3, gritLayer: false,
      seed: 101, geometry: geoCobble, castShadow: true,
    },
    {
      cell: 0.3, half: 34, minR: 0.008, maxR: 0.034,
      base: 0.4, floor: 0.4, maxP: 0.4, terrainDriven: false, stride: 5, gritLayer: true,
      seed: 509, geometry: geoGrit, castShadow: false,
    },
  ], [geoCobble, geoGrit])

  return (
    <group>
      {specs.map((s) => <Layer key={s.seed} spec={s} material={material} />)}
    </group>
  )
}
