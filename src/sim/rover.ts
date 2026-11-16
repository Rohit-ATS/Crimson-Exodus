/**
 * rover.ts — MERV's driving model.
 *
 * ===========================================================================
 *  GAME MECHANIC. MERV is not a real or planned vehicle.
 *
 *  Where it is honest: the suspension is a real rocker-bogie, the kind every
 *  NASA Mars rover since Sojourner has used, and it is articulated here the
 *  way the real one is — no springs, two passive joints per side, all six
 *  wheels kept loaded by geometry alone. The power model is real in shape
 *  too: a solar array whose output collapses with dust loading and low sun,
 *  which is what actually killed Opportunity in the 2018 global storm and
 *  InSight in 2022.
 *
 *  Where it is fiction: the speed. Perseverance's top speed is about
 *  0.042 m/s (152 m/h) and it does not drive alongside anybody. MERV moves at
 *  walking pace because a companion that falls 400 m behind in the first
 *  minute is not a companion. That number is the one deliberate lie in this
 *  module and it is labelled as such in the provenance panel.
 * ===========================================================================
 */

import { heightAt, normalAt, slopeDeg } from '../mission/terrain'
import type { LiveRover } from '../state/live'

/** Wheelbase half-length, metres: front axle to centre axle. */
export const WHEEL_BASE = 0.82
/** Track half-width, metres. */
export const TRACK = 0.62
/** Wheel radius, metres. Perseverance's are 0.2675 m; these are smaller. */
export const WHEEL_R = 0.23
/** Chassis clearance above the mean wheel contact, metres. */
export const CLEARANCE = 0.42

/** Flat ground top speed, m/s. Fiction — see the header. */
export const MAX_SPEED = 1.95
/** Steepest grade MERV will attempt before looking for a way round, degrees. */
export const MAX_GRADE_DEG = 23
/** How far behind and to the side of Jack it tries to sit, metres. */
export const STANDOFF_M = 3.4
/** Inside this it stops closing, so it never shoves the camera. */
export const DEADBAND_M = 0.55

/** Array area times efficiency, in watts at 1 AU-equivalent full sun. */
const ARRAY_PEAK_W = 185
/** Driving draw at full speed, watts. */
const DRIVE_W = 120
/** Everything that is on whether or not it is moving, watts. */
const HOUSEKEEPING_W = 22
/** Usable battery energy, watt-hours. */
const BATTERY_WH = 360

/**
 * The six wheel positions in chassis space, as [x (right), z (forward)].
 * Front, centre, rear on each side — the real six-wheel layout.
 */
export const WHEELS: Array<[number, number]> = [
  [-TRACK, WHEEL_BASE], [TRACK, WHEEL_BASE],
  [-TRACK, 0], [TRACK, 0],
  [-TRACK, -WHEEL_BASE], [TRACK, -WHEEL_BASE],
]

export interface RoverCommand {
  /** Where MERV should be. World metres. */
  targetX: number
  targetZ: number
  /** Jack's position, so it can keep its distance and point the mast. */
  jackX: number
  jackZ: number
  /** Hold position: at a station, sheltering, or told to stay. */
  hold: boolean
  /** Sunlight actually reaching the ground, W/m^2, from the environment model. */
  directIrradianceW: number
  /** Column optical depth, for array dust accumulation. */
  tau: number
  /** Wind speed, m/s — a gust cleans the array, as it does on the real ones. */
  windMs: number
}

/** Shortest signed angle from a to b, radians. */
function angleDelta(a: number, b: number): number {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

/**
 * The target MERV wants to occupy: a stand-off abeam and behind Jack, on his
 * left, chosen so it is in frame for a chase camera looking over his right
 * shoulder but never between him and where he is walking.
 */
export function followTarget(
  jackX: number, jackZ: number, jackHeading: number,
): { x: number; z: number } {
  const offX = -STANDOFF_M * 0.72
  const offZ = -STANDOFF_M * 0.68
  const s = Math.sin(jackHeading)
  const c = Math.cos(jackHeading)
  return {
    x: jackX + offX * c + offZ * s,
    z: jackZ - offX * s + offZ * c,
  }
}

/**
 * Pick a heading.
 *
 * Straight at the target unless the ground that way is too steep, in which
 * case fan out and take the cheapest direction that still makes progress.
 * This is a local steering rule, not a path planner — exactly like the real
 * autonav's hazard-avoidance layer, which also only ever reasons about the
 * next few metres.
 */
function chooseHeading(
  x: number, z: number, wantHeading: number,
): { heading: number; detour: boolean; blocked: boolean } {
  const grade = (h: number) => {
    const px = x + Math.sin(h) * 2.6
    const pz = z + Math.cos(h) * 2.6
    return slopeDeg(px, pz)
  }
  if (grade(wantHeading) <= MAX_GRADE_DEG) {
    return { heading: wantHeading, detour: false, blocked: false }
  }
  // Fan symmetrically so it does not develop a handedness bias.
  const fan = [0.42, -0.42, 0.85, -0.85, 1.25, -1.25, 1.7, -1.7]
  let best = -1
  let bestCost = Infinity
  for (let i = 0; i < fan.length; i++) {
    const h = wantHeading + fan[i]
    const g = grade(h)
    if (g > MAX_GRADE_DEG) continue
    // Cost: how far off the direct line, plus how steep it still is.
    const cost = Math.abs(fan[i]) + g / MAX_GRADE_DEG
    if (cost < bestCost) { bestCost = cost; best = i }
  }
  if (best < 0) return { heading: wantHeading, detour: false, blocked: true }
  return { heading: wantHeading + fan[best], detour: true, blocked: false }
}

/**
 * Where the six wheels touch the ground, and what that does to the chassis.
 *
 * Returns the mean contact height plus the rocker and bogie angles. Calling
 * this is six fBm terrain evaluations, so the renderer throttles it rather
 * than running it every frame.
 */
export function suspension(
  x: number, z: number, heading: number,
): {
  y: number
  pitch: number
  roll: number
  rockerL: number
  rockerR: number
  bogieL: number
  bogieR: number
  contacts: number[]
} {
  const s = Math.sin(heading)
  const c = Math.cos(heading)
  const contacts: number[] = []
  for (let i = 0; i < 6; i++) {
    const [wx, wz] = WHEELS[i]
    contacts.push(heightAt(x + wx * c + wz * s, z - wx * s + wz * c))
  }
  const [fl, fr, cl, cr, rl, rr] = contacts
  const mean = (fl + fr + cl + cr + rl + rr) / 6

  // Pitch from front-to-rear difference, roll from left-to-right.
  const front = (fl + fr) / 2
  const rear = (rl + rr) / 2
  const leftM = (fl + cl + rl) / 3
  const rightM = (fr + cr + rr) / 3
  const pitch = Math.atan2(front - rear, WHEEL_BASE * 2)
  const roll = Math.atan2(rightM - leftM, TRACK * 2)

  /**
   * Rocker-bogie kinematics, simplified to what reads on screen.
   *
   * On each side the rocker carries the front wheel at one end and the bogie
   * at the other; the bogie carries the centre and rear wheels. So the rocker
   * angle follows the front wheel against the mean of the back two, and the
   * bogie angle follows the centre wheel against the rear. That is why a real
   * rover can put one wheel on a boulder and keep the other five planted, and
   * animating these two angles is what makes the chassis look like it has
   * suspension rather than like it is sliding over a heightmap.
   */
  const rockerL = Math.atan2(fl - (cl + rl) / 2, WHEEL_BASE * 1.5)
  const rockerR = Math.atan2(fr - (cr + rr) / 2, WHEEL_BASE * 1.5)
  const bogieL = Math.atan2(cl - rl, WHEEL_BASE)
  const bogieR = Math.atan2(cr - rr, WHEEL_BASE)

  return { y: mean, pitch, roll, rockerL, rockerR, bogieL, bogieR, contacts }
}

/**
 * Advance MERV one fixed step. Mutates `r` in place, the way the rest of the
 * live layer works.
 *
 * `dt` is in EVA seconds, the same frame Jack's locomotion uses, so MERV keeps
 * station at every time-compression setting instead of being left 400 m behind
 * the moment the player presses Shift.
 *
 * The terrain decisions — how steep it is here, which way round an obstacle —
 * are evaluated once per call, because each one costs an fBm sample. Only the
 * integration is sub-stepped, and that is pure arithmetic. At 30x compression
 * a single call can represent a second and a half of driving, and integrating
 * that in one go makes the steering loop ring.
 */
export function stepRover(r: LiveRover, cmd: RoverCommand, dt: number): void {
  // ---- Power ------------------------------------------------------------
  // Dust settles out of the column onto the array; wind lifts some of it off.
  // Both terms are tuned, not measured, but the behaviour is the real one:
  // a long dusty spell is a slow power emergency.
  const settle = 0.0000055 * (0.35 + cmd.tau) * dt
  const clean = 0.0000120 * Math.max(0, cmd.windMs - 9) * dt
  r.arrayDust = Math.max(0, Math.min(0.92, r.arrayDust + settle - clean))

  const cosFactor = Math.max(0, Math.min(1, cmd.directIrradianceW / 590))
  r.arrayW = ARRAY_PEAK_W * cosFactor * (1 - r.arrayDust)

  // ---- Decide what to do ------------------------------------------------
  const dx = cmd.targetX - r.x
  const dz = cmd.targetZ - r.z
  const dist = Math.hypot(dx, dz)

  // Below this charge it stops driving and sits in the sun. Real spacecraft
  // do exactly this, and it is the single most useful thing MERV can teach:
  // the vehicle's own survival outranks the day's plan.
  const lowPower = r.battery < 0.12
  const hold = cmd.hold || lowPower

  let want = r.heading
  let detour = false
  let blocked = false
  if (!hold && dist > DEADBAND_M) {
    want = Math.atan2(dx, dz)
    const pick = chooseHeading(r.x, r.z, want)
    want = pick.heading
    detour = pick.detour
    blocked = pick.blocked
  } else if (hold) {
    // Parked: turn to face Jack so the mast has the shortest pan.
    want = Math.atan2(cmd.jackX - r.x, cmd.jackZ - r.z)
  }

  // ---- Speed ------------------------------------------------------------
  // Steeper ground, a dusty drivetrain and a low battery all cost speed.
  const gradeHere = slopeDeg(r.x, r.z)
  const slopePenalty = 1 - Math.min(0.72, Math.max(0, (gradeHere - 6) / 26))
  const batteryPenalty = r.battery < 0.3 ? 0.45 + r.battery : 1
  const ceiling = MAX_SPEED * slopePenalty * Math.min(1, batteryPenalty)

  // ---- Drive, in sub-steps ----------------------------------------------
  // Everything below is arithmetic on the chassis state. Nothing in here
  // samples the terrain, so sub-stepping it is nearly free.
  const SUB = 0.08
  const n = Math.max(1, Math.min(24, Math.ceil(dt / SUB)))
  const h = dt / n

  for (let i = 0; i < n; i++) {
    // Recompute the error each sub-step so a long step converges instead of
    // flying past the target and turning round.
    const ddx = cmd.targetX - r.x
    const ddz = cmd.targetZ - r.z
    const d = Math.hypot(ddx, ddz)
    const aim = hold ? Math.atan2(cmd.jackX - r.x, cmd.jackZ - r.z)
      : d > DEADBAND_M ? want : r.heading
    const headingErr = angleDelta(r.heading, aim)

    // Approach: close the gap fast when far behind, ease in when close.
    // Turning hard scrubs speed, as it does on a six-wheel chassis.
    const gap = Math.max(0, d - DEADBAND_M)
    const turnScrub = 1 - Math.min(0.85, Math.abs(headingErr) / 1.4)
    const wantSpeed = hold || blocked ? 0 : Math.min(ceiling, gap * 1.35) * turnScrub

    // Accelerate briskly, brake harder — it must not overshoot into Jack.
    const accel = wantSpeed > r.speedMs ? 1.7 : 3.2
    r.speedMs += Math.max(-accel * h, Math.min(accel * h, wantSpeed - r.speedMs))
    if (r.speedMs < 0.004) r.speedMs = 0

    // Six-wheel steering: at speed it arcs, and below a crawl it can spin on
    // the spot, which is how the real ones get out of a dead end.
    const canSpin = Math.abs(headingErr) > 1.05 && d < STANDOFF_M * 2.4
    const yawRate = canSpin ? 1.25 : 0.95 * Math.min(1, 0.3 + r.speedMs / MAX_SPEED)
    const turn = Math.max(-yawRate * h, Math.min(yawRate * h, headingErr))
    r.heading = (r.heading + turn + Math.PI * 2) % (Math.PI * 2)

    // The visible wheel angle eases toward the commanded one.
    const wantSteer = Math.max(-0.52, Math.min(0.52, headingErr * 0.8))
    r.steer += (wantSteer - r.steer) * Math.min(1, h * 5)

    const step = r.speedMs * h
    if (step > 0) {
      r.x += Math.sin(r.heading) * step
      r.z += Math.cos(r.heading) * step
      r.odometerM += step
      // Rolling without slip: one wheel turn per 2*pi*R metres.
      r.spin += step / WHEEL_R
    }
  }

  // ---- Energy -----------------------------------------------------------
  const drawW = HOUSEKEEPING_W + DRIVE_W * (r.speedMs / MAX_SPEED)
  const netWh = ((r.arrayW - drawW) * dt) / 3600
  r.battery = Math.max(0, Math.min(1, r.battery + netWh / BATTERY_WH))

  // ---- Mode -------------------------------------------------------------
  r.mode = lowPower ? 'lowpower'
    : blocked ? 'blocked'
      : detour ? 'detour'
        : r.speedMs > 0.05 ? 'follow' : 'park'

  // Wheels throw dust in proportion to how hard they are working.
  const wantPlume = Math.min(1, (r.speedMs / MAX_SPEED) * 1.15)
  r.plume += (wantPlume - r.plume) * Math.min(1, dt * 3)
}

/** Where the mast should point, given what MERV is currently for. */
export function mastTarget(
  r: LiveRover,
  intent: LiveRover['mastIntent'],
  jack: { x: number; z: number },
  station: { x: number; z: number } | null,
  stormFromDeg: number,
  clock: number,
): { yaw: number; pitch: number } {
  const DEG = Math.PI / 180
  let wx: number
  let wz: number
  let tilt = 0
  switch (intent) {
    case 'station':
      if (station) { wx = station.x; wz = station.z; tilt = -0.16 } else { wx = jack.x; wz = jack.z }
      break
    case 'storm':
      // Look up the bearing the front is arriving from.
      wx = r.x + Math.sin(stormFromDeg * DEG) * 400
      wz = r.z + Math.cos(stormFromDeg * DEG) * 400
      tilt = 0.1
      break
    case 'sky':
      // At the relay orbiter, which is what the high-gain antenna wants.
      wx = r.x + Math.sin(clock * 0.09) * 100
      wz = r.z + Math.cos(clock * 0.09) * 100
      tilt = 0.9
      break
    case 'horizon': {
      // Idle survey sweep, the way a rover spends its spare time.
      const sweep = Math.sin(clock * 0.11) * 2.2
      wx = r.x + Math.sin(sweep) * 300
      wz = r.z + Math.cos(sweep) * 300
      tilt = 0.02
      break
    }
    case 'jack':
    default:
      wx = jack.x; wz = jack.z; tilt = -0.07
      break
  }
  const worldYaw = Math.atan2(wx - r.x, wz - r.z)
  return { yaw: angleDelta(r.heading, worldYaw), pitch: tilt }
}

/** A one-line description of MERV's own state, for the HUD and the agent. */
export function roverStatusLine(r: LiveRover): string {
  switch (r.mode) {
    case 'lowpower':
      return `Low-power hold — array making ${r.arrayW.toFixed(0)} W, battery ${(r.battery * 100).toFixed(0)}%`
    case 'blocked':
      return 'Blocked — no route under the slope limit from here'
    case 'detour':
      return 'Driving a detour around steep ground'
    case 'follow':
      return `Following at ${r.speedMs.toFixed(2)} m/s`
    case 'park':
    default:
      return 'Parked, mast active'
  }
}

/** Surface normal under the chassis, for lighting the wheels' contact shadow. */
export function groundNormal(x: number, z: number): [number, number, number] {
  return normalAt(x, z)
}

/** Clearance check used by the renderer to settle the chassis onto the ground. */
export function chassisHeight(meanContact: number): number {
  return meanContact + WHEEL_R + CLEARANCE
}
