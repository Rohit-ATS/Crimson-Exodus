/**
 * downlink.ts — Getting the data off the planet.
 *
 * Nothing you do on Mars is science until it reaches Earth, and getting it
 * there is not instant and not free. This module models the path a real Mars
 * surface mission's data actually takes, because the path is the lesson:
 *
 *   surface asset  --UHF-->  orbiter  --X-band-->  Deep Space Network  -->  team
 *
 * WHAT IS MODELLED, AND FROM WHAT
 *  - The two-hop relay architecture. Mars surface missions send almost all of
 *    their data to an orbiter overhead on a UHF link, and the orbiter stores it
 *    and forwards it to Earth on its own much larger antenna. Perseverance,
 *    Curiosity and InSight all work this way, relaying through Mars
 *    Reconnaissance Orbiter, MAVEN, Mars Odyssey and ESA's Trace Gas Orbiter.
 *    https://mars.nasa.gov/msl/mission/communications/
 *  - UHF relay rate: up to about 2 Mbit/s from the surface to an orbiter during
 *    a pass. That is the number used here.
 *  - Direct-to-Earth X-band from the surface is roughly a thousand times
 *    slower — tens of kbit/s — which is why the relay exists at all. Modelled
 *    here only as the fallback rate quoted to the player.
 *  - Light time: taken live from `orbits.ts`, computed from real planetary
 *    positions. 3 to 22 minutes one way depending on where the planets are.
 *  - The receiving station is chosen by Earth longitude from the real current
 *    time: Goldstone (California), Madrid or Canberra. The DSN really does hand
 *    off between the three as the Earth turns.
 *
 * WHAT IS NOT MODELLED
 *  - Orbiter pass scheduling. In reality you wait for an orbiter to come over
 *    the horizon, and passes last minutes and happen a few times a sol. Here
 *    the pass is assumed available, because a game that makes you wait four
 *    hours for a relay window is a different game.
 *  - Link budgets, coding and framing overhead, retransmission, DSN antenna
 *    allocation, and the solar conjunction command moratorium beyond a flag.
 *
 * The transfer is SHOWN compressed, exactly like the procedure clock: the real
 * modelled transfer seconds are displayed next to the compression factor, so
 * the player can see what is being sped up for them.
 */

/** Surface-to-orbiter UHF relay rate, bits per second. */
export const RELAY_BPS = 2_000_000

/** Direct-to-Earth X-band from the surface, bits per second, for comparison. */
export const DTE_BPS = 20_000

export type UplinkItemKind = 'frame' | 'observation' | 'sample' | 'telemetry' | 'flag'

export interface UplinkItem {
  id: string
  kind: UplinkItemKind
  label: string
  /** Transmitted size in bytes. */
  bytes: number
  /** Thumbnail to show filling in as it transfers: a captured frame, or a NASA file. */
  thumb?: string
  /** One line of what it is. */
  note?: string
}

/**
 * Typical transmitted sizes.
 *
 * A Mastcam-Z frame is 1648 x 1200 in colour. Raw that is about 5.9 MB; what
 * actually goes down the link is compressed, and the mission uses a mix of
 * lossless and lossy depending on how much the scientists need. 2.4 MB is a
 * reasonable compressed full-frame figure and is what is used here.
 */
export const SIZES: Record<UplinkItemKind, number> = {
  frame: 2.4e6,
  observation: 18e3,
  sample: 46e3,
  telemetry: 9e3,
  flag: 1.1e6,
}

export interface UplinkStage {
  id: string
  /** Fraction of the animation at which this stage starts. */
  at: number
  label: string
  detail: string
}

/**
 * The stages, in the order they really happen. The transfer stage deliberately
 * occupies most of the bar, because that is where the time goes.
 */
export const STAGES: UplinkStage[] = [
  {
    id: 'assemble',
    at: 0,
    label: 'Assembling the packet',
    detail:
      'Frames, observation records and sample manifests are bundled with their metadata and checksummed. Data with no position, time and illumination attached is not worth the bits it costs to send.',
  },
  {
    id: 'acquire',
    at: 0.1,
    label: 'Acquiring the relay orbiter',
    detail:
      'Almost nothing goes straight to Earth from the surface. You transmit to whichever orbiter is over the horizon — MRO, MAVEN, Odyssey or ESA’s Trace Gas Orbiter — and it carries your data the rest of the way.',
  },
  {
    id: 'transfer',
    at: 0.18,
    label: 'UHF transfer to orbiter',
    detail:
      'Up to about 2 megabits per second on the UHF relay link. Straight to Earth from the surface you would get a few tens of kilobits per second — roughly a thousand times slower. This hop is why Mars missions return gigabits instead of megabits.',
  },
  {
    id: 'forward',
    at: 0.8,
    label: 'Orbiter stores and forwards',
    detail:
      'The orbiter holds your packet until its own Deep Space Network pass, then sends it on X-band from an antenna far larger than anything you can carry on your back.',
  },
  {
    id: 'flight',
    at: 0.9,
    label: 'In flight to Earth',
    detail:
      'Now it is just physics. The packet crosses the distance at the speed of light and there is no way to make that faster, shorter or cheaper.',
  },
]

/** Which Deep Space Network complex is facing Mars right now. */
export function dsnStation(now: Date): { name: string; place: string } {
  // The three complexes are roughly 120 degrees apart in longitude:
  // Goldstone -116.9, Madrid -4.2, Canberra +148.98. Pick whichever has the
  // smallest hour-angle difference from the sub-Mars point, approximated here
  // by using the anti-solar-ish rotation of the Earth through the UTC day.
  const hoursUtc = now.getUTCHours() + now.getUTCMinutes() / 60
  const sites = [
    { name: 'Goldstone', place: 'Mojave Desert, California', lon: -116.9 },
    { name: 'Madrid', place: 'Robledo de Chavela, Spain', lon: -4.2 },
    { name: 'Canberra', place: 'Tidbinbilla, Australia', lon: 148.98 },
  ]
  // Local solar time at each site; the one nearest local midday has the best view.
  let best = sites[0]
  let bestScore = Infinity
  for (const s of sites) {
    const lst = (hoursUtc + s.lon / 15 + 24) % 24
    const score = Math.abs(lst - 12)
    if (score < bestScore) { bestScore = score; best = s }
  }
  return { name: best.name, place: best.place }
}

/** Modelled seconds the UHF hop would really take. */
export function transferSeconds(totalBytes: number): number {
  return (totalBytes * 8) / RELAY_BPS
}

/** The same packet over a direct-to-Earth link, for the comparison line. */
export function dteSeconds(totalBytes: number): number {
  return (totalBytes * 8) / DTE_BPS
}

export function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(2)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} kB`
  return `${b.toFixed(0)} B`
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)} s`
  // Round to whole seconds FIRST, then split, so 599.6 s is 10m 00s and never
  // the 9m 60s that rounding each part separately produces.
  const total = Math.round(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** The stage active at a given progress fraction. */
export function activeStage(progress: number): number {
  let i = 0
  for (let k = 0; k < STAGES.length; k++) if (progress >= STAGES[k].at) i = k
  return i
}

/**
 * How far through the item list the transfer has got.
 * Items complete in order, each taking time proportional to its size.
 */
export function itemsSent(items: UplinkItem[], transferFraction: number): number {
  const total = items.reduce((a, i) => a + i.bytes, 0)
  if (total <= 0) return items.length
  let acc = 0
  for (let i = 0; i < items.length; i++) {
    acc += items[i].bytes
    if (acc / total > transferFraction) return i
  }
  return items.length
}
