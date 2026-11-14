/**
 * audio.ts — Procedural sound, synthesised at runtime.
 *
 * No audio files are loaded. Everything here is Web Audio nodes, which keeps the
 * app offline-safe and means there is no third-party or generated asset to
 * disclose.
 *
 * WHAT IS GROUNDED
 * Perseverance carries the first working microphones ever landed on Mars, and
 * what they recorded changed what we know about sound there:
 *
 *  - Sound is QUIET. Acoustic intensity scales with air density, and Mars air is
 *    about 1% as dense as Earth's, so a given source is roughly 20 dB fainter.
 *  - Sound is SLOW. The speed of sound is about 240 m/s at typical surface
 *    temperatures, against 343 m/s on Earth, and it varies with temperature.
 *  - High frequencies DIE FAST. CO2 at low pressure absorbs sound strongly above
 *    a few kilohertz, so above ~2.4 kHz attenuation rises sharply and distant
 *    sources lose their treble entirely. SuperCam's team reported two distinct
 *    speeds of sound for high and low frequencies because of it.
 *
 * So the mix is modelled, not merely stylised: every emitter is low-passed hard,
 * the cutoff falls with distance and with air density, and the overall gain
 * tracks density. What you hear inside the helmet is deliberately louder than
 * what is outside it, because inside the suit you are in Earth-pressure air.
 *
 * Sources: NASA Mars 2020 SuperCam microphone results; NASA Mars facts.
 * https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/
 */

export interface AudioInputs {
  /** Ambient air density, kg/m^3 — sets how loud the outside world can be. */
  densityKgM3: number
  /** Speed of sound, m/s — displayed, and used for the delay on distant events. */
  speedOfSoundMs: number
  /** Sustained wind, m/s. */
  windMs: number
  /** Gust, m/s. */
  gustMs: number
  /** Dust optical depth; a storm is audibly busier against the helmet. */
  dustTau: number
  /** Jack's ground speed, m/s — drives footstep rate. */
  speedMs: number
  /** True while a tool is being used at a station. */
  working: boolean
  /** Which tool, for the work sound. */
  tool: string
  /** Suit electrical load, W — the fan and pump note rides on this. */
  electricalW: number
  /** Return-margin state, for the caution tone. */
  status: 'nominal' | 'caution' | 'warning' | 'critical'
}

/** Earth sea-level density, for the loudness ratio. */
const EARTH_DENSITY = 1.225

export class MarsAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private started = false
  private muted = false

  // Outside world, heard through the helmet.
  private windSrc: AudioBufferSourceNode | null = null
  private windGain: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null

  // Inside the suit: fan, pump, and the crew member breathing.
  private fanOsc: OscillatorNode | null = null
  private fanGain: GainNode | null = null
  private breathGain: GainNode | null = null
  private breathSrc: AudioBufferSourceNode | null = null
  private breathLfo: OscillatorNode | null = null
  private breathLfoGain: GainNode | null = null

  // Tool work.
  private workSrc: AudioBufferSourceNode | null = null
  private workGain: GainNode | null = null
  private workFilter: BiquadFilterNode | null = null

  private lastStepAt = 0
  private lastAlertAt = 0
  private lastStatus = 'nominal'

  get isMuted() { return this.muted }
  get isRunning() { return this.started && !!this.ctx && this.ctx.state === 'running' }

  /** Must be called from a user gesture; browsers refuse audio otherwise. */
  async start(): Promise<boolean> {
    if (this.started) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume()
      return this.isRunning
    }
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return false
      this.ctx = new Ctor()
      await this.ctx.resume()

      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.5
      this.master.connect(this.ctx.destination)

      this.buildWind()
      this.buildSuit()
      this.buildWork()

      this.started = true
      return this.isRunning
    } catch {
      this.ctx = null
      return false
    }
  }

  /** Pink-ish noise buffer, looped. */
  private noiseBuffer(seconds = 4): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      // Simple pink filter: more energy low down, which is what survives on Mars.
      b0 = 0.99765 * b0 + w * 0.0990460
      b1 = 0.96300 * b1 + w * 0.2965164
      b2 = 0.57000 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16
    }
    return buf
  }

  private buildWind() {
    const ctx = this.ctx!
    this.windSrc = ctx.createBufferSource()
    this.windSrc.buffer = this.noiseBuffer(6)
    this.windSrc.loop = true

    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'lowpass'
    this.windFilter.frequency.value = 400
    this.windFilter.Q.value = 0.6

    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0

    this.windSrc.connect(this.windFilter)
    this.windFilter.connect(this.windGain)
    this.windGain.connect(this.master!)
    this.windSrc.start()
  }

  private buildSuit() {
    const ctx = this.ctx!
    // Fan and pump: a low hum with a little harmonic character.
    this.fanOsc = ctx.createOscillator()
    this.fanOsc.type = 'sawtooth'
    this.fanOsc.frequency.value = 76

    const fanFilter = ctx.createBiquadFilter()
    fanFilter.type = 'lowpass'
    fanFilter.frequency.value = 220
    fanFilter.Q.value = 2.2

    this.fanGain = ctx.createGain()
    this.fanGain.gain.value = 0.05

    this.fanOsc.connect(fanFilter)
    fanFilter.connect(this.fanGain)
    this.fanGain.connect(this.master!)
    this.fanOsc.start()

    // Breathing: filtered noise, amplitude-modulated by a slow LFO.
    this.breathSrc = ctx.createBufferSource()
    this.breathSrc.buffer = this.noiseBuffer(5)
    this.breathSrc.loop = true

    const breathFilter = ctx.createBiquadFilter()
    breathFilter.type = 'bandpass'
    breathFilter.frequency.value = 520
    breathFilter.Q.value = 0.8

    this.breathGain = ctx.createGain()
    this.breathGain.gain.value = 0.0

    this.breathLfo = ctx.createOscillator()
    this.breathLfo.type = 'sine'
    this.breathLfo.frequency.value = 0.26 // ~16 breaths a minute at rest
    this.breathLfoGain = ctx.createGain()
    this.breathLfoGain.gain.value = 0.03

    this.breathLfo.connect(this.breathLfoGain)
    this.breathLfoGain.connect(this.breathGain.gain)

    this.breathSrc.connect(breathFilter)
    breathFilter.connect(this.breathGain)
    this.breathGain.connect(this.master!)
    this.breathSrc.start()
    this.breathLfo.start()
  }

  private buildWork() {
    const ctx = this.ctx!
    this.workSrc = ctx.createBufferSource()
    this.workSrc.buffer = this.noiseBuffer(3)
    this.workSrc.loop = true

    this.workFilter = ctx.createBiquadFilter()
    this.workFilter.type = 'bandpass'
    this.workFilter.frequency.value = 1400
    this.workFilter.Q.value = 1.1

    this.workGain = ctx.createGain()
    this.workGain.gain.value = 0

    this.workSrc.connect(this.workFilter)
    this.workFilter.connect(this.workGain)
    this.workGain.connect(this.master!)
    this.workSrc.start()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.06)
    }
  }

  /** Called from the sim loop. All values are the modelled ones. */
  update(i: AudioInputs, dtRealSec: number) {
    if (!this.isRunning || !this.ctx) return
    const t = this.ctx.currentTime
    const ease = (p: AudioParam, v: number, tau = 0.25) => p.setTargetAtTime(v, t, tau)

    // --- How loud can the outside world be? -------------------------------
    // Intensity scales with density. 1% of Earth's density is about -20 dB.
    const densityRatio = Math.max(1e-4, i.densityKgM3 / EARTH_DENSITY)
    const outsideLoudness = Math.pow(densityRatio, 0.5) // ~0.12 at Mars surface

    // --- Wind ---------------------------------------------------------------
    // Energy goes with the cube of wind speed, heavily damped by the thin air.
    const windEnergy = Math.pow(i.gustMs / 12, 2.2)
    ease(this.windGain!.gain, Math.min(0.5, windEnergy * outsideLoudness * 2.6 * (1 + i.dustTau * 0.3)), 0.4)
    // CO2 at low pressure eats the treble: the cutoff stays low and drops further
    // as the air thins.
    ease(this.windFilter!.frequency, 190 + 520 * outsideLoudness + i.gustMs * 12, 0.5)

    // --- Suit ---------------------------------------------------------------
    // The fan note rides on the electrical load, so a storm is audible as a
    // change in the machine around you before it is visible.
    ease(this.fanOsc!.frequency, 70 + (i.electricalW - 100) * 0.09, 0.5)
    ease(this.fanGain!.gain, 0.045 + Math.min(0.03, (i.electricalW - 100) / 4000), 0.5)

    // Breathing rate follows exertion.
    const exertion = Math.min(1, i.speedMs / 1.0 + (i.working ? 0.4 : 0))
    ease(this.breathLfo!.frequency, 0.24 + exertion * 0.22, 0.6)
    ease(this.breathLfoGain!.gain, 0.022 + exertion * 0.022, 0.5)

    // --- Tool work ----------------------------------------------------------
    const workLevel = i.working ? (i.tool === 'brush' ? 0.1 : i.tool === 'drill' ? 0.13 : 0.02) : 0
    ease(this.workGain!.gain, workLevel * (0.35 + 0.65 * outsideLoudness * 4), 0.12)
    ease(this.workFilter!.frequency, i.tool === 'drill' ? 620 : 1700, 0.15)

    // --- Footsteps ----------------------------------------------------------
    if (i.speedMs > 0.1) {
      const stepInterval = Math.max(0.33, 0.95 - i.speedMs * 0.45)
      this.lastStepAt += dtRealSec
      if (this.lastStepAt >= stepInterval) {
        this.lastStepAt = 0
        this.step(outsideLoudness)
      }
    } else {
      this.lastStepAt = 1
    }

    // --- Caution and warning tones -----------------------------------------
    if (i.status !== this.lastStatus) {
      this.lastStatus = i.status
      if (i.status === 'warning') this.alert(660, 0.16)
      if (i.status === 'critical') this.alert(880, 0.22, true)
    }
    if (i.status === 'critical') {
      this.lastAlertAt += dtRealSec
      if (this.lastAlertAt > 3.2) { this.lastAlertAt = 0; this.alert(880, 0.18, true) }
    }
  }

  /** A boot into regolith: a short, soft, low thump. Nothing crisp survives here. */
  private step(outsideLoudness: number) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(0.18)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 300 + 500 * outsideLoudness
    const g = ctx.createGain()
    // Boots are heard mostly by conduction up the suit, so they are not as
    // quiet as the outside air would imply, but they are dull.
    g.gain.setValueAtTime(0.14, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.17)
    src.connect(f); f.connect(g); g.connect(this.master!)
    src.start(t); src.stop(t + 0.2)
  }

  /** A caution tone, inside the helmet, so it is not attenuated. */
  private alert(freq: number, level: number, doubled = false) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const beep = (at: number) => {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = freq
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t + at)
      g.gain.linearRampToValueAtTime(level, t + at + 0.01)
      g.gain.setValueAtTime(level, t + at + 0.1)
      g.gain.exponentialRampToValueAtTime(0.001, t + at + 0.18)
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'; f.frequency.value = 2200
      o.connect(f); f.connect(g); g.connect(this.master!)
      o.start(t + at); o.stop(t + at + 0.2)
    }
    beep(0)
    if (doubled) beep(0.24)
  }

  /** One-off confirmation blip for a completed action. */
  ping(freq = 980) {
    if (!this.isRunning) return
    this.alert(freq, 0.09)
  }

  dispose() {
    try { this.ctx?.close() } catch { /* nothing useful to do */ }
    this.ctx = null
    this.started = false
  }
}

export const marsAudio = new MarsAudio()
