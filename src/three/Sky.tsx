import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SKY_FRAG, SKY_VERT } from './glsl'

export default function Sky({
  sunDir, tau, dayness, transmission,
}: { sunDir: THREE.Vector3; tau: number; dayness: number; transmission: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uTau: { value: 0.5 },
      uDayness: { value: 1 },
      uTransmission: { value: 1 },
    }),
    [],
  )

  useFrame(() => {
    if (!mat.current) return
    const u = mat.current.uniforms
    u.uSunDir.value.copy(sunDir)
    u.uTau.value = tau
    u.uDayness.value = dayness
    u.uTransmission.value = transmission
  })

  return (
    <mesh frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[9000, 48, 32]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={SKY_VERT}
        fragmentShader={SKY_FRAG}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  )
}
