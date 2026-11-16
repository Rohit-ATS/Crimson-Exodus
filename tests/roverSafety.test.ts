import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (p: string) => readFileSync(p, 'utf8')

describe('MERV cannot invent mission numbers', () => {
  const brain = read('src/ai/brain.ts')

  it('answers situational questions from the telemetry snapshot', () => {
    // Every situational reply is a function of `Telemetry`, which is built
    // from mission state. None of them may hold a literal consumable figure.
    assert.match(brain, /export function snapshot\(s: State\): Telemetry/)
    assert.match(brain, /walkHomeMin: s\.ret\.walkMinutes/)
    assert.match(brain, /marginMin: s\.ret\.marginMinutes/)
    assert.match(brain, /doseMSv: s\.doseMSv/)
  })

  it('refuses before the EVA rather than quoting zeros as measurements', () => {
    assert.match(brain, /const preEva = d\.phase !== 'surface'/)
    assert.match(brain, /no live telemetry/)
  })

  it('falls back to an explicit refusal, not to a guess', () => {
    assert.match(brain, /return \{ text: pick\(QUIPS\.unknown/)
  })
})

describe('MERV volunteers on real time, not mission time', () => {
  const merv = read('src/state/merv.ts')

  it('rate-limits advisories against the wall clock', () => {
    // The mission clock runs up to 30x. Gating on mission time would fire six
    // warnings a second the moment the player holds Shift.
    assert.match(merv, /const ADVISORY_GAP_S = \d+/)
    assert.match(merv, /sinceAdvisory \+= dtRealSec/)
    assert.match(merv, /if \(sinceAdvisory < ADVISORY_GAP_S\) return/)
  })

  it('says each advisory exactly once per run', () => {
    assert.match(merv, /filter\(\(a\) => !s\.said\.includes\(a\.id\)\)/)
    assert.match(merv, /said: \[\.\.\.s\.said, top\.id\]/)
  })

  it('keeps the hosted model and the offline brain from disagreeing', () => {
    // Both tiers resolve "can I keep going" through the same function, so the
    // advice cannot differ depending on whether a key is configured.
    assert.match(merv, /case 'assess_return':[\s\S]*respond\('should I turn back', d\)/)
  })

  it('degrades to the offline tier instead of breaking', () => {
    assert.match(merv, /function fallBack/)
    assert.match(merv, /tier: 'local'/)
    for (const call of ['stt?.close()', 'agent?.close()', 'mic?.close()']) {
      assert.ok(merv.includes(call), call)
    }
  })
})

describe('rover driving model', () => {
  const rover = read('src/sim/rover.ts')

  it('labels the one deliberate fiction', () => {
    assert.match(rover, /GAME MECHANIC/)
    assert.match(rover, /0\.042 m\/s/)
  })

  it('sub-steps the integration without re-sampling the terrain', () => {
    // Terrain sampling is fBm and is the expensive part; the integration is
    // arithmetic. Only the latter may be sub-stepped.
    const loop = rover.match(/for \(let i = 0; i < n; i\+\+\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
    assert.ok(loop.length > 100, 'sub-step loop not found')
    assert.doesNotMatch(loop, /slopeDeg|heightAt|roughnessAt/)
  })

  it('derives wheel rotation from distance, so wheels never skate', () => {
    assert.match(rover, /r\.spin \+= step \/ WHEEL_R/)
  })
})

describe('voice credentials cannot leak through the bundle', () => {
  it('ships a token-minting function for both hosts', () => {
    for (const f of ['api/deepgram-token.ts', 'netlify/functions/deepgram-token.mts']) {
      assert.ok(existsSync(f), f)
      const src = read(f)
      // The server-side secret must never carry the VITE_ prefix, which is
      // what compiles a variable into the public bundle.
      assert.match(src, /process\.env\.DEEPGRAM_API_KEY|Netlify\.env\.get\('DEEPGRAM_API_KEY'\)/)
      // The prose explains why VITE_ is unsafe; the code must never read one.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      assert.doesNotMatch(code, /VITE_/)
      assert.match(src, /auth\/grant/)
      assert.match(src, /ttl_seconds/)
    }
  })

  it('keeps env files out of the repository', () => {
    const ignore = read('.gitignore')
    assert.match(ignore, /^\.env$/m)
    assert.match(ignore, /^\.env\.\*$/m)
    assert.match(ignore, /^!\.env\.example$/m)
    assert.ok(!existsSync('.env'), 'a .env file is present and must not be committed')
  })

  it('documents the tiers without requiring a key for any of them', () => {
    const example = read('.env.example')
    assert.match(example, /EVERYTHING IN HERE IS OPTIONAL/)
    assert.match(example, /VITE_DEEPGRAM_TOKEN_URL/)
    assert.match(example, /VITE_ROVER_MODE/)
  })
})

describe('deployment allows the voice link and the microphone', () => {
  const hosts = ['https://api.deepgram.com', 'wss://api.deepgram.com', 'wss://agent.deepgram.com']

  it('names the Deepgram endpoints in connect-src', () => {
    for (const cfg of ['netlify.toml', 'vercel.json']) {
      const src = read(cfg)
      for (const h of hosts) assert.ok(src.includes(h), `${cfg} missing ${h}`)
    }
  })

  it('permits the microphone on our own origin and nowhere else', () => {
    for (const cfg of ['netlify.toml', 'vercel.json']) {
      const src = read(cfg)
      assert.ok(src.includes('microphone=(self)'), cfg)
      assert.ok(src.includes('camera=()'), `${cfg} should still deny the camera`)
      assert.ok(src.includes('geolocation=()'), `${cfg} should still deny geolocation`)
    }
  })

  it('serves the audio worklet from our own origin', () => {
    // `script-src 'self'` governs AudioWorklet modules, so a Blob worklet
    // would work in dev and be silently blocked in production.
    assert.ok(existsSync('public/rover-mic-worklet.js'))
    assert.match(read('src/ai/voice.ts'), /addModule\('rover-mic-worklet\.js'\)/)
    assert.doesNotMatch(read('src/ai/voice.ts'), /createObjectURL/)
  })

  it('routes the token path to the function ahead of the SPA catch-all', () => {
    const netlify = read('netlify.toml')
    assert.ok(netlify.indexOf('from = "/api/*"') < netlify.indexOf('from = "/*"'))
    assert.match(read('vercel.json'), /\(\?!api\//)
  })
})
