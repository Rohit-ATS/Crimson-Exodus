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
    const headers = new Map(config.headers[0].headers.map(
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
})
