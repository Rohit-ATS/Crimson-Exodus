import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CRISM_CAR, REAL_FEATURES, TREK_JEZERO, crismPixel, elevAt, gridToLonLat, loadDtm,
  loadTraverse, lonLatToGrid, slopeDegAt, trekTileBounds, trekTileIndex, trekTileUrl,
  type Dtm, type TraverseData,
} from '../../data/realSite'
import { slopeLegend } from './layers'

export type RealBase = 'hirise' | 'ctx' | 'none'
export type RealOverlay = 'none' | 'shade' | 'elev' | 'slope' | 'crism'

export interface HoverInfo {
  lon: number
  lat: number
  elevM: number
  slopeDeg: number
}

export type TileState = 'loading' | 'ok' | 'partial' | 'offline'

interface Props {
  width: number
  base: RealBase
  overlay: RealOverlay
  overlayAlpha: number
  showTraverse: boolean
  route: Array<[number, number]>
  selected: string | null
  onSelect: (id: string | null) => void
  onAddPoint: (p: [number, number]) => void
  onHover: (h: HoverInfo | null) => void
  onDtm?: (d: Dtm) => void
  onTiles?: (s: TileState) => void
}

/** Slope class colour, matching the traverse map's legend. */
const SLOPE_CLASSES: Array<[number, [number, number, number]]> = slopeLegend().map(([, c], i) => {
  const m = c.match(/\d+/g)!.map(Number) as [number, number, number]
  return [[8, 15, 22, 30, Infinity][i], m]
})

function elevColour(t: number): [number, number, number] {
  // Low = deep teal, mid = sand, high = pale rust. Monotonic in lightness.
  const stops: Array<[number, [number, number, number]]> = [
    [0, [18, 52, 74]], [0.3, [40, 120, 128]], [0.55, [190, 170, 110]], [0.8, [214, 128, 72]], [1, [246, 226, 210]],
  ]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, a] = stops[i - 1], [t1, b] = stops[i]
      const f = (t - t0) / (t1 - t0)
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
    }
  }
  return stops[stops.length - 1][1]
}

function buildOverlay(d: Dtm, kind: RealOverlay): HTMLCanvasElement | null {
  if (kind === 'none' || kind === 'crism') return null
  const { width: W, height: H, minM, maxM } = d.meta
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(W, H)
  // Sun from the north-west at 40° elevation, the cartographic convention.
  const az = (315 * Math.PI) / 180, el = (40 * Math.PI) / 180
  const lx = Math.sin(az) * Math.cos(el), ly = Math.cos(az) * Math.cos(el), lz = Math.sin(el)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const z = d.z[y * W + x]
      if (Number.isNaN(z)) { img.data[i + 3] = 0; continue }
      if (kind === 'shade') {
        const xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1)
        const yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1)
        const gx = (d.z[y * W + xr] - d.z[y * W + xl]) / ((xr - xl) * d.dxM)
        const gn = (d.z[yu * W + x] - d.z[yd * W + x]) / ((yd - yu) * d.dyM) // +north
        const n = 1 / Math.sqrt(gx * gx + gn * gn + 1)
        const s = Math.max(0, (-gx * lx - gn * ly + lz) * n)
        const v = Math.round(255 * Math.min(1, s * 1.05))
        img.data[i] = v; img.data[i + 1] = v * 0.93; img.data[i + 2] = v * 0.86; img.data[i + 3] = 255
      } else if (kind === 'elev') {
        const [r, g, b] = elevColour((z - minM) / (maxM - minM))
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
      } else {
        const s = slopeDegAt(d, x, y)
        const [, c] = SLOPE_CLASSES.find(([lim]) => s < lim)!
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]
        // Easy ground stays transparent so the imagery reads through; only
        // slopes that change the plan are painted.
        img.data[i + 3] = s < 8 ? 0 : 235
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return cv
}

export default function RealSiteMap(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [dtm, setDtm] = useState<Dtm | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [traverse, setTraverse] = useState<TraverseData | null>(null)
  const [crism, setCrism] = useState<HTMLImageElement | null>(null)
  const [tick, setTick] = useState(0)
  const tiles = useRef(new Map<string, HTMLImageElement | 'failed'>())

  useEffect(() => {
    loadDtm().then((d) => { setDtm(d); p.onDtm?.(d) }).catch((e) => setErr(String(e)))
    loadTraverse().then(setTraverse).catch(() => {})
    const im = new Image()
    im.onload = () => setCrism(im)
    im.src = CRISM_CAR.url
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const height = dtm ? Math.round((p.width * dtm.heightM) / dtm.widthM) : Math.round(p.width * 0.68)

  // Fetch the Trek tiles covering the window for the chosen base layer.
  useEffect(() => {
    if (!dtm || p.base === 'none') { p.onTiles?.('ok'); return }
    const L = TREK_JEZERO.find((l) => l.id === p.base)!
    const m = dtm.meta
    const [c0, r0] = trekTileIndex(L.zoom, m.lonW, m.latN)
    const [c1, r1] = trekTileIndex(L.zoom, m.lonE, m.latS)
    let pending = 0, failed = 0, total = 0
    let cancelled = false
    p.onTiles?.('loading')
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = `${L.id}/${L.zoom}/${r}/${c}`
        total++
        if (tiles.current.has(key)) { if (tiles.current.get(key) === 'failed') failed++; continue }
        pending++
        const im = new Image()
        im.crossOrigin = 'anonymous'
        im.onload = () => { tiles.current.set(key, im); done() }
        im.onerror = () => { tiles.current.set(key, 'failed'); failed++; done() }
        im.src = trekTileUrl(L.layer, L.zoom, r, c)
      }
    }
    const report = () => p.onTiles?.(failed === 0 ? 'ok' : failed >= total ? 'offline' : 'partial')
    function done() {
      pending--
      if (cancelled) return
      setTick((t) => t + 1)
      if (pending === 0) report()
    }
    if (pending === 0) report()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dtm, p.base])

  const overlayCanvas = useMemo(() => (dtm ? buildOverlay(dtm, p.overlay) : null), [dtm, p.overlay])

  // ---- draw ---------------------------------------------------------------
  useEffect(() => {
    const cv = canvas.current
    if (!cv || !dtm) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = Math.round(p.width * dpr)
    cv.height = Math.round(height * dpr)
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const m = dtm.meta
    const X = (lon: number) => ((lon - m.lonW) / (m.lonE - m.lonW)) * p.width
    const Y = (lat: number) => ((m.latN - lat) / (m.latN - m.latS)) * height

    ctx.fillStyle = '#0b0f15'
    ctx.fillRect(0, 0, p.width, height)

    // Base imagery
    if (p.base !== 'none') {
      const L = TREK_JEZERO.find((l) => l.id === p.base)!
      const [c0, r0] = trekTileIndex(L.zoom, m.lonW, m.latN)
      const [c1, r1] = trekTileIndex(L.zoom, m.lonE, m.latS)
      ctx.imageSmoothingEnabled = true
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const im = tiles.current.get(`${L.id}/${L.zoom}/${r}/${c}`)
          if (!im || im === 'failed') continue
          const b = trekTileBounds(L.zoom, c, r)
          const x0 = X(b.lonW), x1 = X(b.lonE), y0 = Y(b.latN), y1 = Y(b.latS)
          // +0.5 px overlap hides hairline seams between tiles.
          ctx.drawImage(im, x0, y0, x1 - x0 + 0.5, y1 - y0 + 0.5)
        }
      }
    }

    // Overlay
    if (p.overlay === 'crism' && crism) {
      const [sx0, sy0] = crismPixel(m.lonW, m.latN)
      const [sx1, sy1] = crismPixel(m.lonE, m.latS)
      ctx.globalAlpha = p.overlayAlpha
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(crism, sx0, sy0, sx1 - sx0, sy1 - sy0, 0, 0, p.width, height)
      ctx.imageSmoothingEnabled = true
      ctx.globalAlpha = 1
    } else if (overlayCanvas) {
      ctx.globalAlpha = p.base === 'none' ? 1 : p.overlayAlpha
      ctx.drawImage(overlayCanvas, 0, 0, p.width, height)
      ctx.globalAlpha = 1
    }

    // Perseverance traverse
    if (p.showTraverse && traverse) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1.6
      ctx.setLineDash([4, 3])
      for (const seg of traverse.segments) {
        ctx.beginPath()
        seg.forEach(([lon, lat], i) => (i ? ctx.lineTo(X(lon), Y(lat)) : ctx.moveTo(X(lon), Y(lat))))
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // Planned route
    if (p.route.length) {
      ctx.strokeStyle = '#6ed7ff'
      ctx.lineWidth = 3
      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = 4
      ctx.beginPath()
      p.route.forEach(([lon, lat], i) => (i ? ctx.lineTo(X(lon), Y(lat)) : ctx.moveTo(X(lon), Y(lat))))
      ctx.stroke()
      ctx.shadowBlur = 0
      p.route.forEach(([lon, lat], i) => {
        ctx.fillStyle = i === 0 ? '#7dffb2' : '#6ed7ff'
        ctx.beginPath()
        ctx.arc(X(lon), Y(lat), 4, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    // Features
    ctx.font = '600 11px "Share Tech Mono", monospace'
    for (const f of REAL_FEATURES) {
      const x = X(f.lon), y = Y(f.lat)
      const sel = p.selected === f.id
      ctx.fillStyle = f.id === 'landing' ? '#ff8a3d' : '#ffb24a'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 9); ctx.lineTo(x - 7, y); ctx.closePath()
      ctx.stroke(); ctx.fill()
      if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke() }
      const label = f.name.toUpperCase()
      const tw = ctx.measureText(label).width
      const lx = Math.min(p.width - tw - 6, Math.max(4, x + 11))
      ctx.fillStyle = 'rgba(5,8,13,0.78)'
      ctx.fillRect(lx - 3, y - 8, tw + 6, 15)
      ctx.fillStyle = sel ? '#fff' : '#ffd9a0'
      ctx.fillText(label, lx, y + 3)
    }

    // Scale bar (500 m) and north arrow
    const pxPerM = p.width / dtm.widthM
    const sb = 500 * pxPerM
    ctx.fillStyle = 'rgba(5,8,13,0.8)'
    ctx.fillRect(10, height - 30, sb + 20, 22)
    ctx.fillStyle = '#e8eef5'
    ctx.fillRect(20, height - 16, sb, 3)
    ctx.fillText('500 m', 20 + sb / 2 - 16, height - 20)
    ctx.fillStyle = 'rgba(5,8,13,0.8)'
    ctx.fillRect(p.width - 30, 8, 22, 30)
    ctx.fillStyle = '#e8eef5'
    ctx.beginPath(); ctx.moveTo(p.width - 19, 12); ctx.lineTo(p.width - 13, 24); ctx.lineTo(p.width - 25, 24); ctx.fill()
    ctx.fillText('N', p.width - 23, 35)
  }, [dtm, p.width, height, p.base, p.overlay, p.overlayAlpha, p.showTraverse, p.route, p.selected, overlayCanvas, traverse, crism, tick])

  // ---- interaction --------------------------------------------------------
  const toLonLat = (e: React.MouseEvent): [number, number] | null => {
    if (!dtm) return null
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null
    return gridToLonLat(dtm, fx * dtm.meta.width, fy * dtm.meta.height)
  }

  const hitFeature = (e: React.MouseEvent): string | null => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const sx = r.width / p.width
    for (const f of REAL_FEATURES) {
      if (!dtm) break
      const [gx, gy] = lonLatToGrid(dtm, f.lon, f.lat)
      const x = (gx / dtm.meta.width) * r.width, y = (gy / dtm.meta.height) * r.height
      if (Math.hypot(e.clientX - r.left - x, e.clientY - r.top - y) < 12 * sx) return f.id
    }
    return null
  }

  if (err) {
    return (
      <div className="note danger" style={{ width: p.width }}>
        The bundled HiRISE elevation model could not be loaded ({err}). The rest of the app is unaffected.
      </div>
    )
  }

  return (
    <canvas
      ref={canvas}
      style={{ width: p.width, height, display: 'block', cursor: 'crosshair', border: '1px solid var(--line)' }}
      onMouseMove={(e) => {
        const ll = toLonLat(e)
        if (!ll || !dtm) { p.onHover(null); return }
        const [gx, gy] = lonLatToGrid(dtm, ll[0], ll[1])
        p.onHover({
          lon: ll[0], lat: ll[1],
          elevM: elevAt(dtm, gx, gy),
          slopeDeg: slopeDegAt(dtm, Math.min(dtm.meta.width - 1, Math.floor(gx)), Math.min(dtm.meta.height - 1, Math.floor(gy))),
        })
      }}
      onMouseLeave={() => p.onHover(null)}
      onClick={(e) => {
        const f = hitFeature(e)
        if (f) { p.onSelect(f); return }
        const ll = toLonLat(e)
        if (ll) p.onAddPoint(ll)
      }}
    />
  )
}
