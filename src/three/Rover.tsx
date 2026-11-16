import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { live } from '../state/live'
import { renderTier } from '../state/settings'
import {
  CLEARANCE, TRACK, WHEELS, WHEEL_BASE, WHEEL_R, mastTarget, suspension,
} from '../sim/rover'

/**
 * MERV.
 *
 * A six-wheeled scout rover on a real rocker-bogie, built from primitives the
 * same way Jack is. The silhouette is doing the work: a flat instrument deck
 * with a solar array on it, a mast with a stereo camera head, a dish pointed at
 * the sky, and six cleated wheels on visible articulated arms. That reads as a
 * Mars rover from forty metres away, which is the only distance that matters.
 *
 * What is animated, and why each one earns its cost:
 *
 *  - Six independent wheel contacts drive two rocker angles and two bogie
 *    angles per side. This is the single most convincing thing in the model.
 *    A rover that slides over a heightmap looks like a prop; one whose front
 *    wheel climbs a rock while the chassis barely moves looks like hardware.
 *  - Wheels spin from distance travelled, not from time, so they never skate.
 *  - Front and rear wheels steer; the middle pair does not, which is how a
 *    six-wheel chassis actually turns.
 *  - The mast pans and tilts toward whatever MERV is currently about: Jack
 *    when he is being spoken to, the outcrop when there is work, the up-sun
 *    horizon when a front is building, the sky when the relay is overhead.
 *  - The status bar on the mast is the conversational state made physical.
 *    You can tell from across the crater whether he is listening, thinking or
 *    talking, which means the voice interface has a presence in the world and
 *    not only in a panel.
 *
 * GAME MECHANIC / ARTISTIC: not a model of any real or planned vehicle.
 */

const BODY = '#dcdcd7'        // white thermal blanket over the warm box
const BODY_SHADE = '#b9bbb6'
const GOLD = '#c9a13a'        // Kapton multi-layer insulation
const METAL = '#9ba1a9'       // anodised aluminium structure
const DARK = '#24262a'
const WHEEL = '#2b2d31'
const CELL = '#1b2a4a'        // triple-junction solar cells, deep blue-violet
const NASA_BLUE = '#0b3d91'
const NASA_RED = '#fc3d21'

/** How often the six wheel contacts are resampled, seconds. */
const SUSPENSION_HZ = 1 / 22

export default function Rover({
  dust = 0, lampsOn = false, stationPos = null, stormFromDeg = 0,
}: {
  dust?: number
  lampsOn?: boolean
  /** The outcrop MERV should point the mast at, when there is one. */
  stationPos?: [number, number] | null
  /** Bearing a dust front is arriving from, degrees. */
  stormFromDeg?: number
}) {
  const root = useRef<THREE.Group>(null)
  const chassis = useRef<THREE.Group>(null)
  const mastPan = useRef<THREE.Group>(null)
  const mastTilt = useRef<THREE.Group>(null)
  const dish = useRef<THREE.Group>(null)
  const statusBar = useRef<THREE.Mesh>(null)
  const plume = useRef<THREE.Points>(null)
  const rockers = useRef<Array<THREE.Group | null>>([null, null])
  const bogies = useRef<Array<THREE.Group | null>>([null, null])
  const wheelRefs = useRef<Array<THREE.Group | null>>([null, null, null, null, null, null])
  const lamps = useRef<THREE.Group>(null)

  const tier = renderTier.current.tier

  const mats = useMemo(() => {
    const tint = (hex: string, amount: number) =>
      new THREE.Color(hex).lerp(new THREE.Color('#9a7048'), amount)
    return {
      body: new THREE.MeshStandardMaterial({
        color: tint(BODY, dust * 0.5), roughness: 0.58, metalness: 0.08, envMapIntensity: 0.85,
      }),
      bodyShade: new THREE.MeshStandardMaterial({
        color: tint(BODY_SHADE, dust * 0.6), roughness: 0.7, metalness: 0.1, envMapIntensity: 0.7,
      }),
      // Kapton MLI is a real specular gold film, so it needs the environment
      // map to read as anything other than a yellow box.
      gold: new THREE.MeshStandardMaterial({
        color: GOLD, roughness: 0.22, metalness: 0.92, envMapIntensity: 1.8,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: METAL, roughness: 0.34, metalness: 0.85, envMapIntensity: 1.2,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: DARK, roughness: 0.5, metalness: 0.35, envMapIntensity: 0.8,
      }),
      // Dust loads the wheels and the lower structure far harder than the deck,
      // because that is where it comes from.
      wheel: new THREE.MeshStandardMaterial({
        color: tint(WHEEL, Math.min(0.8, dust * 1.4)), roughness: 0.92, metalness: 0.12,
      }),
      // Solar cells: near-mirror, very dark, and they lose contrast as dust
      // settles. The visual and the power model are driven by the same number.
      // Triple-junction cells under cover glass. Enough specular to catch the
      // sun, not so much that a grazing view turns the whole array into a
      // mirror of the sky — which is what a polished surface really does, and
      // which stops it reading as an array at exactly the angle the player
      // usually sees it from.
      cells: new THREE.MeshStandardMaterial({
        color: new THREE.Color(CELL).lerp(new THREE.Color('#a9865c'), Math.min(0.85, live.rover.arrayDust)),
        roughness: 0.34 + 0.4 * Math.min(1, live.rover.arrayDust),
        metalness: 0.45,
        envMapIntensity: 0.55,
      }),
      lens: new THREE.MeshStandardMaterial({ color: '#0b1016', roughness: 0.05, metalness: 0.9 }),
      blue: new THREE.MeshStandardMaterial({ color: NASA_BLUE, roughness: 0.55, envMapIntensity: 0.6 }),
      red: new THREE.MeshStandardMaterial({ color: NASA_RED, roughness: 0.55, envMapIntensity: 0.6 }),
      lamp: new THREE.MeshStandardMaterial({
        color: '#fff6e2', emissive: '#fff0d0', emissiveIntensity: lampsOn ? 3.4 : 0.05,
      }),
      status: new THREE.MeshStandardMaterial({
        color: '#4fe8ff', emissive: '#4fe8ff', emissiveIntensity: 2.2, toneMapped: false,
      }),
    }
  }, [dust, lampsOn])

  /** Dust thrown up by the wheels. One small buffer, reused. */
  const plumeGeo = useMemo(() => {
    const n = tier === 0 ? 0 : tier === 1 ? 54 : 110
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.5
      pos[i * 3 + 1] = Math.random() * 0.5
      pos[i * 3 + 2] = -WHEEL_BASE - Math.random() * 1.4
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [tier])

  const plumeMat = useMemo(() => new THREE.PointsMaterial({
    color: new THREE.Color('#b08a63'),
    size: 0.09,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  }), [])

  // Smoothed suspension state, so the throttled terrain sampling does not show
  // as a 22 Hz judder on the chassis.
  const susp = useRef({
    y: 0, pitch: 0, roll: 0, rockerL: 0, rockerR: 0, bogieL: 0, bogieR: 0,
    contacts: [0, 0, 0, 0, 0, 0] as number[],
  })
  const target = useRef({ ...susp.current })
  const sinceSample = useRef(99)
  const clock = useRef(0)

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.08, dtRaw)
    clock.current += dt
    const r = live.rover
    const g = root.current
    if (!g) return

    // ---- Ground contact -------------------------------------------------
    sinceSample.current += dt
    if (sinceSample.current >= SUSPENSION_HZ) {
      sinceSample.current = 0
      const s = suspension(r.x, r.z, r.heading)
      target.current = { ...s }
    }
    const k = Math.min(1, dt * 11)
    const s0 = susp.current
    const t0 = target.current
    s0.y += (t0.y - s0.y) * k
    s0.pitch += (t0.pitch - s0.pitch) * k
    s0.roll += (t0.roll - s0.roll) * k
    s0.rockerL += (t0.rockerL - s0.rockerL) * k
    s0.rockerR += (t0.rockerR - s0.rockerR) * k
    s0.bogieL += (t0.bogieL - s0.bogieL) * k
    s0.bogieR += (t0.bogieR - s0.bogieR) * k
    for (let i = 0; i < 6; i++) {
      s0.contacts[i] += ((t0.contacts[i] ?? 0) - s0.contacts[i]) * k
    }

    // Publish the chassis height so the HUD and the camera can use it.
    r.y = s0.y

    // ---- Place the vehicle ----------------------------------------------
    g.position.set(r.x, s0.y + WHEEL_R + CLEARANCE, r.z)
    g.rotation.set(0, r.heading, 0)
    if (chassis.current) {
      // Pitch and roll are applied to the body only. The wheels stay on the
      // ground, which is the whole point of the suspension.
      chassis.current.rotation.set(s0.pitch * 0.55, 0, -s0.roll * 0.55)
    }

    // Rocker and bogie arms carry the wheels. Halving the angle is what a real
    // rocker-bogie does to the body: the chassis rises about half as far as
    // the wheel that climbed.
    rockers.current[0]?.rotation.set(-s0.rockerL * 0.8, 0, 0)
    rockers.current[1]?.rotation.set(-s0.rockerR * 0.8, 0, 0)
    bogies.current[0]?.rotation.set(-s0.bogieL * 0.8, 0, 0)
    bogies.current[1]?.rotation.set(-s0.bogieR * 0.8, 0, 0)

    // ---- Wheels ---------------------------------------------------------
    for (let i = 0; i < 6; i++) {
      const w = wheelRefs.current[i]
      if (!w) continue
      // Front pair steers with the commanded angle; rear pair steers the other
      // way, which tightens the arc; the middle pair is fixed.
      const isFront = WHEELS[i][1] > 0.1
      const isRear = WHEELS[i][1] < -0.1
      w.rotation.y = isFront ? r.steer : isRear ? -r.steer * 0.6 : 0
      const tyre = w.children[0]
      if (tyre) tyre.rotation.x = r.spin
      /**
       * Residual contact correction.
       *
       * The rocker and bogie rotations already carry most of each wheel down
       * onto its own contact point — that is what they are for. Applying the
       * full remaining difference here as well would double-count the terrain
       * and lift wheels clear of the ground on a slope, so only a fraction is
       * applied, and it is clamped to the real travel of the joint.
       */
      const drop = (s0.contacts[i] ?? s0.y) - s0.y
      w.position.y = -CLEARANCE + Math.max(-0.17, Math.min(0.17, drop * 0.45))
    }

    // ---- Mast -----------------------------------------------------------
    const look = stationPos ? { x: stationPos[0], z: stationPos[1] } : null
    const want = mastTarget(
      r, r.mastIntent, { x: live.jack.x, z: live.jack.z }, look, stormFromDeg, clock.current,
    )
    if (mastPan.current) {
      // Shortest-way pan, eased. A mast that spins the long way round to find
      // Jack looks broken.
      const cur = mastPan.current.rotation.y
      const delta = ((want.yaw - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      mastPan.current.rotation.y = cur + delta * Math.min(1, dt * 2.6)
    }
    if (mastTilt.current) {
      mastTilt.current.rotation.x += (want.pitch - mastTilt.current.rotation.x) * Math.min(1, dt * 2.2)
    }

    // The high-gain dish tracks a slowly moving point overhead, the way one
    // tracking a relay orbiter does.
    if (dish.current) {
      dish.current.rotation.y = Math.sin(clock.current * 0.07) * 0.9
      dish.current.rotation.x = -0.75 + Math.sin(clock.current * 0.05) * 0.18
    }

    // ---- Status bar: the conversation, made visible ----------------------
    if (statusBar.current) {
      const m = statusBar.current.material as THREE.MeshStandardMaterial
      let color = '#4fe8ff'
      let pulse = 1
      if (r.listening > 0.5) {
        color = '#7dffb2'
        // Breathing, so "I am hearing you" is unmistakable.
        pulse = 1.6 + Math.sin(clock.current * 7) * 0.7
      } else if (r.thinking > 0.5) {
        color = '#ffb24a'
        pulse = 1.4 + Math.sin(clock.current * 14) * 0.9
      } else if (r.talking > 0.5) {
        color = '#4fe8ff'
        // Chopped, like a vocoder. It reads as speech at any distance.
        pulse = 1.8 + Math.abs(Math.sin(clock.current * 19)) * 1.9
      } else if (r.mode === 'lowpower') {
        color = '#ff4d4d'
        pulse = 0.5 + Math.abs(Math.sin(clock.current * 1.3)) * 0.8
      } else if (r.mode === 'blocked') {
        color = '#ffb24a'
        pulse = 0.9
      } else {
        pulse = 0.85 + Math.sin(clock.current * 1.1) * 0.2
      }
      m.color.set(color)
      m.emissive.set(color)
      m.emissiveIntensity = pulse * 1.4
    }

    if (lamps.current) lamps.current.visible = lampsOn

    // ---- Dust plume -----------------------------------------------------
    if (plume.current && plumeGeo.attributes.position) {
      const op = r.plume * 0.5 * (0.35 + dust)
      plumeMat.opacity = op
      plume.current.visible = op > 0.01
      if (op > 0.01) {
        const pos = plumeGeo.attributes.position as THREE.BufferAttribute
        const seeds = plumeGeo.attributes.aSeed as THREE.BufferAttribute
        const arr = pos.array as Float32Array
        for (let i = 0; i < pos.count; i++) {
          const sd = seeds.getX(i)
          // Rise and drift back from the wheels, then recycle. In 1% of
          // Earth's air density dust thrown up hangs for a long time, which is
          // why the fall-back is slow.
          arr[i * 3 + 1] += dt * (0.18 + sd * 0.3)
          arr[i * 3 + 2] -= dt * (0.5 + sd * 0.8) * (0.3 + r.plume)
          if (arr[i * 3 + 1] > 0.75 || arr[i * 3 + 2] < -3.4) {
            arr[i * 3] = (Math.random() - 0.5) * 1.5
            arr[i * 3 + 1] = 0
            arr[i * 3 + 2] = -WHEEL_BASE - Math.random() * 0.3
          }
        }
        pos.needsUpdate = true
      }
    }
  })

  /** One wheel: hub, rim and visible grousers. */
  const Wheel = ({ i }: { i: number }) => {
    const [wx, wz] = WHEELS[i]
    const cleats = tier === 0 ? 6 : 12
    return (
      <group ref={(el) => { wheelRefs.current[i] = el }} position={[wx, -CLEARANCE, wz]}>
        <group>
          {/* The tyre. Rotated so the cylinder axis runs across the vehicle. */}
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.wheel} castShadow>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.2, tier === 0 ? 12 : 22]} />
          </mesh>
          {/* Grousers: the cleats that give a wheel grip in loose regolith.
              Real rover wheels are covered in them, and they are what makes a
              spinning wheel legible rather than a smooth blur. */}
          {Array.from({ length: cleats }, (_, c) => {
            const a = (c / cleats) * Math.PI * 2
            return (
              <mesh
                key={c}
                position={[0, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R]}
                rotation={[-a, 0, 0]}
                material={mats.metal}
              >
                <boxGeometry args={[0.21, 0.016, 0.05]} />
              </mesh>
            )
          })}
          {/* Hub and spokes. */}
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.metal}>
            <cylinderGeometry args={[0.075, 0.075, 0.215, 10]} />
          </mesh>
        </group>
      </group>
    )
  }

  /** One side's rocker-bogie arm set, with the three wheels it carries. */
  const Side = ({ sign }: { sign: 1 | -1 }) => {
    const si = sign > 0 ? 1 : 0
    const front = sign > 0 ? 1 : 0
    const mid = sign > 0 ? 3 : 2
    const rear = sign > 0 ? 5 : 4
    return (
      <group position={[0, 0, 0]}>
        {/* Rocker: pivots at the chassis, front wheel on one end. */}
        <group ref={(el) => { rockers.current[si] = el }} position={[sign * TRACK, 0.02, 0]}>
          <mesh position={[0, -0.14, WHEEL_BASE / 2]} rotation={[0.3, 0, 0]} material={mats.metal} castShadow>
            <boxGeometry args={[0.07, 0.07, WHEEL_BASE * 1.05]} />
          </mesh>
          <group position={[-sign * TRACK, 0, 0]}><Wheel i={front} /></group>
        </group>

        {/* Bogie: hangs off the other end of the rocker and carries the middle
            and rear wheels. Two passive joints, no springs — exactly the real
            arrangement. */}
        <group ref={(el) => { bogies.current[si] = el }} position={[sign * TRACK, -0.04, -WHEEL_BASE * 0.5]}>
          <mesh position={[0, -0.1, WHEEL_BASE * 0.5]} rotation={[-0.16, 0, 0]} material={mats.metal} castShadow>
            <boxGeometry args={[0.062, 0.062, WHEEL_BASE * 0.72]} />
          </mesh>
          <mesh position={[0, -0.1, -WHEEL_BASE * 0.5]} rotation={[0.16, 0, 0]} material={mats.metal} castShadow>
            <boxGeometry args={[0.062, 0.062, WHEEL_BASE * 0.72]} />
          </mesh>
          <group position={[-sign * TRACK, 0, WHEEL_BASE * 0.5]}><Wheel i={mid} /></group>
          <group position={[-sign * TRACK, 0, -WHEEL_BASE * 0.5]}><Wheel i={rear} /></group>
        </group>
      </group>
    )
  }

  return (
    <group ref={root}>
      {/* Suspension and wheels sit outside the pitching chassis group, because
          the ground does not pitch with the body. */}
      <Side sign={-1} />
      <Side sign={1} />

      <group ref={chassis}>
        {/* ---- Warm electronics box ------------------------------------- */}
        <mesh position={[0, 0.1, 0]} material={mats.body} castShadow receiveShadow>
          <boxGeometry args={[TRACK * 1.78, 0.34, WHEEL_BASE * 1.95]} />
        </mesh>
        {/* Gold MLI on the sides: the blanket that keeps the box alive at
            minus eighty. */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * TRACK * 0.9, 0.04, 0]} material={mats.gold}>
            <boxGeometry args={[0.012, 0.15, WHEEL_BASE * 1.82]} />
          </mesh>
        ))}
        <mesh position={[0, -0.08, 0]} material={mats.bodyShade}>
          <boxGeometry args={[TRACK * 1.7, 0.06, WHEEL_BASE * 1.82]} />
        </mesh>

        {/* ---- Solar array ---------------------------------------------- */}
        <group position={[0, 0.29, -0.06]}>
          <mesh material={mats.bodyShade} receiveShadow>
            <boxGeometry args={[TRACK * 2.5, 0.02, WHEEL_BASE * 1.9]} />
          </mesh>
          <mesh position={[0, 0.013, 0]} material={mats.cells}>
            <boxGeometry args={[TRACK * 2.44, 0.006, WHEEL_BASE * 1.84]} />
          </mesh>
          {/* Cell-string gaps. Four lines is enough to read as a cell grid and
              costs four boxes. */}
          {[-0.62, -0.21, 0.21, 0.62].map((f) => (
            <mesh key={f} position={[f * TRACK * 2.4 * 0.5, 0.018, 0]} material={mats.bodyShade}>
              <boxGeometry args={[0.012, 0.004, WHEEL_BASE * 1.84]} />
            </mesh>
          ))}
        </group>

        {/* ---- Insignia -------------------------------------------------- */}
        <mesh position={[TRACK * 0.9 + 0.008, 0.14, 0.26]} rotation={[0, Math.PI / 2, 0]} material={mats.blue}>
          <circleGeometry args={[0.072, 18]} />
        </mesh>
        <mesh position={[TRACK * 0.9 + 0.01, 0.14, 0.26]} rotation={[0, Math.PI / 2, 0]} material={mats.red}>
          <boxGeometry args={[0.1, 0.014, 0.004]} />
        </mesh>
        <mesh position={[-TRACK * 0.9 - 0.008, 0.14, 0.26]} rotation={[0, -Math.PI / 2, 0]} material={mats.blue}>
          <circleGeometry args={[0.072, 18]} />
        </mesh>

        {/* ---- Mast ------------------------------------------------------ */}
        <group position={[0.16, 0.3, WHEEL_BASE * 0.7]}>
          <mesh position={[0, 0.46, 0]} material={mats.metal} castShadow>
            <cylinderGeometry args={[0.035, 0.05, 0.94, 10]} />
          </mesh>
          {/* Mast foot bracket, so it does not look pushed into the deck. */}
          <mesh position={[0, 0.02, 0]} material={mats.dark}>
            <cylinderGeometry args={[0.08, 0.095, 0.08, 10]} />
          </mesh>
          <group ref={mastPan} position={[0, 0.95, 0]}>
            {/* Pan bearing. */}
            <mesh material={mats.dark}>
              <cylinderGeometry args={[0.058, 0.058, 0.055, 12]} />
            </mesh>
            <group ref={mastTilt} position={[0, 0.07, 0]}>
              {/* Camera head. */}
              <mesh material={mats.body} castShadow>
                <boxGeometry args={[0.3, 0.1, 0.12]} />
              </mesh>
              {/* Stereo pair. Two eyes is what makes a head a head. */}
              {[-0.096, 0.096].map((x) => (
                <group key={x} position={[x, 0, 0.065]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.dark}>
                    <cylinderGeometry args={[0.03, 0.032, 0.05, 12]} />
                  </mesh>
                  <mesh position={[0, 0, 0.027]} material={mats.lens}>
                    <circleGeometry args={[0.024, 14]} />
                  </mesh>
                </group>
              ))}
              {/* Status bar across the brow: listening, thinking, talking. */}
              <mesh ref={statusBar} position={[0, 0.062, 0.03]} material={mats.status}>
                <boxGeometry args={[0.22, 0.016, 0.05]} />
              </mesh>
              {/* Work lamps. */}
              <group ref={lamps} position={[0, -0.055, 0.055]} visible={lampsOn}>
                {[-0.1, 0.1].map((x) => (
                  <mesh key={x} position={[x, 0, 0]} material={mats.lamp}>
                    <sphereGeometry args={[0.022, 8, 6]} />
                  </mesh>
                ))}
                <pointLight position={[0, 0, 0.3]} color="#fff0d0" intensity={lampsOn ? 5 : 0} distance={22} decay={2} />
              </group>
            </group>
          </group>
        </group>

        {/* ---- High-gain antenna ---------------------------------------- */}
        <group ref={dish} position={[-0.3, 0.33, -WHEEL_BASE * 0.62]}>
          <mesh position={[0, 0.13, 0]} material={mats.metal}>
            <cylinderGeometry args={[0.022, 0.028, 0.26, 8]} />
          </mesh>
          <mesh position={[0, 0.3, 0]} rotation={[Math.PI, 0, 0]} material={mats.gold}>
            <sphereGeometry args={[0.185, 16, 9, 0, Math.PI * 2, 0, 0.74]} />
          </mesh>
          <mesh position={[0, 0.23, 0]} material={mats.dark}>
            <cylinderGeometry args={[0.013, 0.013, 0.12, 6]} />
          </mesh>
        </group>

        {/* Instrument box on the deck: a warm enclosure with a radiator face.
            Mars rovers are mostly boxes keeping other boxes alive. */}
        <group position={[-0.2, 0.36, WHEEL_BASE * 0.42]}>
          <mesh material={mats.bodyShade} castShadow>
            <boxGeometry args={[0.34, 0.14, 0.26]} />
          </mesh>
          <mesh position={[0, 0, 0.133]} material={mats.gold}>
            <boxGeometry args={[0.3, 0.1, 0.005]} />
          </mesh>
        </group>

        {/* ---- UHF whip, for the relay link ----------------------------- */}
        <mesh position={[0.3, 0.52, -WHEEL_BASE * 0.6]} material={mats.dark}>
          <cylinderGeometry args={[0.006, 0.006, 0.44, 5]} />
        </mesh>

        {/* ---- Instrument arm, stowed ----------------------------------- */}
        <group position={[0, -0.02, WHEEL_BASE * 0.62]} rotation={[0.42, 0, 0]}>
          <mesh position={[0, 0, 0.16]} material={mats.metal} castShadow>
            <boxGeometry args={[0.055, 0.055, 0.34]} />
          </mesh>
          <mesh position={[0, 0, 0.34]} material={mats.dark}>
            <cylinderGeometry args={[0.05, 0.05, 0.07, 10]} />
          </mesh>
        </group>
      </group>

      {/* Wheel-thrown dust. Outside the chassis group so it does not pitch. */}
      {plumeGeo.attributes.position && plumeGeo.attributes.position.count > 0 && (
        <points ref={plume} geometry={plumeGeo} material={plumeMat} position={[0, -CLEARANCE, 0]} />
      )}
    </group>
  )
}
