/**
 * rover-mic-worklet.js — Microphone capture for MERV's comms link.
 *
 * This is a real file served from the app's own origin rather than a Blob URL
 * built at runtime, and that is deliberate: the deployed Content-Security-Policy
 * is `script-src 'self'`, and an AudioWorklet module is fetched as a script.
 * A Blob worklet would be silently blocked in production and work fine in dev,
 * which is the worst possible failure mode.
 *
 * It does one job: take the float samples the audio graph gives it, convert
 * them to signed 16-bit little-endian PCM, and post them to the main thread in
 * chunks. No resampling — the connection declares whatever rate the
 * AudioContext is actually running at, so there is nothing to convert and
 * nothing to get wrong.
 */

/** Samples per message. At 48 kHz this is 40 ms, which keeps latency low. */
const CHUNK = 1920

class RoverMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Int16Array(CHUNK)
    this.n = 0
    this.muted = false
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.muted === 'boolean') this.muted = e.data.muted
    }
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true

    // Peak level, so the UI can show that the microphone is actually hearing
    // something. A push-to-talk button that gives no feedback is untestable by
    // the person using it.
    let peak = 0

    for (let i = 0; i < ch.length; i++) {
      const v = ch[i]
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
      // Clamp before scaling: a value outside [-1, 1] would wrap to the
      // opposite sign and arrive as a click.
      const c = v > 1 ? 1 : v < -1 ? -1 : v
      this.buf[this.n++] = c < 0 ? c * 0x8000 : c * 0x7fff

      if (this.n === CHUNK) {
        if (!this.muted) {
          // Copy, because the receiving side keeps it and we reuse this buffer.
          const out = this.buf.slice(0)
          this.port.postMessage({ pcm: out.buffer, peak }, [out.buffer])
        }
        this.n = 0
        peak = 0
      }
    }
    return true
  }
}

registerProcessor('rover-mic', RoverMicProcessor)
