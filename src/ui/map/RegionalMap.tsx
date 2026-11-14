import { useEffect, useRef, useState } from 'react'
import { SITE } from '../../mission/site'

/**
 * RegionalMap — real NASA orbital data.
 *
 * Tiles come live from NASA Mars Trek's WMTS service, which publishes global
 * Mars basemaps as a standard tile pyramid. Three products are offered, all
 * genuine instrument data:
 *
 *   - Viking MDIM 2.1 colour mosaic, 232 m/pixel (Viking Orbiters 1 and 2)
 *   - MOLA colour shaded relief, 463 m/pixel (Mars Global Surveyor)
 *   - MOLA / HRSC blended colour shaded relief, 200 m/pixel (MGS + Mars Express)
 *
 * Service: https://trek.nasa.gov/mars/
 *
 * THE POINT OF THIS PANEL. The deepest zoom these global products serve is about
 * 326 m per pixel. The entire 2.4 km traverse area is therefore roughly SEVEN
 * PIXELS across on the best basemap the app can fetch. The panel draws that
 * footprint at its true size so the player can see it. This is the honest
 * version of "we used NASA data": the orbital products give you the crater, the
 * delta, the inlet and outlet valleys and the regional elevation, and they
 * cannot tell you where to put your feet.
 *
 * If the network is slow or blocked, the panel falls back to a drawn schematic
 * of Jezero and says so rather than showing a blank frame.
 */

const Z = 7
const COLS = 2 ** (Z + 1)
const ROWS = 2 ** Z
const TILE = 256
/** Degrees of longitude per tile at this zoom. */
const DEG_PER_TILE = 360 / COLS
/** Mars equatorial radius, km. */
const MARS_R_KM = 3396.19
const KM_PER_DEG = (2 * Math.PI * MARS_R_KM) / 360 // ~59.3 km

export const TREK_PRODUCTS = [
  {
    id: 'viking',
    product: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
    name: 'Viking MDIM 2.1 colour mosaic',
    instrument: 'Viking Orbiter 1 & 2 cameras',
    resolution: '232 m/pixel native',
    date: '1976–1980 imaging, MDIM 2.1 released 2001',
    reads: 'Albedo and landform context. The dark floor of Jezero, the bright dust mantle, the fan at the mouth of Neretva Vallis.',
  },
  {
    id: 'mola',
    product: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
    name: 'MOLA colour shaded relief',
    instrument: 'Mars Orbiter Laser Altimeter',
    resolution: '463 m/pixel gridded',
    date: '1999–2001',
    reads: 'Elevation, colour-coded and hillshaded. The crater rim, the floor at about −2600 m, the inlet and outlet breaches in the rim.',
  },
  {
    id: 'blend',
    product: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
    name: 'MOLA / HRSC blended relief',
    instrument: 'MOLA + Mars Express High Resolution Stereo Camera',
    resolution: '200 m/pixel',
    date: 'MGS 1999–2001 + Mars Express 2004–present',
    reads: 'The sharpest global topographic shading available here. Best for reading the delta front and the rim structure.',
  },
] as const

export type TrekProductId = (typeof TREK_PRODUCTS)[number]['id']

function tileUrl(product: string, x: number, y: number) {
  return `https://trek.nasa.gov/tiles/Mars/EQ/${product}/1.0.0//default/default028mm/${Z}/${y}/${x}.jpg`
}

export type LoadState = 'loading' | 'ok' | 'partial' | 'offline'

export default function RegionalMap({
  productId, size = 420, onState,
}: { productId: TrekProductId; size?: number; onState?: (s: LoadState) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [spanKm, setSpanKm] = useState(0)

  useEffect(() => {
    const entry = TREK_PRODUCTS.find((p) => p.id === productId)!
    let cancelled = false
    setState('loading')
    onState?.('loading')

    // Centre tile for Jezero.
    const fx = ((SITE.eastLonDeg + 180) / 360) * COLS
    const fy = ((90 - SITE.latDeg) / 180) * ROWS
    const cx = Math.floor(fx)
    const cy = Math.floor(fy)

    // A 3x3 block gives about 250 km across: Jezero plus its surroundings.
    const N = 1
    const tiles: Array<{ x: number; y: number; dx: number; dy: number }> = []
    for (let dy = -N; dy <= N; dy++) {
      for (let dx = -N; dx <= N; dx++) {
        tiles.push({ x: (cx + dx + COLS) % COLS, y: Math.max(0, Math.min(ROWS - 1, cy + dy)), dx, dy })
      }
    }

    const blockTiles = 2 * N + 1
    const spanDeg = blockTiles * DEG_PER_TILE
    const km = spanDeg * KM_PER_DEG
    setSpanKm(km)

    let loaded = 0
    let failed = 0
    const images = new Map<string, HTMLImageElement>()

    const draw = () => {
      const cv = canvas.current
      if (!cv) return
      const ctx = cv.getContext('2d')!
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = size * dpr
      cv.height = size * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#0a0d13'
      ctx.fillRect(0, 0, size, size)

      const px = size / (blockTiles * TILE)
      // Offset so the Jezero landing site lands exactly at the canvas centre.
      const subX = fx - cx
      const subY = fy - cy
      const originX = size / 2 - (N + subX) * TILE * px
      const originY = size / 2 - (N + subY) * TILE * px

      if (loaded > 0) {
        for (const t of tiles) {
          const img = images.get(`${t.x}:${t.y}`)
          if (!img) continue
          ctx.drawImage(
            img,
            originX + (t.dx + N) * TILE * px,
            originY + (t.dy + N) * TILE * px,
            TILE * px,
            TILE * px,
          )
        }
      } else {
        drawFallback(ctx, size)
      }

      // --- Overlays ------------------------------------------------------
      const kmToPx = size / km
      const cxp = size / 2
      const cyp = size / 2

      // Jezero crater outline, 45 km across.
      ctx.strokeStyle = 'rgba(79,232,255,0.8)'
      ctx.lineWidth = 1.6
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.arc(cxp - 2 * kmToPx, cyp - 1 * kmToPx, (SITE.craterDiameterKm / 2) * kmToPx, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(79,232,255,0.85)'
      ctx.font = '10px Share Tech Mono, monospace'
      ctx.fillText('JEZERO CRATER — 45 km', cxp - 2 * kmToPx - 52, cyp - 1 * kmToPx - (SITE.craterDiameterKm / 2) * kmToPx - 6)

      // Landing site.
      ctx.strokeStyle = '#e2603a'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(cxp - 11, cyp); ctx.lineTo(cxp - 4, cyp); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cxp + 4, cyp); ctx.lineTo(cxp + 11, cyp); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cxp, cyp - 11); ctx.lineTo(cxp, cyp - 4); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cxp, cyp + 4); ctx.lineTo(cxp, cyp + 11); ctx.stroke()

      // THE POINT: the traverse area at its true size.
      const areaPx = Math.max(1.2, (SITE.areaM / 1000) * kmToPx)
      ctx.strokeStyle = '#ffb24a'
      ctx.lineWidth = 1.4
      ctx.strokeRect(cxp - areaPx / 2, cyp - areaPx / 2, areaPx, areaPx)
      ctx.strokeStyle = 'rgba(255,178,74,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cxp + areaPx / 2, cyp - areaPx / 2)
      ctx.lineTo(cxp + 74, cyp - 46)
      ctx.lineTo(cxp + 88, cyp - 46)
      ctx.stroke()
      ctx.fillStyle = '#ffb24a'
      ctx.font = 'bold 10px Share Tech Mono, monospace'
      ctx.fillText('TRAVERSE AREA', cxp + 76, cyp - 50)
      ctx.font = '9px Share Tech Mono, monospace'
      ctx.fillStyle = 'rgba(255,210,150,0.9)'
      ctx.fillText(`2.4 km — ${areaPx.toFixed(1)} px here`, cxp + 76, cyp - 38)

      // Scale bar.
      const barKm = 50
      const barPx = barKm * kmToPx
      const bx = 16, by = size - 18
      ctx.fillStyle = 'rgba(4,7,12,0.72)'
      ctx.fillRect(bx - 7, by - 15, barPx + 14, 25)
      ctx.strokeStyle = '#d3e6f2'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(bx + barPx, by - 4); ctx.lineTo(bx + barPx, by + 4); ctx.stroke()
      ctx.fillStyle = '#d3e6f2'
      ctx.font = '10px Share Tech Mono, monospace'
      ctx.fillText(`${barKm} km`, bx + barPx + 6, by + 4)

      // Attribution, always on the image.
      ctx.fillStyle = 'rgba(4,7,12,0.72)'
      ctx.fillRect(0, 0, size, 17)
      ctx.fillStyle = 'rgba(200,225,240,0.9)'
      ctx.font = '9.5px Share Tech Mono, monospace'
      ctx.fillText(
        loaded > 0
          ? `NASA MARS TREK · ${entry.name.toUpperCase()} · ${entry.resolution}`
          : 'OFFLINE — SCHEMATIC, NOT NASA IMAGERY',
        7, 12,
      )
    }

    const timeout = window.setTimeout(() => {
      if (cancelled) return
      if (loaded === 0) { setState('offline'); onState?.('offline'); draw() }
    }, 9000)

    for (const t of tiles) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (cancelled) return
        images.set(`${t.x}:${t.y}`, img)
        loaded++
        draw()
        if (loaded + failed === tiles.length) {
          const s: LoadState = failed === 0 ? 'ok' : 'partial'
          setState(s); onState?.(s)
        }
      }
      img.onerror = () => {
        if (cancelled) return
        failed++
        if (loaded + failed === tiles.length) {
          const s: LoadState = loaded === 0 ? 'offline' : 'partial'
          setState(s); onState?.(s)
          draw()
        }
      }
      img.src = tileUrl(entry.product, t.x, t.y)
    }

    draw()

    return () => { cancelled = true; window.clearTimeout(timeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, size])

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <canvas ref={canvas} style={{ width: size, height: size, display: 'block', background: '#0a0d13' }} />
      {state === 'loading' && (
        <div
          className="screen center mono"
          style={{ fontSize: 11, letterSpacing: '0.2em', color: 'var(--cyan)', background: 'rgba(4,7,12,0.6)' }}
        >
          FETCHING NASA MARS TREK TILES&hellip;
        </div>
      )}
      <div
        className="src"
        style={{ position: 'absolute', left: 0, right: 0, bottom: -18, textAlign: 'center' }}
      >
        {spanKm > 0 && `field of view ${spanKm.toFixed(0)} km`}
      </div>
    </div>
  )
}

/** Drawn schematic used only when the tile service cannot be reached. */
function drawFallback(ctx: CanvasRenderingContext2D, size: number) {
  const g = ctx.createLinearGradient(0, 0, size, size)
  g.addColorStop(0, '#2a1810')
  g.addColorStop(1, '#12100e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i < size; i += 24) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,178,74,0.35)'
  ctx.font = '12px Share Tech Mono, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('NASA MARS TREK UNREACHABLE', size / 2, size / 2 - 8)
  ctx.fillText('showing a schematic, not imagery', size / 2, size / 2 + 12)
  ctx.textAlign = 'left'
}
