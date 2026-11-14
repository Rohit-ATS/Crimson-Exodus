import { useMemo } from 'react'
import * as THREE from 'three'
import { EXTENT, heightAt } from '../mission/terrain'
import { NOISE_GLSL } from './glsl'

/**
 * The distance.
 *
 * The playable height field stops at 1.2 km from the lander. Without something
 * beyond it you can see the edge of the world against the sky, which breaks the
 * scene instantly. This is an annulus from the playable boundary out to 26 km,
 * tessellated with radially increasing spacing so the near join is dense and the
 * far horizon is cheap.
 *
 * Inside about 2 km it samples the same height field as the walkable ground, so
 * the join is seamless. Beyond that it blends into a crater-wall profile.
 *
 * ARTISTIC, and anchored to real geometry: Jezero is about 45 km across, so its
 * rim stands roughly 22 km from the centre with several hundred metres of relief
 * above the floor. The lander sits west of centre, which is why the rim rises
 * closer on one side than the other. Nothing here is a NASA elevation product,
 * and nothing in the game is costed against it — it exists so the horizon looks
 * like the inside of a large impact crater, because that is where you are.
 */

const R_IN = EXTENT * 0.985
const R_OUT = 26000
const RADIAL = 110
const ANGULAR = 256

/** Local position of the crater centre, metres. The lander sits west of centre. */
const CENTRE = { x: 13500, z: 3000 }
const RIM_RADIUS = 22000
const RIM_HEIGHT = 780

/** Cheap angular noise so the rim crest is not a drawn circle. */
function rimNoise(a: number): number {
  return (
    0.52 * Math.sin(a * 3.1 + 0.7) +
    0.28 * Math.sin(a * 7.3 + 2.1) +
    0.14 * Math.sin(a * 13.7 + 4.4) +
    0.07 * Math.sin(a * 23.1 + 1.2)
  )
}

function craterProfile(x: number, z: number): number {
  const a = Math.atan2(z - CENTRE.z, x - CENTRE.x)
  const n = rimNoise(a)
  // A real rim varies by a third of its height around the circumference, and the
  // crest wanders in and out by a kilometre or more.
  const R = RIM_RADIUS * (1 + 0.055 * n)
  const H = RIM_HEIGHT * (1 + 0.34 * n)
  const r = Math.hypot(x - CENTRE.x, z - CENTRE.z)
  // Floor out to ~0.78 R, then a rising wall, then a rim crest, then falling ejecta.
  const t = r / R
  if (t < 0.72) return 0
  if (t < 1.0) {
    const u = (t - 0.72) / 0.28
    return H * (u * u * (3 - 2 * u))
  }
  const u = Math.min(1, (t - 1.0) / 0.45)
  return H * (1 - 0.42 * (u * u * (3 - 2 * u)))
}

export default function FarTerrain() {
  const geometry = useMemo(() => {
    const positions = new Float32Array((RADIAL + 1) * (ANGULAR + 1) * 3)
    const uvs = new Float32Array((RADIAL + 1) * (ANGULAR + 1) * 2)
    const indices: number[] = []

    for (let i = 0; i <= RADIAL; i++) {
      // Geometric spacing: dense near the join, sparse at the horizon.
      const f = i / RADIAL
      const r = R_IN * Math.pow(R_OUT / R_IN, f)
      for (let j = 0; j <= ANGULAR; j++) {
        const a = (j / ANGULAR) * Math.PI * 2
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r

        // Blend from the real height field to the crater profile.
        const blend = Math.min(1, Math.max(0, (r - R_IN) / 1400))
        const near = heightAt(x, z)
        const far =
          craterProfile(x, z) +
          // Large-scale undulation so the floor is not a mirror.
          28 * Math.sin(x / 3100) * Math.cos(z / 2700) +
          14 * Math.sin(x / 1250 + 1.7) * Math.sin(z / 1430)
        const y = near * (1 - blend) + (far + near * 0.15) * blend

        const k = i * (ANGULAR + 1) + j
        positions[k * 3] = x
        positions[k * 3 + 1] = y
        positions[k * 3 + 2] = z
        uvs[k * 2] = r / 1000
        uvs[k * 2 + 1] = a
      }
    }

    for (let i = 0; i < RADIAL; i++) {
      for (let j = 0; j < ANGULAR; j++) {
        const a = i * (ANGULAR + 1) + j
        const b = a + 1
        const c = (i + 1) * (ANGULAR + 1) + j
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    g.setIndex(indices)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [])

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.97, metalness: 0 })
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n varying vec3 vWPos;`)
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n varying vec3 vWPos;\n ${NOISE_GLSL}`)
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           {
             vec2 p = vWPos.xz;
             float n = jfbm(p * 0.00065, 4);
             float n2 = jfbm(p * 0.0085, 3);
             vec3 dusty = vec3(0.60, 0.40, 0.26);
             vec3 dark  = vec3(0.31, 0.21, 0.15);
             vec3 col = mix(dark, dusty, clamp(n * 1.5 + 0.1, 0.0, 1.0));
             col *= 0.84 + 0.3 * n2;
             diffuseColor.rgb *= col;
           }`,
        )
    }
    return m
  }, [])

  return <mesh geometry={geometry} material={material} receiveShadow={false} frustumCulled={false} />
}
