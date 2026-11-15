import { useMemo } from 'react'
import * as THREE from 'three'
import { EXTENT, heightAt, normalAt } from '../mission/terrain'
import { NOISE_GLSL } from './glsl'

/**
 * The ground.
 *
 * Geometry is sampled from the one authoritative height field in
 * `mission/terrain.ts`, so what you see is what the planner costed and what the
 * hazard model scored. Vertex normals are computed ANALYTICALLY from that field
 * rather than from the triangles, which means the shading carries detail finer
 * than the mesh spacing and the terrain reads smooth without a million triangles.
 *
 * Surface appearance is procedural and layered by what actually controls the look
 * of Martian ground at Jezero: bright fine dust in the lows and on flat surfaces,
 * darker basaltic sand in the ripple troughs, and exposed bedrock on the steep
 * faces where dust cannot hold. Colours are keyed to Mars 2020 Mastcam-Z and MSL
 * Mastcam imagery of the Jezero floor and delta.
 */

const SEGMENTS = 448 // 2400 m / 448 => 5.36 m posts, analytic normals carry the rest

export default function Terrain({ dustFouling = 0 }: { dustFouling?: number }) {
  const geometry = useMemo(() => {
    const size = EXTENT * 2
    const g = new THREE.PlaneGeometry(size, size, SEGMENTS, SEGMENTS)
    g.rotateX(-Math.PI / 2) // make it an XZ ground plane with +y up

    const pos = g.attributes.position as THREE.BufferAttribute
    const nrm = new Float32Array(pos.count * 3)

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, heightAt(x, z))
      const [nx, ny, nz] = normalAt(x, z, 2.4)
      nrm[i * 3] = nx
      nrm[i * 3 + 1] = ny
      nrm[i * 3 + 2] = nz
    }
    pos.needsUpdate = true
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
    g.computeBoundingSphere()
    return g
  }, [])

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      dithering: true,
    })

    m.onBeforeCompile = (shader) => {
      shader.uniforms.uDust = { value: dustFouling }

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWPos;
           varying float vSlope;`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
           vSlope = 1.0 - clamp(normalize(mat3(modelMatrix) * objectNormal).y, 0.0, 1.0);`,
        )

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWPos;
           varying float vSlope;
           uniform float uDust;
           ${NOISE_GLSL}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           {
             vec2 p = vWPos.xz;

             // Three scales of regolith patchiness.
             float nBroad  = jfbm(p * 0.0045, 4);
             float nMid    = jfbm(p * 0.045, 4);
             float nFine   = jfbm(p * 0.42, 3);
             float nGrit   = jfbm(p * 3.4, 3);

             // Aeolian ripple banding: real megaripples at Jezero run with a
             // consistent crest orientation set by the prevailing wind.
             float ripple = sin((p.x * 0.78 + p.y * 0.62) / 26.0 * 6.2831);
             float rippleMask = smoothstep(0.1, 0.9, nBroad) * 0.5 + 0.25;

             // Palette, keyed to rover imagery of the Jezero floor and delta.
             vec3 dustBright = vec3(0.595, 0.395, 0.248);  // fine airfall dust
             vec3 sandDark   = vec3(0.330, 0.223, 0.158);  // basaltic sand in troughs
             vec3 bedrock    = vec3(0.432, 0.334, 0.268);  // dusty outcrop
             vec3 olivine    = vec3(0.392, 0.372, 0.272);  // olivine-rich floor unit

             vec3 col = mix(sandDark, dustBright, clamp(nMid * 1.25 + 0.18, 0.0, 1.0));

             // Ripple troughs collect coarse dark sand, crests are swept clean.
             col = mix(col, sandDark, clamp(-ripple, 0.0, 1.0) * rippleMask * 0.55);
             col = mix(col, dustBright, clamp(ripple, 0.0, 1.0) * rippleMask * 0.30);

             // Steep ground sheds dust and shows rock.
             float rocky = smoothstep(0.12, 0.42, vSlope);
             col = mix(col, bedrock, rocky * 0.8);

             // The olivine-bearing floor unit, southwest of the lander.
             float seitah = 1.0 - smoothstep(90.0, 300.0, length(p - vec2(-450.0, -200.0)));
             col = mix(col, olivine, seitah * 0.42 * (0.6 + 0.4 * nMid));

             // Fine speckle: the ubiquitous dark lag of small clasts.
             col *= 0.80 + 0.40 * nFine;
             // Centimetre-scale lag of dark clasts, which is what the ground
             // actually looks like under a boot in every rover image.
             col *= 0.86 + 0.28 * nGrit;

             // A suit radiator caked in dust also means a visor caked in dust:
             // everything washes toward the colour of the dust itself.
             col = mix(col, vec3(0.62, 0.45, 0.32), uDust * 0.3);

             diffuseColor.rgb *= col;
           }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           {
             float rn = jfbm(vWPos.xz * 0.09, 3);
             // Dusty flats are very diffuse; swept bedrock is a little glossier.
             roughnessFactor = clamp(0.98 - 0.18 * smoothstep(0.15, 0.45, vSlope) - 0.06 * rn, 0.55, 1.0);
           }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
           {
             // Detail normal from the analytic gradient of a procedural height
             // field. This is what makes 5 m geometry read as metre-scale ground.
             vec2 p = vWPos.xz;
             float e = 0.35;
             // A near-field term at centimetre scale, faded out with distance.
             // Without the fade it aliases into shimmering noise on ground a
             // kilometre away; with it, the ground under the boots has grain
             // and the horizon stays clean.
             float dist = length(vViewPosition);
             float near = 1.0 - smoothstep(6.0, 46.0, dist);
             float eN = 0.03;
             float g0 = jfbm(p * 26.0, 2);
             float gx = jfbm((p + vec2(eN, 0.0)) * 26.0, 2);
             float gz = jfbm((p + vec2(0.0, eN)) * 26.0, 2);

             float h0 = jfbm(p * 1.9, 4) * 0.045 + jfbm(p * 0.52, 4) * 0.16 + jfbm(p * 0.13, 4) * 0.42;
             float hx = jfbm((p + vec2(e, 0.0)) * 1.9, 4) * 0.045 + jfbm((p + vec2(e, 0.0)) * 0.52, 4) * 0.16 + jfbm((p + vec2(e, 0.0)) * 0.13, 4) * 0.42;
             float hz = jfbm((p + vec2(0.0, e)) * 1.9, 4) * 0.045 + jfbm((p + vec2(0.0, e)) * 0.52, 4) * 0.16 + jfbm((p + vec2(0.0, e)) * 0.13, 4) * 0.42;
             vec3 dn = normalize(vec3(
               -(hx - h0) / e - near * (gx - g0) / eN * 0.016,
               1.0,
               -(hz - h0) / e - near * (gz - g0) / eN * 0.016));
             // Rotate the detail normal into the surface frame, cheaply.
             vec3 n = normalize(normal);
             vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4, 0.0, 0.0));
             vec3 b = cross(n, t);
             normal = normalize(n + t * dn.x * 2.6 + b * dn.z * 2.6);
           }`,
        )
    }
    return m
  }, [dustFouling])

  return (
    <mesh geometry={geometry} material={material} receiveShadow castShadow={false} />
  )
}
