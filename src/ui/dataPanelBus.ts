/** A one-line event bus so any screen can open the shared Data Details panel. */
type Fn = () => void
const subs = new Set<Fn>()

export const openDataPanel = {
  subscribe(fn: Fn) {
    subs.add(fn)
    return () => { subs.delete(fn) }
  },
  open() {
    subs.forEach((f) => f())
  },
}
