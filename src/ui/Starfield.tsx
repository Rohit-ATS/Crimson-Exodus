import { useEffect, useRef } from 'react'

/** Slow-drifting starfield with a Mars limb, used behind the menu screens. */
export default function Starfield({ marsLimb = true }: { marsLimb?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    let raf = 0
    let w = 0, h = 0
    const stars: Array<{ x: number; y: number; r: number; a: number; tw: number }> = []

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = cv.clientWidth; h = cv.clientHeight
      cv.width = Math.floor(w * dpr)
      cv.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars.length = 0
      const n = Math.round((w * h) / 5200)
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.1 + 0.25,
          a: Math.random() * 0.6 + 0.2,
          tw: Math.random() * 2.4 + 0.4,
        })
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      // Deep space gradient
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#04060b')
      g.addColorStop(0.62, '#070910')
      g.addColorStop(1, '#0b0a0d')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      for (const s of stars) {
        const a = s.a * (0.62 + 0.38 * Math.sin(t / 900 * s.tw + s.x))
        ctx.globalAlpha = a
        ctx.fillStyle = '#dff1ff'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (marsLimb) {
        // A big Mars limb crossing the lower right, lit from the upper left.
        const cx = w * 1.02
        const cy = h * 1.26
        const R = Math.max(w, h) * 0.82
        const rot = t / 160000

        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, Math.PI * 2)
        ctx.clip()

        const surf = ctx.createRadialGradient(cx - R * 0.55, cy - R * 0.62, R * 0.05, cx, cy, R * 1.05)
        surf.addColorStop(0, '#e59a63')
        surf.addColorStop(0.32, '#c06a3d')
        surf.addColorStop(0.62, '#8b4226')
        surf.addColorStop(0.86, '#431a10')
        surf.addColorStop(1, '#180808')
        ctx.fillStyle = surf
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2)

        // Albedo blotches: Syrtis-like dark regions drifting with rotation.
        for (let i = 0; i < 26; i++) {
          const ang = i * 2.399 + rot
          const rr = R * (0.18 + ((i * 37) % 70) / 100)
          const bx = cx + Math.cos(ang) * rr * 0.92
          const by = cy + Math.sin(ang * 0.7) * rr * 0.55 - R * 0.25
          const br = R * (0.05 + ((i * 17) % 40) / 420)
          const bl = ctx.createRadialGradient(bx, by, 0, bx, by, br)
          bl.addColorStop(0, 'rgba(60,30,22,0.35)')
          bl.addColorStop(1, 'rgba(60,30,22,0)')
          ctx.fillStyle = bl
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill()
        }

        // Polar cap haze at the top of the visible limb
        const cap = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.98, 0, cx - R * 0.2, cy - R * 0.98, R * 0.42)
        cap.addColorStop(0, 'rgba(236,240,245,0.5)')
        cap.addColorStop(1, 'rgba(236,240,245,0)')
        ctx.fillStyle = cap
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2)

        // Terminator shading
        const term = ctx.createLinearGradient(cx - R, cy - R, cx + R * 0.5, cy + R)
        term.addColorStop(0, 'rgba(0,0,0,0)')
        term.addColorStop(0.55, 'rgba(0,0,0,0.25)')
        term.addColorStop(1, 'rgba(0,0,0,0.85)')
        ctx.fillStyle = term
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
        ctx.restore()

        // Thin dusty atmosphere glow on the limb
        const atm = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.055)
        atm.addColorStop(0, 'rgba(255,170,110,0)')
        atm.addColorStop(0.45, 'rgba(255,176,116,0.3)')
        atm.addColorStop(1, 'rgba(255,176,116,0)')
        ctx.fillStyle = atm
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2); ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [marsLimb])

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  )
}
