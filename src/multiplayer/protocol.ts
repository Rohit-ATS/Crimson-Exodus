export const MULTIPLAYER_PROTOCOL = 1 as const

/**
 * How many people can be in one mission room.
 *
 * One EV-1, because exactly one person drives Jack and publishes telemetry,
 * and up to three at HABCOM — a flight director and two others watching the
 * same feed. Four is the number a small team actually demos with.
 */
export const ROOM_CAPACITY = 4
export const ROLE_CAPACITY: Record<MultiplayerRole, number> = { ev: 1, habcom: 3 }

export type MultiplayerRole = 'ev' | 'habcom'
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
    }
  | { type: 'peer'; role: MultiplayerRole; connected: boolean }
  | { type: 'roster'; roster: RosterEntry[]; capacity: number }
  | { type: 'snapshot'; snapshot: MissionSnapshot }
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

export function multiplayerEndpoint(envValue: string | undefined, location: Location): string | null {
  const configured = envValue?.trim()
  if (configured) {
    try {
      const url = new URL(configured)
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null
      return url.toString()
    } catch {
      return null
    }
  }

  // Render serves the static build and socket from the same paid Web Service.
  // Local development gets the same zero-configuration behaviour. GitHub Pages
  // must provide VITE_MULTIPLAYER_URL because it has no backend of its own.
  if (location.hostname.endsWith('.onrender.com') || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}/ws`
  }
  return null
}
