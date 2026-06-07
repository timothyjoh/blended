// ---------------------------------------------------------------------------
// Pure, total routing helpers for the cycle-0004 client-side route guard. None
// of these touch the DOM, `window`, or InstantDB — they are the unit-testable
// core that the `RouteGuard`/`SessionRouteGuard` islands and `AuthGate` redirect
// consume. Total functions: hostile/empty/missing input resolves to a safe
// default (open-redirect-safe `/dashboard`, `denied` ownership verdict) rather
// than throwing. Mirrors the pure-helper + co-located-test pattern of
// `src/lib/auth.ts` (the `.tsx` islands stay outside unit scope, like useAuth).
// ---------------------------------------------------------------------------

/** Role-aware default landing for an authenticated visit with no valid target. */
export const DEFAULT_LANDING = '/dashboard'

/**
 * Open-redirect-safe resolution of a `next` param. Returns `raw` ONLY when it is
 * a same-origin absolute path (starts with a single '/', not '//' or '/\', and
 * carries no control chars used to smuggle a CR/LF header or new scheme);
 * otherwise returns {@link DEFAULT_LANDING}. Total — never throws. This blocks an
 * attacker from driving an off-origin navigation via a crafted `?next=`.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '') return DEFAULT_LANDING
  if (!raw.startsWith('/')) return DEFAULT_LANDING // 'https://…', 'evil', etc.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_LANDING // protocol-relative
  if (/[\u0000-\u001f]/.test(raw)) return DEFAULT_LANDING // CR/LF/tab smuggling
  return raw
}

/** Build the login bounce URL preserving the current destination, URL-encoded. */
export function loginRedirectTarget(loc: { pathname: string; search: string }): string {
  const dest = `${loc.pathname}${loc.search}`
  return `/login?next=${encodeURIComponent(dest)}`
}

export type AuthzDecision = 'loading' | 'authorized' | 'denied'

/**
 * Pure ownership verdict for the session guard. `denied` on query error or a
 * missing/zero-row id; `loading` while the query is unresolved; `authorized`
 * ONLY when the row's `teacherId` matches the signed-in user. Error wins over
 * loading so a failing query never hangs on a spinner. Total — never throws.
 */
export function authorizeOwnership(input: {
  userId: string | null | undefined
  ownerId: string | null | undefined
  loading: boolean
  error: boolean
}): AuthzDecision {
  if (input.error) return 'denied'
  if (input.loading) return 'loading'
  if (!input.userId || !input.ownerId) return 'denied'
  return input.userId === input.ownerId ? 'authorized' : 'denied'
}
