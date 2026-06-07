# Implementation Plan: Cycle 0020

## Overview
Replace the empty `/admin` placeholder (cycle 0019) with a read-only, realtime, system-wide session console: a pure aggregation helper `buildAdminSessionRows` plus an `AdminSessionList` island that runs three unscoped live queries and renders per-session operator rows, each a drill-in link to `/admin/sessions/:id`.

## Current State (from Research)
- `/admin` (`src/pages/admin.astro:18-23`) mounts `AdminRouteGuard` as a `client:only="react"` island whose children are a static `admin-root` heading + a "later cycle" placeholder paragraph. This cycle swaps the placeholder for `<AdminSessionList client:only="react" />` (the guard's access logic is reused verbatim — no new auth).
- `AdminRouteGuard` (`src/components/AdminRouteGuard.tsx:18-43`) already gates rendering on `adminLevel === 'uber'`, bouncing unauthenticated visitors to `/login?next=%2Fadmin` and denying non-admins with `route-guard-denied`. The console inherits this guard structurally — it writes no access-control logic.
- `SessionList` (`src/components/SessionList.tsx:24-115`) is the canonical render-state template: error (`role="alert"` + `console.error`, checked **before** empty) → loading → sort via pure comparator → empty → populated rows; each row `<a data-testid=… data-session-id href=…>`. The console mirrors this exactly but with **unscoped** queries (no `where`, no `useAuth`) and per-row aggregate cells.
- `src/lib/admin.ts:1-83` holds the db-free, TOTAL pure-helper convention (cycle 0019); `buildAdminSessionRows` lands here and follows it verbatim. `src/lib/admin.test.ts` is the co-located Vitest suite it extends.
- Ordering precedent: `compareSessionsForList` (createdAt asc, id tie-break) and `sessionDisplayTitle` ('(untitled session)' fallback) in `src/lib/sessions.ts:783-802`.
- Schema is read-only and unchanged: `sessions` (`title`, `status`, `teacherId`, `createdAt`, `activeResourceId?`, `currentUrl?`), `participants` (`sessionId`, no `email`), `questions` (`sessionId`, `status`) — `src/lib/db.ts:55-146`. Open-read rules already permit unscoped client reads (`src/lib/perms.ts:73,131,176`) — no `perms:push`. Open-question = `status !== 'answered'` (`src/lib/sessions.ts:567,701,724`).
- E2E pattern: `e2e/admin-route.spec.ts` gates on `adminAvailable()`, skips loudly without admin env, signs in via `signInViaUi`, asserts denial via `route-guard-denied` + `admin-root` absence. Helpers in `e2e/support/auth.ts` (`adminAvailable`, `mintCode`, `freshEmail`, `queryAdmin`, `signInViaUi`).

## Desired End State
A signed-in uber admin visiting `/admin` sees `admin-session-list` populated with one `admin-session-item` per session (all owners, all statuses), each row showing status, owner `teacherId`, participant count, active resource, current URL, and open-question count, and linking to `/admin/sessions/:id` with `data-session-id`. Counts and the active-resource cell update without reload as other contexts join/activate/broadcast/ask. A query error renders an inline `role="alert"`; zero sessions renders an explicit empty state; loading renders an explicit element. Non-admins are denied by the unchanged guard. Verify: `npm run test` (new `buildAdminSessionRows` cases green), `npm run astro check` clean, `npm run test:e2e` (`e2e/admin-console.spec.ts` green or loud-skip).

## What We're NOT Doing
- Building the `/admin/sessions/:id` event-log inspector page (sibling cycle `txt-20260606-213645`) — only the `<a href>` + `data-session-id` link target is wired.
- Any mutation from the console (no start/end, activate, promote, `writeEvent`).
- Org/group-scoped admin views (deferred per ADR-0003).
- Rendering any teacher/student email — owner is `teacherId` only.
- Server-side indexing or pagination of the unscoped queries (MVP-scale full scan accepted; noted as deferred follow-up).
- Any schema change, `instant-cli push schema`, or `perms:push`.
- New auth or access-control logic — `AdminRouteGuard` is reused verbatim.

## Implementation Approach
Two artifacts in one vertical slice plus tests. (1) Add a TOTAL pure helper `buildAdminSessionRows(sessions, participants, questions)` to `src/lib/admin.ts` that builds a `sessionId → { participants, openQuestions }` tally by single-pass folds (ignoring rows whose `sessionId` is not a known session), then maps each session into a row `{ id, title, status, teacherId, participantCount, activeResourceId, currentUrl, openQuestionCount }` with `title` via `sessionDisplayTitle`, `activeResourceId`/`currentUrl` normalized to `string | null`, and a deterministic `createdAt asc, id` sort. (2) Add `src/components/AdminSessionList.tsx`: three unconditional unscoped `db.useQuery` calls, error-before-empty render-state branching mirroring `SessionList`, rows rendered from the helper with the fixed testids. (3) Swap the placeholder in `src/pages/admin.astro`. (4) Extend `src/lib/admin.test.ts` (unit) and add `e2e/admin-console.spec.ts` (E2E). The helper's totality is the safety mechanism; the guard remains the access mechanism.

Resolved open questions:
- **Projection shapes**: the unscoped queries return full entity rows; the helper consumes only `{ id, title?, status?, teacherId?, createdAt?, activeResourceId?, currentUrl? }` from sessions and `{ sessionId?, status? }` from participants/questions, tolerating extra/missing fields. Orphan participant/question rows (no matching session id) are ignored via a presence check against the session-id set.
- **"none" affordance**: the helper carries `activeResourceId`/`currentUrl` as `string | null` (blank/whitespace/absent → `null`); the island renders an explicit fallback string `ADMIN_VALUE_NONE = '(none)'` in the `admin-session-active-resource` / `admin-session-current-url` cells when `null` — never a blank cell.
- **title**: the helper applies `sessionDisplayTitle` so `row.title` is always non-blank.

## Failure & Resilience Decisions

**Task 1 — `buildAdminSessionRows` (pure):** N/A — pure. No I/O. Totality is the contract: missing/partial/null/orphan input resolves to safe defaults (counts 0, `null` resource/url, fallback title) and never throws. This is exercised by hostile-input unit tests, not runtime error handling.

**Task 2 — `AdminSessionList` island (live queries):**
- **Failure modes**: any of the three `db.useQuery` calls can surface `{ error }`. Response: **degrade to an inline error surface** — render `admin-session-list-error` with `role="alert"` (the error of whichever query failed, first-failure precedence) and `console.error('[AdminSessionList] <which> query error:', err)`. The error branch is checked **before** the empty branch so an errored query never renders as falsely-empty. No retry/timeout machinery (none exists in this island family; failure is a render-state branch driven by `{ isLoading, error, data }`).
- **Idempotency**: read-only — no mutations, locks, or dedup keys. Re-render/remount is inherently safe.
- **Observability**: `console.error('[AdminSessionList] …')` on the error path, matching `SessionList` / `AdminRouteGuard` convention. No structured `.cycle/log.jsonl` event (that spine is engine-level, not product runtime).
- **No silent failure**: the error is both logged and rendered as a visible `role="alert"`; it is never caught-and-discarded. Loading renders an explicit `admin-session-list-loading` element (never a flash of empty); genuine zero-sessions renders an explicit `admin-session-list-empty` element.

**Task 3 — `admin.astro` placeholder swap:** N/A — pure markup change (mount an island). No failure surface beyond what the island and guard already own.

---

## Task 1: Pure aggregation helper `buildAdminSessionRows`

### Overview
Add a TOTAL, db-free helper that folds the three projection lists into deterministically-ordered per-session operator rows, defensive against missing/partial/orphan input.

### Changes Required
**File**: `src/lib/admin.ts`
**Changes**: Append (importing `sessionDisplayTitle` from `@/lib/sessions`):

```ts
import { sessionDisplayTitle } from '@/lib/sessions'

/** Explicit "no value" display used by the admin console for absent resource/url. */
export const ADMIN_VALUE_NONE = '(none)' as const

/** Minimal session-projection subset the admin console reads. */
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
  const known = new Set((sessions ?? []).map((s) => s.id))
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
  return (sessions ?? [])
    .map((s) => ({
      id: s.id,
      title: sessionDisplayTitle(s.title),
      status: s.status ?? null,
      teacherId: s.teacherId ?? null,
      participantCount: pCounts.get(s.id) ?? 0,
      activeResourceId: normalizeOptional(s.activeResourceId),
      currentUrl: normalizeOptional(s.currentUrl),
      openQuestionCount: qCounts.get(s.id) ?? 0,
    }))
    .sort((a, b) => {
      const ca = (sessions ?? []).find((s) => s.id === a.id)?.createdAt ?? 0
      const cb = (sessions ?? []).find((s) => s.id === b.id)?.createdAt ?? 0
      if (ca !== cb) return ca - cb
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}
```

Note: capture `createdAt` into the row's sort by reading it once during `.map` into a local sort tuple rather than re-`find`-ing (implementer should fold `createdAt` into an intermediate `{ row, createdAt }` to keep the sort O(n log n) — the snippet above is illustrative; the final code must not do an O(n²) `find` inside `sort`).

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run astro check`)
- [ ] `buildAdminSessionRows` exported from `src/lib/admin.ts`; existing cycle-0019 exports untouched
- [ ] Unit tests pass: correct participant/open-question tallies; zero-child sessions → 0; orphan child rows ignored; missing optional fields → null/fallback; open-question filter (`!== 'answered'`); deterministic createdAt-asc/id order
- [ ] Helper never throws on null/empty/hostile input (totality)
- [ ] No email field read or emitted in the row shape
- [ ] Failure paths behave as designed — N/A (pure); totality covered by tests

---

## Task 2: `AdminSessionList` realtime island

### Overview
Add the island that runs three unscoped live queries, folds them through `buildAdminSessionRows`, and renders mutually-exclusive loading/error/empty/populated states with the fixed testids, each row linking to `/admin/sessions/:id`.

### Changes Required
**File**: `src/components/AdminSessionList.tsx` (new)
**Changes**: Mirror `SessionList`'s structure with unscoped queries (no `useAuth`, no `where`) and aggregate cells. Sketch:

```tsx
import { db } from '@/lib/db'
import { buildAdminSessionRows, ADMIN_VALUE_NONE } from '@/lib/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AdminSessionList() {
  const sessionsQ = db.useQuery({ sessions: {} })
  const participantsQ = db.useQuery({ participants: {} })
  const questionsQ = db.useQuery({ questions: {} })

  const error = sessionsQ.error ?? participantsQ.error ?? questionsQ.error
  if (error) console.error('[AdminSessionList] sessions/participants/questions query error:', error)

  // 1. Error — checked BEFORE empty so an errored query never renders falsely-empty.
  if (error) {
    return (
      <Card data-testid="admin-session-list" className="mt-6">
        <CardHeader><CardTitle>All sessions</CardTitle></CardHeader>
        <CardContent>
          <p data-testid="admin-session-list-error" role="alert" className="text-sm text-destructive">
            {String(error?.message ?? error)}
          </p>
        </CardContent>
      </Card>
    )
  }

  // 2. Loading — explicit element, never a flash of empty.
  if (sessionsQ.isLoading || participantsQ.isLoading || questionsQ.isLoading) {
    return ( /* admin-session-list-loading */ )
  }

  const rows = buildAdminSessionRows(
    sessionsQ.data?.sessions, participantsQ.data?.participants, questionsQ.data?.questions
  )

  // 3. Empty / 4. Populated
  return (
    <Card data-testid="admin-session-list" className="mt-6">
      <CardHeader><CardTitle>All sessions</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p data-testid="admin-session-list-empty" className="text-sm text-muted-foreground">
            No sessions exist yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <a key={r.id} data-testid="admin-session-item" data-session-id={r.id}
                 href={`/admin/sessions/${r.id}`}
                 className="flex flex-col gap-1 rounded-md border px-4 py-3 transition-colors hover:bg-accent">
                <span data-testid="admin-session-status">{r.status ?? ADMIN_VALUE_NONE}</span>
                <span data-testid="admin-session-owner">{r.teacherId ?? ADMIN_VALUE_NONE}</span>
                <span data-testid="admin-session-participant-count">{r.participantCount}</span>
                <span data-testid="admin-session-active-resource">{r.activeResourceId ?? ADMIN_VALUE_NONE}</span>
                <span data-testid="admin-session-current-url">{r.currentUrl ?? ADMIN_VALUE_NONE}</span>
                <span data-testid="admin-session-open-questions">{r.openQuestionCount}</span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

Include a leading block comment (matching `SessionList`) documenting: unscoped reads (no scoping — access is the guard's job), read-only/no-email/no-mutation invariants, error-before-empty ordering, the deferred unindexed-scan trade-off, and the `/admin/sessions/:id` link reserved for the inspector cycle. Style: no semicolons, two-space indent, Tailwind utilities.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run astro check` clean (no warnings)
- [ ] All fixed testids present: `admin-session-list`, `-loading`, `-error`, `-empty`, `admin-session-item` (with `data-session-id`), `admin-session-status`, `-owner`, `-participant-count`, `-active-resource`, `-current-url`, `-open-questions`
- [ ] Each row is `<a href="/admin/sessions/:id">` carrying `data-session-id`
- [ ] Error branch precedes empty branch; error is logged `[AdminSessionList] …` and rendered `role="alert"` — never swallowed; loading renders explicit element
- [ ] No `useAuth`, no `where` filter, no mutation, no email rendered

---

## Task 3: Mount the console on `/admin`

### Overview
Replace the placeholder paragraph inside `AdminRouteGuard` with the new island, hydrated only when the guard authorizes.

### Changes Required
**File**: `src/pages/admin.astro`
**Changes**: Import `AdminSessionList`; keep the `admin-root` heading (existing E2E/walkthrough assert it), replace the "later cycle" paragraph with `<AdminSessionList client:only="react" />` as a nested island inside `AdminRouteGuard` (mirroring the `/dashboard` nested-island mount). Update the page comment to note the console now lands.

```astro
<AdminRouteGuard client:only="react">
  <h1 data-testid="admin-root" class="text-2xl font-semibold">Admin</h1>
  <AdminSessionList client:only="react" />
</AdminRouteGuard>
```

(Widen the container max-width if needed so rows read comfortably.)

### Success Criteria
- [ ] `/admin` renders `admin-root` + `admin-session-list` for an uber admin
- [ ] Non-admin still gets `route-guard-denied`; unauthenticated still bounces to `/login?next=%2Fadmin` (guard unchanged)
- [ ] `npm run astro check` clean
- [ ] Failure paths — delegated to guard + island; no new failure surface

---

## Task 4: Unit tests for `buildAdminSessionRows`

### Overview
Extend the existing co-located admin suite with pure-function coverage of the new helper.

### Changes Required
**File**: `src/lib/admin.test.ts`
**Changes**: Add a `describe('buildAdminSessionRows')` block covering: happy-path join (participant + open-question tallies correct); session with zero participants/questions → counts 0; orphan participant referencing unknown `sessionId` ignored; orphan question referencing unknown `sessionId` ignored; `status === 'answered'` questions excluded, all other statuses counted as open; missing optional fields (`activeResourceId`/`currentUrl` absent/blank → `null`; blank/whitespace `title` → `'(untitled session)'`); deterministic order (createdAt asc, id tie-break for equal/absent createdAt); null/empty/`undefined` inputs → `[]` without throwing; no email present in any output row (`expect(JSON.stringify(rows)).not.toContain('@')` with an `@`-bearing input not part of the consumed fields). Pure function — no mocks.

### Success Criteria
- [ ] `npm run test` green, including all new cases
- [ ] Failure-path cases (orphan rows, null/empty input) assert no throw and correct safe defaults
- [ ] Existing cycle-0019 admin tests still pass

---

## Task 5: E2E console spec

### Overview
Add `e2e/admin-console.spec.ts` mirroring `admin-route.spec.ts`'s skip-loudly + admin-seam pattern, covering the realtime happy path and access-denial failure paths.

### Changes Required
**File**: `e2e/admin-console.spec.ts` (new)
**Changes**: `test.skip(!adminAvailable(), …)` at the top. Use `signInViaUi`, `freshEmail`, `queryAdmin`, and the admin SDK (`init` from `@instantdb/admin`, as `support/auth.ts` does) to seed deterministic data via the rule-bypassing admin token.

- **Happy path + realtime**: seed (admin `transact`) a session owned by a `teacherId`, status `live`, plus one participant; sign in as `admin@blended.test`, `goto('/admin')`; assert `admin-session-list` visible and an `admin-session-item` with that `data-session-id` shows participant count `1` and the seeded status/owner. Then admin-`transact` a second participant **and** set `activeResourceId`/`currentUrl` on the session; without reloading, assert the same row's `admin-session-participant-count` becomes `2` and `admin-session-active-resource` reflects the new value (realtime via `expect(...).toHaveText(...)` polling on the element — never `networkidle`). Assert no email string appears in the rendered list.
- **All-status/all-owner coverage**: seed sessions of differing owners and statuses (`draft`/`ended`); assert each appears as a row (console is unscoped).
- **Failure — denial**: as a `freshEmail()` non-admin, `goto('/admin')` → `route-guard-denied` visible, `admin-session-list` count 0.
- **Failure — unauthenticated**: `goto('/admin')` → URL matches `/login?next=%2Fadmin`.

Seed/cleanup via admin `transact` is read-safe-from-the-app's-view; use fresh ids per run (`crypto.randomUUID()`) so reruns against the shared app never collide. Skip loudly when admin env is unset.

### Success Criteria
- [ ] Spec runs green with admin env set; **skips loudly** (not silently passes) without `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID`
- [ ] Realtime assertion observes count + active-resource update with no `page.reload()`
- [ ] Denial + unauthenticated failure paths asserted
- [ ] No email asserted absent from the rendered console

---

## Task 6: Documentation

### Overview
Docs are part of "done."

### Changes Required
- **`AGENTS.md`**: add a cycle 0020 paragraph documenting `AdminSessionList`, the `buildAdminSessionRows` pure seam in `src/lib/admin.ts`, the three unscoped realtime queries over `sessions`/`participants`/`questions`, the no-schema/no-perms-push fact, the read-only/no-email invariants, the `/admin/sessions/:id` drill-in target reserved for the inspector cycle, the deferred unindexed-scan trade-off, and the fixed testids.
- **`README.md`**: note uber admins now have a live system-wide read-only session console at `/admin`.
- **Cycle docs** (this cycle's folder): note it fulfills ADR-0003's observability intent (ADR-0003 itself unchanged).

### Success Criteria
- [ ] `AGENTS.md`, `README.md` updated; ADR-0003 referenced as realized
- [ ] Testid list in `AGENTS.md` matches the island's emitted testids

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] As an uber admin, `/admin` renders a list containing every session in the system regardless of owner or status, each row showing status, owner `teacherId`, participant count, active resource, current URL, and open-question count. *(user-observable benefit)* | Task 1, 2, 3 | Unscoped queries + helper + mount |
| [ ] With a live session running in other browser contexts, the matching `/admin` row's participant count and active-resource cell update in realtime (no reload) as those contexts join and activate a resource. | Task 2, 5 | `db.useQuery` re-render; E2E realtime assertion |
| [ ] Each session row is a link to `/admin/sessions/:id` carrying `data-session-id` (the inspector drill-in target is wired). | Task 2 | `<a href>` + `data-session-id` |
| [ ] `buildAdminSessionRows` is a pure total function with unit coverage proving: correct participant/open-question tallies, sessions with zero participants/questions yield count 0, a participant/question with an unknown `sessionId` is ignored, and deterministic ordering (createdAt asc, id tie-break). | Task 1, 4 | Helper + unit suite |
| [ ] **Failure path:** when a live query errors, `/admin` renders an inline `role="alert"` error (checked before the empty state) and logs `[AdminSessionList] …`; when zero sessions exist it renders an explicit empty-state element — neither case renders a blank region or a falsely-empty list. | Task 2 | Error-before-empty branch ordering |
| [ ] **Failure path:** a non-admin user (teacher or student) navigating to `/admin` is denied (`route-guard-denied`) and never sees the session list shell; an unauthenticated visitor bounces to `/login?next=%2Fadmin`. | Task 3, 5 | Delegated to unchanged `AdminRouteGuard`; E2E asserts |
| [ ] No email string appears in the rendered console or in `buildAdminSessionRows` output (owner shown as `teacherId`). | Task 1, 4, 5 | Helper omits email; unit + E2E assert absence |
| [ ] All existing tests still pass. | Task 4, 5 | Cycle-0019 admin tests + e2e untouched |
| [ ] No compiler/linter warnings introduced (`npm run astro check` clean). | Task 1, 2, 3 | Gate on every code task |

---

## Testing Strategy

### Unit Tests
- `src/lib/admin.test.ts` (Vitest, no mocks): happy-path participant/open-question tallies; zero-child sessions → 0; orphan participant/question rows (unknown `sessionId`) ignored; `status === 'answered'` excluded, all other statuses counted open; missing/blank optional fields → `null` resource/url and `'(untitled session)'` title; deterministic createdAt-asc/id-tiebreak order including equal/absent createdAt.
- **Failure-path tests**: `null`/`undefined`/`[]` inputs for each of the three args → `[]` without throwing; hostile rows (missing `id` on a child, missing `sessionId`) ignored without throwing; an `@`-bearing field outside the consumed set never leaks into output.
- Mocking strategy: none — the helper is pure; the island's render states are exercised in E2E against the real `db.useQuery` and real (admin-seeded) data rather than a mocked client.

### Integration / E2E Tests
- `e2e/admin-console.spec.ts` (Playwright): realtime cross-context update (seed → assert → admin-`transact` more participants + activate resource → assert row updates with no reload); all-status/all-owner coverage; denial for a non-admin (`route-guard-denied`, list shell absent); unauthenticated bounce to `/login?next=%2Fadmin`; no-email assertion on the rendered list. Skips loudly without admin env, mirroring `e2e/admin-route.spec.ts`. Query-error and empty-state rendering are covered by the unit-tested branch ordering plus the E2E empty case (a fresh app with no seeded sessions, or asserting the empty element when the seed set is cleared) — error injection is not reliably reproducible against the live app, so the error branch is verified by code review of the error-before-empty ordering and the `console.error` log.

## Walkthrough Plan
- **Flow**: Drive the REAL operator console at `/admin` (never the home page). Using the deterministic admin magic-code seam (`@instantdb/admin`, as cycle 0019's walkthrough does), the script (1) admin-`transact`-seeds a session + one participant, (2) signs the allowlisted `admin@blended.test` operator in and opens `/admin` to show the populated console, then (3) admin-`transact`s a second participant and sets an active resource on that session **while the page stays open** to evidence the realtime row update, and (4) signs in a fresh non-allowlisted user to show the denial. Single-page capture harness switches routes/state between captures.
- **Capture points** (ordered, named):
  - `01-login` — the real `/login` island ready (`auth-email-input`).
  - `02-admin-console-populated` — `/admin` for the allowlisted operator showing `admin-session-list` with the seeded session row (status, owner, participant count `1`, active resource `(none)`, open-question count).
  - `03-admin-console-realtime-update` — same `/admin` page after an admin-`transact` adds a participant and sets an active resource: the row's `admin-session-participant-count` now `2` and `admin-session-active-resource` populated, captured without reload (waits on the element text, not `networkidle`).
  - `04-admin-console-denied` — `/admin` for a fresh non-allowlisted signed-in user showing `route-guard-denied` (list shell absent).
- **Preconditions / test data**: dev server `.env` includes `ADMIN_EMAILS=admin@blended.test`, `INSTANT_ADMIN_TOKEN`, `PUBLIC_INSTANTDB_APP_ID`. Auth is the admin-minted magic code (never a real inbox). Sessions/participants are seeded deterministically via the admin SDK with `crypto.randomUUID()` ids so reruns never collide. Realtime captures wait on explicit testid text (`admin-session-participant-count`), never `networkidle` (InstantDB keeps the socket busy). When admin env is unset the walkthrough **degrades loudly** — captures the `/login` surface with a one-line stderr diagnostic — rather than silently falling back to the home page (mirrors cycle 0019).
- **If no observable UI this cycle**: not applicable — this cycle ships an observable new surface (the populated `/admin` console) and the walkthrough exercises it directly.

## Risk Assessment
- **Three separate live queries may resolve at different times**, briefly showing partial counts: acceptable for a realtime operator console (counts converge within InstantDB's sync window); loading state gates the first paint until all three resolve. Mitigation: the combined `isLoading` guard waits for all three before the first render.
- **Unscoped full-table scans don't scale**: accepted MVP trade-off per SPEC; documented as a deferred follow-up (server-side indexing/pagination) in `AGENTS.md`. No mitigation this cycle by design.
- **E2E seeded data pollutes the shared Instant app across reruns**: mitigate with `crypto.randomUUID()` ids per run and scoping assertions to the specific seeded `data-session-id` rather than absolute list length.
- **Realtime E2E flakiness** (timing of cross-context propagation): mitigate with `expect(...).toHaveText(...)` polling with a generous timeout on the specific row's cells, never `waitForTimeout`/`networkidle`.
