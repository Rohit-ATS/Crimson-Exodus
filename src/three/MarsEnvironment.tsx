/**
 * MarsEnvironment.tsx — Image-based lighting from the Martian sky.
 *
 * Without an environment map, a metal surface has nothing to reflect, so gold
 * visors and aluminium struts render as flat grey plastic no matter how good
 * the roughness value is. On Mars this matters more than it does on Earth,
 * because the sky is not a weak blue fill: suspended dust makes the whole dome
 * a bright, warm, enormous area light, and almost everything you see on the
 * ground is lit mostly by it rather than directly by the Sun.
 *
 * So this generates a small equirectangular radiance map from the same
 * modelled numbers the rest of the scene uses — Sun direction, dust optical
 * depth, solar transmission, daylight factor — runs it through Three's PMREM
 * generator, and hands it to the scene as `scene.environment`. Every standard
 * material then picks up correct Martian ambient colour and a plausible
 * specular response for free.
 *
 * WHAT THE SKY MODEL CAPTURES, AND WHY
 *  - Butterscotch dome. Suspended dust is reddish and optically thick, so
 *    multiply-scattered light is strongly red-weighted. The sky is not
 *    pink-because-of-the-air; it is the colour of the dust in it.
 *  - Brightening toward the horizon, because the line of sight passes through
 *    more scattering dust.
 *  - A BLUE aureole around the Sun. This is the famous and genuinely
 *    counter-intuitive part: Mars has blue sunsets and a bluish halo around the
 *    Sun, because dust grains of roughly a micrometre forward-scatter blue
 *    light more strongly into a narrow angle than red. It is the inverse of
 *    Earth's red sunset, and it is visible in Spirit, Opportunity, Curiosity
 *    and Perseverance images.
 *  - A ground hemisphere, because half of what any surface reflects is bounce
 *    off the regolith, and that bounce is brown.
 *
 * The map is deliberately tiny (128 x 64) and only regenerated when the Sun
 * has actually moved or the dust load has actually changed, because PMREM is
 * not free and nothing here needs more resolution than a blurred radiance
 * probe.
 *
 * LABEL: model output and artistic rendering. The colours are keyed to rover
 * imagery; they are not a radiative transfer calculation.
 */

import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

const W = 128
const H = 64

function buildEquirect(
  sunDir: THREE.Vector3,
  tau: number,
  dayness: number,
  transmission: number,
): THREE.DataTexture {
  const data = new Float32Array(W * H * 4)

  const dust = Math.min(1, tau / 3.4)
  // Overall sky brightness collapses in a storm even though the sky itself
  // stays bright-looking, because far less light is getting down at all.
  const gain = (0.25 + 1.5 * Math.pow(Math.max(0.02, transmission), 0.45)) * (0.1 + 0.9 * dayness)

  // Zenith and horizon colours, keyed to rover imagery of a clear Jezero sky
  // and of the 2022 regional storm.
  const zenithClear = new THREE.Color(0.52, 0.36, 0.26)
  const horizClear = new THREE.Color(0.80, 0.58, 0.40)
  const zenithDusty = new THREE.Color(0.46, 0.27, 0.14)
  const horizDusty = new THREE.Color(0.72, 0.42, 0.20)
  const zenith = zenithClear.clone().lerp(zenithDusty, dust)
  const horiz = horizClear.clone().lerp(horizDusty, dust)
  // Regolith bounce. Darker and browner than the sky, and it is what lights
  // the underside of everything.
  const ground = new THREE.Color(0.30, 0.19, 0.12).multiplyScalar(0.55 + 0.45 * dayness)

  // The forward-scattering aureole: blue-weighted, tight, and brighter when
  // there is more dust to do the scattering.
  const aureole = new THREE.Color(0.58, 0.74, 1.0)
  const aureoleGain = (0.9 + 1.8 * dust) * Math.max(0.05, transmission)

  const c = new THREE.Color()
  for (let y = 0; y < H; y++) {
    // Equirectangular: v = 0 at +Y (zenith), v = 1 at -Y (nadir).
    const theta = ((y + 0.5) / H) * Math.PI
    const cy = Math.cos(theta)
    const sy = Math.sin(theta)
    for (let x = 0; x < W; x++) {
      const phi = ((x + 0.5) / W) * Math.PI * 2 - Math.PI
      const dx = sy * Math.sin(phi)
      const dz = sy * Math.cos(phi)

      if (cy >= 0) {
        // Sky hemisphere. Brighter toward the horizon: more dust in the path.
        const t = Math.pow(1 - cy, 1.8)
        c.copy(zenith).lerp(horiz, t)

        // Angular distance from the Sun.
        const cosA = dx * sunDir.x + cy * sunDir.y + dz * sunDir.z
        const ang = Math.acos(Math.max(-1, Math.min(1, cosA)))
        // Tight blue aureole, then a broad warm glow around it.
        const blue = Math.exp(-Math.pow(ang / 0.22, 2))
        const warm = Math.exp(-Math.pow(ang / 0.9, 2))
        c.lerp(aureole, Math.min(0.85, blue * aureoleGain * 0.75))
        c.r += warm * 0.55 * transmission
        c.g += warm * 0.36 * transmission
        c.b += warm * 0.20 * transmission
      } else {
        // Ground hemisphere: regolith bounce, falling off toward the nadir.
        const t = Math.pow(-cy, 0.7)
        c.copy(horiz).lerp(ground, 0.35 + 0.65 * t)
        c.multiplyScalar(0.55)
      }

      c.multiplyScalar(gain)

      const i = (y * W + x) * 4
      data[i] = c.r
      data[i + 1] = c.g
      data[i + 2] = c.b
      data[i + 3] = 1
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export default function MarsEnvironment({
  sunDir, tau, dayness, transmission,
}: {
  sunDir: THREE.Vector3
  tau: number
  dayness: number
  transmission: number
}) {
  const { gl, scene } = useThree()

  // Regenerate only when something visibly changed. The Sun moves 0.25 degrees
  // a minute; quantising to roughly that keeps this off the frame budget.
  const key = useMemo(() => {
    const el = Math.round(Math.asin(Math.max(-1, Math.min(1, sunDir.y))) * (180 / Math.PI) / 2)
    const az = Math.round(Math.atan2(sunDir.x, sunDir.z) * (180 / Math.PI) / 6)
    return `${el}|${az}|${Math.round(tau * 8)}|${Math.round(dayness * 10)}|${Math.round(transmission * 12)}`
  }, [sunDir, tau, dayness, transmission])

  useEffect(() => {
    const tex = buildEquirect(sunDir, tau, dayness, transmission)
    const pmrem = new THREE.PMREMGenerator(gl)
    pmrem.compileEquirectangularShader()
    const rt = pmrem.fromEquirectangular(tex)
    const prev = scene.environment
    scene.environment = rt.texture
    tex.dispose()
    pmrem.dispose()
    return () => {
      if (scene.environment === rt.texture) scene.environment = prev
      rt.dispose()
    }
    // sunDir is a new Vector3 each frame; `key` is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gl, scene])

  return null
}
