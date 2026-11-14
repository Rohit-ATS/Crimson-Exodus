import { useEffect, useRef } from 'react'
import type { SampledPoint } from '../../mission/path'
import { STATIONS } from '../../mission/site'

/**
 * Elevation profile along the chosen route.
 *
 * The vertical axis is height above the lander pad. The band colour under the
 * curve is the local grade, using the same thresholds as the slope layer, so the
 * expensive parts of a route are visible at a glance. Station positions are
 * projected onto the profile by their nearest point on the path.
 */
export default function ElevationProfile({
  path, width, height = 160, progressIndex,
}: { path: SampledPoint[]; width: number; height?: number; progressIndex?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv || !path.length) return
    const ctx = cv.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = width * dpr
    cv.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const PAD_L = 38, PAD_R = 10, PAD_T = 14, PAD_B = 22
    const W = width - PAD_L - PAD_R
    const H = height - PAD_T - PAD_B

    const total = path[path.length - 1].s
    let hMin = Infinity, hMax = -Infinity
    for (const p of path) { hMin = Math.min(hMin, p.h); hMax = Math.max(hMax, p.h) }
    const pad = Math.max(4, (hMax - hMin) * 0.16)
    hMin -= pad; hMax += pad

    const X = (s: number) => PAD_L + (s / total) * W
    const Y = (h: number) => PAD_T + H - ((h - hMin) / (hMax - hMin)) * H

    ctx.fillStyle = '#080b11'
    ctx.fillRect(0, 0, width, height)

    // Horizontal gridlines every 10 m
    ctx.strokeStyle = 'rgba(110,215,255,0.1)'
    ctx.fillStyle = 'rgba(160,185,200,0.6)'
    ctx.font = '9px Share Tech Mono, monospace'
    ctx.lineWidth = 1
    const step = (hMax - hMin) > 70 ? 20 : 10
    for (let h = Math.ceil(hMin / step) * step; h <= hMax; h += step) {
      const y = Y(h)
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(width - PAD_R, y); ctx.stroke()
      ctx.fillText(`${h > 0 ? '+' : ''}${h}`, 4, y + 3)
    }

    // Grade-coloured fill
    const gradeColor = (g: number) => {
      const a = Math.abs(g)
      if (a < 0.08) return 'rgba(60,170,120,0.55)'
      if (a < 0.15) return 'rgba(214,196,90,0.55)'
      if (a < 0.22) return 'rgba(230,140,56,0.6)'
      if (a < 0.3) return 'rgba(220,70,50,0.65)'
      return 'rgba(150,24,90,0.7)'
    }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]
      ctx.fillStyle = gradeColor(a.grade)
      ctx.beginPath()
      ctx.moveTo(X(a.s), Y(a.h))
      ctx.lineTo(X(b.s), Y(b.h))
      ctx.lineTo(X(b.s), PAD_T + H)
      ctx.lineTo(X(a.s), PAD_T + H)
      ctx.closePath()
      ctx.fill()
    }

    // Walked portion
    if (progressIndex !== undefined && progressIndex > 0) {
      const sNow = path[Math.min(path.length - 1, progressIndex)].s
      ctx.fillStyle = 'rgba(125,255,178,0.1)'
      ctx.fillRect(PAD_L, PAD_T, X(sNow) - PAD_L, H)
      ctx.strokeStyle = '#7dffb2'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(X(sNow), PAD_T); ctx.lineTo(X(sNow), PAD_T + H); ctx.stroke()
    }

    // The profile line
    ctx.strokeStyle = '#d3e6f2'
    ctx.lineWidth = 1.8
    ctx.beginPath()
    path.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.s), Y(p.h)) : ctx.lineTo(X(p.s), Y(p.h))))
    ctx.stroke()

    // Stations projected onto the profile
    for (const st of STATIONS) {
      let best = -1, bestD = Infinity
      for (let i = 0; i < path.length; i++) {
        const d = (path[i].x - st.x) ** 2 + (path[i].z - st.z) ** 2
        if (d < bestD) { bestD = d; best = i }
      }
      if (best < 0 || Math.sqrt(bestD) > st.radius * 1.6) continue
      const p = path[best]
      const x = X(p.s), y = Y(p.h)
      ctx.strokeStyle = '#ffb24a'
      ctx.setLineDash([2, 3])
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, PAD_T); ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y)
      ctx.closePath()
      ctx.fillStyle = '#ffb24a'
      ctx.fill()
      ctx.fillStyle = '#ffd9a8'
      ctx.font = 'bold 9px Share Tech Mono, monospace'
      ctx.fillText(st.codename.split(' ')[1] ?? st.id.toUpperCase(), x - 6, PAD_T - 4)
    }

    // Distance axis
    ctx.fillStyle = 'rgba(160,185,200,0.65)'
    ctx.font = '9px Share Tech Mono, monospace'
    const dStep = total > 2000 ? 500 : 250
    // Reserve room on the right for the axis caption so ticks never collide with it.
    const captionW = 78
    for (let s = 0; s <= total; s += dStep) {
      const x = X(s)
      if (x > width - PAD_R - captionW) continue
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(110,215,255,0.16)'
      ctx.moveTo(x, PAD_T + H); ctx.lineTo(x, PAD_T + H + 4); ctx.stroke()
      ctx.fillText(`${(s / 1000).toFixed(1)}`, x - 7, height - 7)
    }
    ctx.textAlign = 'right'
    ctx.fillText('km along route', width - PAD_R, height - 7)
    ctx.textAlign = 'left'
    ctx.save()
    ctx.translate(10, PAD_T + H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('m above pad', -34, -22)
    ctx.restore()
  }, [path, width, height, progressIndex])

  return <canvas ref={ref} style={{ width, height, display: 'block' }} />
}
