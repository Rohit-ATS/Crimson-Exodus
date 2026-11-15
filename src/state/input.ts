/** input.ts — Keyboard state, read by the sim loop. */

const down = new Set<string>()

export const input = {
  get forward() { return down.has('KeyW') || down.has('ArrowUp') },
  get back() { return down.has('KeyS') || down.has('ArrowDown') },
  get left() { return down.has('KeyA') || down.has('ArrowLeft') },
  get right() { return down.has('KeyD') || down.has('ArrowRight') },
  get boost() { return down.has('ShiftLeft') || down.has('ShiftRight') },
  get turnLeft() { return down.has('KeyQ') },
  get turnRight() { return down.has('KeyE') },
  has: (code: string) => down.has(code),
  clear: () => down.clear(),
}

type Handler = (code: string) => void
const pressHandlers = new Set<Handler>()

export function onPress(h: Handler): () => void {
  pressHandlers.add(h)
  return () => pressHandlers.delete(h)
}

export function installInput(): () => void {
  /** Keys that open a panel. The character must not also land in a text field. */
  const SWALLOW = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyC', 'KeyG',
    'KeyB', 'KeyM', 'KeyT', 'KeyK', 'KeyH', 'KeyV', 'KeyP', 'KeyR', 'KeyN',
    'Space', 'Enter', 'NumpadEnter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ])

  const kd = (e: KeyboardEvent) => {
    const inField =
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    // Escape always gets through: otherwise a modal with a focused search box
    // becomes impossible to leave with the keyboard.
    if (inField && e.code !== 'Escape') return
    if (!down.has(e.code)) pressHandlers.forEach((h) => h(e.code))
    down.add(e.code)
    if (SWALLOW.has(e.code)) e.preventDefault()
  }
  const ku = (e: KeyboardEvent) => down.delete(e.code)
  const blur = () => down.clear()
  window.addEventListener('keydown', kd)
  window.addEventListener('keyup', ku)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', kd)
    window.removeEventListener('keyup', ku)
    window.removeEventListener('blur', blur)
  }
}
