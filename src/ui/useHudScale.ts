import { useEffect, useState, type CSSProperties } from 'react'

/**
 * The HUD is laid out for roughly 1500 x 880 CSS px. On a smaller laptop or a
 * projector at a low resolution the side panels start to overlap the log and
 * each other, so shrink the whole overlay uniformly instead.
 *
 * CSS `zoom` multiplies specified lengths, so giving the zoomed box a size of
 * viewport / scale makes it render exactly viewport-sized again: panels pinned
 * to the right and bottom edges stay pinned to the real edges.
 */
const DESIGN_W = 1500
const DESIGN_H = 880
const MIN_SCALE = 0.62

function compute(): number {
  if (typeof window === 'undefined') return 1
  const s = Math.min(1, window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H)
  return Math.max(MIN_SCALE, Math.round(s * 100) / 100)
}

export function useHudScale(): CSSProperties {
  const [scale, setScale] = useState(compute)
  useEffect(() => {
    const on = () => setScale(compute())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  if (scale >= 1) return {}
  return {
    zoom: scale,
    right: 'auto',
    bottom: 'auto',
    width: window.innerWidth / scale,
    height: window.innerHeight / scale,
  }
}
