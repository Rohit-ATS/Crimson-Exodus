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

/**
 * The scale factor on its own.
 *
 * Anything that positions itself from a pointer event needs this. `zoom`
 * leaves `clientX` in real viewport pixels while `left` is interpreted in the
 * zoomed coordinate space, so a draggable window drifts away from the cursor
 * on any screen smaller than the design size unless the two are reconciled.
 */
export function useHudScaleValue(): number {
  const [auto, setAuto] = useState(compute)
  const manual = useSettings((s) => s.hudScale)
  useEffect(() => {
    const on = () => setAuto(compute())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return Math.round(auto * manual * 100) / 100
}

export function useHudScale(): CSSProperties {
  const scale = useHudScaleValue()
  if (scale >= 0.995 && scale <= 1.005) return {}
  return {
    zoom: scale,
    right: 'auto',
    bottom: 'auto',
    width: window.innerWidth / scale,
    height: window.innerHeight / scale,
  }
}
