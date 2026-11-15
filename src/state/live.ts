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

export const live = {
  jack: {
    x: 0, z: 34, y: 0, heading: Math.PI, speedMs: 0, stride: 0, moving: 0, working: 0,
    tool: 'none',
  } as LiveJack,
  /** Camera look direction, radians, 0 = +z. Controlled with the mouse or Q/E. */
  camYaw: 0,
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
}

export function resetLive() {
  live.jack = {
    x: 0, z: 34, y: 0, heading: Math.PI, speedMs: 0,
    stride: 0, moving: 0, working: 0, tool: 'none',
  }
  live.camYaw = 0
  live.camPitch = 0.26
  live.camDist = 9
  live.dustVisual = 0
  live.lightVisual = 1
  live.firstPerson = false
}
