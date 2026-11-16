import { create } from 'zustand'
import {
  MULTIPLAYER_PROTOCOL, multiplayerEndpoint, normalizeRoomCode,
  sameConnectionIntent, type ClientMessage, type ConnectionIntent, type CrewMessage, type MissionSnapshot, type MultiplayerRole,
  type OpsCommand, type OpsCommandKind, type ServerMessage,
} from './protocol'

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
  resumableEvRoom: string | null
  resumableHabcomRoom: string | null
  createMission: () => void
  resumeMission: () => void
  resumeHabcom: () => void
  joinMission: (code: string) => void
  leaveMission: () => void
  publishSnapshot: (snapshot: MissionSnapshot) => void
  sendCommand: (kind: OpsCommandKind, note?: string) => void
  acknowledgeCommand: (commandId: string, accepted: boolean) => void
  sendChat: (text: string) => void
}

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {}
const endpoint = typeof window === 'undefined' ? null : multiplayerEndpoint(env.VITE_MULTIPLAYER_URL, window.location)
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
    useMultiplayer.setState({
      status: 'unavailable',
      error: 'Multiplayer server is not configured for this deployment. Set VITE_MULTIPLAYER_URL to the Render wss:// endpoint.',
    })
    return
  }
  socket?.close()
  useMultiplayer.setState({ status: reconnectAttempt ? 'reconnecting' : 'connecting', endpoint, error: null })
  const ws = new WebSocket(endpoint)
  socket = ws

  ws.addEventListener('open', () => {
    const current = intent
    if (!current) return
    if (current.mode === 'create') {
      transmit({ type: 'create', protocol: MULTIPLAYER_PROTOCOL })
    } else {
      transmit({ type: 'join', protocol: MULTIPLAYER_PROTOCOL, roomCode: current.roomCode, role: current.role, resumeToken: current.resumeToken })
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
        resumableEvRoom: message.role === 'ev' ? message.roomCode : state.resumableEvRoom,
        resumableHabcomRoom: message.role === 'habcom' ? message.roomCode : state.resumableHabcomRoom,
      })
    } else if (message.type === 'peer') {
      if (message.role !== state.role) useMultiplayer.setState({ peerConnected: message.connected })
    } else if (message.type === 'snapshot') {
      useMultiplayer.setState({ snapshot: message.snapshot })
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
  error: null,
  snapshot: null,
  history: [],
  commands: [],
  resumableEvRoom: typeof window === 'undefined' ? null : savedSession('ev')?.roomCode ?? null,
  resumableHabcomRoom: typeof window === 'undefined' ? null : savedSession('habcom')?.roomCode ?? null,

  createMission: () => connect({ mode: 'create' }),
  resumeMission: () => {
    const saved = savedSession('ev')
    if (!saved) { set({ resumableEvRoom: null, error: 'No EV-1 session is available in this browser tab.' }); return }
    connect({ mode: 'join', roomCode: saved.roomCode, role: 'ev', resumeToken: saved.resumeToken })
  },
  resumeHabcom: () => {
    const saved = savedSession('habcom')
    if (!saved) { set({ resumableHabcomRoom: null, error: 'No HABCOM session is available in this browser tab.' }); return }
    connect({ mode: 'join', roomCode: saved.roomCode, role: 'habcom', resumeToken: saved.resumeToken })
  },
  joinMission: (code) => {
    const roomCode = normalizeRoomCode(code)
    if (roomCode.length !== 6) { set({ error: 'Enter the complete six-character mission code.' }); return }
    const saved = savedSession('habcom')
    connect({ mode: 'join', roomCode, role: 'habcom', resumeToken: saved?.roomCode === roomCode ? saved.resumeToken : undefined })
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
      history: [], commands: [],
      resumableEvRoom: role === 'ev' ? null : get().resumableEvRoom,
      resumableHabcomRoom: role === 'habcom' ? null : get().resumableHabcomRoom,
    })
  },
  publishSnapshot: (snapshot) => transmit({ type: 'snapshot', snapshot }),
  sendCommand: (kind, note = '') => transmit({ type: 'command', kind, note }),
  acknowledgeCommand: (commandId, accepted) => {
    transmit({ type: 'command_ack', commandId, accepted })
    set({ commands: get().commands.map((item) => item.id === commandId
      ? { ...item, status: accepted ? 'accepted' : 'declined' }
      : item) })
  },
  sendChat: (text) => transmit({ type: 'chat', text: text.slice(0, 240) }),
}))
