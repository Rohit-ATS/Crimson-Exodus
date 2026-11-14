import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { heightAt } from '../mission/terrain'

/** A soft round sprite, generated rather than loaded, so there is no asset to fetch. */
function grainTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,225,195,0.95)')
  grad.addColorStop(0.35, 'rgba(228,170,120,0.45)')
  grad.addColorStop(1, 'rgba(180,120,80,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const BOX = 95

/**
 * Suspended dust.
 *
 * Martian dust grains are a few micrometres across. In 1% of Earth's air density
 * their settling velocity is tiny, so once lifted they stay up for weeks: that is
 * why a regional storm takes sols to clear and why the sky never goes properly
 * clear. The particle field here is dense, slow, and drifts with the modelled
 * wind rather than gusting, which is what suspended dust actually looks like.
 */
export function DustField({
  intensity, windFromDeg, windMs,
}: { intensity: number; windFromDeg: number; windMs: number }) {
  const pts = useRef<THREE.Points>(null)
  const { camera } = useThree()
  const tex = useMemo(grainTexture, [])

  const { geo, velocities } = useMemo(() => {
    const N = 14000
    const pos = new Float32Array(N * 3)
    const size = new Float32Array(N)
    const vel = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * BOX
      pos[i * 3 + 1] = Math.pow(Math.random(), 1.6) * 40
      pos[i * 3 + 2] = (Math.random() - 0.5) * BOX
      size[i] = 0.2 + Math.pow(Math.random(), 2.2) * 2.3
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.12
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    return { geo: g, velocities: vel }
  }, [])

  const mat = useMemo(() => {
    const m = new THREE.PointsMaterial({
      size: 0.8,
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
      color: new THREE.Color('#d9a271'),
      opacity: 0,
    })
    return m
  }, [tex])

  useFrame((_, dt) => {
    if (!pts.current) return
    mat.opacity = Math.min(0.9, intensity * 1.05)
    pts.current.visible = intensity > 0.012
    if (!pts.current.visible) return

    const pos = geo.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    // Wind blows FROM windFromDeg, so the motion vector points the other way.
    const to = (windFromDeg + 180) * (Math.PI / 180)
    const vx = Math.sin(to) * windMs * (0.5 + intensity)
    const vz = Math.cos(to) * windMs * (0.5 + intensity)

    const cx = camera.position.x
    const cz = camera.position.z

    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3] += vx * dt
      arr[i * 3 + 1] += velocities[i * 3 + 1] * dt
      arr[i * 3 + 2] += vz * dt
      // Wrap the box around the camera so the field is always where you are.
      let x = arr[i * 3] - cx
      let z = arr[i * 3 + 2] - cz
      if (x > BOX / 2) x -= BOX
      if (x < -BOX / 2) x += BOX
      if (z > BOX / 2) z -= BOX
      if (z < -BOX / 2) z += BOX
      arr[i * 3] = cx + x
      arr[i * 3 + 2] = cz + z
      if (arr[i * 3 + 1] > 44) arr[i * 3 + 1] = 0.4
      if (arr[i * 3 + 1] < 0.3) arr[i * 3 + 1] = 42
    }
    pos.needsUpdate = true
  })

  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} />
}

/**
 * A dust devil: a convective vortex. Perseverance and Ingenuity imaged these
 * routinely at Jezero, strongest in the early afternoon when the boundary layer
 * is deepest. Tens of metres across, a few hundred metres tall, lasting minutes.
 */
export function DustDevil({
  active, intensity, originX, originZ, driftDeg,
}: { active: boolean; intensity: number; originX: number; originZ: number; driftDeg: number }) {
  const grp = useRef<THREE.Group>(null)
  const pts = useRef<THREE.Points>(null)
  const tex = useMemo(grainTexture, [])
  const t0 = useRef(0)

  const geo = useMemo(() => {
    const N = 2400
    const pos = new Float32Array(N * 3)
    const phase = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const h = Math.pow(Math.random(), 0.65)
      const r = (2.2 + h * 10) * (0.5 + Math.random() * 0.5)
      const a = Math.random() * Math.PI * 2
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = h * 110
      pos[i * 3 + 2] = Math.sin(a) * r
      phase[i] = a
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    return g
  }, [])

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 1.5,
        map: tex,
        transparent: true,
        depthWrite: false,
        color: new THREE.Color('#c99266'),
        opacity: 0,
        sizeAttenuation: true,
      }),
    [tex],
  )

  useFrame(({ clock }, dt) => {
    if (!grp.current) return
    grp.current.visible = active && intensity > 0.02
    if (!grp.current.visible) { t0.current = clock.elapsedTime; return }
    mat.opacity = Math.min(0.6, intensity * 0.7)

    // Drift across the landscape.
    const el = clock.elapsedTime - t0.current
    const to = (driftDeg + 180) * (Math.PI / 180)
    const x = originX + Math.sin(to) * el * 6.5
    const z = originZ + Math.cos(to) * el * 6.5
    grp.current.position.set(x, heightAt(x, z), z)
    grp.current.rotation.y += dt * 2.4

    if (pts.current) pts.current.rotation.y += dt * 3.2
  })

  return (
    <group ref={grp}>
      <points ref={pts} geometry={geo} material={mat} frustumCulled={false} />
    </group>
  )
}
