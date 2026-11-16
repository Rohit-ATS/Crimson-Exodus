/**
 * HudWindow.tsx — A draggable, dismissable HUD window.
 *
 * Deliberately not a modal: the mission keeps running underneath, the player
 * keeps walking, and several of these can be open at once. It is a panel that
 * happens to float, with a title bar you can pick up.
 *
 * Dragging is implemented with pointer capture rather than window-level mouse
 * listeners, so a drag that leaves the window — or the browser — still ends
 * cleanly, and a touch screen at a demo table behaves the same as a mouse.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useHudScaleValue } from '../useHudScale'
import { useWindows, windowPosition, type WindowSpec } from './windows'

export default function HudWindow({
  spec, children, tone,
}: {
  spec: WindowSpec
  children: ReactNode
  /** Border accent, for a window that is currently reporting a problem. */
  tone?: string
}) {
  const pos = useWindows((s) => s.pos[spec.id])
  const stack = useWindows((s) => s.stack)
  const hide = useWindows((s) => s.hide)
  const raise = useWindows((s) => s.raise)
  const move = useWindows((s) => s.move)

  /**
   * Everything here works in the HUD's own coordinate space, not the
   * viewport's.
   *
   * The overlay is rendered with CSS `zoom` on screens below the design size,
   * which makes its internal space larger than the viewport by 1/scale. A
   * pointer event still arrives in real viewport pixels, so both the stored
   * position and the live drag have to be divided through — otherwise the
   * window drifts away from the cursor on exactly the laptops this redesign
   * is for.
   */
  const scale = useHudScaleValue() || 1
  const [raw, setRaw] = useState(() => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 800 : window.innerHeight,
  }))

  useEffect(() => {
    const onResize = () => setRaw({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const viewport = { w: raw.w / scale, h: raw.h / scale }
  const place = windowPosition(spec, pos, viewport)
  const z = 30 + Math.max(0, stack.indexOf(spec.id))

  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only the title bar drags, and never from its buttons.
    if (e.target instanceof Element && e.target.closest('button')) return
    raise(spec.id)
    drag.current = { dx: e.clientX / scale - place.x, dy: e.clientY / scale - place.y }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [place.x, place.y, raise, scale, spec.id])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    move(spec.id, {
      x: Math.max(0, Math.min(viewport.w - 70, e.clientX / scale - d.dx)),
      y: Math.max(0, Math.min(viewport.h - 40, e.clientY / scale - d.dy)),
    })
  }, [move, scale, spec.id, viewport.w, viewport.h])

  const endDrag = useCallback(() => { drag.current = null }, [])

  return (
    <div
      className="clipped"
      style={{
        position: 'absolute',
        left: place.x,
        top: place.y,
        width: spec.width,
        maxHeight: '76vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(7,11,18,0.9)',
        border: `1px solid ${tone ?? 'var(--line)'}`,
        backdropFilter: 'blur(7px)',
        pointerEvents: 'auto',
        zIndex: z,
        animation: 'fadeUp 0.14s ease-out',
      }}
      onPointerDown={() => raise(spec.id)}
    >
      <div
        className="row between gap8"
        style={{
          padding: '5px 6px 5px 9px',
          borderBottom: '1px solid var(--line-soft)',
          background: 'rgba(79,232,255,0.06)',
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="display cy" style={{ fontSize: 10, letterSpacing: '0.16em' }}>
          {spec.title.toUpperCase()}
        </span>
        <button
          className="btn ghost sm"
          style={{ padding: '1px 7px', fontSize: 10, lineHeight: 1.3 }}
          onClick={() => hide(spec.id)}
          title={`Close ${spec.title}`}
        >
          &times;
        </button>
      </div>
      <div className="scroll" style={{ padding: 9, minHeight: 0 }}>{children}</div>
    </div>
  )
}
