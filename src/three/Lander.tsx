import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The lander: home, airlock, recharge port, and the only true shelter on the map.
 *
 * ARTISTIC. This is not any announced NASA vehicle. It is assembled from the
 * features a crewed Mars surface element plausibly needs and that a player needs
 * to read at a glance: a descent stage with throttleable engines and crushable
 * footpads, a pressurised module with a side airlock and ladder, a high-gain dish
 * for the direct-to-Earth link, deployable solar arrays, radiators, and handrails.
 */
export default function Lander({ dust = 0, lightsOn = true }: { dust?: number; lightsOn?: boolean }) {
  const beacon = useRef<THREE.Mesh>(null)
  const dish = useRef<THREE.Group>(null)

  const mats = useMemo(() => {
    const tint = (hex: string, a: number) => new THREE.Color(hex).lerp(new THREE.Color('#8a6340'), a)
    return {
      blanket: new THREE.MeshStandardMaterial({ color: tint('#eceae4', dust * 0.45), roughness: 0.55, metalness: 0.1 }),
      kapton: new THREE.MeshStandardMaterial({ color: tint('#d9a63c', dust * 0.3), roughness: 0.28, metalness: 0.85 }),
      metal: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.34, metalness: 0.85 }),
      dark: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.45, metalness: 0.5 }),
      nozzle: new THREE.MeshStandardMaterial({ color: '#4a4136', roughness: 0.4, metalness: 0.8 }),
      panel: new THREE.MeshStandardMaterial({
        color: tint('#1b2f5c', dust * 0.6), roughness: 0.22, metalness: 0.5,
        emissive: '#0a1733', emissiveIntensity: 0.3,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: '#9fd8ff', roughness: 0.08, metalness: 0.4,
        emissive: '#8fd0ff', emissiveIntensity: lightsOn ? 1.5 : 0.1,
      }),
      beacon: new THREE.MeshStandardMaterial({ color: '#ff5533', emissive: '#ff4422', emissiveIntensity: 4 }),
      green: new THREE.MeshStandardMaterial({ color: '#6bff9e', emissive: '#4dff8a', emissiveIntensity: 2.4 }),
    }
  }, [dust, lightsOn])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (beacon.current) {
      const m = beacon.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 1.2 + 4.5 * Math.pow(Math.max(0, Math.sin(t * 2.0)), 8)
    }
    if (dish.current) dish.current.rotation.y = Math.sin(t * 0.07) * 0.22
  })

  return (
    <group position={[0, 0, 0]}>
      {/* ---- Landing legs and footpads ---------------------------------- */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const r = 3.5
        return (
          <group key={i} rotation={[0, -a, 0]}>
            {/* primary strut */}
            <mesh position={[0, 1.0, r * 0.5]} rotation={[0.72, 0, 0]} material={mats.metal} castShadow>
              <cylinderGeometry args={[0.085, 0.085, 2.65, 10]} />
            </mesh>
            {/* secondary brace */}
            <mesh position={[0, 0.42, r * 0.72]} rotation={[1.25, 0, 0]} material={mats.metal} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 1.9, 8]} />
            </mesh>
            {/* footpad */}
            <mesh position={[0, 0.12, r]} material={mats.blanket} castShadow>
              <cylinderGeometry args={[0.62, 0.52, 0.22, 18]} />
            </mesh>
            <mesh position={[0, 0.02, r]} material={mats.dark}>
              <cylinderGeometry args={[0.64, 0.64, 0.05, 18]} />
            </mesh>
          </group>
        )
      })}

      {/* ---- Descent stage ---------------------------------------------- */}
      <mesh position={[0, 1.65, 0]} material={mats.blanket} castShadow receiveShadow>
        <cylinderGeometry args={[2.0, 2.25, 0.95, 8]} />
      </mesh>
      <mesh position={[0, 1.17, 0]} material={mats.kapton}>
        <cylinderGeometry args={[2.26, 2.1, 0.12, 8]} />
      </mesh>
      {/* Propellant tanks tucked under the deck */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 1.35, 1.1, Math.sin(a) * 1.35]}
            material={mats.metal}
            castShadow
          >
            <sphereGeometry args={[0.52, 18, 14]} />
          </mesh>
        )
      })}
      {/* Engines */}
      {[-0.85, 0.85].map((dx) =>
        [-0.85, 0.85].map((dz) => (
          <group key={`${dx}:${dz}`} position={[dx, 0.78, dz]}>
            <mesh material={mats.nozzle} castShadow>
              <cylinderGeometry args={[0.18, 0.34, 0.6, 16, 1, true]} />
            </mesh>
            <mesh position={[0, 0.34, 0]} material={mats.dark}>
              <cylinderGeometry args={[0.14, 0.18, 0.18, 14]} />
            </mesh>
          </group>
        )),
      )}

      {/* ---- Pressurised module ---------------------------------------- */}
      <mesh position={[0, 3.35, 0]} material={mats.blanket} castShadow receiveShadow>
        <cylinderGeometry args={[1.72, 1.72, 2.5, 20]} />
      </mesh>
      <mesh position={[0, 4.72, 0]} material={mats.blanket} castShadow>
        <sphereGeometry args={[1.72, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
      </mesh>
      {/* Thermal blanket banding */}
      {[2.5, 3.1, 3.7, 4.3].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={mats.kapton}>
          <cylinderGeometry args={[1.74, 1.74, 0.07, 20]} />
        </mesh>
      ))}

      {/* Airlock hatch, facing +z (where Jack starts) */}
      <group position={[0, 2.85, 1.73]}>
        <mesh material={mats.metal} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.72, 0.72, 0.16, 20]} />
        </mesh>
        <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={mats.dark}>
          <cylinderGeometry args={[0.6, 0.6, 0.08, 20]} />
        </mesh>
        <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]} material={mats.glass}>
          <cylinderGeometry args={[0.2, 0.2, 0.02, 16]} />
        </mesh>
        <mesh position={[0.5, 0.42, 0.1]} material={mats.green}>
          <boxGeometry args={[0.1, 0.05, 0.03]} />
        </mesh>
      </group>

      {/* Portholes */}
      {[-1.0, 1.0].map((dx) => (
        <mesh key={dx} position={[dx, 3.9, 1.45]} rotation={[Math.PI / 2, 0, 0]} material={mats.glass}>
          <cylinderGeometry args={[0.25, 0.25, 0.08, 18]} />
        </mesh>
      ))}

      {/* Ladder */}
      <group position={[0, 0, 1.95]}>
        {[-0.28, 0.28].map((dx) => (
          <mesh key={dx} position={[dx, 1.45, 0]} material={mats.metal} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 2.9, 8]} />
          </mesh>
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[0, 0.25 + i * 0.33, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.metal}>
            <cylinderGeometry args={[0.028, 0.028, 0.56, 8]} />
          </mesh>
        ))}
      </group>

      {/* Handrails around the module */}
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 1.8, 2.3, Math.sin(a) * 1.8]}
            rotation={[0, -a, 0]}
            material={mats.metal}
          >
            <boxGeometry args={[0.06, 0.06, 0.4]} />
          </mesh>
        )
      })}

      {/* ---- High-gain dish: the direct-to-Earth link ------------------- */}
      <group position={[1.45, 5.0, -0.6]} ref={dish}>
        <mesh material={mats.metal} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 1.0, 8]} />
        </mesh>
        <group position={[0, 0.62, 0]} rotation={[-0.62, 0, 0]}>
          <mesh material={mats.blanket} castShadow>
            <sphereGeometry args={[0.82, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.28]} />
          </mesh>
          <mesh position={[0, 0.3, 0]} material={mats.dark}>
            <coneGeometry args={[0.07, 0.3, 10]} />
          </mesh>
        </group>
      </group>

      {/* Low-gain / UHF relay whip */}
      <mesh position={[-1.5, 5.4, -0.4]} material={mats.dark} castShadow>
        <cylinderGeometry args={[0.022, 0.016, 1.8, 8]} />
      </mesh>

      {/* ---- Solar arrays ---------------------------------------------- */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 2.2, 2.35, 0]} rotation={[0, 0, side * -0.17]}>
          <mesh position={[side * 1.6, 0, 0]} material={mats.panel} castShadow>
            <boxGeometry args={[3.2, 0.05, 2.1]} />
          </mesh>
          {/* cell gridlines */}
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i} position={[side * (0.2 + i * 0.46), 0.03, 0]} material={mats.metal}>
              <boxGeometry args={[0.02, 0.012, 2.05]} />
            </mesh>
          ))}
          <mesh position={[side * 0.2, 0, 0]} material={mats.metal}>
            <boxGeometry args={[0.4, 0.09, 0.5]} />
          </mesh>
        </group>
      ))}

      {/* ---- Radiators -------------------------------------------------- */}
      <mesh position={[0, 3.3, -1.82]} material={mats.dark} castShadow>
        <boxGeometry args={[2.4, 1.9, 0.07]} />
      </mesh>

      {/* ---- Beacon ----------------------------------------------------- */}
      <mesh position={[0, 5.78, 0]} material={mats.beacon} ref={beacon}>
        <sphereGeometry args={[0.11, 14, 10]} />
      </mesh>
      {lightsOn && (
        <>
          <pointLight position={[0, 5.8, 0]} color="#ff5533" intensity={9} distance={26} />
          <pointLight position={[0, 2.6, 2.6]} color="#cfe8ff" intensity={14} distance={20} />
        </>
      )}

      {/* Floodlit pad markings */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7.4, 8.0, 64]} />
        <meshBasicMaterial color="#4fe8ff" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
