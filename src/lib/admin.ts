// ---------------------------------------------------------------------------
// Pure, db-free admin-capability building blocks (cycle 0019, ADR-0003). Kept
// out of `db.ts`/`useAuth.ts` so they unit-test without initializing the
// InstantDB client. The global admin level is a NAMED domain value
// (`'none' | 'uber'`, CONTEXT.md "Uber Admin") — code must treat `adminLevel`
// EXCLUSIVELY through these constants/types, never scattered string literals.
//
// Every helper is TOTAL: hostile/empty/missing input resolves to the safe
// default (`'none'` / empty allowlist / `{ elevate: false }`) rather than
// throwing — mirroring the pure-helper convention of `src/lib/auth.ts` and
// `src/lib/routing.ts`. The elevated `'uber'` value can ONLY ever be produced
// server-side via `@instantdb/admin` (which bypasses permission rules); the
// client can never write it (the tightened `users` rule rejects it).
// ---------------------------------------------------------------------------

/** Non-elevated global admin level — the default for every user row. */
export const ADMIN_LEVEL_NONE = 'none' as const
/** The single elevated global admin level (ADR-0003 — no other level today). */
export const ADMIN_LEVEL_UBER = 'uber' as const

export type AdminLevel = typeof ADMIN_LEVEL_NONE | typeof ADMIN_LEVEL_UBER

/**
 * Total normalization: anything not EXACTLY `'uber'` → `'none'`. This is the
 * read-time tolerance for legacy stored values (the field was once `i.number()`,
 * so existing rows may carry `0`/`1`/absent) — they degrade safely to `'none'`
 * (denied) rather than throwing. Never throws on any input.
 */
export function normalizeAdminLevel(raw: unknown): AdminLevel {
  return raw === ADMIN_LEVEL_UBER ? ADMIN_LEVEL_UBER : ADMIN_LEVEL_NONE
}

/**
 * Parse the server-only `ADMIN_EMAILS` env list (comma/whitespace-separated)
 * into trimmed, lowercased, de-duped, non-empty entries. Tolerates empty/unset
 * (→ empty allowlist ⇒ no admins are bootstrapped). Total — never throws.
 */
export function parseAdminEmails(raw: string | null | undefined): string[] {
  if (!raw) return []
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e !== '')
    )
  )
}

/**
 * Case-insensitive allowlist membership. A missing/empty email is never a
 * member. Total — never throws.
 */
export function isEmailAllowlisted(
  email: string | null | undefined,
  allowlist: string[]
): boolean {
  if (!email) return false
  return allowlist.includes(email.trim().toLowerCase())
}

/**
 * The pure bootstrap decision — the server endpoint's authorization +
 * idempotency core, unit-testable without the admin SDK. Returns whether to
 * elevate and the resulting level:
 *   - already `'uber'` → no elevate (idempotent re-bootstrap is a no-op).
 *   - verified email not in the allowlist (or empty allowlist) → no elevate,
 *     stays `'none'`.
 *   - allowlisted, not-yet-`'uber'` → elevate to `'uber'`.
 * Total — never throws (hostile/missing input collapses to `{ elevate: false }`).
 */
export function decideBootstrap(input: {
  verifiedEmail: string | null | undefined
  allowlist: string[]
  currentLevel: unknown
}): { elevate: boolean; adminLevel: AdminLevel } {
  const current = normalizeAdminLevel(input.currentLevel)
  if (current === ADMIN_LEVEL_UBER) return { elevate: false, adminLevel: ADMIN_LEVEL_UBER }
  if (!isEmailAllowlisted(input.verifiedEmail, input.allowlist)) {
    return { elevate: false, adminLevel: ADMIN_LEVEL_NONE }
  }
  return { elevate: true, adminLevel: ADMIN_LEVEL_UBER }
}
