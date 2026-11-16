import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (!address || typeof address === 'string') return reject(new Error('No smoke-test port'))
      probe.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function waitForStart(child) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`Render server did not start:\n${output}`)), 8_000)
    const onData = (data) => {
      output += data.toString()
      if (!output.includes('multiplayer listening')) return
      clearTimeout(timer)
      child.stdout.off('data', onData)
      resolve()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', (data) => { output += data.toString() })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Render server exited during startup (${code}):\n${output}`))
    })
  })
}

const port = await freePort()
const origin = `http://localhost:${port}`
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: origin },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitForStart(child)
  const base = `http://127.0.0.1:${port}`
  const health = await fetch(`${base}/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).protocol, 2)

  const page = await fetch(`${base}/`)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type') ?? '', /^text\/html/)
  assert.match(page.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
  const html = await page.text()
  assert.match(html, /<div id="root"><\/div>/)
  const script = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
  assert.ok(script, 'production index references a JavaScript bundle')

  const asset = await fetch(new URL(script, `${base}/`))
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type') ?? '', /^text\/javascript/)
  assert.match(asset.headers.get('cache-control') ?? '', /immutable/)

  const spa = await fetch(`${base}/mission/habcom`)
  assert.equal(spa.status, 200)
  assert.match(spa.headers.get('content-type') ?? '', /^text\/html/)
  assert.match(await spa.text(), /<div id="root"><\/div>/)

  console.log('Render production smoke test passed')
} finally {
  if (child.exitCode == null) {
    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.kill('SIGTERM')
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))])
    if (child.exitCode == null) child.kill('SIGKILL')
  }
}
