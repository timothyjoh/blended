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

// ---------------------------------------------------------------------------
// Admin console aggregation (cycle 0020, ADR-0003). The pure, db-free seam the
// `AdminSessionList` island folds its three unscoped live queries through. Kept
// here (not in the island) so the join logic unit-tests without a hydrated
// client. `sessionDisplayTitle` is the only cross-module dependency — reused
// verbatim so the console's title fallback matches the dashboard's.
// ---------------------------------------------------------------------------

import { sessionDisplayTitle } from './sessions'

/** Explicit "no value" display used by the admin console for absent resource/url. */
export const ADMIN_VALUE_NONE = '(none)' as const

/** Minimal session-projection subset the admin console reads (never email). */
export type AdminSessionInput = {
  id: string
  title?: string | null
  status?: string | null
  teacherId?: string | null
  createdAt?: number | null
  activeResourceId?: string | null
  currentUrl?: string | null
}

/** Minimal participant/question subset — only `sessionId` (+ `status` for questions) matter. */
export type AdminSessionChildInput = { sessionId?: string | null; status?: string | null }

/** A fully-resolved admin console row — every field non-throwing and display-ready. */
export type AdminSessionRow = {
  id: string
  title: string
  status: string | null
  teacherId: string | null
  participantCount: number
  activeResourceId: string | null
  currentUrl: string | null
  openQuestionCount: number
}

/** Blank/whitespace/absent → null (so the island renders an explicit "none"). */
function normalizeOptional(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * TOTAL join of the three unscoped projections into ordered admin rows. Never
 * throws: a session with no children → counts 0; a participant/question whose
 * `sessionId` matches no session is ignored; absent optional fields collapse to
 * null/0/fallback. Open-question = `status !== 'answered'`. Order: createdAt asc,
 * id tie-break (deterministic, no server index). No email is read or emitted.
 */
export function buildAdminSessionRows(
  sessions: readonly AdminSessionInput[] | null | undefined,
  participants: readonly AdminSessionChildInput[] | null | undefined,
  questions: readonly AdminSessionChildInput[] | null | undefined
): AdminSessionRow[] {
  const knownSessions = sessions ?? []
  const known = new Set(knownSessions.map((s) => s.id))

  const pCounts = new Map<string, number>()
  for (const p of participants ?? []) {
    const sid = p?.sessionId
    if (sid && known.has(sid)) pCounts.set(sid, (pCounts.get(sid) ?? 0) + 1)
  }

  const qCounts = new Map<string, number>()
  for (const q of questions ?? []) {
    const sid = q?.sessionId
    if (sid && known.has(sid) && q?.status !== 'answered')
      qCounts.set(sid, (qCounts.get(sid) ?? 0) + 1)
  }

  // Fold createdAt into an intermediate tuple so the sort is O(n log n) — never
  // a re-`find` inside the comparator.
  return knownSessions
    .map((s) => ({
      createdAt: s.createdAt ?? 0,
      row: {
        id: s.id,
        title: sessionDisplayTitle(s.title),
        status: s.status ?? null,
        teacherId: s.teacherId ?? null,
        participantCount: pCounts.get(s.id) ?? 0,
        activeResourceId: normalizeOptional(s.activeResourceId),
        currentUrl: normalizeOptional(s.currentUrl),
        openQuestionCount: qCounts.get(s.id) ?? 0,
      } satisfies AdminSessionRow,
    }))
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
      return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0
    })
    .map((e) => e.row)
}
