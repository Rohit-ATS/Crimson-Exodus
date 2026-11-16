/**
 * voice.ts — MERV's voice and ears.
 *
 * ===========================================================================
 *  THREE TIERS, AND THE LOWEST ONE IS NOT A FALLBACK — IT IS THE DEFAULT.
 *
 *  tier 'local'    No credentials, no network. MERV answers from the sourced
 *                  knowledge base in `knowledge.ts` and the live telemetry in
 *                  `brain.ts`, and speaks through the browser's own
 *                  SpeechSynthesis engine, which runs on the device. This is
 *                  what a judge gets when they open the deployed link, and it
 *                  is a complete experience on its own.
 *
 *  tier 'grounded' Deepgram listen + Deepgram speak. Your voice goes to
 *                  Deepgram's speech-to-text, the ANSWER still comes from this
 *                  project's own brain, and Deepgram's text-to-speech reads it
 *                  back. Natural speech in and out; every fact still sourced
 *                  and still checkable. For a science outreach piece this is
 *                  usually the right tier, not the one below it.
 *
 *  tier 'agent'    Deepgram's Voice Agent API: their speech-to-text, a hosted
 *                  language model, and their text-to-speech, over one
 *                  WebSocket. MERV gains open-ended conversation and loses the
 *                  guarantee that every number traces to a citation — so the
 *                  live telemetry is injected into the system prompt and the
 *                  model is given client-side functions that call back into
 *                  this simulation, which keeps it honest about the things
 *                  that matter and lets it be a person about everything else.
 *
 *  Tier selection is automatic and degrades silently downward. A failed token
 *  fetch, a refused microphone, a dropped socket — all of them end with a
 *  working rover, because the thing in the middle of this project is a Mars
 *  survival guide and it cannot depend on somebody's API quota.
 * ===========================================================================
 *
 * Credentials. Deepgram is reached from the browser, so the key cannot simply
 * be pasted into the bundle: anything in a `VITE_` variable is readable by
 * anyone who opens the deployed site. The supported paths, in order:
 *
 *   1. VITE_DEEPGRAM_TOKEN_URL — an endpoint you host that mints a
 *      short-lived Deepgram token from a server-side secret. Two
 *      implementations ship with this repo, for Netlify and Vercel. This is
 *      the only one that is safe on a public deployment.
 *   2. VITE_DEEPGRAM_API_KEY — the raw key, baked into the bundle. Convenient
 *      for `npm run dev` on your own machine. The module logs a warning and
 *      refuses to use it when the page is not on localhost.
 *
 * Browsers cannot set an Authorization header on a WebSocket, so Deepgram's
 * documented workaround is used: the credential is passed as the second
 * WebSocket subprotocol, after the literal string "token".
 */

/** Which capability tier is actually running. */
export type VoiceTier = 'local' | 'grounded' | 'agent'

export interface VoiceConfig {
  /** Tier the operator asked for. 'auto' takes the best one available. */
  want: 'auto' | VoiceTier
  tokenUrl: string | null
  apiKey: string | null
  /** Deepgram Aura voice for text-to-speech. */
  voice: string
  /** Voice Agent language-model provider and model. */
  thinkProvider: string
  thinkModel: string
  /** Speech-to-text model. */
  listenModel: string
}

interface ViteEnv {
  DEV?: boolean
  VITE_DEEPGRAM_TOKEN_URL?: string
  VITE_DEEPGRAM_API_KEY?: string
  VITE_ROVER_MODE?: string
  VITE_ROVER_VOICE?: string
  VITE_ROVER_THINK_PROVIDER?: string
  VITE_ROVER_THINK_MODEL?: string
  VITE_ROVER_LISTEN_MODEL?: string
}

const DG_AGENT = 'wss://agent.deepgram.com/v1/agent/converse'
const DG_LISTEN = 'wss://api.deepgram.com/v1/listen'
const DG_SPEAK = 'https://api.deepgram.com/v1/speak'

/** Output rate requested from Deepgram, Hz. Aura's native rate. */
const OUT_RATE = 24000

export function readConfig(env: ViteEnv): VoiceConfig {
  const want = (env.VITE_ROVER_MODE ?? 'auto').trim().toLowerCase()
  return {
    want: want === 'local' || want === 'grounded' || want === 'agent' ? want : 'auto',
    tokenUrl: env.VITE_DEEPGRAM_TOKEN_URL?.trim() || null,
    apiKey: env.VITE_DEEPGRAM_API_KEY?.trim() || null,
    voice: env.VITE_ROVER_VOICE?.trim() || 'aura-2-orion-en',
    // Deepgram hosts this one, so a Deepgram key is the only credential
    // needed — no second provider account, no second secret to leak.
    thinkProvider: env.VITE_ROVER_THINK_PROVIDER?.trim() || 'anthropic',
    thinkModel: env.VITE_ROVER_THINK_MODEL?.trim() || 'claude-haiku-4-5',
    listenModel: env.VITE_ROVER_LISTEN_MODEL?.trim() || 'nova-3',
  }
}

/**
 * The configuration this build was started with.
 *
 * `readConfig` takes a plain object so it can be unit-tested without a
 * bundler; this is the one place that actually reaches for Vite's env, which
 * keeps `import.meta` out of every other module that needs the settings.
 */
export function envConfig(): VoiceConfig {
  return readConfig((import.meta as unknown as { env?: Record<string, string> }).env ?? {})
}

/** True when a raw bundled key is acceptable: local development only. */
export function rawKeyAllowed(hostname: string, dev: boolean): boolean {
  if (!dev) return false
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Highest tier the configuration can actually reach.
 *
 * Note the deliberate asymmetry: 'agent' is never chosen automatically. It
 * spends money on every spoken word and hands the microphone to a hosted
 * language model, and neither of those should happen because somebody ran
 * `npm run dev`. Ask for it explicitly with VITE_ROVER_MODE=agent.
 */
export function resolveTier(cfg: VoiceConfig, hasCredential: boolean): VoiceTier {
  if (cfg.want === 'local') return 'local'
  if (!hasCredential) return 'local'
  if (cfg.want === 'agent') return 'agent'
  if (cfg.want === 'grounded') return 'grounded'
  return 'grounded'
}

// ---------------------------------------------------------------------------
//  Credentials
// ---------------------------------------------------------------------------

export interface Credential {
  value: string
  /** How it was obtained, for the diagnostics line in the comms panel. */
  kind: 'token' | 'raw-key'
  /** Epoch ms after which it should be re-fetched. Infinity for a raw key. */
  expiresAt: number
}

let cached: Credential | null = null

/**
 * Get a usable credential, or null.
 *
 * A short-lived token is re-fetched when it is within thirty seconds of
 * expiry, because a token that expires mid-sentence is worse than one that
 * was never issued.
 */
export async function credential(
  cfg: VoiceConfig,
  opts: { hostname: string; dev: boolean; fetchImpl?: typeof fetch },
): Promise<Credential | null> {
  if (cached && cached.expiresAt - Date.now() > 30_000) return cached

  if (cfg.tokenUrl) {
    try {
      const f = opts.fetchImpl ?? fetch
      const res = await f(cfg.tokenUrl, { method: 'POST' })
      if (!res.ok) throw new Error(`token endpoint returned ${res.status}`)
      const body = (await res.json()) as { access_token?: string; key?: string; expires_in?: number }
      const value = body.access_token ?? body.key
      if (!value) throw new Error('token endpoint returned no token')
      cached = {
        value,
        kind: 'token',
        expiresAt: Date.now() + (body.expires_in ?? 30) * 1000,
      }
      return cached
    } catch (err) {
      console.warn('[MERV] token endpoint unavailable, staying on the local tier:', err)
      // Fall through: a raw key may still be configured for development.
    }
  }

  if (cfg.apiKey) {
    if (!rawKeyAllowed(opts.hostname, opts.dev)) {
      console.warn(
        '[MERV] VITE_DEEPGRAM_API_KEY is set but this page is not localhost. ' +
        'A key in a VITE_ variable is readable by every visitor, so it is being ignored. ' +
        'Use VITE_DEEPGRAM_TOKEN_URL with the serverless function in this repo instead.',
      )
      return null
    }
    cached = { value: cfg.apiKey, kind: 'raw-key', expiresAt: Infinity }
    return cached
  }

  return null
}

/** Drop the cached credential — used when a socket closes on an auth error. */
export function forgetCredential(): void {
  cached = null
}

// ---------------------------------------------------------------------------
//  Speaking
// ---------------------------------------------------------------------------

/**
 * Plays queued PCM through one AudioContext with a running playhead.
 *
 * Deepgram streams raw audio in many small frames. Handing each one to a fresh
 * AudioBufferSourceNode at `currentTime` produces audible seams, so each frame
 * is scheduled at the end of the previous one and the playhead is only reset
 * when it has fallen behind.
 */
export class PcmPlayer {
  private ctx: AudioContext | null = null
  private head = 0
  private gain: GainNode | null = null
  private live = new Set<AudioBufferSourceNode>()
  private rate: number

  // Written as an ordinary field rather than a parameter property so this
  // module stays importable by Node's type-stripping test runner, which is
  // what lets the credential rules below be unit-tested without a browser.
  constructor(rate = OUT_RATE) {
    this.rate = rate
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.gain = this.ctx.createGain()
      this.gain.gain.value = 1
      this.gain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Seconds of audio still queued ahead of the playhead. */
  get pending(): number {
    if (!this.ctx) return 0
    return Math.max(0, this.head - this.ctx.currentTime)
  }

  push(int16: Int16Array): void {
    const ctx = this.ensure()
    if (!int16.length) return
    const buf = ctx.createBuffer(1, int16.length, this.rate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 0x8000
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.gain!)
    // A small lead keeps the first frame from being scheduled in the past.
    const start = Math.max(ctx.currentTime + 0.04, this.head)
    src.start(start)
    this.head = start + buf.duration
    this.live.add(src)
    src.onended = () => this.live.delete(src)
  }

  /** Stop immediately — used when the player interrupts MERV mid-sentence. */
  stop(): void {
    for (const s of this.live) {
      try { s.stop() } catch { /* already finished */ }
    }
    this.live.clear()
    this.head = this.ctx?.currentTime ?? 0
  }

  close(): void {
    this.stop()
    try { void this.ctx?.close() } catch { /* nothing to do */ }
    this.ctx = null
    this.gain = null
  }
}

/**
 * Speak one line with the device's own synthesiser.
 *
 * This is the 'local' tier's voice. It costs nothing, needs no key, works
 * offline and never sends the text anywhere — the engine is part of the
 * browser. The voices are less pleasant than Aura's and that is an acceptable
 * trade for a companion that always talks.
 */
export function speakLocally(
  text: string,
  opts: { onStart?: () => void; onEnd?: () => void } = {},
): () => void {
  const synth = window.speechSynthesis
  if (!synth) { opts.onEnd?.(); return () => {} }
  try {
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    // Slightly low and slightly slow: it has to be intelligible over a HUD.
    u.rate = 0.98
    u.pitch = 0.82
    // Prefer a local (on-device) English voice so nothing is sent to a server.
    const voices = synth.getVoices()
    const local = voices.find((v) => v.localService && /^en/i.test(v.lang))
    if (local) u.voice = local
    u.onstart = () => opts.onStart?.()
    u.onend = () => opts.onEnd?.()
    u.onerror = () => opts.onEnd?.()
    synth.speak(u)
    return () => { try { synth.cancel() } catch { /* ignore */ } }
  } catch {
    opts.onEnd?.()
    return () => {}
  }
}

/**
 * Deepgram text-to-speech, one line at a time, over plain HTTP.
 *
 * The streaming speak socket would start sooner, but a REST call per line is
 * far easier to reason about and the lines MERV says are short. Returns the
 * decoded PCM so the caller can queue it on the same player the agent uses.
 */
export async function speakDeepgram(
  text: string,
  cred: Credential,
  cfg: VoiceConfig,
  signal?: AbortSignal,
): Promise<Int16Array> {
  const url = `${DG_SPEAK}?model=${encodeURIComponent(cfg.voice)}&encoding=linear16&sample_rate=${OUT_RATE}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(cred),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!res.ok) throw new Error(`Deepgram speak failed: ${res.status}`)
  const bytes = await res.arrayBuffer()
  // linear16 is little-endian signed PCM; the platform is too, on everything
  // this app runs on, so the view is free.
  return new Int16Array(bytes, 0, Math.floor(bytes.byteLength / 2))
}

// ---------------------------------------------------------------------------
//  Listening
// ---------------------------------------------------------------------------

export interface MicStream {
  /** Int16 PCM frames at `rate`. */
  onPcm: (cb: (pcm: Int16Array, peak: number) => void) => void
  rate: number
  mute: (muted: boolean) => void
  close: () => void
}

/**
 * Open the microphone.
 *
 * Throws on refusal, which is a normal outcome and handled by the caller: a
 * refused microphone drops MERV to typed input, not to broken.
 */
export async function openMic(): Promise<MicStream> {
  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctor()
  if (ctx.state === 'suspended') await ctx.resume()
  // Served from our own origin, so `script-src 'self'` is satisfied.
  await ctx.audioWorklet.addModule('rover-mic-worklet.js')
  const node = new AudioWorkletNode(ctx, 'rover-mic')
  const src = ctx.createMediaStreamSource(media)
  src.connect(node)
  // The worklet produces no output; connecting it to a silent gain keeps it
  // scheduled on browsers that cull nodes with no downstream path.
  const sink = ctx.createGain()
  sink.gain.value = 0
  node.connect(sink).connect(ctx.destination)

  let cb: ((pcm: Int16Array, peak: number) => void) | null = null
  node.port.onmessage = (e: MessageEvent) => {
    const d = e.data as { pcm?: ArrayBuffer; peak?: number }
    if (d.pcm && cb) cb(new Int16Array(d.pcm), d.peak ?? 0)
  }

  return {
    rate: ctx.sampleRate,
    onPcm: (fn) => { cb = fn },
    mute: (muted) => node.port.postMessage({ muted }),
    close: () => {
      cb = null
      try { node.disconnect() } catch { /* ignore */ }
      try { src.disconnect() } catch { /* ignore */ }
      for (const t of media.getTracks()) t.stop()
      try { void ctx.close() } catch { /* ignore */ }
    },
  }
}

/**
 * The HTTP Authorization header for a credential.
 *
 * A raw API key uses Deepgram's own `Token` scheme; a short-lived JWT from
 * /v1/auth/grant is a bearer token. Sending the wrong one is a 401 with a
 * misleading message, so it is derived from how the credential was obtained
 * rather than guessed at the call site.
 */
export function authHeader(cred: Credential): string {
  return cred.kind === 'token' ? `Bearer ${cred.value}` : `Token ${cred.value}`
}

/**
 * Subprotocol list for a browser WebSocket handshake.
 *
 * Browsers forbid custom headers on a WebSocket handshake, so Deepgram's
 * documented workaround is to pass the credential as the second subprotocol
 * after a scheme name. For an API key that scheme is `token`, which is
 * documented. For a short-lived JWT it is `bearer` by analogy with the HTTP
 * header — Deepgram's own page on the subprotocol does not cover the JWT case,
 * so `attempt` lets the caller retry with the other scheme rather than
 * stranding a correctly configured deployment on an undocumented detail.
 */
export function subprotocols(cred: Credential, attempt = 0): string[] {
  const schemes = cred.kind === 'token' ? ['bearer', 'token'] : ['token', 'bearer']
  return [schemes[attempt % 2], cred.value]
}

function dgSocket(url: string, cred: Credential, attempt = 0): WebSocket {
  return new WebSocket(url, subprotocols(cred, attempt))
}

/** A close that looks like the handshake itself was refused. */
function handshakeFailure(code: number, sinceOpenMs: number): boolean {
  // 1002 protocol error, 1006 abnormal close, 1008 policy violation. Only
  // treated as a handshake problem if it happened before anything worked.
  return sinceOpenMs < 2500 && (code === 1002 || code === 1006 || code === 1008)
}

export interface Transcriber {
  /** Feed one microphone frame. */
  send: (pcm: Int16Array) => void
  /** Ask Deepgram to finalise what it has. */
  finish: () => void
  close: () => void
}

/**
 * Streaming speech-to-text for the 'grounded' tier.
 *
 * `onFinal` fires with each completed utterance. Interim results go to
 * `onInterim` so the panel can show words appearing as they are spoken, which
 * is most of what makes a voice interface feel like it is working.
 */
export function transcribe(
  cred: Credential,
  cfg: VoiceConfig,
  rate: number,
  handlers: {
    onOpen?: () => void
    onInterim?: (text: string) => void
    onFinal?: (text: string) => void
    onError?: (e: string) => void
    onClose?: () => void
  },
): Transcriber {
  const q = new URLSearchParams({
    model: cfg.listenModel,
    language: 'en-US',
    encoding: 'linear16',
    sample_rate: String(rate),
    channels: '1',
    punctuate: 'true',
    smart_format: 'true',
    interim_results: 'true',
    // Close the utterance after a short silence rather than waiting for the
    // button to come up, so a question gets answered the moment it ends.
    endpointing: '320',
  })
  const pending: Int16Array[] = []
  const started = Date.now()
  let everWorked = false
  let attempt = 0
  let ws = dgSocket(`${DG_LISTEN}?${q}`, cred, attempt)

  /**
   * Handlers are function DECLARATIONS, not const arrows.
   *
   * `bind` runs immediately on the line below, and a `const` handler declared
   * after it would still be in its temporal dead zone — which threw
   * "Cannot access 'onMessage' before initialization" and took the whole
   * speech-to-text path down silently, because the caller's catch treated it
   * as a missing microphone. Declarations hoist; these must.
   */
  function onMessage(e: MessageEvent): void {
    everWorked = true
    handleListen(e)
  }

  function bind(sock: WebSocket): void {
    sock.onopen = () => {
      for (const p of pending) sock.send(p)
      pending.length = 0
      handlers.onOpen?.()
    }
    sock.onmessage = onMessage
    sock.onerror = () => { /* the close handler decides what this means */ }
    sock.onclose = (ev) => {
      if (!everWorked && attempt === 0 && handshakeFailure(ev.code, Date.now() - started)) {
        // Almost certainly the credential scheme. Try the other one once.
        attempt = 1
        ws = dgSocket(`${DG_LISTEN}?${q}`, cred, attempt)
        bind(ws)
        return
      }
      if (!everWorked) handlers.onError?.('speech-to-text link refused')
      handlers.onClose?.()
    }
  }

  bind(ws)

  /**
   * Deepgram finalises in two stages, and conflating them asks the same
   * question twice.
   *
   * `is_final` closes a SEGMENT — a long question produces several. The
   * utterance is only over at `speech_final`, when the endpointer has heard
   * enough silence. Submitting on either one meant a two-sentence question
   * arrived as two separate questions and got two unrelated answers.
   *
   * So segments accumulate here and are submitted once, on `speech_final` or
   * when the player releases the key, whichever comes first.
   */
  let segments: string[] = []

  function flush(): void {
    const whole = segments.join(' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '')
    segments = []
    if (whole) handlers.onFinal?.(whole)
  }

  function handleListen(e: MessageEvent): void {
    if (typeof e.data !== 'string') return
    try {
      const msg = JSON.parse(e.data) as {
        type?: string
        is_final?: boolean
        speech_final?: boolean
        channel?: { alternatives?: Array<{ transcript?: string }> }
      }
      const text = msg.channel?.alternatives?.[0]?.transcript?.replace(/^\s+|\s+$/g, '')
      if (!text) {
        // An empty speech_final still ends the utterance.
        if (msg.speech_final) flush()
        return
      }
      if (msg.is_final) {
        segments.push(text)
        if (msg.speech_final) flush()
      } else if (msg.speech_final) {
        segments.push(text)
        flush()
      } else {
        // Show the segments already closed plus the words still arriving.
        handlers.onInterim?.([...segments, text].join(' '))
      }
    } catch { /* a frame we do not understand is not worth failing over */ }
  }
  return {
    send: (pcm) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm)
      // Buffer the first frames: the button is usually pressed before the
      // socket finishes its handshake, and those frames are the question.
      else if (ws.readyState === WebSocket.CONNECTING && pending.length < 64) pending.push(pcm.slice(0))
    },
    finish: () => {
      // Submit whatever has been finalised so far. Releasing the key is the
      // player saying they are done; waiting for Deepgram's endpointer after
      // that just adds latency to an answer they have already asked for.
      flush()
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }))
    },
    close: () => { try { ws.close() } catch { /* ignore */ } },
  }
}

// ---------------------------------------------------------------------------
//  The Voice Agent
// ---------------------------------------------------------------------------

/** A function the hosted model may call back into the simulation with. */
export interface AgentFunction {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface AgentHandlers {
  onOpen?: () => void
  onReady?: () => void
  onUserText?: (text: string) => void
  onAgentText?: (text: string) => void
  onUserStarted?: () => void
  onThinking?: () => void
  onSpeakStart?: () => void
  onAudio?: (pcm: Int16Array) => void
  onAudioDone?: () => void
  /** Return the result the model should see. Resolved value is JSON-encoded. */
  onFunction?: (name: string, args: Record<string, unknown>) => Promise<unknown>
  onError?: (e: string) => void
  onClose?: (code: number) => void
}

export interface AgentSession {
  send: (pcm: Int16Array) => void
  /** Push fresh telemetry into the model's system prompt mid-conversation. */
  updatePrompt: (prompt: string) => void
  /** Make MERV say something the player did not ask for. */
  inject: (message: string, behavior?: 'default' | 'queue' | 'interrupt') => void
  close: () => void
  readonly ready: boolean
}

/**
 * Open a Voice Agent session.
 *
 * The `Settings` message has to be sent before any audio and the agent ignores
 * everything until it acknowledges it, so frames captured during the handshake
 * are queued and flushed on `SettingsApplied`.
 */
export function openAgent(
  cred: Credential,
  cfg: VoiceConfig,
  opts: {
    micRate: number
    prompt: string
    greeting: string
    functions: AgentFunction[]
  },
  h: AgentHandlers,
): AgentSession {
  let ready = false
  let attempt = 0
  let everReady = false
  const openedAt = Date.now()
  const queued: Int16Array[] = []
  let keepAlive: ReturnType<typeof setInterval> | null = null
  let ws = dgSocket(DG_AGENT, cred, attempt)
  ws.binaryType = 'arraybuffer'

  const settings = {
    type: 'Settings',
    audio: {
      input: { encoding: 'linear16', sample_rate: opts.micRate },
      output: { encoding: 'linear16', sample_rate: OUT_RATE, container: 'none' },
    },
    agent: {
      listen: {
        provider: {
          type: 'deepgram',
          model: cfg.listenModel,
          language: 'en-US',
          smart_format: true,
          // Terms the model must not mishear. A transcript that says "Jazeera"
          // instead of "Jezero" produces a confidently wrong answer.
          keyterms: [
            'Jezero', 'MERV', 'Perseverance', 'regolith', 'perchlorate',
            'sol', 'tau', 'Armstrong limit', 'scrubber', 'EVA', 'MOXIE',
          ],
        },
      },
      think: {
        provider: {
          type: cfg.thinkProvider,
          model: cfg.thinkModel,
          temperature: 0.4,
        },
        prompt: opts.prompt,
        functions: opts.functions,
      },
      speak: { provider: { type: 'deepgram', model: cfg.voice } },
      greeting: opts.greeting,
    },
  }

  function bind(): void {
    ws.binaryType = 'arraybuffer'
    ws.onopen = onOpen
    ws.onmessage = onMessage
    ws.onerror = () => { if (everReady) h.onError?.('voice agent link failed') }
    ws.onclose = onClose
  }

  function onOpen(): void {
    ws.send(JSON.stringify(settings))
    h.onOpen?.()
    // The socket is closed by the server if it goes quiet, and MERV is quiet
    // for most of an EVA.
    if (keepAlive) clearInterval(keepAlive)
    keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
    }, 8000)
  }

  /**
   * A function DECLARATION, for the same reason as in `transcribe` above:
   * `bind` references it, and a `const` arrow declared further down would
   * still be in its temporal dead zone when `bind` first runs. That threw
   * "Cannot access 'onMessage' before initialization", and because the caller
   * treats any failure here as "agent unavailable", it degraded silently to
   * the offline tier instead of reporting a broken socket.
   */
  async function onMessage(e: MessageEvent): Promise<void> {
    // Binary frames are MERV's voice.
    if (e.data instanceof ArrayBuffer) {
      h.onAudio?.(new Int16Array(e.data, 0, Math.floor(e.data.byteLength / 2)))
      return
    }
    if (typeof e.data !== 'string') return
    let msg: Record<string, unknown>
    try { msg = JSON.parse(e.data) } catch { return }

    switch (msg.type) {
      case 'SettingsApplied':
        ready = true
        everReady = true
        for (const p of queued) ws.send(p)
        queued.length = 0
        h.onReady?.()
        break
      case 'ConversationText': {
        const role = msg.role as string
        const content = (msg.content as string) ?? ''
        if (role === 'user') h.onUserText?.(content)
        else h.onAgentText?.(content)
        break
      }
      case 'UserStartedSpeaking': h.onUserStarted?.(); break
      case 'AgentThinking': h.onThinking?.(); break
      case 'AgentStartedSpeaking': h.onSpeakStart?.(); break
      case 'AgentAudioDone': h.onAudioDone?.(); break
      case 'FunctionCallRequest': {
        // Deepgram sends an array of calls; each needs its own response with
        // the matching id or the model stalls waiting for it.
        const calls = (msg.functions as Array<{ id: string; name: string; arguments?: string; client_side?: boolean }>) ?? []
        for (const c of calls) {
          if (c.client_side === false) continue
          let args: Record<string, unknown> = {}
          try { args = c.arguments ? JSON.parse(c.arguments) : {} } catch { /* empty args */ }
          let content = '{}'
          try {
            content = JSON.stringify(await h.onFunction?.(c.name, args) ?? {})
          } catch (err) {
            content = JSON.stringify({ error: String(err) })
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'FunctionCallResponse', id: c.id, name: c.name, content }))
          }
        }
        break
      }
      case 'Warning':
        console.warn('[MERV] agent warning:', msg.description)
        break
      case 'Error':
        h.onError?.(String(msg.description ?? 'agent error'))
        break
      default: break
    }
  }

  bind()

  function onClose(ev: CloseEvent): void {
    if (keepAlive) clearInterval(keepAlive)
    keepAlive = null
    ready = false
    // The credential scheme for a short-lived token is not documented for the
    // WebSocket handshake, so one retry with the other scheme is attempted
    // before giving up on an otherwise correct configuration.
    if (!everReady && attempt === 0 && handshakeFailure(ev.code, Date.now() - openedAt)) {
      attempt = 1
      ws = dgSocket(DG_AGENT, cred, attempt)
      bind()
      return
    }
    h.onClose?.(ev.code)
  }

  return {
    get ready() { return ready },
    send: (pcm) => {
      if (ready && ws.readyState === WebSocket.OPEN) ws.send(pcm)
      else if (queued.length < 128) queued.push(pcm.slice(0))
    },
    updatePrompt: (prompt) => {
      if (ready && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'UpdatePrompt', prompt }))
      }
    },
    inject: (message, behavior = 'queue') => {
      if (ready && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'InjectAgentMessage', message, behavior }))
      }
    },
    close: () => {
      if (keepAlive) clearInterval(keepAlive)
      try { ws.close() } catch { /* ignore */ }
    },
  }
}
