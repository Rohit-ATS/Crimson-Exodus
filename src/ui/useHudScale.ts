import { useEffect, useState, type CSSProperties } from 'react'
import { useSettings } from '../state/settings'

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
  const [auto, setAuto] = useState(compute)
  const manual = useSettings((s) => s.hudScale)
  useEffect(() => {
    const on = () => setAuto(compute())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  // The automatic fit stops panels overlapping; the manual setting is the
  // player's own preference on top of it.
  const scale = Math.round(auto * manual * 100) / 100
  if (scale >= 0.995 && scale <= 1.005) return {}
  return {
    zoom: scale,
    right: 'auto',
    bottom: 'auto',
    width: window.innerWidth / scale,
    height: window.innerHeight / scale,
  }
}
