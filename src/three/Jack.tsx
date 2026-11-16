import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { jackView, live, type LiveJack } from '../state/live'
import { normalAt } from '../mission/terrain'

/**
 * Jack.
 *
 * A suited crew member built from primitives: hard upper torso, soft-goods limbs,
 * a gold-coated visor, and a portable life support backpack carrying the things
 * this mission actually uses — a camera, a flag canister and a rack of sealed
 * sample tubes. The silhouette is the point: an EVA suit reads as an EVA suit
 * because of the backpack, the helmet and the chest-mounted control module.
 *
 * The gait is a low-gravity bounding walk. In 0.379 g a person pushes off further
 * and hangs longer, so the vertical bob is exaggerated and the stride is long and
 * flat. Apollo crews converged on exactly this on the Moon, for the same reason.
 *
 * GAME MECHANIC / ARTISTIC: this is not a model of any real or planned suit.
 */

/**
 * Palette, taken from what a real EVA suit is actually made of.
 *
 *  - The outer layer of a NASA EVA suit is a white Thermal Micrometeoroid
 *    Garment: Ortho-Fabric over aluminised Mylar. White because on a surface
 *    with no atmosphere worth the name, reflecting sunlight IS the cooling
 *    system, and because white shows contamination immediately.
 *  - Joint bearings at shoulder, elbow, wrist, hip, knee and ankle are
 *    anodised aluminium and read as bare metal, not fabric. They are the
 *    single most suit-like detail on the whole model.
 *  - The sun visor is gold. Not for looks: a vacuum-deposited gold film a few
 *    hundred atoms thick reflects most incoming infrared while passing enough
 *    visible light to see through, which is exactly the filter you want.
 *  - Red commander stripes on the arms, legs and helmet. A real identification
 *    aid: on Apollo 13 onward the commander wore them, because in a
 *    photograph two white suits are indistinguishable.
 *  - NASA blue 0B3D91 and NASA red FC3D21 are the agency's own brand colours,
 *    used here for the insignia only.
 */
const SUIT = '#f0efea'          // hard upper torso, fibreglass over TMG
const SUIT_SHADE = '#dcdad3'    // shadowed TMG panels, chest module, gloves
const SOFT = '#e8e5dd'          // soft-goods limbs, Ortho-Fabric
const BEARING = '#9ba1a9'       // anodised aluminium joint bearings
const BOOT = '#2a2c30'          // boot sole and tread
const DARK = '#232428'
const GOLD = '#d7a93f'
const ACCENT = '#c8102e'        // commander stripe red
const NASA_BLUE = '#0b3d91'
const NASA_RED = '#fc3d21'

export default function Jack({
  dust = 0, lampsOn = false, hidden = false, source = live.jack, variant = 'ev1',
}: { dust?: number; lampsOn?: boolean; hidden?: boolean; source?: LiveJack; variant?: 'ev1' | 'ev2' }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const kneeL = useRef<THREE.Group>(null)
  const kneeR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const elbowL = useRef<THREE.Group>(null)
  const elbowR = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const toolGrp = useRef<THREE.Group>(null)
  const dustPuff = useRef<THREE.Points>(null)

  const mats = useMemo(() => {
    const tint = (hex: string, amount: number) =>
      new THREE.Color(hex).lerp(new THREE.Color('#9a7048'), amount)
    return {
      // Fibreglass hard shell: smooth, barely any specular, no metal.
      suit: new THREE.MeshStandardMaterial({
        color: tint(SUIT, dust * 0.5), roughness: 0.52, metalness: 0.0, envMapIntensity: 0.8,
      }),
      suitShade: new THREE.MeshStandardMaterial({
        color: tint(SUIT_SHADE, dust * 0.55), roughness: 0.66, envMapIntensity: 0.7,
      }),
      // Woven Ortho-Fabric: very rough, almost entirely diffuse.
      soft: new THREE.MeshStandardMaterial({
        color: tint(SOFT, dust * 0.6), roughness: 0.95, metalness: 0.0, envMapIntensity: 0.65,
      }),
      // Dust is thrown up from the ground, so it loads the lower legs and
      // boots several times harder than the torso. Apollo crews came back
      // with suits grey to the knee and clean at the shoulder.
      softDirty: new THREE.MeshStandardMaterial({
        color: tint(SOFT, Math.min(0.85, 0.22 + dust * 1.5)), roughness: 0.97, envMapIntensity: 0.6,
      }),
      bearing: new THREE.MeshStandardMaterial({
        color: BEARING, roughness: 0.3, metalness: 0.88, envMapIntensity: 1.2,
      }),
      boot: new THREE.MeshStandardMaterial({
        color: BOOT, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.4,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: DARK, roughness: 0.45, metalness: 0.4, envMapIntensity: 0.9,
      }),
      // Vacuum-deposited gold on the sun visor: a true mirror, so it needs the
      // environment map to look like anything at all.
      gold: new THREE.MeshStandardMaterial({
        color: GOLD, roughness: 0.075, metalness: 1,
        envMapIntensity: 2.6,
      }),
      accent: new THREE.MeshStandardMaterial({ color: variant === 'ev2' ? '#4fe8ff' : ACCENT, roughness: 0.6, envMapIntensity: 0.6 }),
      blue: new THREE.MeshStandardMaterial({ color: NASA_BLUE, roughness: 0.6, envMapIntensity: 0.6 }),
      red: new THREE.MeshStandardMaterial({ color: NASA_RED, roughness: 0.6, envMapIntensity: 0.6 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#141a20', roughness: 0.04, metalness: 0.6,
        transparent: true, opacity: 0.42, envMapIntensity: 2.2,
      }),
      tank: new THREE.MeshStandardMaterial({
        color: '#b9bec4', roughness: 0.3, metalness: 0.78, envMapIntensity: 1.3,
      }),
      lens: new THREE.MeshStandardMaterial({ color: '#0b1016', roughness: 0.05, metalness: 0.9 }),
      led: new THREE.MeshStandardMaterial({ color: '#4fe8ff', emissive: '#4fe8ff', emissiveIntensity: 2.6 }),
      ledWarn: new THREE.MeshStandardMaterial({ color: '#ffb24a', emissive: '#ffb24a', emissiveIntensity: 2.2 }),
    }
  }, [dust, variant])

  const clockRef = useRef(0)
  const nextNormalAt = useRef(0)
  const surfaceNormal = useRef(new THREE.Vector3(0, 1, 0))

  useFrame((_, dt) => {
    clockRef.current += dt
    const g = root.current
    if (!g) return
    const j = source
    // The local astronaut is drawn between simulation steps; a networked one
    // arrives already smoothed.
    const v = source === live.jack ? jackView() : source

    g.position.set(v.x, v.y, v.z)
    // Face the direction of travel, smoothly.
    const target = j.heading
    let d = target - g.rotation.y
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    g.rotation.y += d * Math.min(1, dt * 9)

    // Stand on the slope: tilt the whole body to the local surface normal.
    if (clockRef.current >= nextNormalAt.current) {
      const [nx, ny, nz] = normalAt(v.x, v.z, 2.0)
      surfaceNormal.current.set(nx, ny, nz)
      nextNormalAt.current = clockRef.current + 0.1
    }
    const { x: nx, z: nz } = surfaceNormal.current
    if (body.current) {
      body.current.rotation.x += (Math.atan(nz) * Math.cos(g.rotation.y) + Math.atan(nx) * Math.sin(g.rotation.y) - body.current.rotation.x) * Math.min(1, dt * 5)
      body.current.rotation.z += (-Math.atan(nx) * Math.cos(g.rotation.y) + Math.atan(nz) * Math.sin(g.rotation.y) - body.current.rotation.z) * Math.min(1, dt * 5)
    }

    const m = v.moving
    const s = v.stride
    const working = j.working > 0
    const work = working ? 1 : 0
    const tool = j.tool

    // Station work is a crouch, not a stoop: in a pressurised suit you drop a
    // knee and bring the target up to the hands rather than bending at the waist.
    const crouch = work * (tool === 'lens' ? 0.55 : 0.85)

    // Bounding gait: long swing, pronounced hang time.
    const swing = Math.sin(s) * 0.62 * m
    const swing2 = Math.sin(s + Math.PI) * 0.62 * m
    const bob = Math.abs(Math.sin(s)) * 0.085 * m
    const lean = 0.14 * m

    if (legL.current) legL.current.rotation.x = swing - 0.05 - crouch * 0.75
    if (legR.current) legR.current.rotation.x = swing2 - 0.05 - crouch * 0.1
    if (kneeL.current) kneeL.current.rotation.x = Math.max(0, -Math.sin(s - 0.8)) * 0.85 * m + crouch * 1.5
    if (kneeR.current) kneeR.current.rotation.x = Math.max(0, -Math.sin(s + Math.PI - 0.8)) * 0.85 * m + crouch * 0.9

    // Arms counter-swing, held wide because a pressurised suit cannot tuck them in.
    const armBase = 0.22
    // Tool-specific motion at the target.
    const t = clockRef.current
    const scrub = tool === 'brush' ? Math.sin(t * 11) * 0.30 : 0       // back and forth
    const bore = tool === 'drill' ? Math.sin(t * 5.5) * 0.10 - 0.10 : 0 // steady press
    const peer = tool === 'lens' ? Math.sin(t * 1.3) * 0.05 : 0        // slow, careful

    if (armL.current) {
      armL.current.rotation.x = swing2 * 0.55 - work * (1.05 + scrub * 0.5) + peer
      armL.current.rotation.z = armBase + work * 0.1
    }
    if (armR.current) {
      armR.current.rotation.x = swing * 0.55 - work * (1.05 + scrub + bore) + peer
      armR.current.rotation.z = -armBase - work * 0.1
    }
    if (elbowL.current) elbowL.current.rotation.x = -0.35 - work * (0.85 - scrub * 0.4) - Math.max(0, swing2) * 0.3
    if (elbowR.current) elbowR.current.rotation.x = -0.35 - work * (0.85 - scrub * 0.6) - Math.max(0, swing) * 0.3

    // Show the right tool in the right hand, only while working.
    if (toolGrp.current) {
      toolGrp.current.visible = working && tool !== 'none' && tool !== 'flag'
      toolGrp.current.children.forEach((c) => {
        c.visible = c.name === tool
      })
    }
    // Abrading throws dust. Nothing else here does.
    if (dustPuff.current) {
      dustPuff.current.visible = working && tool === 'brush'
      if (dustPuff.current.visible) {
        const mat = dustPuff.current.material as THREE.PointsMaterial
        mat.opacity = 0.35 + 0.25 * Math.abs(Math.sin(t * 11))
        dustPuff.current.rotation.y = t * 0.8
      }
    }

    if (torso.current) {
      torso.current.position.y = 0.92 + bob - crouch * 0.46
      torso.current.rotation.x = lean + work * 0.5
      torso.current.rotation.y = Math.sin(s) * 0.07 * m + (tool === 'brush' ? scrub * 0.25 : 0)
    }
  })

  if (hidden) return null

  return (
    <group ref={root}>
      <group ref={body}>
        {/* ---- Legs ------------------------------------------------------ */}
        {([['L', -0.14, legL, kneeL], ['R', 0.14, legR, kneeR]] as const).map(([k, dx, hip, knee]) => (
          <group key={k} position={[dx, 0.92, 0]} ref={hip}>
            {/* Hip bearing: a real suit rotates here on a metal race */}
            <mesh position={[0, -0.03, 0]} material={mats.bearing} castShadow>
              <cylinderGeometry args={[0.108, 0.108, 0.05, 18]} />
            </mesh>
            {/* thigh */}
            <mesh position={[0, -0.21, 0]} material={mats.soft} castShadow>
              <capsuleGeometry args={[0.105, 0.3, 4, 10]} />
            </mesh>
            {/* Commander stripe, thigh */}
            <mesh position={[0, -0.3, 0]} material={mats.accent}>
              <cylinderGeometry args={[0.107, 0.107, 0.034, 16]} />
            </mesh>
            <group position={[0, -0.44, 0]} ref={knee}>
              {/* Knee bearing */}
              <mesh material={mats.bearing} castShadow>
                <cylinderGeometry args={[0.094, 0.094, 0.045, 16]} />
              </mesh>
              {/* shin, dusted from the ground up */}
              <mesh position={[0, -0.2, 0]} material={mats.softDirty} castShadow>
                <capsuleGeometry args={[0.092, 0.28, 4, 10]} />
              </mesh>
              {/* Ankle bearing */}
              <mesh position={[0, -0.355, 0]} material={mats.bearing}>
                <cylinderGeometry args={[0.082, 0.082, 0.04, 14]} />
              </mesh>
              {/* boot: fabric upper, hard sole, tread */}
              <mesh position={[0, -0.42, 0.045]} material={mats.softDirty} castShadow>
                <boxGeometry args={[0.15, 0.1, 0.3]} />
              </mesh>
              <mesh position={[0, -0.455, 0.045]} material={mats.boot}>
                <boxGeometry args={[0.158, 0.04, 0.31]} />
              </mesh>
              {/* Tread blocks. Boot prints are data: Apollo photographed every one. */}
              {[0, 1, 2, 3, 4].map((t) => (
                <mesh key={t} position={[0, -0.478, -0.095 + t * 0.048]} material={mats.boot}>
                  <boxGeometry args={[0.148, 0.014, 0.024]} />
                </mesh>
              ))}
            </group>
          </group>
        ))}

        {/* ---- Torso and up --------------------------------------------- */}
        <group ref={torso} position={[0, 0.92, 0]}>
          {/* Hard upper torso */}
          <mesh position={[0, 0.2, 0]} material={mats.suit} castShadow>
            <capsuleGeometry args={[0.2, 0.2, 6, 14]} />
          </mesh>
          <mesh position={[0, 0.03, 0]} material={mats.soft} castShadow>
            <capsuleGeometry args={[0.165, 0.12, 4, 12]} />
          </mesh>
          {/* Waist ring: the hard torso meets the soft lower half here */}
          <mesh position={[0, -0.08, 0]} material={mats.bearing}>
            <cylinderGeometry args={[0.17, 0.17, 0.045, 18]} />
          </mesh>

          {/* Insignia, left chest. NASA blue and NASA red, the agency's own. */}
          <mesh position={[-0.112, 0.3, 0.158]} rotation={[0, -0.34, 0]} material={mats.blue}>
            <circleGeometry args={[0.035, 20]} />
          </mesh>
          <mesh position={[-0.113, 0.3, 0.1595]} rotation={[0, -0.34, 0.5]} material={mats.red}>
            <boxGeometry args={[0.054, 0.006, 0.001]} />
          </mesh>

          {/* Chest-mounted display and control module */}
          <mesh position={[0, 0.17, 0.2]} material={mats.suitShade} castShadow>
            <boxGeometry args={[0.26, 0.17, 0.085]} />
          </mesh>
          <mesh position={[0, 0.2, 0.246]} material={mats.lens}>
            <boxGeometry args={[0.14, 0.07, 0.01]} />
          </mesh>
          <mesh position={[-0.085, 0.12, 0.246]} material={mats.led}>
            <boxGeometry args={[0.018, 0.018, 0.008]} />
          </mesh>
          <mesh position={[-0.045, 0.12, 0.246]} material={mats.ledWarn}>
            <boxGeometry args={[0.018, 0.018, 0.008]} />
          </mesh>
          {/* Commander stripes: a real EVA identification aid */}
          <mesh position={[0, 0.26, 0.0]} material={mats.accent}>
            <torusGeometry args={[0.202, 0.012, 6, 24]} />
          </mesh>

          {/* ---- Arms --------------------------------------------------- */}
          {([['L', -0.215, armL, elbowL], ['R', 0.215, armR, elbowR]] as const).map(([k, dx, sh, el]) => (
            <group key={k} position={[dx, 0.26, 0]} ref={sh}>
              {/* Scye bearing: the shoulder joint a pressurised suit turns on */}
              <mesh material={mats.bearing} castShadow>
                <cylinderGeometry args={[0.084, 0.084, 0.05, 16]} />
              </mesh>
              <mesh position={[0, -0.14, 0]} material={mats.soft} castShadow>
                <capsuleGeometry args={[0.078, 0.2, 4, 10]} />
              </mesh>
              {/* Commander stripe, upper arm */}
              <mesh position={[0, -0.2, 0]} material={mats.accent}>
                <cylinderGeometry args={[0.08, 0.08, 0.03, 14]} />
              </mesh>
              <group position={[0, -0.3, 0]} ref={el}>
                {/* Elbow bearing */}
                <mesh material={mats.bearing} castShadow>
                  <cylinderGeometry args={[0.072, 0.072, 0.04, 14]} />
                </mesh>
                <mesh position={[0, -0.13, 0]} material={mats.soft} castShadow>
                  <capsuleGeometry args={[0.07, 0.18, 4, 10]} />
                </mesh>
                {/* glove */}
                <mesh position={[0, -0.27, 0.01]} material={mats.suitShade} castShadow>
                  <sphereGeometry args={[0.082, 12, 10]} />
                </mesh>
                {k === 'R' && (
                  <group ref={toolGrp} position={[0, -0.33, 0.04]} visible={false}>
                    {/* Wire brush / abrader head */}
                    <group name="brush">
                      <mesh material={mats.dark}>
                        <boxGeometry args={[0.05, 0.12, 0.04]} />
                      </mesh>
                      <mesh position={[0, -0.08, 0]} material={mats.tank}>
                        <boxGeometry args={[0.07, 0.04, 0.06]} />
                      </mesh>
                      {Array.from({ length: 5 }, (_, i) => (
                        <mesh key={i} position={[-0.024 + i * 0.012, -0.11, 0]} material={mats.dark}>
                          <boxGeometry args={[0.004, 0.03, 0.05]} />
                        </mesh>
                      ))}
                    </group>
                    {/* Hand lens */}
                    <group name="lens">
                      <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.dark}>
                        <torusGeometry args={[0.035, 0.009, 8, 18]} />
                      </mesh>
                      <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.glass}>
                        <circleGeometry args={[0.032, 18]} />
                      </mesh>
                      <mesh position={[0, 0.055, 0]} material={mats.dark}>
                        <boxGeometry args={[0.012, 0.05, 0.012]} />
                      </mesh>
                    </group>
                    {/* Coring drill */}
                    <group name="drill">
                      <mesh material={mats.tank}>
                        <boxGeometry args={[0.07, 0.15, 0.07]} />
                      </mesh>
                      <mesh position={[0, -0.13, 0]} material={mats.dark}>
                        <cylinderGeometry args={[0.018, 0.018, 0.13, 10]} />
                      </mesh>
                      <mesh position={[0, 0.095, 0]} material={mats.accent}>
                        <boxGeometry args={[0.05, 0.03, 0.05]} />
                      </mesh>
                    </group>
                  </group>
                )}
                {/* Wrist disconnect: gloves come off at a metal ring */}
                <mesh position={[0, -0.21, 0]} material={mats.bearing}>
                  <cylinderGeometry args={[0.072, 0.072, 0.03, 14]} />
                </mesh>
              </group>
            </group>
          ))}

          {/* ---- Helmet ------------------------------------------------- */}
          <group position={[0, 0.49, 0]}>
            {/* Neck ring */}
            <mesh position={[0, -0.08, 0]} material={mats.bearing}>
              <cylinderGeometry args={[0.105, 0.115, 0.05, 18]} />
            </mesh>
            {/* Pressure bubble */}
            <mesh material={mats.glass} castShadow>
              <sphereGeometry args={[0.155, 22, 18]} />
            </mesh>
            {/* Hard shell over the back and crown */}
            <mesh position={[0, 0.012, -0.022]} material={mats.suit} castShadow>
              <sphereGeometry args={[0.163, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            </mesh>
            <mesh position={[0, -0.02, -0.07]} material={mats.suit}>
              <sphereGeometry args={[0.16, 20, 16, Math.PI * 0.52, Math.PI * 0.96]} />
            </mesh>
            {/* Gold-coated sun visor: a real EVA visor is gold for exactly this reason */}
            <mesh position={[0, 0.02, 0.012]} rotation={[0, 0, 0]} material={mats.gold} castShadow>
              <sphereGeometry args={[0.168, 24, 18, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.46]} />
            </mesh>
            {/* Helmet lamps */}
            {[-0.1, 0.1].map((dx) => (
              <group key={dx} position={[dx, 0.1, 0.085]}>
                <mesh material={mats.dark}>
                  <cylinderGeometry args={[0.025, 0.028, 0.045, 12]} />
                </mesh>
                <mesh position={[0, 0.024, 0]} material={lampsOn ? mats.led : mats.lens}>
                  <cylinderGeometry args={[0.021, 0.021, 0.006, 12]} />
                </mesh>
              </group>
            ))}
            {lampsOn && (
              <spotLight
                position={[0, 0.06, 0.12]}
                target-position={[0, -1.4, 6]}
                angle={0.5}
                penumbra={0.7}
                intensity={16}
                distance={34}
                color="#dff2ff"
              />
            )}
            {/* Antenna */}
            <mesh position={[0.1, 0.11, -0.1]} rotation={[0.3, 0, -0.25]} material={mats.dark}>
              <cylinderGeometry args={[0.005, 0.004, 0.2, 6]} />
            </mesh>
          </group>

          {/* ---- Portable life support system ------------------------- */}
          <group position={[0, 0.17, -0.245]}>
            {/* Main housing */}
            <mesh material={mats.suitShade} castShadow>
              <boxGeometry args={[0.4, 0.5, 0.2]} />
            </mesh>
            {/* Radiator panel on the back face */}
            <mesh position={[0, 0.02, -0.108]} material={mats.dark}>
              <boxGeometry args={[0.35, 0.4, 0.014]} />
            </mesh>
            {Array.from({ length: 7 }, (_, i) => (
              <mesh key={i} position={[-0.14 + i * 0.047, 0.02, -0.117]} material={mats.tank}>
                <boxGeometry args={[0.012, 0.38, 0.006]} />
              </mesh>
            ))}
            {/* Oxygen tanks */}
            {[-0.12, 0.12].map((dx) => (
              <mesh key={dx} position={[dx, -0.16, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={mats.tank} castShadow>
                <capsuleGeometry args={[0.058, 0.2, 4, 12]} />
              </mesh>
            ))}
            {/* Plumbing */}
            <mesh position={[0, -0.05, 0.085]} rotation={[0, 0, Math.PI / 2]} material={mats.dark}>
              <cylinderGeometry args={[0.016, 0.016, 0.26, 10]} />
            </mesh>

            {/* ---- The backpack kit ---------------------------------- */}
            {/* Field camera on a swing bracket */}
            <group position={[-0.235, 0.14, 0.02]} rotation={[0, -0.35, 0]}>
              <mesh material={mats.dark} castShadow>
                <boxGeometry args={[0.09, 0.07, 0.11]} />
              </mesh>
              <mesh position={[0, 0, 0.072]} material={mats.lens}>
                <cylinderGeometry args={[0.026, 0.03, 0.04, 16]} />
              </mesh>
              <mesh position={[0, 0.045, 0]} material={mats.accent}>
                <boxGeometry args={[0.05, 0.016, 0.05]} />
              </mesh>
            </group>

            {/* Flag canister: a sealed tube, carried like a core sleeve */}
            <group position={[0.235, 0.08, 0.0]} rotation={[0, 0, -0.1]}>
              <mesh material={mats.tank} castShadow>
                <cylinderGeometry args={[0.035, 0.035, 0.42, 14]} />
              </mesh>
              <mesh position={[0, 0.22, 0]} material={mats.accent}>
                <cylinderGeometry args={[0.038, 0.038, 0.035, 14]} />
              </mesh>
            </group>

            {/* Sample tube rack */}
            <group position={[0, -0.21, 0.07]}>
              {Array.from({ length: 4 }, (_, i) => (
                <mesh key={i} position={[-0.09 + i * 0.06, 0, 0]} rotation={[0.25, 0, 0]} material={mats.tank} castShadow>
                  <cylinderGeometry args={[0.019, 0.019, 0.17, 10]} />
                </mesh>
              ))}
              <mesh position={[0, -0.08, 0]} material={mats.dark}>
                <boxGeometry args={[0.26, 0.03, 0.06]} />
              </mesh>
            </group>

            {/* Geology hammer, strapped to the side */}
            <group position={[-0.225, -0.12, 0.0]} rotation={[0, 0, 0.18]}>
              <mesh material={mats.dark} castShadow>
                <cylinderGeometry args={[0.012, 0.012, 0.26, 8]} />
              </mesh>
              <mesh position={[0, 0.14, 0]} material={mats.tank}>
                <boxGeometry args={[0.03, 0.05, 0.09]} />
              </mesh>
            </group>
          </group>
        </group>
        {/* Dust thrown off the abraded patch, at the work point in front of the boots */}
        <points ref={dustPuff} position={[0.16, 0.22, 0.46]} visible={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[puffPositions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.035}
            color="#c99266"
            transparent
            opacity={0.5}
            depthWrite={false}
            sizeAttenuation
          />
        </points>
      </group>
    </group>
  )
}

/** A small fixed cloud of points; the animation spins and pulses it. */
const puffPositions = (() => {
  const N = 90
  const a = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const r = Math.pow(Math.random(), 0.6) * 0.17
    const th = Math.random() * Math.PI * 2
    a[i * 3] = Math.cos(th) * r
    a[i * 3 + 1] = Math.random() * 0.14
    a[i * 3 + 2] = Math.sin(th) * r
  }
  return a
})()
