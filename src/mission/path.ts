/**
 * path.ts — Route geometry. Turns a waypoint list into something you can walk,
 * cost, and compute a return estimate against.
 */

import { gradeAlong, heightAt, roughnessAt, slopeDeg, walkSpeed } from './terrain'

export type Pt = [number, number]

export interface SampledPoint {
  x: number
  z: number
  /** Cumulative distance along the path, metres (3D, so climbs count). */
  s: number
  /** Height above the pad datum, metres. */
  h: number
  /** Signed grade in the direction of travel. */
  grade: number
  slopeDeg: number
  roughness: number
  /** Achievable walking speed here, m/s. */
  speedMs: number
}

/** Resample a waypoint polyline at a fixed spacing and attach terrain data. */
export function samplePath(waypoints: Pt[], spacing = 8): SampledPoint[] {
  const out: SampledPoint[] = []
  let s = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [x0, z0] = waypoints[i]
    const [x1, z1] = waypoints[i + 1]
    const segLen = Math.hypot(x1 - x0, z1 - z0)
    const steps = Math.max(1, Math.round(segLen / spacing))
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      const x = x0 + (x1 - x0) * t
      const z = z0 + (z1 - z0) * t
      const dirX = x1 - x0
      const dirZ = z1 - z0
      const grade = gradeAlong(x, z, dirX, dirZ)
      const rough = roughnessAt(x, z)
      const h = heightAt(x, z)
      if (out.length > 0) {
        const prev = out[out.length - 1]
        const dh = h - prev.h
        s += Math.hypot(x - prev.x, z - prev.z, dh)
      }
      out.push({
        x, z, s, h, grade,
        slopeDeg: slopeDeg(x, z),
        roughness: rough,
        speedMs: walkSpeed(0.92, grade, rough),
      })
    }
  }
  // Close the path on its final waypoint.
  const [lx, lz] = waypoints[waypoints.length - 1]
  const lh = heightAt(lx, lz)
  if (out.length) {
    const prev = out[out.length - 1]
    s += Math.hypot(lx - prev.x, lz - prev.z, lh - prev.h)
  }
  out.push({
    x: lx, z: lz, s, h: lh,
    grade: 0,
    slopeDeg: slopeDeg(lx, lz),
    roughness: roughnessAt(lx, lz),
    speedMs: walkSpeed(0.92, 0, roughnessAt(lx, lz)),
  })
  return out
}

export interface PathStats {
  /** Total 3D path length, metres. */
  lengthM: number
  /** Planimetric length, metres. */
  groundM: number
  /** Total metres climbed. */
  ascentM: number
  /** Total metres descended. */
  descentM: number
  /** Steepest grade along the path, as a percentage. */
  maxGradePct: number
  /** Mean achievable speed, m/s. */
  meanSpeedMs: number
  /** Pure walking time, minutes, integrating the local speed. */
  walkMinutes: number
  /** Furthest point from the lander, metres. */
  maxRangeM: number
}

export function pathStats(pts: SampledPoint[]): PathStats {
  let ascent = 0, descent = 0, maxGrade = 0, time = 0, ground = 0, maxRange = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const dh = b.h - a.h
    const dGround = Math.hypot(b.x - a.x, b.z - a.z)
    const d3 = Math.hypot(dGround, dh)
    ground += dGround
    if (dh > 0) ascent += dh
    else descent += -dh
    maxGrade = Math.max(maxGrade, Math.abs(a.grade))
    time += d3 / Math.max(0.1, a.speedMs)
    maxRange = Math.max(maxRange, Math.hypot(b.x, b.z))
  }
  const lengthM = pts[pts.length - 1].s
  return {
    lengthM,
    groundM: ground,
    ascentM: ascent,
    descentM: descent,
    maxGradePct: maxGrade * 100,
    meanSpeedMs: lengthM / Math.max(1, time),
    walkMinutes: time / 60,
    maxRangeM: maxRange,
  }
}

/** Index of the sampled point nearest to (x, z). */
export function nearestIndex(pts: SampledPoint[], x: number, z: number): number {
  let best = 0, bestD = Infinity
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

/**
 * Remaining distance and time to walk the route from `index` back to the lander
 * the way the route actually goes. The lander is the final waypoint, so this is
 * simply the tail of the path.
 */
export function remainingToHome(pts: SampledPoint[], index: number): { distanceM: number; minutes: number } {
  let d = 0, t = 0
  for (let i = index; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const seg = Math.hypot(b.x - a.x, b.z - a.z, b.h - a.h)
    d += seg
    t += seg / Math.max(0.1, a.speedMs)
  }
  return { distanceM: d, minutes: t / 60 }
}

/**
 * The direct abort path: walk straight at the lander from wherever you are.
 * Shorter on the map, but the terrain decides whether it is actually faster.
 */
export function directToHome(x: number, z: number): { distanceM: number; minutes: number; meanSpeedMs: number } {
  const steps = 48
  let d = 0, t = 0
  let px = x, pz = z, ph = heightAt(x, z)
  for (let i = 1; i <= steps; i++) {
    const f = i / steps
    const nx = x * (1 - f)
    const nz = z * (1 - f)
    const nh = heightAt(nx, nz)
    const seg = Math.hypot(nx - px, nz - pz, nh - ph)
    const grade = seg > 0 ? (nh - ph) / Math.max(0.01, Math.hypot(nx - px, nz - pz)) : 0
    const sp = walkSpeed(0.92, grade, roughnessAt(px, pz))
    d += seg
    t += seg / Math.max(0.1, sp)
    px = nx; pz = nz; ph = nh
  }
  return { distanceM: d, minutes: t / 60, meanSpeedMs: d / Math.max(1, t) }
}
