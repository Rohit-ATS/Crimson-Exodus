/**
 * netlify/functions/deepgram-token.mts — Mint a short-lived Deepgram token.
 *
 * The Netlify twin of `api/deepgram-token.ts`. Same reasoning, same contract:
 * the long-lived key lives in the server-side DEEPGRAM_API_KEY variable and is
 * never prefixed with VITE_, so it cannot reach the bundle; the browser only
 * ever sees a token that expires in a minute.
 *
 * SET UP
 *   1. Set DEEPGRAM_API_KEY in Site configuration → Environment variables.
 *   2. Set VITE_DEEPGRAM_TOKEN_URL=/api/deepgram-token (the redirect in
 *      netlify.toml maps that path to this function).
 *   3. Deploy.
 *
 * With neither set, the rover still works offline. That is the whole design.
 */

const TTL_SECONDS = 60

export default async function handler(req: Request): Promise<Response> {
  const noStore = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: noStore })
  }

  const key = Netlify.env.get('DEEPGRAM_API_KEY')
  if (!key) {
    return new Response(
      JSON.stringify({ error: 'DEEPGRAM_API_KEY is not configured on the server' }),
      { status: 503, headers: noStore },
    )
  }

  try {
    const dg = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: TTL_SECONDS }),
    })
    if (!dg.ok) {
      console.error('deepgram grant failed', dg.status, await dg.text())
      return new Response(
        JSON.stringify({ error: 'token grant refused by Deepgram' }),
        { status: 502, headers: noStore },
      )
    }
    const body = await dg.json() as { access_token?: string; expires_in?: number }
    if (!body.access_token) {
      return new Response(
        JSON.stringify({ error: 'token grant returned no access_token' }),
        { status: 502, headers: noStore },
      )
    }
    return new Response(
      JSON.stringify({ access_token: body.access_token, expires_in: body.expires_in ?? TTL_SECONDS }),
      { status: 200, headers: noStore },
    )
  } catch (err) {
    console.error('deepgram grant error', err)
    return new Response(JSON.stringify({ error: 'token grant failed' }), { status: 502, headers: noStore })
  }
}

export const config = { path: '/api/deepgram-token' }

/** Netlify's runtime global, declared so this file type-checks standalone. */
declare const Netlify: { env: { get: (k: string) => string | undefined } }
