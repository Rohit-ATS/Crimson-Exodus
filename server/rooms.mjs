import { randomBytes } from 'node:crypto'

export const PROTOCOL = 1
export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_TTL_MS = 30 * 60 * 1000
const MAX_HISTORY = 60
const MAX_COMMANDS = 30
const MAX_ROOMS = 1000

const id = (prefix) => `${prefix}_${randomBytes(8).toString('hex')}`

function roomCode() {
  let out = ''
  for (let i = 0; i < 6; i += 1) out += ALPHABET[randomBytes(1)[0] % ALPHABET.length]
  return out
}

function finite(value, min, max, fallback = 0) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

function shortText(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''
}

export function validateSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || raw.protocol !== PROTOCOL) return null
  const phase = ['title', 'briefing', 'planning', 'surface', 'debrief'].includes(raw.phase) ? raw.phase : null
  if (!phase) return null
  const life = raw.lifeSupport ?? {}
  const env = raw.environment ?? {}
  const science = raw.science ?? {}
  const mission = raw.mission ?? {}
  const position = raw.position ?? {}
  const route = raw.route ?? {}
  const outcome = raw.outcome && typeof raw.outcome === 'object'
    ? { success: !!raw.outcome.success, title: shortText(raw.outcome.title, 100) }
    : null
  return {
    protocol: PROTOCOL,
    sentAt: Date.now(),
    phase,
    route: { id: shortText(route.id, 40), progress: finite(route.progress, 0, 1) },
    mission: {
      evaSec: finite(mission.evaSec, 0, 7 * 24 * 3600),
      timeScale: finite(mission.timeScale, 0, 100, 1),
      paused: !!mission.paused,
      activity: shortText(mission.activity, 60),
      procedure: mission.procedure == null ? null : shortText(mission.procedure, 100),
      aborting: !!mission.aborting,
      sheltering: !!mission.sheltering,
    },
    position: {
      x: finite(position.x, -100000, 100000), z: finite(position.z, -100000, 100000),
      heading: finite(position.heading, -1000, 1000), atLander: !!position.atLander,
    },
    lifeSupport: {
      o2: finite(life.o2, 0, 1), scrubber: finite(life.scrubber, 0, 1),
      battery: finite(life.battery, 0, 1), water: finite(life.water, 0, 1),
      limiting: shortText(life.limiting, 30), returnMarginMin: finite(life.returnMarginMin, -10000, 10000),
      reserveMarginMin: finite(life.reserveMarginMin, -10000, 10000), returnStatus: shortText(life.returnStatus, 30),
    },
    environment: {
      weather: shortText(env.weather, 40), headline: shortText(env.headline, 100),
      dustOpacity: finite(env.dustOpacity, 0, 20), visibilityM: finite(env.visibilityM, 0, 100000),
      airTempC: finite(env.airTempC, -200, 100), radiation: env.radiation == null ? null : shortText(env.radiation, 60),
      doseMSv: finite(env.doseMSv, 0, 100000),
    },
    science: {
      nearStation: science.nearStation == null ? null : shortText(science.nearStation, 40),
      samples: Math.round(finite(science.samples, 0, 100)), photos: Math.round(finite(science.photos, 0, 10000)),
      completedStations: Math.round(finite(science.completedStations, 0, 100)),
      feedPackages: Math.round(finite(science.feedPackages, 0, 1000)),
    },
    outcome,
  }
}

export class RoomRegistry {
  constructor() { this.rooms = new Map() }

  create(connection) {
    this.sweep()
    if (this.rooms.size >= MAX_ROOMS) throw Object.assign(new Error('Mission room capacity reached. Try again shortly.'), { code: 'CAPACITY' })
    let code
    do code = roomCode(); while (this.rooms.has(code))
    const room = {
      code, createdAt: Date.now(), emptyAt: null, snapshot: null,
      clients: new Map(), tokens: new Map(), history: [], commands: [],
    }
    this.rooms.set(code, room)
    return this.attach(room, 'ev', connection)
  }

  join(code, role, connection, resumeToken) {
    if (!ROOM_CODE_RE.test(code)) throw Object.assign(new Error('Mission code must contain six letters or numbers.'), { code: 'ROOM_CODE_INVALID' })
    const room = this.rooms.get(code)
    if (!room) throw Object.assign(new Error('Mission room not found.'), { code: 'ROOM_NOT_FOUND' })
    if (!['ev', 'habcom'].includes(role)) throw Object.assign(new Error('Unsupported crew role.'), { code: 'ROLE_INVALID' })
    const existing = [...room.clients.values()].find((client) => client.role === role)
    const resumed = resumeToken && room.tokens.get(resumeToken) === role
    if (existing && !resumed) throw Object.assign(new Error(`${role === 'ev' ? 'EV-1' : 'HABCOM'} station is already occupied.`), { code: 'ROLE_TAKEN' })
    if (existing && resumed) {
      // Release the role synchronously. Waiting for the socket's asynchronous
      // close event leaves a brief window with two owners of one crew station.
      this.detach(room, existing)
      existing.connection.close(4001, 'Session resumed elsewhere')
    }
    return this.attach(room, role, connection, resumed ? resumeToken : undefined)
  }

  attach(room, role, connection, token = id('resume')) {
    const client = { id: id('crew'), role, token, connection, detached: false }
    room.clients.set(client.id, client)
    room.tokens.set(token, role)
    room.emptyAt = null
    return { room, client }
  }

  detach(room, client) {
    if (client.detached) return
    client.detached = true
    room.clients.delete(client.id)
    if (room.clients.size === 0) room.emptyAt = Date.now()
  }

  peerConnected(room, role) {
    return [...room.clients.values()].some((client) => client.role !== role)
  }

  clientByRole(room, role) {
    return [...room.clients.values()].find((client) => client.role === role) ?? null
  }

  addChat(room, role, text) {
    const clean = shortText(text, 240)
    if (!clean) return null
    const message = { id: id('msg'), from: role, text: clean, sentAt: Date.now() }
    room.history.push(message)
    room.history.splice(0, Math.max(0, room.history.length - MAX_HISTORY))
    return message
  }

  addCommand(room, kind, note) {
    if (!['go', 'hold', 'return'].includes(kind)) return null
    const command = { id: id('cmd'), kind, note: shortText(note, 160), sentAt: Date.now(), status: 'pending' }
    room.commands.push(command)
    room.commands.splice(0, Math.max(0, room.commands.length - MAX_COMMANDS))
    return command
  }

  acknowledge(room, commandId, accepted) {
    const command = room.commands.find((item) => item.id === commandId)
    if (!command || command.status !== 'pending') return null
    command.status = accepted ? 'accepted' : 'declined'
    return command
  }

  sweep(now = Date.now()) {
    for (const [code, room] of this.rooms) {
      if (room.emptyAt && now - room.emptyAt > ROOM_TTL_MS) this.rooms.delete(code)
    }
  }
}
