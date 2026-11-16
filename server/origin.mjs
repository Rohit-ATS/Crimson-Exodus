/**
 * origin.mjs — Who is allowed to open a crew link.
 *
 * Kept as its own pure module so it can be unit-tested directly. It is the
 * only thing standing between the mission room and any web page on the
 * internet, and security logic that can only be exercised by booting a server
 * tends not to be exercised.
 */

/** The default allowlist: the project's GitHub Pages deployment. */
export const DEFAULT_ALLOWED_ORIGINS = 'https://rohit-ats.github.io'

export function parseAllowedOrigins(value = DEFAULT_ALLOWED_ORIGINS) {
  return new Set(String(value).split(',').map((entry) => entry.trim()).filter(Boolean))
}

/**
 * Is this WebSocket handshake allowed?
 *
 * The rule that does the work is SAME ORIGIN: if the page asking for the
 * socket was served by this very server, it cannot be a cross-site request,
 * so it is allowed whatever the domain happens to be called. That covers
 * Render, a custom domain in front of the same service, and anywhere else
 * running this server — with nothing to configure.
 *
 * Before, that was granted only to `*.onrender.com`, so putting a custom
 * domain in front of the service broke the crew link with a 403 at the
 * upgrade: the page loaded, the room code appeared, and the socket was
 * refused with nothing on screen to explain it.
 *
 * It is also stricter than a suffix test. A page on another site carries its
 * own origin, which cannot equal our host, so `crimsonexodus.com.evil.test`
 * is refused where an `endsWith` check would have waved it through.
 * `ALLOWED_ORIGINS` remains for genuinely cross-origin deployments, such as
 * GitHub Pages talking to a server on Render.
 */
export function originAllowed(origin, requestHost, allowed = parseAllowedOrigins()) {
  if (!origin) return false
  if (allowed.has(origin)) return true
  let url
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
  return !!requestHost && url.host === requestHost
}
