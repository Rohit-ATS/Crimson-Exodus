/**
 * live.ts — High-frequency mutable state.
 *
 * Jack's transform changes every frame. Pushing that through React would re-render
 * the HUD sixty times a second for no benefit, so it lives here as a plain mutable
 * object that the 3D scene reads directly and the sim loop writes. Anything the
 * UI needs to *display* is mirrored into the Zustand store at a lower rate.
 */

export interface LiveJack {
  x: number
  z: number
  /** Terrain height under the feet. */
  y: number
  /** Facing, radians, 0 = +z (north). */
  heading: number
  /** Current ground speed, m/s. */
  speedMs: number
  /** Stride phase for the walk animation, radians. */
  stride: number
  /** 0-1 blend into the walk pose. */
  moving: number
  /** Set while a station interaction animation plays. */
  working: number
  /** Which tool is in Jack's hands, for the station work pose. */
  tool: Tool
}

/** Tools Jack carries on the backpack and uses at a station. */
export type Tool = 'none' | 'brush' | 'lens' | 'drill' | 'flag'

/** What MERV is doing right now, for the renderer and the HUD. */
export type RoverMode = 'park' | 'follow' | 'detour' | 'blocked' | 'lowpower'

/** What the mast is pointing at. */
export type MastIntent = 'jack' | 'station' | 'horizon' | 'storm' | 'sky'

/**
 * MERV's transform and suspension state.
 *
 * Same reasoning as `LiveJack`: six wheels each with their own ground contact
 * is forty-odd numbers changing every frame, and none of it belongs in React.
 * The HUD reads a summary from the mission store at a few hertz instead.
 */
export interface LiveRover {
  x: number
  z: number
  /** Chassis centre height, metres above the datum. */
  y: number
  /** Facing, radians, 0 = +z (north). */
  heading: number
  speedMs: number
  /** Front/rear steering angle, radians. */
  steer: number
  /** Accumulated wheel rotation, radians. Drives the tread animation. */
  spin: number
  /** Chassis attitude from the wheel contacts, radians. */
  pitch: number
  roll: number
  /**
   * Rocker-bogie joint angles, radians: one rocker and one bogie per side.
   * A real rocker-bogie has no springs — the geometry itself keeps all six
   * wheels loaded, and these two angles per side are what absorb the terrain.
   */
  rockerL: number
  rockerR: number
  bogieL: number
  bogieR: number
  /** Mast pan and tilt, radians. Pan is relative to the chassis. */
  mastYaw: number
  mastPitch: number
  mastIntent: MastIntent
  /** 0-1 state of charge. */
  battery: number
  /** 0-1 dust loading on the solar array. */
  arrayDust: number
  /** Instantaneous array output, watts. */
  arrayW: number
  mode: RoverMode
  /** Metres driven this EVA. */
  odometerM: number
  /** 0-1 blend, how hard the wheels are throwing dust. */
  plume: number
  /** 0-1, lit while the agent is speaking. Drives the status bar animation. */
  talking: number
  /** 0-1, lit while the microphone is open. */
  listening: number
  /** 0-1, lit while a reply is being composed. */
  thinking: number
}

const freshRover = (): LiveRover => ({
  // Parked just off the lander's port side at step-out.
  x: -2.6, z: 35.4, y: 0, heading: Math.PI, speedMs: 0, steer: 0, spin: 0,
  pitch: 0, roll: 0, rockerL: 0, rockerR: 0, bogieL: 0, bogieR: 0,
  mastYaw: 0, mastPitch: 0, mastIntent: 'jack',
  battery: 1, arrayDust: 0, arrayW: 0, mode: 'park', odometerM: 0, plume: 0,
  talking: 0, listening: 0, thinking: 0,
})

export const live = {
  jack: {
    x: 0, z: 34, y: 0, heading: Math.PI, speedMs: 0, stride: 0, moving: 0, working: 0,
    tool: 'none',
  } as LiveJack,
  /** Camera look direction, radians, 0 = +z. Controlled with the mouse or Q/E. */
  camYaw: 0,
  /**
   * Where auto-traverse wants the camera to look, or null while the player
   * steers. The simulation sets it; the render loop eases toward it every
   * frame, so the view swings round smoothly instead of in 20 Hz steps.
   */
  camYawGoal: null as number | null,
  /**
   * Fixed-step interpolation. The simulation advances in 1/20 s steps but the
   * screen refreshes at 60-144 Hz; drawing the raw positions would hold each
   * one for several frames and then jump, which reads as stutter. The sim loop
   * records where things were before the latest step and how far the clock has
   * run into the next one (`alpha`), and the renderer draws in between. Only
   * active while the fixed-step loop runs; co-op moves Jack every frame itself.
   */
  interp: {
    active: false,
    alpha: 1,
    jack: { x: 0, y: 0, z: 0, stride: 0, moving: 0 },
    rover: { x: 0, z: 0, heading: 0 },
  },
  camPitch: 0.26,
  camDist: 9,
  /** Set true while a modal panel has focus so movement keys are ignored. */
  inputLocked: false,
  /** Smoothed dust intensity for the renderer, 0-1. */
  dustVisual: 0,
  /** Smoothed light level for the renderer. */
  lightVisual: 1,
  /** First-person view toggle. */
  firstPerson: false,
  /** Set by the 3D scene so the UI can grab a frame for the photo log. */
  captureFrame: null as null | (() => string | undefined),
  rover: freshRover(),
}

export function resetLive() {
  live.jack = {
    x: 0, z: 34, y: 0, heading: Math.PI, speedMs: 0,
    stride: 0, moving: 0, working: 0, tool: 'none',
  }
  live.camYaw = 0
  live.camYawGoal = null
  live.camPitch = 0.26
  live.camDist = 9
  live.dustVisual = 0
  live.lightVisual = 1
  live.firstPerson = false
  live.rover = freshRover()
  snapshotInterp()
}

/** Shortest signed difference b - a between two angles, radians. */
export function angleDelta(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Record the current positions as the start of the next interpolation span. */
export function snapshotInterp(): void {
  const p = live.interp
  const j = live.jack
  const r = live.rover
  p.jack.x = j.x; p.jack.y = j.y; p.jack.z = j.z
  p.jack.stride = j.stride; p.jack.moving = j.moving
  p.rover.x = r.x; p.rover.z = r.z; p.rover.heading = r.heading
}

const jackOut = { x: 0, y: 0, z: 0, stride: 0, moving: 0 }
/** Jack's pose for drawing this frame, between the last two simulation steps. */
export function jackView(): { x: number; y: number; z: number; stride: number; moving: number } {
  const j = live.jack
  const p = live.interp
  if (!p.active) return j
  const t = p.alpha
  const a = p.jack
  jackOut.x = a.x + (j.x - a.x) * t
  jackOut.y = a.y + (j.y - a.y) * t
  jackOut.z = a.z + (j.z - a.z) * t
  jackOut.stride = a.stride + (j.stride - a.stride) * t
  jackOut.moving = a.moving + (j.moving - a.moving) * t
  return jackOut
}

const roverOut = { x: 0, z: 0, heading: 0 }
/** MERV's position and facing for drawing this frame. */
export function roverView(): { x: number; z: number; heading: number } {
  const r = live.rover
  const p = live.interp
  if (!p.active) return r
  const t = p.alpha
  const a = p.rover
  roverOut.x = a.x + (r.x - a.x) * t
  roverOut.z = a.z + (r.z - a.z) * t
  roverOut.heading = a.heading + angleDelta(a.heading, r.heading) * t
  return roverOut
}
