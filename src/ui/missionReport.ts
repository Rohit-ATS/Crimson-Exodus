/**
 * missionReport.ts — The thing the player takes away.
 *
 * A debrief that only exists on screen is forgotten by the time the browser
 * tab closes. This renders the run as a single portrait image: the outcome,
 * the numbers that decided it, the best frame the player actually captured on
 * Mars, and the survival notes they earned. It is sized for a phone screen and
 * a social post, because the point of this project is that somebody learns
 * something about surviving on Mars and then tells someone else.
 *
 * Everything is drawn with the 2D canvas API and the fonts the page already
 * loaded. There is no screenshot library, no server, and nothing leaves the
 * machine: the image is produced locally and handed straight to a download.
 *
 * NASA credit is rendered onto the image itself, not just alongside it, so a
 * card that gets reposted still carries its attribution.
 */

import type { Outcome, Photo, State } from '../state/store'
import type { Lesson } from '../mission/activity'

export interface ReportInput {
  outcome: Outcome
  state: State
  lessons: Lesson[]
  scienceScore: { score: number; max: number }
  routeName: string
}

const W = 1080
const H = 1920

const INK = '#e8eef5'
const DIM = '#8fa3b5'
const FAINT = '#5a6b7a'
const CYAN = '#4fe8ff'
const AMBER = '#ffb24a'
const LIME = '#7dffb2'
const RED = '#ff4d4d'

/** Wait for the webfonts so the card is not rendered in a fallback face. */
async function fontsReady(): Promise<void> {
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
  } catch {
    /* A browser without the Font Loading API just gets system fonts. */
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

/** Draw wrapped text, returning the y position after the last line. */
function wrap(
  c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number,
  maxLines = 99,
): number {
  const words = text.split(' ')
  let line = ''
  let yy = y
  let lines = 0
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (c.measureText(test).width > maxW && line) {
      if (lines === maxLines - 1) {
        // Last allowed line: ellipsise rather than overflow the card.
        let t = line
        while (c.measureText(`${t}…`).width > maxW && t.length > 1) t = t.slice(0, -1)
        c.fillText(`${t}…`, x, yy)
        return yy + lh
      }
      c.fillText(line, x, yy)
      yy += lh
      lines++
      line = word
    } else {
      line = test
    }
  }
  if (line) { c.fillText(line, x, yy); yy += lh }
  return yy
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, color = FAINT) {
  c.font = '600 20px "Share Tech Mono", monospace'
  c.fillStyle = color
  c.letterSpacing = '3px'
  c.fillText(text.toUpperCase(), x, y)
  c.letterSpacing = '0px'
}

/** The frame worth showing: prefer one taken at a station, else the last one. */
function heroPhoto(photos: Photo[]): Photo | undefined {
  const withImage = photos.filter((p) => !!p.dataUrl)
  return withImage.filter((p) => p.stationId).pop() ?? withImage.pop()
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = src
  })
}

export async function renderMissionReport(input: ReportInput): Promise<HTMLCanvasElement> {
  await fontsReady()
  const { outcome: o, state: s, lessons, scienceScore, routeName } = input

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!

  // --- Ground ------------------------------------------------------------
  const bg = c.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#070c12')
  bg.addColorStop(0.55, '#0a1119')
  bg.addColorStop(1, '#05080c')
  c.fillStyle = bg
  c.fillRect(0, 0, W, H)

  // A faint grid, the same one the HUD uses.
  c.strokeStyle = 'rgba(79,232,255,0.05)'
  c.lineWidth = 1
  for (let x = 0; x < W; x += 54) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke() }
  for (let y = 0; y < H; y += 54) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke() }

  const M = 64
  const CW = W - M * 2
  let y = 120

  // --- Title -------------------------------------------------------------
  c.font = '900 64px Orbitron, sans-serif'
  c.fillStyle = INK
  c.letterSpacing = '2px'
  c.fillText('JACK: MARSWALK', M, y)
  c.letterSpacing = '0px'
  y += 34
  label(c, 'Jezero Crater · Mars EVA report', M, y, CYAN)
  y += 52

  // --- Outcome banner ----------------------------------------------------
  const tone = o.code === 'returned-nominal' ? LIME
    : o.code === 'returned-reserve-breach' ? AMBER : RED
  c.fillStyle = `${tone}14`
  roundRect(c, M, y, CW, 150, 4)
  c.fill()
  c.strokeStyle = tone
  c.lineWidth = 2
  c.beginPath(); c.moveTo(M, y); c.lineTo(M, y + 150); c.stroke()
  c.strokeStyle = `${tone}55`
  c.lineWidth = 1
  roundRect(c, M, y, CW, 150, 4)
  c.stroke()

  c.font = '700 20px "Share Tech Mono", monospace'
  c.fillStyle = tone
  c.letterSpacing = '4px'
  c.fillText(o.success ? 'MISSION SUCCESS' : 'MISSION FAILED', M + 28, y + 42)
  c.letterSpacing = '0px'
  c.font = '700 38px "Barlow Condensed", sans-serif'
  c.fillStyle = INK
  c.fillText(o.title, M + 28, y + 88)
  c.font = '400 23px "Barlow Condensed", sans-serif'
  c.fillStyle = DIM
  wrap(c, o.summary, M + 28, y + 122, CW - 56, 28, 1)
  y += 192

  // --- The hero frame ----------------------------------------------------
  const hero = heroPhoto(s.photos)
  if (hero?.dataUrl) {
    const im = await loadImage(hero.dataUrl)
    if (im) {
      const ih = 420
      // Cover-fit, cropped to the card width.
      const scale = Math.max(CW / im.width, ih / im.height)
      const dw = im.width * scale
      const dh = im.height * scale
      c.save()
      roundRect(c, M, y, CW, ih, 3)
      c.clip()
      c.drawImage(im, M + (CW - dw) / 2, y + (ih - dh) / 2, dw, dh)
      // A caption strip, so the frame carries its own conditions.
      c.fillStyle = 'rgba(5,8,13,0.82)'
      c.fillRect(M, y + ih - 58, CW, 58)
      c.font = '400 22px "Barlow Condensed", sans-serif'
      c.fillStyle = INK
      c.fillText(hero.label, M + 18, y + ih - 32)
      c.font = '400 18px "Share Tech Mono", monospace'
      c.fillStyle = DIM
      c.fillText(
        `SUN ${hero.sunElevationDeg.toFixed(0)}°  ·  LTST ${hero.ltst.toFixed(2)} h  ·  OPACITY ${hero.tau.toFixed(2)}`,
        M + 18, y + ih - 10,
      )
      c.restore()
      c.strokeStyle = 'rgba(79,232,255,0.3)'
      c.lineWidth = 1
      roundRect(c, M, y, CW, ih, 3)
      c.stroke()
      y += ih + 44
    }
  }

  // --- The numbers -------------------------------------------------------
  label(c, 'The run', M, y)
  y += 30

  const stats: Array<[string, string]> = [
    ['Route', routeName],
    ['Distance walked', `${(s.distanceWalkedM / 1000).toFixed(2)} km`],
    ['Furthest from the lander', `${s.maxRangeReachedM.toFixed(0)} m`],
    ['EVA duration', `${Math.floor(s.time.evaSec / 60)} min`],
    ['Science score', `${scienceScore.score} / ${scienceScore.max}`],
    ['Cores sealed', `${s.samples.length}`],
    ['Frames captured', `${s.photos.length}`],
    ['Packets downlinked', `${s.feed.length}`],
    ['Worst margin', Number.isFinite(s.worstMarginMin) ? `${s.worstMarginMin.toFixed(0)} min` : '—'],
    ['Reserve', s.reserveBreached ? 'BREACHED' : 'held'],
    ['EVA radiation dose', `${s.doseMSv.toFixed(3)} mSv`],
    ['Earth light time', `${(s.link.owltSec / 60).toFixed(1)} min one way`],
  ]

  const colW = CW / 2
  stats.forEach((row, i) => {
    const col = i % 2
    const rowI = Math.floor(i / 2)
    const sx = M + col * colW
    const sy = y + rowI * 58
    c.font = '400 19px "Share Tech Mono", monospace'
    c.fillStyle = FAINT
    c.letterSpacing = '1.5px'
    c.fillText(row[0].toUpperCase(), sx, sy)
    c.letterSpacing = '0px'
    c.font = '600 30px "Barlow Condensed", sans-serif'
    c.fillStyle = row[1] === 'BREACHED' ? RED : INK
    c.fillText(row[1], sx, sy + 32)
  })
  y += Math.ceil(stats.length / 2) * 58 + 36

  // --- The field guide: the part meant to be kept ------------------------
  c.strokeStyle = 'rgba(255,255,255,0.09)'
  c.lineWidth = 1
  c.beginPath(); c.moveTo(M, y); c.lineTo(W - M, y); c.stroke()
  y += 40

  label(c, `What Mars taught you · ${lessons.length} note(s)`, M, y, AMBER)
  y += 36

  if (lessons.length === 0) {
    c.font = '400 24px "Barlow Condensed", sans-serif'
    c.fillStyle = DIM
    y = wrap(c, 'No field procedures were carried out, so there is nothing here. The guide only fills from work actually done on the surface.', M, y, CW, 30)
  } else {
    // Give the space to full entries while there is room for one, then list the
    // remaining headlines compactly. The alternative — a fixed count — either
    // overflows the footer or leaves a third of the card empty.
    const FULL_H = 186
    const COMPACT_H = 42
    const bottom = H - 190
    let i = 0
    while (i < lessons.length && y + FULL_H <= bottom) {
      const l = lessons[i]
      c.fillStyle = AMBER
      c.fillRect(M, y - 20, 3, 56)
      c.font = '600 29px "Barlow Condensed", sans-serif'
      c.fillStyle = INK
      y = wrap(c, l.headline, M + 20, y, CW - 20, 34, 2)
      c.font = '400 22px "Barlow Condensed", sans-serif'
      c.fillStyle = DIM
      y = wrap(c, l.body, M + 20, y + 6, CW - 20, 27, 3)
      y += 26
      i++
    }
    if (i < lessons.length) {
      c.font = '400 19px "Share Tech Mono", monospace'
      c.fillStyle = FAINT
      c.letterSpacing = '2px'
      c.fillText('ALSO LEARNED', M + 20, y)
      c.letterSpacing = '0px'
      y += 30
      for (; i < lessons.length && y + COMPACT_H <= bottom; i++) {
        c.fillStyle = `${AMBER}66`
        c.fillRect(M, y - 15, 3, 24)
        c.font = '600 25px "Barlow Condensed", sans-serif'
        c.fillStyle = DIM
        y = wrap(c, lessons[i].headline, M + 20, y, CW - 20, 30, 1)
        y += 12
      }
      if (i < lessons.length) {
        c.font = '400 20px "Share Tech Mono", monospace'
        c.fillStyle = FAINT
        c.fillText(`+ ${lessons.length - i} more in the full debrief`, M + 20, y + 4)
      }
    }
  }

  // --- Footer: provenance, always on the image ---------------------------
  const fy = H - 132
  c.strokeStyle = 'rgba(79,232,255,0.22)'
  c.lineWidth = 1
  c.beginPath(); c.moveTo(M, fy - 34); c.lineTo(W - M, fy - 34); c.stroke()

  c.font = '400 20px "Share Tech Mono", monospace'
  c.fillStyle = CYAN
  c.letterSpacing = '2px'
  c.fillText('BUILT ON NASA OPEN DATA', M, fy)
  c.letterSpacing = '0px'

  c.font = '400 19px "Barlow Condensed", sans-serif'
  c.fillStyle = DIM
  wrap(
    c,
    'Imagery and elevation: NASA/JPL-Caltech, MSSS, ASU, University of Arizona, USGS, JHU-APL. ' +
    'Mars Reconnaissance Orbiter (HiRISE, CTX, CRISM, MARCI), Mars 2020 Perseverance (Mastcam-Z, WATSON, PIXL), ' +
    'Viking, Mars Global Surveyor (MOLA), Curiosity (RAD). Ephemerides: JPL approximate planetary positions. ' +
    'Timekeeping: NASA GISS Mars24. Terrain in the 3D scene is synthetic; the science, the site and the sky are not.',
    M, fy + 28, CW, 24, 4,
  )

  return canvas
}

/** A plain-text version, for pasting into a post or a submission form. */
export function reportText(input: ReportInput): string {
  const { outcome: o, state: s, lessons, scienceScore, routeName } = input
  const lines = [
    'JACK: MARSWALK — Mars EVA report',
    'Jezero Crater, western delta front',
    '',
    `${o.success ? 'MISSION SUCCESS' : 'MISSION FAILED'} — ${o.title}`,
    o.summary,
    '',
    `Route: ${routeName}`,
    `Distance walked: ${(s.distanceWalkedM / 1000).toFixed(2)} km, furthest ${s.maxRangeReachedM.toFixed(0)} m from the lander`,
    `EVA duration: ${Math.floor(s.time.evaSec / 60)} min`,
    `Science score: ${scienceScore.score} / ${scienceScore.max}`,
    `Cores sealed: ${s.samples.length} · frames: ${s.photos.length} · packets downlinked: ${s.feed.length}`,
    `Worst margin: ${Number.isFinite(s.worstMarginMin) ? `${s.worstMarginMin.toFixed(0)} min` : '—'} · reserve ${s.reserveBreached ? 'BREACHED' : 'held'}`,
    `Radiation dose: ${s.doseMSv.toFixed(3)} mSv · Earth light time: ${(s.link.owltSec / 60).toFixed(1)} min one way`,
    '',
    `What Mars taught me (${lessons.length}):`,
    ...lessons.map((l, i) => `  ${i + 1}. ${l.headline} — ${l.body}`),
    '',
    'Built on NASA open data: MRO (HiRISE, CTX, CRISM, MARCI), Mars 2020 Perseverance',
    '(Mastcam-Z, WATSON, PIXL), Viking, MGS (MOLA), Curiosity (RAD). Ephemerides from',
    'JPL approximate planetary positions; timekeeping from NASA GISS Mars24.',
  ]
  return lines.join('\n')
}

/** Hand the rendered card to the browser as a download. */
export async function downloadReport(input: ReportInput): Promise<void> {
  const canvas = await renderMissionReport(input)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Could not encode the report image')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `crimson-exodus-report-${new Date().toISOString().slice(0, 10)}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the download a moment to start before the blob is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
