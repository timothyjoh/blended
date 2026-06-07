// ---------------------------------------------------------------------------
// Resource URL validation (cycle 0015). The SINGLE, pure, total seam where the
// scheme-acceptance decision lives (mirroring `isValidEmail` in auth.ts and
// `classifyMessage` in classify.ts). No other code path parses a resource URL
// scheme — the builder, the dual-write wrapper, the component, and the fold all
// route their accept/reject decision through here, so a future allowlist/SSRF
// tightening (SPEC §16.3/16.4) touches only this body.
// ---------------------------------------------------------------------------

/** Machine-distinguishable rejection reasons (never a free-text string). */
export type ResourceUrlRejection = 'blank' | 'unparseable' | 'unsafe_scheme'

export type ResourceUrlValidation =
  | { ok: true; url: string }
  | { ok: false; reason: ResourceUrlRejection }

/**
 * Total URL validator (SPEC §16.3/16.4). Accepts absolute `http`/`https` URLs;
 * rejects blank/whitespace (`blank`), unparseable/relative/bare input
 * (`unparseable`), and any non-http(s) scheme — `javascript:`, `data:`,
 * `vbscript:`, `file:`, … (`unsafe_scheme`). NEVER throws on any input
 * (including `null`/`undefined`/non-string-ish): every parse failure is caught
 * and mapped to a tagged rejection, so an unsafe scheme can never be stored or
 * later rendered. On success the normalized `parsed.href` is returned.
 */
export function validateResourceUrl(
  input: string | null | undefined
): ResourceUrlValidation {
  const raw = (typeof input === 'string' ? input : '').trim()
  if (raw === '') return { ok: false, reason: 'blank' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    // Relative/bare/garbage input (no scheme, or otherwise unparseable).
    return { ok: false, reason: 'unparseable' }
  }
  const scheme = parsed.protocol.toLowerCase()
  if (scheme !== 'http:' && scheme !== 'https:') {
    return { ok: false, reason: 'unsafe_scheme' }
  }
  return { ok: true, url: parsed.href }
}
