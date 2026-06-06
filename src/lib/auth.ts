// ---------------------------------------------------------------------------
// Pure, db-free auth building blocks. Kept out of `db.ts` so they unit-test
// without initializing the InstantDB client (which needs PUBLIC_INSTANTDB_APP_ID
// at import time). The `useAuth` hook composes these with the live auth surface.
// ---------------------------------------------------------------------------

/**
 * Reserved non-session scope for identity-scoped `writeEvent()` calls (SPEC §41).
 * `writeEvent` requires a `sessionId`, but first-sign-in `users`-row creation is
 * not bound to any real session — it uses this sentinel id instead. Identity
 * events are intentionally NOT folded by `applyEvent` (they never appear in a
 * real session's event list); see `src/lib/db.ts`.
 */
export const IDENTITY_SCOPE = 'identity'

/** Identity-scope event type for first-sign-in users-row creation (SPEC §41). */
export const USER_SIGNED_IN = 'UserSignedIn'

/**
 * Minimal, dependency-free email check. Rejects empty/whitespace/malformed so an
 * invalid submission never reaches `sendMagicCode`. Total over its input — never
 * throws (SPEC failure behavior: invalid email surfaces a validation message).
 */
export function isValidEmail(raw: string | null | undefined): boolean {
  if (!raw) return false
  const email = raw.trim()
  if (email === '') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Derived username = email local-part (SPEC §40 email privacy). The signed-in
 * view shows this, never the raw email. Total over its input.
 */
export function deriveUsername(email: string | null | undefined): string {
  if (!email) return ''
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

/**
 * Idempotency gate for first-sign-in users-row creation (SPEC §41). Returns true
 * ONLY when an auth id exists, the users query has loaded, no row exists yet, and
 * no creation write is already in flight — safe across reloads, repeat sign-ins,
 * and React re-renders.
 */
export function shouldCreateUserRow(input: {
  authUserId: string | null | undefined
  usersLoaded: boolean
  existingUserCount: number
  inFlight: boolean
}): boolean {
  const { authUserId, usersLoaded, existingUserCount, inFlight } = input
  return Boolean(authUserId) && usersLoaded && existingUserCount === 0 && !inFlight
}
