import * as THREE from 'three'
import { findCountry, flagUrl } from './countries'

/**
 * Flag textures.
 *
 * Real flag renderings come from flagcdn.com, keyed by ISO 3166-1 alpha-2 code.
 * That is a third-party public CDN, not NASA data, and the app says so.
 *
 * Offline or blocked, we do not silently show a wrong flag: we draw a clearly
 * labelled placeholder carrying the country name and code, so nothing in a
 * screenshot can be mistaken for a real national flag.
 */

const cache = new Map<string, { tex: THREE.Texture; real: boolean }>()

function placeholder(code: string): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 420
  const g = c.getContext('2d')!
  const name = findCountry(code)?.name ?? code.toUpperCase()

  g.fillStyle = '#10151d'
  g.fillRect(0, 0, 640, 420)
  g.strokeStyle = '#4fe8ff'
  g.lineWidth = 6
  g.strokeRect(10, 10, 620, 400)
  for (let i = -420; i < 640; i += 34) {
    g.strokeStyle = 'rgba(79,232,255,0.12)'
    g.lineWidth = 12
    g.beginPath(); g.moveTo(i, 420); g.lineTo(i + 420, 0); g.stroke()
  }
  g.fillStyle = '#4fe8ff'
  g.font = 'bold 44px monospace'
  g.textAlign = 'center'
  g.fillText(code.toUpperCase(), 320, 150)
  g.fillStyle = '#d3e6f2'
  g.font = '30px monospace'
  const words = name.split(' ')
  let line = ''
  const lines: string[] = []
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 20) { lines.push(line.trim()); line = w } else line += ' ' + w
  }
  lines.push(line.trim())
  lines.forEach((l, i) => g.fillText(l, 320, 215 + i * 36))
  g.fillStyle = '#ffb24a'
  g.font = '20px monospace'
  g.fillText('FLAG IMAGE UNAVAILABLE OFFLINE', 320, 380)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export async function loadFlagTexture(code: string): Promise<{ tex: THREE.Texture; real: boolean }> {
  const hit = cache.get(code)
  if (hit) return hit

  try {
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const tex = await loader.loadAsync(flagUrl(code, 320))
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const res = { tex, real: true }
    cache.set(code, res)
    return res
  } catch {
    const res = { tex: placeholder(code), real: false }
    cache.set(code, res)
    return res
  }
}
