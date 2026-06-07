// ---------------------------------------------------------------------------
// Cycle 0018: bounded embed-detection constants + the pure card-heading helper
// for the shared `ResourcePane` blocked-embed fallback ("never a blank pane",
// SPEC §8.2). The load timeout is the DEPENDABLE block signal: browsers do not
// reliably surface `X-Frame-Options` / CSP `frame-ancestors` refusals via the
// iframe's `onError`/`onLoad`, so a bounded timeout (cleared on a real `onLoad`)
// is the primary trigger; `onError` is a secondary signal. Kept here — pure and
// unit-testable — so the timeout value lives in ONE place.
// ---------------------------------------------------------------------------

/**
 * How long to wait for an embed to fire `onLoad` before treating it as blocked.
 * A real `onLoad` arriving BEFORE the deadline cancels the timeout and the inline
 * frame stays. Once the timeout fires the status settles to blocked, the iframe is
 * unmounted and the fallback card replaces it; the card then stays — a late
 * `onLoad` can no longer clear it, and the embed is not re-checked until
 * `activeResourceId`/`currentUrlVersion` changes (degraded-but-visible for a
 * slow-but-valid embed, accepted per SPEC §44).
 */
export const EMBED_LOAD_TIMEOUT_MS = 4000

/** Heading for the fallback card: the trimmed title, else the URL hostname, else the raw URL. */
export function resourceCardHeading(title: string | null | undefined, url: string): string {
  const t = (title ?? '').trim()
  if (t !== '') return t
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}
