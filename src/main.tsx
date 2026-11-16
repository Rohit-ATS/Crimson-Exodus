import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'

// When a deployment replaces hashed chunks under an already-open tab, Vite's
// dynamic import can point at an asset that no longer exists. Refresh once to
// fetch the matching index.html and chunks; if that still fails, leave the
// ErrorBoundary visible instead of creating a reload loop.
const CHUNK_RELOAD_KEY = 'jack-marswalk:chunk-reload-at'
let allowChunkReload = false
try {
  const previousReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))
  const elapsed = Date.now() - previousReload
  allowChunkReload = !previousReload || elapsed > 60_000
  if (allowChunkReload) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  }
  // Re-arm after the cooldown, including on the refreshed page after one
  // recovery attempt, so a later deployment can still recover automatically.
  window.setTimeout(() => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    allowChunkReload = true
  }, allowChunkReload ? 60_000 : Math.max(0, 60_000 - elapsed))
} catch {
  // If storage is unavailable, show the in-app recovery screen rather than risk
  // an infinite refresh cycle.
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (!allowChunkReload) return
  allowChunkReload = false
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
