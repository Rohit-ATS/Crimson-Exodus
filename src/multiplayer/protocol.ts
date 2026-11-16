export const MULTIPLAYER_PROTOCOL = 2 as const

/**
 * How many people can be in one mission room.
 *
 * One authoritative EV-1, one independently controlled EV-2, and up to three
 * at HABCOM. EV-1 owns shared mission state; both surface clients stream only
 * compact transforms for the other astronaut.
 */
export const ROOM_CAPACITY = 5
export const ROLE_CAPACITY: Record<MultiplayerRole, number> = { ev: 1, ev2: 1, habcom: 3 }

export type MultiplayerRole = 'ev' | 'ev2' | 'habcom'
export type OpsCommandKind = 'go' | 'hold' | 'return'
export type ConnectionIntent =
  | { mode: 'create' }
  | { mode: 'join'; roomCode: string; role: MultiplayerRole; resumeToken?: string }

/** One person in the room, as everybody else sees them. */
export interface RosterEntry {
  clientId: string
  role: MultiplayerRole
  callsign: string
  /** True for the entry describing the recipient. */
  you?: boolean
}

/** A compact, untrusted transform streamed by either surface player. */
export interface CrewPose {
  x: number
  z: number
  heading: number
  speedMs: number
  moving: number
  stride: number
  sentAt: number
}

export interface MissionSnapshot {
  protocol: typeof MULTIPLAYER_PROTOCOL
  sentAt: number
  phase: 'title' | 'briefing' | 'planning' | 'surface' | 'debrief'
  route: { id: string; progress: number }
  mission: {
    evaSec: number
    timeScale: number
    paused: boolean
    activity: string
    procedure: string | null
    aborting: boolean
    sheltering: boolean
  }
  position: { x: number; z: number; heading: number; atLander: boolean }
  lifeSupport: {
    o2: number
    scrubber: number
    battery: number
    water: number
    limiting: string
    returnMarginMin: number
    reserveMarginMin: number
    returnStatus: string
  }
  environment: {
    weather: string
    headline: string
    dustOpacity: number
    visibilityM: number
    airTempC: number
    radiation: string | null
    doseMSv: number
  }
  science: {
    nearStation: string | null
    samples: number
    photos: number
    completedStations: number
    feedPackages: number
  }
  outcome: { success: boolean; title: string } | null
}

export interface OpsCommand {
  id: string
  kind: OpsCommandKind
  note: string
  sentAt: number
  status: 'pending' | 'accepted' | 'declined'
}

export interface CrewMessage {
  id: string
  from: MultiplayerRole | 'system'
  text: string
  sentAt: number
}

export type ClientMessage =
  | { type: 'create'; protocol: number; playerId?: string; callsign?: string; resumeToken?: string }
  | {
      type: 'join'
      protocol: number
      roomCode: string
      role: MultiplayerRole
      /** This tab's throwaway id. Lets the server recognise a reconnect. */
      playerId?: string
      callsign?: string
      resumeToken?: string
    }
  | { type: 'snapshot'; snapshot: MissionSnapshot }
  | { type: 'pose'; pose: CrewPose }
  | { type: 'command'; kind: OpsCommandKind; note: string }
  | { type: 'command_ack'; commandId: string; accepted: boolean }
  | { type: 'chat'; text: string }
  | { type: 'ping'; at: number }
  | { type: 'leave' }

export type ServerMessage =
  | {
      type: 'joined'
      protocol: number
      roomCode: string
      role: MultiplayerRole
      clientId: string
      /** Echoed back so the client can confirm the server understood it. */
      playerId: string
      callsign: string
      resumeToken: string
      peerConnected: boolean
      roster: RosterEntry[]
      capacity: number
      snapshot: MissionSnapshot | null
      history: CrewMessage[]
      commands: OpsCommand[]
      poses: Partial<Record<'ev' | 'ev2', CrewPose>>
    }
  | { type: 'peer'; role: MultiplayerRole; connected: boolean }
  | { type: 'roster'; roster: RosterEntry[]; capacity: number }
  | { type: 'snapshot'; snapshot: MissionSnapshot }
  | { type: 'pose'; role: 'ev' | 'ev2'; pose: CrewPose }
  | { type: 'command'; command: OpsCommand }
  | { type: 'command_ack'; commandId: string; accepted: boolean }
  | { type: 'chat'; message: CrewMessage }
  | { type: 'pong'; at: number }
  | { type: 'error'; code: string; message: string; retryable: boolean }

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export function sameConnectionIntent(current: ConnectionIntent | null, next: ConnectionIntent): boolean {
  if (!current || current.mode !== next.mode) return false
  if (current.mode === 'create' || next.mode === 'create') return true
  return current.roomCode === next.roomCode
    && current.role === next.role
    && current.resumeToken === next.resumeToken
}

/**
 * Why the crew link has no endpoint, in words a person can act on.
 *
 * The previous version returned `null` for three completely different
 * problems and the UI printed the same sentence for all of them: "set
 * VITE_MULTIPLAYER_URL". That sentence is wrong advice for two of the three,
 * and it was shown to somebody running on Render — where the variable should
 * not be needed at all — with no hint that their configured value had been
 * parsed and rejected.
 */
export type EndpointFailure =
  | { reason: 'unset'; message: string }
  | { reason: 'not-a-websocket-url'; configured: string; message: string }
  | { reason: 'unparseable'; configured: string; message: string }

export type EndpointResolution =
  | { url: string; source: 'configured' | 'same-origin' }
  | EndpointFailure

/** Literal accepted by VITE_MULTIPLAYER_URL for a host that serves both. */
export const SAME_ORIGIN = 'same-origin'

/**
 * The marker the multiplayer server stamps into the `index.html` it serves.
 *
 * A browser cannot tell whether the site it loaded from has a WebSocket
 * server behind it, and the hostname is a poor proxy: a custom domain in
 * front of the real server looks like a static host, and guessing wrong
 * refuses a socket that exists. The server knows, so the server says.
 */
export const CREW_LINK_META = 'crew-link'

/** Minimal shape of the document, so this stays testable without a browser. */
export interface MetaSource {
  querySelector(selectors: string): { getAttribute(name: string): string | null } | null
}

function markedPath(doc: MetaSource | null | undefined): string | null {
  if (!doc) return null
  try {
    const path = doc.querySelector(`meta[name="${CREW_LINK_META}"]`)?.getAttribute('content')
    // An absolute path on THIS origin, and nothing else. A scheme-relative
    // "//elsewhere/ws" also begins with a slash and would point the crew link
    // at another host entirely, so it is rejected explicitly.
    if (!path || !path.startsWith('/') || path.startsWith('//')) return null
    return path
  } catch {
    return null
  }
}

/**
 * Work out where the crew link lives, and say why when it cannot.
 *
 * Order: an explicit setting wins; otherwise a host known to serve the socket
 * from the same origin discovers itself. A static host with no backend —
 * GitHub Pages — must be told, because silently dialling a socket that cannot
 * exist produces a worse error than refusing to try.
 */
export function resolveMultiplayerEndpoint(
  envValue: string | undefined,
  location: Pick<Location, 'protocol' | 'hostname' | 'host'>,
  doc?: MetaSource | null,
): EndpointResolution {
  const sameOrigin = (path = '/ws') =>
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`

  const configured = envValue?.trim()
  if (configured) {
    if (configured === SAME_ORIGIN) return { url: sameOrigin(), source: 'same-origin' }
    let url: URL
    try {
      url = new URL(configured)
    } catch {
      return {
        reason: 'unparseable',
        configured,
        message: `VITE_MULTIPLAYER_URL is set to "${configured}", which is not a URL. It must look like wss://your-service.onrender.com/ws — or the word "${SAME_ORIGIN}" if this site and the socket are served by the same service.`,
      }
    }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return {
        reason: 'not-a-websocket-url',
        configured,
        message: `VITE_MULTIPLAYER_URL is set to "${configured}", but a crew link needs a WebSocket URL. Change ${url.protocol}// to ${url.protocol === 'http:' ? 'ws://' : 'wss://'} and make sure the path ends in /ws.`,
      }
    }
    return { url: url.toString(), source: 'configured' }
  }

  // The server that served this page says it has a socket. True for Render,
  // for a custom domain in front of it, and for anywhere else running
  // server/index.mjs — without anybody having to configure a thing.
  const marked = markedPath(doc)
  if (marked) return { url: sameOrigin(marked), source: 'same-origin' }

  // Fallbacks by name, for a build served by something other than our own
  // server: Render's own domain, and local development.
  if (
    location.hostname.endsWith('.onrender.com')
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1'
  ) {
    return { url: sameOrigin(), source: 'same-origin' }
  }

  return {
    reason: 'unset',
    message: `This site (${location.host}) has no multiplayer server of its own, and VITE_MULTIPLAYER_URL was not set when it was built. Rebuild with VITE_MULTIPLAYER_URL=wss://your-service.onrender.com/ws, or with "${SAME_ORIGIN}" if the same service also serves the socket. It is a build-time variable: setting it in a dashboard without rebuilding changes nothing.`,
  }
}

/** The endpoint, or null. Kept for callers that only need the URL. */
export function multiplayerEndpoint(
  envValue: string | undefined,
  location: Location,
  doc?: MetaSource | null,
): string | null {
  const resolved = resolveMultiplayerEndpoint(envValue, location, doc)
  return 'url' in resolved ? resolved.url : null
}
