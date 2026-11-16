import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { PROTOCOL, ROOM_CAPACITY, ROOM_CODE_RE, RoomRegistry, validatePose, validateSnapshot } from './rooms.mjs'
import { originAllowed as checkOrigin, parseAllowedOrigins } from './origin.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'dist')
const port = Number(process.env.PORT) || 10000
const registry = new RoomRegistry()
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
const tokenGrants = new Map()

const MIME = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
}

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://trek.nasa.gov https://flagcdn.com; connect-src 'self' https://api.deepgram.com wss:; media-src 'self'; manifest-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self), payment=(), usb=()',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

function json(res, status, body) {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function deepgramToken(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
  if (!originAllowed(req.headers.origin, req.headers.host)) return json(res, 403, { error: 'Origin is not allowed' })
  const address = req.socket.remoteAddress ?? 'unknown'
  const now = Date.now()
  const grants = (tokenGrants.get(address) ?? []).filter((time) => now - time < 60_000)
  if (grants.length >= 10) return json(res, 429, { error: 'Token grant rate limit exceeded' })
  grants.push(now)
  tokenGrants.set(address, grants)
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) return json(res, 503, { error: 'DEEPGRAM_API_KEY is not configured on the server' })
  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: 60 }),
    })
    if (!response.ok) {
      // Keep the upstream body out of the public response, but preserve the
      // status in Render logs so a bad key or missing permission is diagnosable.
      console.error('Deepgram token grant rejected', response.status)
      const hint = response.status === 403
        ? ' The API key needs at least Member permissions.'
        : response.status === 401
          ? ' Check that DEEPGRAM_API_KEY is a valid API key.'
          : ''
      return json(res, 502, { error: `Deepgram token grant rejected (${response.status}).${hint}` })
    }
    const body = await response.json()
    if (!body.access_token) return json(res, 502, { error: 'token grant returned no access_token' })
    return json(res, 200, { access_token: body.access_token, expires_in: body.expires_in ?? 60 })
  } catch (error) {
    console.error('deepgram grant error', error)
    return json(res, 502, { error: 'token grant failed' })
  }
}

function staticResponse(req, res) {
  const requestPath = new URL(req.url ?? '/', 'http://localhost').pathname
  let relative
  try { relative = requestPath === '/' ? 'index.html' : decodeURIComponent(requestPath).replace(/^\/+/, '') }
  catch { return json(res, 400, { error: 'Malformed URL path' }) }
  relative = normalize(relative)
  let file = resolve(dist, relative)
  const missingAsset = /^\/assets(?:\/|$)/.test(requestPath)
  if (!file.startsWith(`${dist}/`) || !existsSync(file) || !statSync(file).isFile()) {
    // Do not turn a missing JavaScript/CSS chunk into index.html. Browsers then
    // reject the response as text/html, and an old tab cannot recover its lazy
    // screen. Unknown app routes still receive the SPA shell.
    if (missingAsset) {
      res.writeHead(404, {
        ...securityHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      return res.end('Asset not found')
    }
    file = join(dist, 'index.html')
  }
  if (!existsSync(file)) return json(res, 503, { error: 'Frontend build is missing. Run npm run build before starting.' })
  const immutable = file.includes(`${join(dist, 'assets')}/`)
  const headers = {
    ...securityHeaders,
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  }

  /**
   * Tell the page that this host has a crew link.
   *
   * A browser cannot work out by itself whether the site it loaded from has a
   * WebSocket server behind it. Guessing wrong is bad in both directions: a
   * static host would dial a socket that cannot exist, and a custom domain in
   * front of a real server would refuse to dial one that does.
   *
   * So the server says. Only this process serves this marker, and only this
   * process has the socket — GitHub Pages serves the same `index.html` from
   * the repository build and stamps nothing, so it still correctly reports
   * that it needs to be told where the server is.
   */
  if (file.endsWith('index.html')) {
    const html = readFileSync(file, 'utf8')
      .replace('</head>', `<meta name="crew-link" content="/ws">\n  </head>`)
    const body = Buffer.from(html, 'utf8')
    res.writeHead(200, { ...headers, 'Content-Length': body.byteLength })
    if (req.method === 'HEAD') return res.end()
    return res.end(body)
  }

  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (path === '/health') return json(res, 200, { ok: true, protocol: PROTOCOL, rooms: registry.rooms.size })
  if (path === '/api/deepgram-token') return deepgramToken(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' })
  return staticResponse(req, res)
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

/** See server/origin.mjs — same-origin always, plus the ALLOWED_ORIGINS list. */
function originAllowed(origin, requestHost) {
  return checkOrigin(origin, requestHost, allowedOrigins)
}

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (path !== '/ws' || !originAllowed(req.headers.origin, req.headers.host)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

function broadcast(room, message, except = null) {
  for (const client of room.clients.values()) if (client !== except) send(client.connection, message)
}

function fail(ws, code, message, retryable = false) {
  send(ws, { type: 'error', code, message, retryable })
}

/**
 * Tell everyone who is in the room.
 *
 * Each client gets its own copy, because each needs its own entry flagged as
 * `you` — a roster that cannot show you yourself is a list of strangers.
 */
function announceRoster(room) {
  for (const client of room.clients.values()) {
    send(client.connection, {
      type: 'roster',
      roster: registry.occupants(room, client),
      capacity: ROOM_CAPACITY,
    })
  }
}

function limiter() {
  let tokens = 40
  let updated = Date.now()
  return () => {
    const now = Date.now()
    tokens = Math.min(40, tokens + (now - updated) * 0.02)
    updated = now
    if (tokens < 1) return false
    tokens -= 1
    return true
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  const allowMessage = limiter()
  let attached = null
  let lastSnapshotAt = 0
  let lastPoseAt = 0

  const join = (message) => {
    if (attached) return fail(ws, 'ALREADY_JOINED', 'This connection already belongs to a mission.')
    if (message.protocol !== PROTOCOL) return fail(ws, 'PROTOCOL_MISMATCH', 'Client and server versions do not match.')
    // The identity is whatever the browser minted for this tab. It
    // authorises nothing — it only lets the room tell a reconnect from a
    // newcomer, which is the difference between "welcome back" and "the
    // station is already occupied".
    const identity = { playerId: message.playerId, callsign: message.callsign, resumeToken: message.resumeToken }
    try {
      attached = message.type === 'create'
        ? registry.create(ws, identity)
        : registry.join(String(message.roomCode ?? '').toUpperCase(), message.role, ws, identity)
      const { room, client } = attached
      send(ws, {
        type: 'joined', protocol: PROTOCOL, roomCode: room.code, role: client.role,
        clientId: client.id, playerId: client.playerId ?? '', callsign: client.callsign,
        resumeToken: client.token, peerConnected: registry.peerConnected(room, client.role),
        roster: registry.occupants(room, client), capacity: ROOM_CAPACITY,
        snapshot: room.snapshot, history: room.history, commands: room.commands, poses: room.poses,
        flags: room.flags ?? [],
      })
      broadcast(room, { type: 'peer', role: client.role, connected: true }, client)
      announceRoster(room)
    } catch (error) {
      fail(ws, error.code ?? 'JOIN_FAILED', error.message ?? 'Unable to join mission.')
    }
  }

  ws.on('message', (data, isBinary) => {
    if (isBinary || !allowMessage()) return fail(ws, 'RATE_LIMIT', 'Too many messages.', true)
    let message
    try { message = JSON.parse(data.toString()) } catch { return fail(ws, 'BAD_JSON', 'Message is not valid JSON.') }
    if (!message || typeof message.type !== 'string') return fail(ws, 'BAD_MESSAGE', 'Message type is missing.')
    if (message.type === 'create' || message.type === 'join') return join(message)
    if (message.type === 'ping') return send(ws, { type: 'pong', at: Number(message.at) || Date.now() })
    if (!attached) return fail(ws, 'NOT_JOINED', 'Join a mission before sending data.')
    const { room, client } = attached

    if (message.type === 'snapshot') {
      if (client.role !== 'ev') return fail(ws, 'FORBIDDEN', 'Only EV-1 can publish mission telemetry.')
      const now = Date.now()
      if (now - lastSnapshotAt < 150) return
      lastSnapshotAt = now
      const snapshot = validateSnapshot(message.snapshot)
      if (!snapshot) return fail(ws, 'BAD_SNAPSHOT', 'Telemetry snapshot was rejected.')
      room.snapshot = snapshot
      broadcast(room, { type: 'snapshot', snapshot }, client)
      return
    }
    if (message.type === 'pose') {
      if (client.role !== 'ev' && client.role !== 'ev2') return fail(ws, 'FORBIDDEN', 'Only surface crew can publish a pose.')
      const now = Date.now()
      if (now - lastPoseAt < 75) return
      lastPoseAt = now
      const pose = validatePose(message.pose)
      if (!pose) return fail(ws, 'BAD_POSE', 'Crew pose was rejected.')
      const previous = room.poses[client.role]
      if (previous) {
        const elapsed = Math.max(0.075, (pose.sentAt - previous.sentAt) / 1000)
        const distance = Math.hypot(pose.x - previous.x, pose.z - previous.z)
        if (distance > 45 * elapsed + 8) return fail(ws, 'POSE_SPEED', 'Crew movement exceeded the safety envelope.', true)
      }
      room.poses[client.role] = pose
      broadcast(room, { type: 'pose', role: client.role, pose }, client)
      return
    }
    if (message.type === 'command') {
      if (client.role !== 'habcom') return fail(ws, 'FORBIDDEN', 'Only HABCOM can issue operational recommendations.')
      const command = registry.addCommand(room, message.kind, message.note)
      if (!command) return fail(ws, 'BAD_COMMAND', 'Unknown operational recommendation.')
      broadcast(room, { type: 'command', command })
      return
    }
    if (message.type === 'command_ack') {
      if (client.role !== 'ev') return fail(ws, 'FORBIDDEN', 'Only EV-1 can acknowledge a recommendation.')
      const command = registry.acknowledge(room, String(message.commandId ?? ''), !!message.accepted)
      if (!command) return fail(ws, 'COMMAND_CLOSED', 'Recommendation is missing or already closed.')
      broadcast(room, { type: 'command_ack', commandId: command.id, accepted: command.status === 'accepted' })
      return
    }
    if (message.type === 'chat') {
      const chat = registry.addChat(room, client.role, message.text)
      if (!chat) return fail(ws, 'BAD_CHAT', 'Message is empty.')
      broadcast(room, { type: 'chat', message: chat })
      return
    }
    if (message.type === 'flag_plant') {
      if (client.role !== 'ev' && client.role !== 'ev2') return fail(ws, 'FORBIDDEN', 'Only surface crew can plant flags.')
      const code = typeof message.code === 'string' ? message.code.slice(0, 10).toLowerCase() : ''
      const name = typeof message.name === 'string' ? message.name.slice(0, 50) : code
      const x = Number.isFinite(message.x) ? Math.max(-1180, Math.min(1180, message.x)) : 0
      const z = Number.isFinite(message.z) ? Math.max(-1180, Math.min(1180, message.z)) : 0
      if (!code) return fail(ws, 'BAD_FLAG', 'Flag code is required.')
      const flag = { code, name, x, z }
      if (!room.flags) room.flags = []
      if (!room.flags.some((f) => f.code === flag.code && Math.hypot(f.x - flag.x, f.z - flag.z) < 0.5)) {
        room.flags.push(flag)
      }
      broadcast(room, { type: 'flag_plant', flag, by: client.role })
      const chat = registry.addChat(room, client.role, `Emplaced commemorative flag: ${name}`)
      if (chat) broadcast(room, { type: 'chat', message: chat })
      return
    }
    if (message.type === 'leave') ws.close(1000, 'Crew member left')
    else fail(ws, 'BAD_MESSAGE', 'Unknown message type.')
  })

  ws.on('close', () => {
    if (!attached) return
    registry.detach(attached.room, attached.client)
    if (attached.client.role === 'ev' || attached.client.role === 'ev2') delete attached.room.poses[attached.client.role]
    broadcast(attached.room, { type: 'peer', role: attached.client.role, connected: false })
    announceRoster(attached.room)
  })
})

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue }
    ws.isAlive = false
    ws.ping()
  }
  registry.sweep()
  const cutoff = Date.now() - 60_000
  for (const [address, grants] of tokenGrants) {
    const recent = grants.filter((time) => time >= cutoff)
    if (recent.length) tokenGrants.set(address, recent)
    else tokenGrants.delete(address)
  }
}, 25_000)
heartbeat.unref()

server.listen(port, '0.0.0.0', () => {
  console.log(`Crimson Exodus multiplayer listening on 0.0.0.0:${port}`)
})

// Render replaces instances during deploys. Tell connected clients to use
// their reconnect path, stop accepting new work, and never hold shutdown open
// past Render's grace window.
let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received; draining multiplayer connections`)
  clearInterval(heartbeat)
  for (const ws of wss.clients) ws.close(1012, 'Service restarting')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
