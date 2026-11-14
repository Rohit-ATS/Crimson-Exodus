/**
 * layers.ts — Raster layers for the 2.4 km traverse map.
 *
 * ===========================================================================
 *  Every layer here is computed from the SYNTHETIC height field in
 *  mission/terrain.ts. None of it is resampled NASA data. It is presented as a
 *  traverse-planning instrument because that is what it does in the game, and
 *  it is labelled SYNTHETIC everywhere it appears, because the best global
 *  NASA basemap this app can load covers this entire traverse in about seven
 *  pixels. The regional map shows that honestly, side by side.
 *
 *  The layer CONCEPTS are real, and each names the NASA instrument that
 *  produces the equivalent product for a real traverse plan.
 * ===========================================================================
 */

import { EXTENT, heightAt, roughnessAt, slopeDeg } from '../../mission/terrain'
import { hazardAt } from '../../sim/hazard'
import type { WeatherEvent } from '../../sim/weather'

export type LayerId = 'relief' | 'elevation' | 'slope' | 'thermal' | 'hazard'

export interface LayerMeta {
  id: LayerId
  name: string
  /** The real instrument that produces this kind of product. */
  analogue: string
  /** What it tells a traverse planner. */
  reads: string
  /** What it cannot tell them. */
  limit: string
}

export const LAYERS: LayerMeta[] = [
  {
    id: 'relief',
    name: 'Shaded relief',
    analogue: 'HiRISE / CTX orbital imagery (MRO)',
    reads: 'Landform shape, scarps, the breach valley, the remnant butte, ripple fields. Lit from the real solar azimuth and elevation at Jezero for the hour you have chosen to step out \u2014 so shadows on the map are the shadows Jack will walk into.',
    limit: 'Shading is not slope. A face in shadow can be gentle and a brightly lit one can be a cliff. Read the slope layer before committing a route.',
  },
  {
    id: 'elevation',
    name: 'Elevation',
    analogue: 'MOLA gridded topography (MGS) / HiRISE stereo DTM',
    reads: 'Height above the lander pad, with 5 m contours. Drives the elevation profile and the climb cost of every route.',
    limit: 'MOLA, the global product this is analogous to, is 463 m per pixel. One of its pixels is wider than this entire map. Treat absolute heights as regional context only.',
  },
  {
    id: 'slope',
    name: 'Slope',
    analogue: 'Derived from a stereo DTM',
    reads: 'Local ground angle. The single most useful planning layer: slope sets the metabolic cost, the walking speed and the fall risk.',
    limit: 'Computed over a 5 m baseline. A 3 m boulder or a 1 m scarp lip is invisible at this baseline and will still stop a crew member.',
  },
  {
    id: 'thermal',
    name: 'Thermal inertia (proxy)',
    analogue: 'THEMIS thermal infrared (Mars Odyssey)',
    reads: 'High values mean exposed, consolidated bedrock: firm footing and good outcrop. Low values mean dust and loose sand: slow, soft and poor exposure.',
    limit: 'THEMIS is ~100 m per pixel. This is a PROXY computed from the synthetic surface, not a radiometric measurement, and it says nothing about composition.',
  },
  {
    id: 'hazard',
    name: 'Hazard cue',
    analogue: 'No NASA product. Composite planning cue.',
    reads: 'Slope, roughness, exposure to the dust front bearing, and distance from the lander, combined. Updates live with the weather.',
    limit: 'A PLANNING CUE, never a safety certification. Nothing at orbital resolution can certify that a human can safely place a boot on a square metre of Mars.',
  },
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function ramp(stops: Array<[number, [number, number, number]]>, t: number): [number, number, number] {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1]
      const [p1, c1] = stops[i]
      const f = (t - p0) / (p1 - p0)
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)]
    }
  }
  return stops[stops.length - 1][1]
}

const ELEV_RAMP: Array<[number, [number, number, number]]> = [
  [0.0, [18, 32, 58]],
  [0.18, [28, 84, 96]],
  [0.36, [52, 132, 96]],
  [0.54, [168, 160, 78]],
  [0.72, [198, 112, 56]],
  [0.88, [214, 160, 130]],
  [1.0, [248, 240, 235]],
]

const SLOPE_RAMP: Array<[number, [number, number, number]]> = [
  [0.0, [26, 54, 46]],
  [0.25, [60, 170, 120]],   // < 8 deg, easy
  [0.45, [214, 196, 90]],   // 10-15, noticeable
  [0.62, [230, 140, 56]],   // 15-22, hard work
  [0.8, [220, 70, 50]],     // 22-30, slow and risky
  [1.0, [150, 24, 90]],     // > 30, do not plan a walk here
]

const THERMAL_RAMP: Array<[number, [number, number, number]]> = [
  [0.0, [34, 20, 54]],
  [0.3, [78, 36, 110]],
  [0.55, [186, 66, 92]],
  [0.78, [242, 148, 52]],
  [1.0, [255, 238, 176]],
]

const HAZARD_RAMP: Array<[number, [number, number, number]]> = [
  [0.0, [16, 28, 36]],
  [0.25, [26, 108, 120]],
  [0.45, [120, 176, 92]],
  [0.62, [238, 206, 86]],
  [0.8, [240, 124, 48]],
  [1.0, [236, 42, 64]],
]

export interface LayerOptions {
  res: number
  /** Solar azimuth, degrees clockwise from north — the real current one. */
  sunAzDeg: number
  /** Solar elevation, degrees. */
  sunElDeg: number
  weather?: WeatherEvent
  stormFromDeg?: number
}

/** World position for a raster pixel. Row 0 is north. */
export function pixelToWorld(i: number, j: number, res: number): [number, number] {
  const x = -EXTENT + (2 * EXTENT * i) / (res - 1)
  const z = EXTENT - (2 * EXTENT * j) / (res - 1)
  return [x, z]
}

export function worldToPixel(x: number, z: number, res: number): [number, number] {
  return [((x + EXTENT) / (2 * EXTENT)) * (res - 1), ((EXTENT - z) / (2 * EXTENT)) * (res - 1)]
}

/** Build one layer as ImageData. */
export function buildLayer(layer: LayerId, o: LayerOptions): ImageData {
  const { res } = o
  const img = new ImageData(res, res)
  const d = img.data
  const spacing = (2 * EXTENT) / (res - 1)

  // Hillshade parameters from the real sun.
  const az = ((o.sunAzDeg + 180) % 360) * (Math.PI / 180) // illumination direction
  const alt = Math.max(4, o.sunElDeg) * (Math.PI / 180)
  const lx = Math.sin(az) * Math.cos(alt)
  const ly = Math.cos(az) * Math.cos(alt)
  const lz = Math.sin(alt)

  // Height range for the elevation ramp.
  let hMin = Infinity, hMax = -Infinity
  const heights = new Float32Array(res * res)
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const [x, z] = pixelToWorld(i, j, res)
      const h = heightAt(x, z)
      heights[j * res + i] = h
      if (h < hMin) hMin = h
      if (h > hMax) hMax = h
    }
  }

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const idx = j * res + i
      const [x, z] = pixelToWorld(i, j, res)
      const h = heights[idx]

      // Gradient by central differences on the raster.
      const hL = heights[j * res + Math.max(0, i - 1)]
      const hR = heights[j * res + Math.min(res - 1, i + 1)]
      const hU = heights[Math.max(0, j - 1) * res + i]
      const hD = heights[Math.min(res - 1, j + 1) * res + i]
      const dzdx = (hR - hL) / (2 * spacing)
      const dzdy = (hU - hD) / (2 * spacing)
      const nLen = Math.hypot(dzdx, dzdy, 1)
      const shade = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / nLen)
      const slopeRad = Math.atan(Math.hypot(dzdx, dzdy))
      const slopeDegrees = (slopeRad * 180) / Math.PI

      let r = 0, g = 0, b = 0

      if (layer === 'relief') {
        // Mars-coloured hillshade with a little albedo variation.
        // Stretch the shading so metre-scale relief is legible on a small map.
        const sh = 0.1 + 1.25 * Math.pow(shade, 1.45)
        const dusty = 1 - Math.min(1, slopeDegrees / 26) * 0.55
        r = 205 * sh * (0.68 + 0.34 * dusty)
        g = 136 * sh * (0.66 + 0.36 * dusty)
        b = 96 * sh * (0.62 + 0.34 * dusty)
      } else if (layer === 'elevation') {
        const t = (h - hMin) / Math.max(1e-6, hMax - hMin)
        const c = ramp(ELEV_RAMP, t)
        const sh = 0.55 + 0.6 * shade
        r = c[0] * sh; g = c[1] * sh; b = c[2] * sh
        // 5 m contours
        const band = Math.abs(((h - hMin) % 5) - 2.5)
        if (band > 2.28) { r = r * 0.45 + 20; g = g * 0.45 + 20; b = b * 0.45 + 20 }
      } else if (layer === 'slope') {
        const t = Math.min(1, slopeDegrees / 34)
        const c = ramp(SLOPE_RAMP, t)
        const sh = 0.7 + 0.42 * shade
        r = c[0] * sh; g = c[1] * sh; b = c[2] * sh
      } else if (layer === 'thermal') {
        // Thermal inertia proxy: consolidated, swept, steep ground is "rocky"
        // (high TI); flat dusty lows and ripple fields are "mantled" (low TI).
        const rough = roughnessAt(x, z)
        const ti = Math.min(1, Math.max(0,
          0.18 + (slopeDegrees / 30) * 0.55 + (rough - 1) * 0.62 - Math.max(0, (hMax - h) / Math.max(1, hMax - hMin)) * 0.18,
        ))
        const c = ramp(THERMAL_RAMP, ti)
        const sh = 0.78 + 0.3 * shade
        r = c[0] * sh; g = c[1] * sh; b = c[2] * sh
      } else {
        const hz = o.weather
          ? hazardAt(x, z, o.weather, o.stormFromDeg ?? 225).score
          : Math.min(1, 0.34 * Math.min(1, Math.max(0, (slopeDegrees - 7) / 20)) + 0.2 * Math.min(1, (roughnessAt(x, z) - 1.05) / 0.6) + 0.18 * Math.min(1, Math.hypot(x, z) / 1100) * 0.25)
        const c = ramp(HAZARD_RAMP, hz)
        const sh = 0.72 + 0.4 * shade
        r = c[0] * sh; g = c[1] * sh; b = c[2] * sh
      }

      const p = idx * 4
      d[p] = Math.max(0, Math.min(255, r))
      d[p + 1] = Math.max(0, Math.min(255, g))
      d[p + 2] = Math.max(0, Math.min(255, b))
      d[p + 3] = 255
    }
  }
  return img
}

/** Equivalent slope value, used for the legend. */
export function slopeLegend(): Array<[string, string]> {
  return [
    ['< 8°', 'rgb(60,170,120)'],
    ['8–15°', 'rgb(214,196,90)'],
    ['15–22°', 'rgb(230,140,56)'],
    ['22–30°', 'rgb(220,70,50)'],
    ['> 30°', 'rgb(150,24,90)'],
  ]
}

export { slopeDeg, roughnessAt, heightAt }
