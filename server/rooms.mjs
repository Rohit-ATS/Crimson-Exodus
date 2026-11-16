import { randomBytes } from 'node:crypto'

export const PROTOCOL = 2
export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/

/**
 * Room capacity.
 *
 * One authoritative EV-1, one independently controlled EV-2, and up to three
 * at HABCOM watching the same feed. These must stay in step with ROOM_CAPACITY and
 * ROLE_CAPACITY in src/multiplayer/protocol.ts; a test asserts that they do.
 */
export const ROOM_CAPACITY = 5
export const ROLE_CAPACITY = { ev: 1, ev2: 1, habcom: 3 }
export const PLAYER_ID_RE = /^crew_[0-9a-f]{24}$/
export const CALLSIGN_RE = /^CREW-[A-Z0-9]{3}$/
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_TTL_MS = 30 * 60 * 1000
const MAX_HISTORY = 60
const MAX_COMMANDS = 30
const MAX_ROOMS = 1000

const id = (prefix) => `${prefix}_${randomBytes(8).toString('hex')}`

/**
 * A readable name for a client that did not bring one.
 *
 * Nobody should appear in a roster as an opaque id, and a client whose
 * storage is blocked still deserves to be distinguishable from the others.
 */
function autoCallsign(room, role) {
  const taken = new Set([...room.clients.values()].map((client) => client.callsign))
  const stem = role === 'ev' ? 'E1' : role === 'ev2' ? 'E2' : 'HB'
  for (let n = 1; n < 100; n += 1) {
    const candidate = `CREW-${stem}${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `CREW-${stem}`
}

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
    flag: raw.flag && typeof raw.flag === 'object'
      ? {
        code: shortText(raw.flag.code, 10),
        name: shortText(raw.flag.name, 50),
        x: finite(raw.flag.x, -1180, 1180),
        z: finite(raw.flag.z, -1180, 1180),
      }
      : null,
    ...(Array.isArray(raw.flags) ? {
      flags: raw.flags.slice(0, 30).map((f) => ({
        code: shortText(f.code, 10),
        name: shortText(f.name, 50),
        x: finite(f.x, -1180, 1180),
        z: finite(f.z, -1180, 1180),
      })).filter((f) => f.code),
    } : {}),
    outcome,
  }
}

export function validatePose(raw) {
  if (!raw || typeof raw !== 'object') return null
  const pose = {
    x: finite(raw.x, -1180, 1180),
    z: finite(raw.z, -1180, 1180),
    heading: finite(raw.heading, -Math.PI * 4, Math.PI * 4),
    speedMs: finite(raw.speedMs, 0, 40),
    moving: finite(raw.moving, 0, 1),
    stride: finite(raw.stride, -1e6, 1e6),
    sentAt: Date.now(),
  }
  if (raw.rover && typeof raw.rover === 'object') {
    pose.rover = {
      x: finite(raw.rover.x, -1180, 1180),
      z: finite(raw.rover.z, -1180, 1180),
      heading: finite(raw.rover.heading, -Math.PI * 4, Math.PI * 4),
      speedMs: finite(raw.rover.speedMs, 0, 40),
      moving: finite(raw.rover.moving, 0, 1),
    }
  }
  return pose
}

/**
 * Normalise whatever the browser sent as an identity.
 *
 * Both fields are optional on the wire: an older client, or one whose
 * storage is blocked, simply joins without an id and is treated as a new
 * person every time — which is the behaviour this replaced, so it stays
 * correct rather than failing.
 */
export function readIdentity(raw = {}) {
  const playerId = typeof raw.playerId === 'string' && PLAYER_ID_RE.test(raw.playerId) ? raw.playerId : null
  const callsign = typeof raw.callsign === 'string' && CALLSIGN_RE.test(raw.callsign) ? raw.callsign : null
  return { playerId, callsign }
}

export class RoomRegistry {
  constructor() { this.rooms = new Map() }

  create(connection, options = {}) {
    this.sweep()
    if (this.rooms.size >= MAX_ROOMS) throw Object.assign(new Error('Mission room capacity reached. Try again shortly.'), { code: 'CAPACITY' })
    let code
    do code = roomCode(); while (this.rooms.has(code))
    const room = {
      code, createdAt: Date.now(), emptyAt: null, snapshot: null,
      clients: new Map(), tokens: new Map(), history: [], commands: [], poses: {}, flags: [],
    }
    this.rooms.set(code, room)
    return this.attach(room, 'ev', connection, options)
  }

  /**
   * Seat somebody in a room.
   *
   * `options` is `{ playerId, callsign, resumeToken }`. A bare string is
   * accepted as the resume token so older callers keep working.
   *
   * The order of these checks is the whole fix for the bug this replaced.
   * Before, any client already holding the role made the join fail — so your
   * OWN dead socket, still seated because its close event had not arrived
   * yet, reported the station as occupied when you refreshed. Now the first
   * question asked is "is this the same person coming back", and only after
   * that does capacity come into it.
   */
  join(code, role, connection, options = {}) {
    const opts = typeof options === 'string' ? { resumeToken: options } : (options ?? {})
    const { playerId, callsign } = readIdentity(opts)
    const resumeToken = typeof opts.resumeToken === 'string' ? opts.resumeToken : undefined

    if (!ROOM_CODE_RE.test(code)) throw Object.assign(new Error('Mission code must contain six letters or numbers.'), { code: 'ROOM_CODE_INVALID' })
    const room = this.rooms.get(code)
    if (!room) throw Object.assign(new Error('Mission room not found.'), { code: 'ROOM_NOT_FOUND' })
    if (!['ev', 'ev2', 'habcom'].includes(role)) throw Object.assign(new Error('Unsupported crew role.'), { code: 'ROLE_INVALID' })

    // 1. The same person, back again. Reclaim whichever seat they held — if
    //    they were EV-1 before a reload, they are still EV-1 now, whatever
    //    the lobby asked for.
    const mine = playerId
      ? [...room.clients.values()].find((client) => client.playerId === playerId)
      : null
    if (mine) {
      this.detach(room, mine)
      mine.connection.close(4001, 'Session resumed elsewhere')
      return this.attach(room, mine.role, connection, { playerId, callsign, token: mine.token })
    }

    /**
     * 2. A resume token. Kept for clients that bring no identity.
     *
     * The token identifies ONE CLIENT, not a role. That distinction did not
     * exist while a room held a single HABCOM — "the client with this role"
     * and "the client with this token" were the same person. With three
     * HABCOM seats they are not, and resuming evicted whichever HABCOM
     * happened to be first in the map: a different human, thrown out of the
     * mission by somebody else reloading their browser.
     */
    const tokenRole = room.tokens.get(resumeToken)
    if (resumeToken && tokenRole === role) {
      const holder = [...room.clients.values()].find((client) => client.token === resumeToken)
      if (holder) {
        // Release that seat synchronously. Waiting for the socket's own close
        // event leaves a window with two owners of one crew station.
        this.detach(room, holder)
        holder.connection.close(4001, 'Session resumed elsewhere')
        return this.attach(room, holder.role, connection, { playerId, callsign, token: resumeToken })
      }
      // The token is ours but its connection has already gone. There is no
      // seat to reclaim, so fall through: take a free one if the room has
      // one, and be refused if it does not. Never evict somebody else.
    }

    // 3. Somebody new. Is there room, and is there room at that station?
    if (room.clients.size >= ROOM_CAPACITY) {
      throw Object.assign(
        new Error(`Mission room is full (${ROOM_CAPACITY} crew).`),
        { code: 'ROOM_FULL' },
      )
    }
    const seated = [...room.clients.values()].filter((client) => client.role === role).length
    if (seated >= ROLE_CAPACITY[role]) {
      const station = role === 'ev' ? 'EV-1' : role === 'ev2' ? 'EV-2' : 'HABCOM'
      throw Object.assign(
        new Error(
          role === 'ev'
            ? 'EV-1 is already crewed. Join as EV-2 or HABCOM instead.'
            : role === 'ev2'
              ? 'EV-2 is already crewed. Join as HABCOM instead.'
              : `All ${ROLE_CAPACITY.habcom} ${station} positions are occupied.`,
        ),
        { code: 'ROLE_TAKEN' },
      )
    }
    return this.attach(room, role, connection, { playerId, callsign })
  }

  attach(room, role, connection, options = {}) {
    const token = options.token ?? id('resume')
    const client = {
      id: id('crew'),
      role,
      token,
      playerId: options.playerId ?? null,
      callsign: options.callsign ?? autoCallsign(room, role),
      connection,
      detached: false,
    }
    room.clients.set(client.id, client)
    room.tokens.set(token, role)
    room.emptyAt = null
    return { room, client }
  }

  /** Everyone currently in the room, in join order. */
  occupants(room, forClient = null) {
    return [...room.clients.values()].map((client) => ({
      clientId: client.id,
      role: client.role,
      callsign: client.callsign,
      ...(forClient && client.id === forClient.id ? { you: true } : {}),
    }))
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
