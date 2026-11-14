import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { heightAt, normalAt } from '../mission/terrain'
import { loadFlagTexture } from '../data/flagTexture'

/**
 * A planted flag.
 *
 * The flag hangs from a horizontal crossbar, not from a halyard. On Mars the air
 * is about 1% of Earth's density, so even a 20 m/s wind carries almost no
 * dynamic pressure and a flag will not fly. Apollo solved the same problem on the
 * airless Moon the same way, with a telescoping rod along the top edge, and the
 * permanent ripple in those flags is a crease from being folded in storage.
 * That is modelled here: a fixed, shallow wave, not a flutter.
 *
 * Planting a flag is commemorative. Outer Space Treaty Article II is explicit
 * that it creates no claim of sovereignty.
 */
export default function FlagMesh({
  code, x, z, scale = 1,
}: { code: string; x: number; z: number; scale?: number }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const [real, setReal] = useState(true)

  useEffect(() => {
    let alive = true
    setTex(null)
    loadFlagTexture(code).then((r) => {
      if (!alive) return
      setTex(r.tex)
      setReal(r.real)
    })
    return () => { alive = false }
  }, [code])

  /**
   * The flag material is built FROM the texture rather than having the texture
   * assigned to it afterwards. Swapping `map` from undefined to a texture on a
   * live MeshStandardMaterial needs a shader recompile, and without it the flag
   * renders as a blank panel.
   */
  const flagMat = useMemo(() => {
    if (!tex) return null
    return new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      side: THREE.DoubleSide,
      roughness: 0.84,
      metalness: 0,
    })
  }, [tex])

  const geo = useMemo(() => {
    const W = 1.3, H = 0.84
    const g = new THREE.PlaneGeometry(W, H, 26, 10)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i)
      const py = pos.getY(i)
      // Distance from the pole, 0 at the hoist edge.
      const u = (px + W / 2) / W
      // Storage crease plus a gravity sag that grows away from the pole.
      const wave = Math.sin(u * Math.PI * 2.1) * 0.052 * u + Math.sin(py * 7.0) * 0.013 * u
      pos.setZ(i, wave)
      pos.setY(i, py - u * u * 0.035)
    }
    g.computeVertexNormals()
    return g
  }, [])

  const mats = useMemo(() => ({
    pole: new THREE.MeshStandardMaterial({ color: '#e4e8ec', roughness: 0.28, metalness: 0.8 }),
    plaque: new THREE.MeshStandardMaterial({ color: '#d9a63c', roughness: 0.3, metalness: 0.9 }),
  }), [])

  const y = heightAt(x, z)
  const [nx, , nz] = normalAt(x, z, 2)

  return (
    <group position={[x, y, z]} rotation={[Math.atan(nz) * 0.6, 0.6, -Math.atan(nx) * 0.6]} scale={scale}>
      {/* Pole, driven into the regolith */}
      <mesh position={[0, 1.08, 0]} material={mats.pole} castShadow>
        <cylinderGeometry args={[0.036, 0.028, 2.16, 12]} />
      </mesh>
      {/* Crossbar holding the flag out, because the air cannot */}
      <mesh position={[0.66, 2.02, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.pole} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 1.36, 10]} />
      </mesh>
      {/* The flag itself. It only appears once its image has actually arrived. */}
      {flagMat
        ? <mesh position={[0.56, 1.63, 0]} geometry={geo} material={flagMat} castShadow />
        : (
          <mesh position={[0.67, 1.56, 0]} geometry={geo} castShadow>
            <meshStandardMaterial color="#6a6f76" side={THREE.DoubleSide} roughness={0.9} />
          </mesh>
        )}
      {!real && (
        /* A marker that this is the drawn stand-in, not a national flag image. */
        <mesh position={[0.67, 1.1, 0.01]}>
          <planeGeometry args={[1.3, 0.035]} />
          <meshBasicMaterial color="#ffb24a" />
        </mesh>
      )}
      {/* Commemorative plaque at the base */}
      <mesh position={[0, 0.34, 0.035]} material={mats.plaque} castShadow>
        <boxGeometry args={[0.3, 0.17, 0.02]} />
      </mesh>
      {/* Foot disc so it does not appear to float on rough ground */}
      <mesh position={[0, 0.03, 0]} material={mats.pole}>
        <cylinderGeometry args={[0.13, 0.15, 0.06, 14]} />
      </mesh>
    </group>
  )
}
