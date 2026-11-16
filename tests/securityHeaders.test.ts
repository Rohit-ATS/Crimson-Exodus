import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const requiredDirectives = [
  "default-src 'self'",
  "object-src 'none'",
  "form-action 'none'",
  "script-src 'self'",
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://trek.nasa.gov',
  'https://flagcdn.com',
]

describe('deployment security policy', () => {
  it('keeps the GitHub Pages-compatible meta policy in the app shell', () => {
    const html = readFileSync('index.html', 'utf8')
    assert.match(html, /http-equiv="Content-Security-Policy"/)
    assert.match(html, /name="referrer" content="strict-origin-when-cross-origin"/)
    for (const directive of requiredDirectives) assert.ok(html.includes(directive), directive)
  })

  it('configures hardened Vercel response headers', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
    const policy = config.headers.find((entry: { source: string }) => entry.source === '/(.*)')
    assert.ok(policy, 'catch-all Vercel security header block')
    const headers = new Map(policy.headers.map(
      ({ key, value }: { key: string; value: string }) => [key, value],
    ))
    for (const name of [
      'Content-Security-Policy', 'Referrer-Policy', 'Permissions-Policy',
      'X-Content-Type-Options', 'X-Frame-Options', 'Cross-Origin-Opener-Policy',
    ]) assert.ok(headers.has(name), name)
    assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'none'/)
  })

  it('keeps the Netlify policy aligned with Vercel', () => {
    const netlify = readFileSync('netlify.toml', 'utf8')
    for (const name of [
      'Content-Security-Policy', 'Referrer-Policy', 'Permissions-Policy',
      'X-Content-Type-Options', 'X-Frame-Options', 'Cross-Origin-Opener-Policy',
    ]) assert.ok(netlify.includes(name), name)
    for (const directive of requiredDirectives) assert.ok(netlify.includes(directive), directive)
  })

  it('ships a paid Render WebSocket service with health checks', () => {
    const blueprint = readFileSync('render.yaml', 'utf8')
    for (const expected of [
      'type: web', 'runtime: node', 'plan: 0.5c-512mb',
      'numInstances: 1', 'healthCheckPath: /health',
      'autoDeployTrigger: commit',
      'startCommand: npm run multiplayer:start',
    ]) assert.ok(blueprint.includes(expected), expected)
    const server = readFileSync('server/index.mjs', 'utf8')
    for (const expected of ['WebSocketServer', 'maxPayload', 'originAllowed', 'RATE_LIMIT']) {
      assert.ok(server.includes(expected), expected)
    }
  })
})

describe('GitHub Pages workflow', () => {
  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8')

  it('validates the project before publishing dist', () => {
    for (const command of ['npm ci', 'npm test', 'npm run typecheck', 'npm run build', 'npm run test:render']) {
      assert.ok(workflow.includes(`run: ${command}`), command)
    }
    assert.match(workflow, /path: dist/)
    assert.match(workflow, /VITE_MULTIPLAYER_URL: \$\{\{ vars\.VITE_MULTIPLAYER_URL \}\}/)
  })

  it('uses the official Pages artifact and deployment flow', () => {
    for (const action of [
      'actions/configure-pages@v6',
      'actions/upload-pages-artifact@v5',
      'actions/deploy-pages@v5',
    ]) assert.ok(workflow.includes(action), action)
    assert.match(workflow, /pages: write/)
    assert.match(workflow, /id-token: write/)
    assert.match(workflow, /name: github-pages/)
  })

  it('grants Pages API access before configure-pages runs in the build job', () => {
    const topLevelPermissions = workflow.match(
      /^permissions:\n([\s\S]*?)^concurrency:/m,
    )?.[1] ?? ''
    assert.match(topLevelPermissions, /^  contents: read$/m)
    assert.match(topLevelPermissions, /^  pages: write$/m)
    assert.match(topLevelPermissions, /^  id-token: write$/m)
  })
})
