/**
 * api/deepgram-token.ts — Mint a short-lived Deepgram token. Vercel.
 *
 * ===========================================================================
 *  WHY THIS FILE EXISTS
 *
 *  MERV's voice runs in the browser, and a browser cannot keep a secret.
 *  Anything put in a `VITE_` variable is compiled into the public bundle, so
 *  `VITE_DEEPGRAM_API_KEY` on a deployed site is the same as publishing the
 *  key — anyone who opens the page can read it out of the JavaScript and spend
 *  your Deepgram balance.
 *
 *  So the key stays here, server side, in DEEPGRAM_API_KEY, which is NOT
 *  prefixed with VITE_ and therefore never reaches the client. This endpoint
 *  exchanges it for a token that expires in sixty seconds, and that is what
 *  the browser gets. A leaked sixty-second token is a non-event.
 *
 *  SET UP
 *    1. Set DEEPGRAM_API_KEY in the Vercel project's environment variables.
 *    2. Set VITE_DEEPGRAM_TOKEN_URL=/api/deepgram-token.
 *    3. Deploy. The app picks the voice tier up automatically.
 *
 *  Leave both unset and the rover still works — it answers from the offline
 *  knowledge base and speaks with the browser's own engine.
 * ===========================================================================
 */

/** Token lifetime, seconds. Deepgram allows 1 to 3600; short is the point. */
const TTL_SECONDS = 60

/**
 * Minimal request/response shapes.
 *
 * Typed structurally rather than against `@vercel/node` so this file needs no
 * dependency the rest of the project does not already have, and so it still
 * type-checks in a plain `tsc` run.
 */
interface Req {
  method?: string
  headers: Record<string, string | string[] | undefined>
}
interface Res {
  status: (code: number) => Res
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

export default async function handler(req: Req, res: Res): Promise<void> {
  // No caching, ever. A cached token is a long-lived token.
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  const key = process.env.DEEPGRAM_API_KEY
  if (!key) {
    // Not an error the user should see as a crash: the client treats any
    // failure here as "no credential" and stays on the offline tier.
    res.status(503).json({ error: 'DEEPGRAM_API_KEY is not configured on the server' })
    return
  }

  try {
    const dg = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: TTL_SECONDS }),
    })
    if (!dg.ok) {
      const detail = await dg.text()
      console.error('deepgram grant failed', dg.status, detail)
      res.status(502).json({ error: 'token grant refused by Deepgram' })
      return
    }
    const body = (await dg.json()) as { access_token?: string; expires_in?: number }
    if (!body.access_token) {
      res.status(502).json({ error: 'token grant returned no access_token' })
      return
    }
    res.status(200).json({
      access_token: body.access_token,
      expires_in: body.expires_in ?? TTL_SECONDS,
    })
  } catch (err) {
    console.error('deepgram grant error', err)
    res.status(502).json({ error: 'token grant failed' })
  }
}
