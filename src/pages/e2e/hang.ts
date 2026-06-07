import type { APIRoute } from 'astro'

// ---------------------------------------------------------------------------
// Cycle 0018 e2e fixture (dev/test only): a deterministically NON-LOADING embed
// target. It delays its response well past `EMBED_LOAD_TIMEOUT_MS` (4s) so an
// iframe pointed at it never fires `onLoad` within the detection window — the
// `ResourcePane` timeout fires and the blocked-embed fallback card appears. This
// is the dependable way to exercise a blocked/hung embed in a real browser
// (real X-Frame-Options refusals can't be served from our own origin).
//
// Guarded to dev so it can NEVER affect production routing: outside `import.meta
// .env.DEV` it 404s. The delay is abortable — when the test context/iframe is
// torn down the request is cancelled, so the timer is cleared (no leak).
// ---------------------------------------------------------------------------

const HANG_DELAY_MS = 30_000

export const GET: APIRoute = async ({ request }) => {
  if (!import.meta.env.DEV) {
    return new Response('not found', { status: 404 })
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, HANG_DELAY_MS)
    // If the client aborts (context/iframe torn down), clear the pending timer
    // and resolve so the handler doesn't leak — never swallowed silently.
    request.signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  return new Response('<!doctype html><title>hang</title>ok', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
