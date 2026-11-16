import { useEffect, useMemo, useRef, useState } from 'react'
import { EXTENT, heightAt, roughnessAt, slopeDeg } from '../../mission/terrain'
import { CACHES, LANDER, ROUTES, SHELTERS, STATIONS } from '../../mission/site'
import { samplePath } from '../../mission/path'
import { buildLayer, worldToPixel, type LayerId } from './layers'
import type { WeatherEvent } from '../../sim/weather'

export interface LocalMapProps {
  layer: LayerId
  routeId: string
  /** Routes to draw faintly for comparison. */
  showAllRoutes?: boolean
  jack?: { x: number; z: number; heading: number } | null
  jack2?: { x: number; z: number; heading: number; label?: string } | null
  weather?: WeatherEvent
  stormFromDeg?: number
  sunAzDeg: number
  sunElDeg: number
  /** Compact mode drops the grid, scale bar and labels. */
  compact?: boolean
  /** Pixel size of the square canvas. */
  size?: number
  onHover?: (info: { x: number; z: number; h: number; slope: number; rough: number } | null) => void
  visitedStations?: Record<string, boolean>
  cachesUsed?: string[]
  flag?: { x: number; z: number; code: string } | null
}

const RES = 420

export default function LocalMap(props: LocalMapProps) {
  const {
    layer, routeId, showAllRoutes, jack, jack2, weather, stormFromDeg,
    sunAzDeg, sunElDeg, compact, size = 520, onHover, visitedStations, flag, cachesUsed,
  } = props

  const canvas = useRef<HTMLCanvasElement>(null)
  const [raster, setRaster] = useState<ImageData | null>(null)
  const [hover, setHover] = useState<[number, number] | null>(null)

  // Quantise the sun so the raster is not rebuilt every frame.
  const sunKey = `${Math.round(sunAzDeg / 4)}:${Math.round(sunElDeg / 4)}`
  const hazKey = layer === 'hazard'
    ? `${weather?.kind}:${(weather?.tau ?? 0).toFixed(1)}:${Math.round((stormFromDeg ?? 0) / 20)}`
    : ''

  useEffect(() => {
    let alive = true
    // Build off the critical path so the UI does not jank on a layer switch.
    const id = window.setTimeout(() => {
      const img = buildLayer(layer, {
        res: RES,
        sunAzDeg,
        sunElDeg,
        weather,
        stormFromDeg,
      })
      if (alive) setRaster(img)
    }, 0)
    return () => { alive = false; window.clearTimeout(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, sunKey, hazKey])

  const paths = useMemo(
    () => Object.fromEntries(ROUTES.map((r) => [r.id, samplePath(r.waypoints, 14)])),
    [],
  )

  useEffect(() => {
    const cv = canvas.current
    if (!cv || !raster) return
    const ctx = cv.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = size * dpr
    cv.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = true

    // Blit the raster scaled to the canvas.
    const off = document.createElement('canvas')
    off.width = RES; off.height = RES
    off.getContext('2d')!.putImageData(raster, 0, 0)
    ctx.drawImage(off, 0, 0, size, size)

    const S = size / (2 * EXTENT) // pixels per metre
    const W = (x: number, z: number): [number, number] => [
      (x + EXTENT) * S,
      (EXTENT - z) * S,
    ]

    // --- Graticule -------------------------------------------------------
    if (!compact) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)'
      ctx.lineWidth = 1
      ctx.font = '9px Share Tech Mono, monospace'
      ctx.fillStyle = 'rgba(210,230,245,0.42)'
      for (let m = -1000; m <= 1000; m += 500) {
        const [px] = W(m, 0)
        const [, py] = W(0, m)
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, size); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(size, py); ctx.stroke()
        if (m !== 0) {
          ctx.fillText(`${m > 0 ? '+' : ''}${m}`, px + 3, 11)
          ctx.fillText(`${m > 0 ? '+' : ''}${m}`, 3, py - 3)
        }
      }
    }

    // --- Other routes, faint --------------------------------------------
    if (showAllRoutes) {
      for (const r of ROUTES) {
        if (r.id === routeId) continue
        drawPath(ctx, paths[r.id], W, 'rgba(180,200,215,0.28)', 1.6, [5, 6])
      }
    }

    // --- Shelters ---------------------------------------------------------
    for (const s of SHELTERS) {
      if (s.id === 'lander') continue
      const [px, py] = W(s.x, s.z)
      ctx.beginPath()
      ctx.arc(px, py, s.radius * S, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,90,168,0.11)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,90,168,0.6)'
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.setLineDash([])
      if (!compact) {
        ctx.fillStyle = '#ff8ec4'
        ctx.font = '9px Share Tech Mono, monospace'
        ctx.fillText(s.name.toUpperCase(), px + s.radius * S + 4, py + 3)
      }
    }

    // --- Consumables caches ---------------------------------------------
    for (const c of CACHES) {
      const used = cachesUsed?.includes(c.id)
      const [px, py] = W(c.x, c.z)
      ctx.beginPath()
      ctx.arc(px, py, c.radius * S, 0, Math.PI * 2)
      ctx.strokeStyle = used ? 'rgba(109,130,146,0.6)' : 'rgba(255,178,74,0.85)'
      ctx.setLineDash([2, 2])
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.setLineDash([])
      // A crate glyph.
      const r = compact ? 3.5 : 5.5
      ctx.fillStyle = used ? '#6d8292' : '#ffb24a'
      ctx.fillRect(px - r, py - r, r * 2, r * 2)
      ctx.strokeStyle = '#04070c'
      ctx.lineWidth = 1.3
      ctx.strokeRect(px - r, py - r, r * 2, r * 2)
      if (!compact) {
        ctx.font = 'bold 9px Share Tech Mono, monospace'
        ctx.fillStyle = used ? '#6d8292' : '#ffd9a8'
        ctx.fillText(used ? `${c.name.toUpperCase()} (EMPTY)` : c.name.toUpperCase(), px + 9, py + 3)
      }
    }

    // --- The selected route ----------------------------------------------
    drawPath(ctx, paths[routeId], W, 'rgba(0,0,0,0.55)', compact ? 3.4 : 5)
    drawPath(ctx, paths[routeId], W, '#4fe8ff', compact ? 1.8 : 2.6)

    // --- Stations ---------------------------------------------------------
    for (const st of STATIONS) {
      const [px, py] = W(st.x, st.z)
      const onRoute = ROUTES.find((r) => r.id === routeId)!.stations.includes(st.id)
      const done = visitedStations?.[st.id]
      const col = done ? '#7dffb2' : onRoute ? '#ffb24a' : '#6d8292'
      ctx.beginPath()
      ctx.arc(px, py, st.radius * S, 0, Math.PI * 2)
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.globalAlpha = 1

      // Diamond pin
      const r = compact ? 4 : 6.5
      ctx.beginPath()
      ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py)
      ctx.closePath()
      ctx.fillStyle = col
      ctx.fill()
      ctx.strokeStyle = '#04070c'
      ctx.lineWidth = 1.4
      ctx.stroke()

      if (!compact) {
        ctx.font = 'bold 10px Share Tech Mono, monospace'
        ctx.fillStyle = '#04070c'
        ctx.fillText(st.codename, px + 11, py - 3)
        ctx.fillStyle = col
        ctx.fillText(st.codename, px + 10, py - 4)
        ctx.font = '9px Share Tech Mono, monospace'
        ctx.fillStyle = 'rgba(220,235,245,0.75)'
        ctx.fillText(st.name, px + 10, py + 8)
      }
    }

    // --- Lander -----------------------------------------------------------
    {
      const [px, py] = W(LANDER[0], LANDER[1])
      ctx.beginPath()
      ctx.arc(px, py, compact ? 5 : 8, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#e2603a'
      ctx.lineWidth = 2.2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(px, py, compact ? 9 : 14, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(226,96,58,0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
      if (!compact) {
        ctx.font = 'bold 10px Share Tech Mono, monospace'
        ctx.fillStyle = '#ffd3c2'
        ctx.fillText('LANDER', px + 13, py + 4)
      }
    }

    // --- Flag -------------------------------------------------------------
    if (flag) {
      const [px, py] = W(flag.x, flag.z)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 11); ctx.stroke()
      ctx.fillStyle = '#ffb24a'
      ctx.fillRect(px, py - 11, 8, 5.5)
    }

    // --- Dust front bearing ----------------------------------------------
    if (weather && weather.tau > 0.1 && stormFromDeg !== undefined && !compact) {
      const a = (stormFromDeg * Math.PI) / 180
      const cx = size / 2, cy = size / 2
      const L = size * 0.46
      ctx.save()
      ctx.strokeStyle = 'rgba(255,90,80,0.55)'
      ctx.setLineDash([8, 5])
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.sin(a) * L, cy - Math.cos(a) * L)
      ctx.lineTo(cx - Math.sin(a) * L * 0.4, cy + Math.cos(a) * L * 0.4)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,120,100,0.9)'
      ctx.font = 'bold 10px Share Tech Mono, monospace'
      ctx.fillText(
        `DUST FRONT ${Math.round(stormFromDeg)}°`,
        cx + Math.sin(a) * L - 48,
        cy - Math.cos(a) * L + (Math.cos(a) > 0 ? 16 : -8),
      )
      ctx.restore()
    }

    // --- Jack -------------------------------------------------------------
    if (jack) {
      const [px, py] = W(jack.x, jack.z)
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(-jack.heading)
      ctx.beginPath()
      ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7)
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#04070c'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.restore()
      // Range ring back to the lander
      ctx.beginPath()
      ctx.setLineDash([2, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1
      ctx.moveTo(px, py)
      const [lx, ly] = W(0, 0)
      ctx.lineTo(lx, ly)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // --- Jack 2 (EV-2 or crew member) -------------------------------------
    if (jack2) {
      const [px2, py2] = W(jack2.x, jack2.z)
      ctx.save()
      ctx.translate(px2, py2)
      ctx.rotate(-jack2.heading)
      ctx.beginPath()
      ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7)
      ctx.closePath()
      ctx.fillStyle = '#4fe8ff'
      ctx.fill()
      ctx.strokeStyle = '#04070c'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.restore()
      ctx.fillStyle = '#4fe8ff'
      ctx.font = 'bold 10px Share Tech Mono, monospace'
      ctx.fillText(jack2.label ?? 'EV-2', px2 + 8, py2 - 4)

      // Tether line between EV-1 and EV-2
      if (jack) {
        const [px1, py1] = W(jack.x, jack.z)
        ctx.beginPath()
        ctx.setLineDash([2, 4])
        ctx.strokeStyle = 'rgba(79,232,255,0.45)'
        ctx.lineWidth = 1.2
        ctx.moveTo(px1, py1)
        ctx.lineTo(px2, py2)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // --- Scale bar and north arrow ---------------------------------------
    if (!compact) {
      const barM = 500
      const barPx = barM * S
      const bx = size - barPx - 18, by = size - 22
      ctx.fillStyle = 'rgba(4,7,12,0.7)'
      ctx.fillRect(bx - 8, by - 15, barPx + 16, 26)
      ctx.strokeStyle = '#d3e6f2'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(bx + barPx, by - 5); ctx.lineTo(bx + barPx, by + 5); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(bx + barPx / 2, by - 3); ctx.lineTo(bx + barPx / 2, by + 3); ctx.stroke()
      ctx.fillStyle = '#d3e6f2'
      ctx.font = '10px Share Tech Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('500 m', bx + barPx / 2, by - 6)
      ctx.textAlign = 'left'

      // North arrow
      ctx.save()
      ctx.translate(26, 32)
      ctx.fillStyle = 'rgba(4,7,12,0.7)'
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(79,232,255,0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -12); ctx.lineTo(5, 7); ctx.lineTo(0, 3); ctx.lineTo(-5, 7)
      ctx.closePath()
      ctx.fillStyle = '#4fe8ff'
      ctx.fill()
      ctx.fillStyle = '#d3e6f2'
      ctx.font = 'bold 9px Share Tech Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('N', 0, -14)
      ctx.textAlign = 'left'
      ctx.restore()
    }

    // --- Hover crosshair --------------------------------------------------
    if (hover && !compact) {
      const [hx, hy] = hover
      ctx.strokeStyle = 'rgba(79,232,255,0.65)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, size); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(size, hy); ctx.stroke()
    }
  }, [raster, routeId, showAllRoutes, jack, weather, stormFromDeg, compact, size, paths, hover, visitedStations, flag, cachesUsed])

  return (
    <canvas
      ref={canvas}
      style={{
        width: size,
        height: size,
        display: 'block',
        background: '#0a0d13',
        cursor: compact ? 'default' : 'crosshair',
      }}
      onMouseMove={(e) => {
        if (compact || !onHover) return
        const r = e.currentTarget.getBoundingClientRect()
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        setHover([px, py])
        const x = (px / size) * 2 * EXTENT - EXTENT
        const z = EXTENT - (py / size) * 2 * EXTENT
        onHover({ x, z, h: heightAt(x, z), slope: slopeDeg(x, z), rough: roughnessAt(x, z) })
      }}
      onMouseLeave={() => { setHover(null); onHover?.(null) }}
    />
  )
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; z: number }>,
  W: (x: number, z: number) => [number, number],
  color: string,
  width: number,
  dash?: number[],
) {
  if (!pts?.length) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (dash) ctx.setLineDash(dash)
  ctx.beginPath()
  pts.forEach((p, i) => {
    const [px, py] = W(p.x, p.z)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.stroke()
  ctx.restore()
}

export { worldToPixel }
