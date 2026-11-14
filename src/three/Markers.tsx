import { useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { heightAt } from '../mission/terrain'
import { CACHES, SHELTERS, STATIONS } from '../mission/site'
import type { StationState } from '../state/store'

/** Holographic station and shelter markers with DOM labels that stay legible. */
export default function Markers({
  stations, nearStation, showShelters, jackPos, cachesUsed,
}: {
  stations: Record<string, StationState>
  nearStation: string | null
  showShelters: boolean
  jackPos: [number, number]
  cachesUsed: string[]
}) {
  return (
    <group>
      {STATIONS.map((st) => {
        const state = stations[st.id]
        const done = !!state?.choice
        const dist = Math.hypot(jackPos[0] - st.x, jackPos[1] - st.z)
        const near = nearStation === st.id
        const color = done ? '#7dffb2' : near ? '#ffb24a' : '#4fe8ff'
        return (
          <group key={st.id} position={[st.x, heightAt(st.x, st.z), st.z]}>
            <Beam color={color} height={near ? 26 : 18} />
            <Ring radius={st.radius} color={color} />
            {dist < 520 && (
              <Html position={[0, near ? 4.2 : 3.4, 0]} center distanceFactor={48} zIndexRange={[20, 0]}>
                <div
                  style={{
                    fontFamily: 'Share Tech Mono, monospace',
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    padding: '4px 9px',
                    color,
                    border: `1px solid ${color}`,
                    background: 'rgba(5,8,13,0.74)',
                    letterSpacing: '0.11em',
                    textTransform: 'uppercase',
                    pointerEvents: 'none',
                    textShadow: '0 0 10px rgba(0,0,0,0.9)',
                  }}
                >
                  {st.codename}
                  <div style={{ fontSize: 10.5, opacity: 0.8, letterSpacing: '0.06em' }}>
                    {done ? 'observation recorded' : `${dist.toFixed(0)} m · ${st.name}`}
                  </div>
                </div>
              </Html>
            )}
          </group>
        )
      })}

      {/* Consumables caches: a crate, a beacon and a ring. */}
      {CACHES.map((c) => {
        const used = cachesUsed.includes(c.id)
        const dist = Math.hypot(jackPos[0] - c.x, jackPos[1] - c.z)
        const col = used ? '#6d8292' : '#ffb24a'
        return (
          <group key={c.id} position={[c.x, heightAt(c.x, c.z), c.z]}>
            {/* The crate itself */}
            <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.1, 0.68, 0.8]} />
              <meshStandardMaterial color={used ? '#5c5a55' : '#d8d4c8'} roughness={0.7} metalness={0.15} />
            </mesh>
            <mesh position={[0, 0.7, 0]}>
              <boxGeometry args={[1.14, 0.06, 0.84]} />
              <meshStandardMaterial color="#d9a63c" roughness={0.35} metalness={0.8} />
            </mesh>
            {/* Tanks strapped to the side */}
            {!used && [-0.3, 0.3].map((dx) => (
              <mesh key={dx} position={[dx, 0.34, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <capsuleGeometry args={[0.12, 0.3, 4, 10]} />
                <meshStandardMaterial color="#b9bec4" roughness={0.35} metalness={0.7} />
              </mesh>
            ))}
            {/* Beacon mast so it can be found from a distance */}
            <mesh position={[0.62, 1.1, -0.3]}>
              <cylinderGeometry args={[0.02, 0.02, 1.5, 6]} />
              <meshStandardMaterial color="#9aa0a6" roughness={0.4} metalness={0.7} />
            </mesh>
            <mesh position={[0.62, 1.88, -0.3]}>
              <sphereGeometry args={[0.08, 12, 8]} />
              <meshBasicMaterial color={col} />
            </mesh>
            {!used && <Beam color={col} height={10} />}
            <Ring radius={c.radius} color={col} />
            {dist < 520 && (
              <Html position={[0, 2.4, 0]} center distanceFactor={48} zIndexRange={[19, 0]}>
                <div
                  style={{
                    fontFamily: 'Share Tech Mono, monospace',
                    fontSize: 12.5,
                    whiteSpace: 'nowrap',
                    padding: '3px 8px',
                    color: col,
                    border: `1px solid ${col}`,
                    background: 'rgba(5,8,13,0.74)',
                    letterSpacing: '0.11em',
                    textTransform: 'uppercase',
                    pointerEvents: 'none',
                  }}
                >
                  {c.name}
                  <div style={{ fontSize: 10, opacity: 0.8 }}>
                    {used ? 'empty' : `${dist.toFixed(0)} m · consumables`}
                  </div>
                </div>
              </Html>
            )}
          </group>
        )
      })}

      {showShelters &&
        SHELTERS.filter((s) => s.id !== 'lander').map((s) => {
          const dist = Math.hypot(jackPos[0] - s.x, jackPos[1] - s.z)
          return (
            <group key={s.id} position={[s.x, heightAt(s.x, s.z), s.z]}>
              <Beam color="#ff5aa8" height={12} />
              <Ring radius={s.radius} color="#ff5aa8" />
              {dist < 620 && (
                <Html position={[0, 2.8, 0]} center distanceFactor={52} zIndexRange={[18, 0]}>
                  <div
                    style={{
                      fontFamily: 'Share Tech Mono, monospace',
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                      padding: '3px 8px',
                      color: '#ff8ec4',
                      border: '1px solid #ff5aa8',
                      background: 'rgba(5,8,13,0.74)',
                      letterSpacing: '0.11em',
                      textTransform: 'uppercase',
                      pointerEvents: 'none',
                    }}
                  >
                    SHELTER &middot; {s.name}
                    <div style={{ fontSize: 10, opacity: 0.8 }}>
                      {dist.toFixed(0)} m &middot; {(s.effectiveness * 100).toFixed(0)}% cover
                    </div>
                  </div>
                </Html>
              )}
            </group>
          )
        })}
    </group>
  )
}

function Beam({ color, height }: { color: string; height: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.1 + 0.07 * (1 + Math.sin(clock.elapsedTime * 1.7))
    }
  })
  return (
    <mesh ref={ref} position={[0, height / 2, 0]}>
      <cylinderGeometry args={[0.5, 1.2, height, 12, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.16}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

function Ring({ radius, color }: { radius: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = clock.elapsedTime * 0.18
  })
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]} ref={ref}>
        <ringGeometry args={[radius - 1.1, radius, 72, 1, 0, Math.PI * 1.65]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[0, radius, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}
