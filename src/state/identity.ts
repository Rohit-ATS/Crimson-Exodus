/**
 * identity.ts — Who this browser is, without an account.
 *
 * ===========================================================================
 *  The multiplayer server needs to tell three situations apart:
 *
 *    1. A NEW PERSON joining a room, who needs a free crew seat.
 *    2. THE SAME PERSON coming back — they refreshed, their wifi dropped, or
 *       Render replaced the instance mid-mission. They should get their own
 *       seat back, instantly, not be told the room is full of themselves.
 *    3. A DIFFERENT PERSON on the same machine, in another tab, which is how
 *       almost everybody tests a multiplayer build before a demo.
 *
 *  Without an identity the server could only guess, and it guessed wrong in
 *  the most visible way: after a refresh your own seat was still held by your
 *  dead socket, so rejoining reported the station as already occupied.
 *
 *  This is the smallest thing that fixes it. Every visitor is handed a
 *  throwaway id the moment they land on the site. No sign-up, no password, no
 *  account, nothing to administer, and nothing personal: it is random bytes
 *  and a callsign, and it ceases to exist when the tab closes.
 * ===========================================================================
 *
 * WHY SESSION STORAGE, NOT LOCAL STORAGE. This is the one decision in the
 * module worth arguing about, and it is load-bearing.
 *
 * `sessionStorage` is per TAB and survives a reload. `localStorage` is per
 * BROWSER and survives everything.
 *
 * Per-browser sounds better until you watch somebody test. Two tabs side by
 * side is how this gets demonstrated, and under `localStorage` both tabs
 * would carry the same id — so the server would treat the second tab as the
 * first one reconnecting and hand it the same seat, kicking the first. One
 * player, playing against themselves, unable to see why.
 *
 * Per-tab gives the right answer to all three questions above: a reload keeps
 * your seat, a second tab is a second crew member, and closing the tab throws
 * the identity away, which is what "temporary" should mean.
 */

/** How the identity was obtained, for the diagnostics line in the lobby. */
export type IdentitySource = 'session' | 'memory'

export interface PlayerIdentity {
  /** Opaque, random, and meaningless outside this session. */
  playerId: string
  /** Short readable name, so a roster and a chat line can say who is who. */
  callsign: string
  source: IdentitySource
}

const KEY = 'crimson-exodus:player:v1'

/** Unambiguous in a callsign read aloud over a demo table: no O/0, no I/1. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  const crypto = globalThis.crypto
  if (crypto?.getRandomValues) crypto.getRandomValues(buf)
  // `Math.random` is not a security boundary and is not being used as one:
  // this id authorises nothing. It only has to be unlikely to collide.
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomCallsign(): string {
  let out = ''
  const buf = new Uint8Array(3)
  const crypto = globalThis.crypto
  if (crypto?.getRandomValues) crypto.getRandomValues(buf)
  else for (let i = 0; i < 3; i++) buf[i] = Math.floor(Math.random() * 256)
  for (let i = 0; i < 3; i++) out += ALPHABET[buf[i] % ALPHABET.length]
  return `CREW-${out}`
}

/** Shape check on anything read back out of storage. */
export function parseIdentity(raw: string | null): Omit<PlayerIdentity, 'source'> | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    const playerId = typeof record.playerId === 'string' ? record.playerId : ''
    const callsign = typeof record.callsign === 'string' ? record.callsign : ''
    if (!/^crew_[0-9a-f]{24}$/.test(playerId)) return null
    if (!/^CREW-[A-Z0-9]{3}$/.test(callsign)) return null
    return { playerId, callsign }
  } catch {
    return null
  }
}

export function freshIdentity(): Omit<PlayerIdentity, 'source'> {
  return { playerId: `crew_${randomHex(12)}`, callsign: randomCallsign() }
}

let cached: PlayerIdentity | null = null

/**
 * This browser tab's identity, creating one on the first call.
 *
 * Never throws. Private browsing, blocked site data and a server-side render
 * all end with a usable in-memory identity rather than an exception, because
 * nothing about this is important enough to break a page over.
 */
export function playerIdentity(): PlayerIdentity {
  if (cached) return cached

  let stored: Omit<PlayerIdentity, 'source'> | null = null
  let source: IdentitySource = 'memory'
  try {
    stored = parseIdentity(sessionStorage.getItem(KEY))
    if (!stored) {
      stored = freshIdentity()
      sessionStorage.setItem(KEY, JSON.stringify(stored))
    }
    source = 'session'
  } catch {
    // Storage is unavailable. The identity still works for this page view;
    // it simply will not survive a reload.
    stored = stored ?? freshIdentity()
    source = 'memory'
  }

  cached = { ...stored, source }
  return cached
}

/**
 * Throw this identity away and take a new one.
 *
 * Only for the player who deliberately wants to be a different crew member in
 * the same tab. Reconnecting must NOT call this — the whole point of the id
 * is that it survives a reconnect.
 */
export function resetIdentity(): PlayerIdentity {
  cached = null
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
  return playerIdentity()
}
