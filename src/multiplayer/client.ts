import { create } from 'zustand'
import {
  MULTIPLAYER_PROTOCOL, ROOM_CAPACITY, normalizeRoomCode, resolveMultiplayerEndpoint,
  sameConnectionIntent, type ClientMessage, type ConnectionIntent, type CrewMessage, type MissionSnapshot, type MultiplayerRole,
  type CrewPose, type OpsCommand, type OpsCommandKind, type RosterEntry, type ServerMessage,
} from './protocol'
import { playerIdentity } from '../state/identity'
import { debugGlobalsEnabled, type DebugGlobalTarget } from '../state/debugGlobals'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'error'

interface MultiplayerState {
  status: ConnectionStatus
  endpoint: string | null
  roomCode: string | null
  role: MultiplayerRole | null
  peerConnected: boolean
  latencyMs: number | null
  error: string | null
  snapshot: MissionSnapshot | null
  history: CrewMessage[]
  commands: OpsCommand[]
  poses: Partial<Record<'ev' | 'ev2', CrewPose>>
  /** Everyone in the room, including you. */
  roster: RosterEntry[]
  capacity: number
  /** This tab's throwaway callsign, shown so a player knows who they are. */
  callsign: string
  resumableEvRoom: string | null
  resumableEv2Room: string | null
  resumableHabcomRoom: string | null
  createMission: () => void
  resumeMission: () => void
  resumeEv2: () => void
  resumeHabcom: () => void
  joinMission: (code: string, role?: 'ev2' | 'habcom') => void
  leaveMission: () => void
  publishSnapshot: (snapshot: MissionSnapshot) => void
  publishPose: (pose: CrewPose) => void
  sendCommand: (kind: OpsCommandKind, note?: string) => void
  acknowledgeCommand: (commandId: string, accepted: boolean) => void
  sendChat: (text: string) => void
}

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {}
const resolved = typeof window === 'undefined'
  ? null
  : resolveMultiplayerEndpoint(env.VITE_MULTIPLAYER_URL, window.location, document)
const endpoint = resolved && 'url' in resolved ? resolved.url : null
/** Why there is no endpoint, phrased as something the operator can fix. */
const endpointProblem = resolved && !('url' in resolved) ? resolved.message : null
let socket: WebSocket | null = null
let intent: ConnectionIntent | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let closedByUser = false
let pingTimer: ReturnType<typeof setInterval> | null = null
let generation = 0

const storageKey = (role: MultiplayerRole) => `crimson-exodus:multiplayer:${role}`

function savedSession(role: MultiplayerRole): { roomCode: string; resumeToken: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(role)) ?? 'null') as unknown
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    const roomCode = normalizeRoomCode(String(record.roomCode ?? ''))
    const resumeToken = String(record.resumeToken ?? '')
    return roomCode.length === 6 && resumeToken ? { roomCode, resumeToken } : null
  } catch { return null }
}

function remember(role: MultiplayerRole, roomCode: string, resumeToken: string) {
  sessionStorage.setItem(storageKey(role), JSON.stringify({ roomCode, resumeToken }))
}

function clearTimers() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (pingTimer) clearInterval(pingTimer)
  reconnectTimer = null
  pingTimer = null
}

function transmit(message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function connect(nextIntent: ConnectionIntent) {
  // React does not repaint the disabled button until after the current event
  // turn. A double click (or Enter followed by a click) can therefore call
  // joinMission twice while the first socket is still opening. Do not replace
  // an in-flight/active connection with an identical one: the first socket may
  // already own the role on the server, making the replacement look like a
  // different HABCOM client and producing a false ROLE_TAKEN error.
  if (
    socket
    && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
    && sameConnectionIntent(intent, nextIntent)
  ) return

  const thisGeneration = ++generation
  intent = nextIntent
  closedByUser = false
  clearTimers()
  if (!endpoint) {
    useMultiplayer.setState({ status: 'unavailable', error: endpointProblem })
    return
  }
  socket?.close()
  useMultiplayer.setState({ status: reconnectAttempt ? 'reconnecting' : 'connecting', endpoint, error: null })
  const ws = new WebSocket(endpoint)
  socket = ws

  ws.addEventListener('open', () => {
    const current = intent
    if (!current) return
    // The identity goes with every attempt, including reconnects. It is what
    // lets the room hand this tab its own seat back instead of reporting the
    // station as occupied by the socket that just died.
    const { playerId, callsign } = playerIdentity()
    if (current.mode === 'create') {
      transmit({ type: 'create', protocol: MULTIPLAYER_PROTOCOL, playerId, callsign })
    } else {
      transmit({
        type: 'join', protocol: MULTIPLAYER_PROTOCOL, roomCode: current.roomCode,
        role: current.role, playerId, callsign, resumeToken: current.resumeToken,
      })
    }
    pingTimer = setInterval(() => transmit({ type: 'ping', at: Date.now() }), 20_000)
  })

  ws.addEventListener('message', (event) => {
    let message: ServerMessage
    try { message = JSON.parse(String(event.data)) as ServerMessage } catch { return }
    const state = useMultiplayer.getState()
    if (message.type === 'joined') {
      reconnectAttempt = 0
      intent = { mode: 'join', roomCode: message.roomCode, role: message.role, resumeToken: message.resumeToken }
      remember(message.role, message.roomCode, message.resumeToken)
      useMultiplayer.setState({
        status: 'connected', roomCode: message.roomCode, role: message.role,
        peerConnected: message.peerConnected, snapshot: message.snapshot,
        history: message.history, commands: message.commands, error: null,
        poses: message.poses ?? {},
        roster: message.roster ?? [], capacity: message.capacity ?? ROOM_CAPACITY,
        callsign: message.callsign || state.callsign,
        resumableEvRoom: message.role === 'ev' ? message.roomCode : state.resumableEvRoom,
        resumableEv2Room: message.role === 'ev2' ? message.roomCode : state.resumableEv2Room,
        resumableHabcomRoom: message.role === 'habcom' ? message.roomCode : state.resumableHabcomRoom,
      })
    } else if (message.type === 'roster') {
      /**
       * The roster is authoritative for "is anybody else here".
       *
       * The old `peer` message could not answer that once a room could hold
       * more than two: when one of three HABCOM clients dropped, every other
       * client was told a peer disconnected and EV-1 would show itself as
       * alone while two people were still watching.
       */
      const roster = message.roster ?? []
      const poses = { ...state.poses }
      if (!roster.some((entry) => entry.role === 'ev')) delete poses.ev
      if (!roster.some((entry) => entry.role === 'ev2')) delete poses.ev2
      useMultiplayer.setState({
        roster,
        poses,
        capacity: message.capacity ?? state.capacity,
        peerConnected: roster.filter((entry) => !entry.you).length > 0,
      })
    } else if (message.type === 'peer') {
      // Kept for older servers that send no roster.
      if (!state.roster.length && message.role !== state.role) {
        useMultiplayer.setState({ peerConnected: message.connected })
      }
    } else if (message.type === 'snapshot') {
      useMultiplayer.setState({ snapshot: message.snapshot })
    } else if (message.type === 'pose') {
      useMultiplayer.setState({ poses: { ...state.poses, [message.role]: message.pose } })
    } else if (message.type === 'command') {
      const commands = [...state.commands.filter((item) => item.id !== message.command.id), message.command]
      useMultiplayer.setState({ commands })
    } else if (message.type === 'command_ack') {
      useMultiplayer.setState({ commands: state.commands.map((item) => item.id === message.commandId
        ? { ...item, status: message.accepted ? 'accepted' : 'declined' }
        : item) })
    } else if (message.type === 'chat') {
      useMultiplayer.setState({ history: [...state.history, message.message].slice(-60) })
    } else if (message.type === 'pong') {
      useMultiplayer.setState({ latencyMs: Math.max(0, Date.now() - message.at) })
    } else if (message.type === 'error') {
      useMultiplayer.setState({ status: message.retryable ? state.status : 'error', error: message.message })
    }
  })

  ws.addEventListener('close', () => {
    if (thisGeneration !== generation) return
    clearTimers()
    if (socket === ws) socket = null
    if (closedByUser || !intent) return
    reconnectAttempt += 1
    useMultiplayer.setState({ status: 'reconnecting', peerConnected: false })
    const delay = Math.min(15_000, 500 * 2 ** Math.min(reconnectAttempt, 5))
    reconnectTimer = setTimeout(() => { if (intent) connect(intent) }, delay)
  })

  ws.addEventListener('error', () => {
    useMultiplayer.setState({ error: 'The realtime link could not be established.' })
  })
}

export const useMultiplayer = create<MultiplayerState>((set, get) => ({
  status: endpoint ? 'idle' : 'unavailable',
  endpoint,
  roomCode: null,
  role: null,
  peerConnected: false,
  latencyMs: null,
  // Stated up front, not held back until somebody clicks. A lobby that says
  // "unavailable" and nothing else sends the operator to the source.
  error: endpointProblem,
  snapshot: null,
  history: [],
  commands: [],
  poses: {},
  roster: [],
  capacity: ROOM_CAPACITY,
  callsign: typeof window === 'undefined' ? '' : playerIdentity().callsign,
  resumableEvRoom: typeof window === 'undefined' ? null : savedSession('ev')?.roomCode ?? null,
  resumableEv2Room: typeof window === 'undefined' ? null : savedSession('ev2')?.roomCode ?? null,
  resumableHabcomRoom: typeof window === 'undefined' ? null : savedSession('habcom')?.roomCode ?? null,

  createMission: () => connect({ mode: 'create' }),
  resumeMission: () => {
    const saved = savedSession('ev')
    if (!saved) { set({ resumableEvRoom: null, error: 'No EV-1 session is available in this browser tab.' }); return }
    connect({ mode: 'join', roomCode: saved.roomCode, role: 'ev', resumeToken: saved.resumeToken })
  },
  resumeEv2: () => {
    const saved = savedSession('ev2')
    if (!saved) { set({ resumableEv2Room: null, error: 'No EV-2 session is available in this browser tab.' }); return }
    connect({ mode: 'join', roomCode: saved.roomCode, role: 'ev2', resumeToken: saved.resumeToken })
  },
  resumeHabcom: () => {
    const saved = savedSession('habcom')
    if (!saved) { set({ resumableHabcomRoom: null, error: 'No HABCOM session is available in this browser tab.' }); return }
    connect({ mode: 'join', roomCode: saved.roomCode, role: 'habcom', resumeToken: saved.resumeToken })
  },
  joinMission: (code, role = 'habcom') => {
    const roomCode = normalizeRoomCode(code)
    if (roomCode.length !== 6) { set({ error: 'Enter the complete six-character mission code.' }); return }
    const saved = savedSession(role)
    connect({ mode: 'join', roomCode, role, resumeToken: saved?.roomCode === roomCode ? saved.resumeToken : undefined })
  },
  leaveMission: () => {
    const role = get().role
    closedByUser = true
    generation += 1
    intent = null
    clearTimers()
    transmit({ type: 'leave' })
    socket?.close(1000, 'Crew member left')
    socket = null
    if (role) sessionStorage.removeItem(storageKey(role))
    reconnectAttempt = 0
    set({
      status: endpoint ? 'idle' : 'unavailable', roomCode: null, role: null,
      peerConnected: false, latencyMs: null, error: null, snapshot: null,
      history: [], commands: [], roster: [], poses: {},
      resumableEvRoom: role === 'ev' ? null : get().resumableEvRoom,
      resumableEv2Room: role === 'ev2' ? null : get().resumableEv2Room,
      resumableHabcomRoom: role === 'habcom' ? null : get().resumableHabcomRoom,
    })
  },
  publishSnapshot: (snapshot) => transmit({ type: 'snapshot', snapshot }),
  publishPose: (pose) => transmit({ type: 'pose', pose }),
  sendCommand: (kind, note = '') => transmit({ type: 'command', kind, note }),
  acknowledgeCommand: (commandId, accepted) => {
    transmit({ type: 'command_ack', commandId, accepted })
    set({ commands: get().commands.map((item) => item.id === commandId
      ? { ...item, status: accepted ? 'accepted' : 'declined' }
      : item) })
  },
  sendChat: (text) => transmit({ type: 'chat', text: text.slice(0, 240) }),
}))

/**
 * Browser automation can drive the crew link: create a room, join one, read
 * the roster. Opt-in through the same flag the mission store uses, so an
 * ordinary session publishes nothing.
 */
if (typeof window !== 'undefined' && debugGlobalsEnabled(import.meta.env)) {
  ;(window as unknown as DebugGlobalTarget).__mp = useMultiplayer
}
