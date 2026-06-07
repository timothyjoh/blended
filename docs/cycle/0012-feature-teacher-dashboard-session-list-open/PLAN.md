# Implementation Plan: Cycle 0012

## Overview
Add a realtime, owner-scoped `SessionList` island to the teacher `/dashboard` that subscribes via InstantDB's live query to the `sessions` rows the signed-in user owns (`where: { teacherId: user.id }`), renders each row's title and status, and links each into the existing facilitation view at `/dashboard/sessions/:id` — giving a teacher a durable home base for the sessions they created.

## Current State (from Research)
- `/dashboard` (`src/pages/dashboard/index.astro:15-22`) mounts `RouteGuard` wrapping `dashboard-root` and the `NewSession` island; this is the exact mount point for `SessionList`, beside `NewSession`.
- `NewSession` (`src/components/NewSession.tsx`) is the sibling model for an auth-guarded `client:only="react"` island: identity via `useAuth` (never `db.useAuth()`), inline `role="alert"` error + `console.error('[NewSession] …')`, `Card`/`Button` usage, and an `<a href={\`/dashboard/sessions/${id}\`}>` styled as a button (`created-session-link`).
- `SessionLifecycle` (`src/components/SessionLifecycle.tsx`) is the canonical source for: the `db.useQuery(sessionId ? {…} : null)` null-guard (`:40`), query-error logging (`:57-58`), the inline stable comparator `createdAt` asc tie-broken by `id` (`:64-69`), the loading early-return (`:151-159`), and the explicit empty-state element (`:240-246`). It renders the `session-root` container the navigation acceptance asserts.
- The `sessions` entity (`src/lib/db.ts:48-59`) carries `title`, `status: 'draft'|'live'|'ended'|'archived'`, `teacherId` (un-indexed `i.string()`), `joinCode`, `createdAt`, `interactionMode`; it structurally carries **no email**. `Session` type exported at `src/lib/db.ts:194`.
- `sessions` open-read / owner-only-write permission rules already exist (cycle 0003, `src/lib/perms.ts`) — the owner-scoped read is legal; **no `instant-cli push` this cycle**.
- `src/lib/sessions.ts` holds the pure-core/thin-wrapper convention for session logic and is the natural home for an extracted pure comparator/title helper; it has its own `*.test.ts` (`src/lib/sessions.test.ts`).
- e2e helpers (`e2e/support/auth.ts`): `adminAvailable()`, `freshEmail()`, `mintCode()`, `queryAdmin()`, `signInViaUi()`. The sibling skip idiom and per-suite sign-in/create-session helpers are in `e2e/teacher-question-queue.spec.ts:23-59`.

## Desired End State
- A new `src/components/SessionList.tsx` island is mounted inside `RouteGuard` on `/dashboard`, beside `NewSession`. A signed-in teacher opening `/dashboard` sees a live list of every session they own, each showing title + status, each clickable into `/dashboard/sessions/:id`. New sessions and status transitions appear/update with no reload. Loading, empty (`session-list-empty`), and error (`session-list-error`, `role="alert"`) states are explicit.
- Pure ordering + title-fallback logic lives in `src/lib/sessions.ts`, unit-tested in `src/lib/sessions.test.ts`.
- A new `e2e/dashboard-session-list.spec.ts` proves happy/realtime/navigation/scoping/empty legs, skipping loudly without admin env.
- CLAUDE.md / AGENTS.md and README.md document the island.
- Verify: `npm run test`, `npm run test:e2e`, `npm run astro check` all green; opening `/dashboard` shows the live owned-session list.

## What We're NOT Doing
- No start/end lifecycle controls or in-session panels (live on the facilitation view, cycle 0006).
- No session creation changes — `NewSession` keeps owning that and stays mounted.
- No schema change, no new permission rule, **no `instant-cli push` / `perms:push`**.
- No sorting/filtering controls, pagination, search, archive, or delete.
- No surfacing of sessions the user joined as a Student (owned sessions only).
- No refactor of the existing inline comparator copies in `SessionLifecycle`/`StudentChat` — the SPEC scopes the extraction to `SessionList` only; touching the others is out of scope.

## Implementation Approach
Mirror the established island pattern exactly. `SessionList` reads identity from `useAuth`, runs a single `db.useQuery(user?.id ? { sessions: { $: { where: { teacherId: user.id } } } } : null)` so the filter is applied server-side and the query is skipped (`null`) until the user id resolves. Rows are ordered client-side by a newly-extracted **pure** comparator in `src/lib/sessions.ts` (testable in isolation, satisfying SPEC §117-118), and titles run through a pure `sessionDisplayTitle` fallback. The island renders explicit unresolved-auth (nothing actionable), loading, error, empty, and populated states with the SPEC-fixed testids. Each row is an `<a href>` styled as a row/button (precedent: `created-session-link`) carrying `data-session-id`. The island is read-only (live query + navigation), so there are no writes, locks, or idempotency keys to manage.

## Failure & Resilience Decisions

**Task 1 — pure helpers (`compareSessionsForList`, `sessionDisplayTitle`) in `src/lib/sessions.ts`**: N/A — pure. Total over hostile input by construction: equal `createdAt` tie-broken by `id`; `null`/`undefined`/empty/whitespace title → non-blank placeholder. No I/O, no throw on the read path (these are display helpers, not validating builders).

**Task 2 — `SessionList` island (`src/components/SessionList.tsx`)** — performs a network live query (read) + client navigation:
- **Failure modes**: (a) Live-query error → render an inline `role="alert"` element (`session-list-error`) showing the message AND `console.error('[SessionList] sessions query error:', q.error)`; never render a falsely-empty or blank list. (b) Unresolved auth (`!user?.id`) → pass `null` to `db.useQuery` (no unscoped query issued) and render nothing actionable. (c) Query in flight (`q.isLoading`) → explicit `session-list-loading` element, never a flash of "no sessions". (d) Row with missing/blank title → `sessionDisplayTitle` placeholder so the row stays non-blank and clickable. Navigation is a plain `<a href>`; a broken target is handled by the destination route's existing `SessionRouteGuard`, not here.
- **Idempotency**: Read-only (live query + navigation). No writes, no subprocesses, no files — re-render/remount is inherently safe; the live query re-subscribes and reflects the source of truth. No locks/dedup needed. The only guard is the `null`-query guard when `user?.id` is unresolved.
- **Observability**: Query errors logged with the `[SessionList] …` bracketed prefix (matching sibling islands) to the browser console, plus the inline `role="alert"`.
- **No silent failure**: The error path both logs and renders the alert; it is never swallowed and never collapses to the empty state. The error and empty states are mutually exclusive (error checked before empty).

**Task 3 — unit tests / Task 4 — e2e tests / Task 5 — docs**: N/A — pure (tests) / docs. The e2e suite itself surfaces admin-call failures via the helpers' throw-not-swallow convention and skips loudly without admin env (never a false green).

---

## Task 1: Extract pure ordering + title-fallback helpers

### Overview
Add db-free, unit-testable helpers to `src/lib/sessions.ts` that `SessionList` consumes: a stable comparator (`createdAt` asc, tie-break by `id`) and a non-blank title fallback. This satisfies SPEC §117-118's "extract the SessionList comparator as pure, testable logic" without touching the existing inline copies in `SessionLifecycle`/`StudentChat`.

### Changes Required
**File**: `src/lib/sessions.ts`
**Changes**: Append a small, documented section:

```ts
// ---------------------------------------------------------------------------
// SessionList display helpers (cycle 0012). Pure, db-free, total — extracted so
// the dashboard list's stable ordering and title fallback are unit-testable in
// isolation. Mirrors the inline comparator in SessionLifecycle (createdAt asc,
// tie-break by id) but is the SOLE shared copy SessionList uses.
// ---------------------------------------------------------------------------

/** Minimal shape the list orders/renders — a `sessions` projection row subset. */
export type SessionListRow = {
  id: string
  title?: string | null
  status?: string | null
  createdAt?: number | null
}

/** Placeholder for a row whose projection is missing a usable title (SPEC §94). */
export const SESSION_LIST_TITLE_FALLBACK = '(untitled session)'

/** Non-blank display title — trims, falls back when null/empty/whitespace. */
export function sessionDisplayTitle(title: string | null | undefined): string {
  const t = (title ?? '').trim()
  return t === '' ? SESSION_LIST_TITLE_FALLBACK : t
}

/**
 * Stable comparator: oldest-first by `createdAt`, tie-broken by `id` for a
 * deterministic order without a server-side index. Total over hostile input —
 * a missing `createdAt` sorts as 0 so equal/absent timestamps fall back to the
 * id tie-break rather than producing NaN/unstable order.
 */
export function compareSessionsForList(a: SessionListRow, b: SessionListRow): number {
  const ca = a.createdAt ?? 0
  const cb = b.createdAt ?? 0
  if (ca !== cb) return ca - cb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run astro check`)
- [ ] Unit tests pass (Task 3)
- [ ] Helpers are pure (no `db`/`Date.now()`/network references)
- [ ] Failure paths behave as designed: missing title → placeholder; equal/missing `createdAt` → id tie-break (no NaN, stable)

---

## Task 2: Build the `SessionList` island and mount it on `/dashboard`

### Overview
Create the realtime, owner-scoped island and mount it inside `RouteGuard` on `/dashboard` beside `NewSession`.

### Changes Required
**File**: `src/components/SessionList.tsx` (new)
**Changes**: A `client:only="react"` island following the `NewSession`/`SessionLifecycle` patterns:

```tsx
import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { compareSessionsForList, sessionDisplayTitle } from '@/lib/sessions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SessionList() {
  const { user } = useAuth()
  // Owner-scoped, server-side filter; null-guarded until the user id resolves
  // (mirrors SessionLifecycle's `sessionId ? … : null`) so no unscoped query.
  const q = db.useQuery(
    user?.id ? { sessions: { $: { where: { teacherId: user.id } } } } : null
  )

  // Surface query errors — never swallow (mirrors SessionLifecycle :57-58).
  if (q.error) console.error('[SessionList] sessions query error:', q.error)
```

Render order (each branch an explicit, testid'd element — error before empty so they never collide):
1. **Unresolved auth** (`!user?.id`): render nothing actionable (`return null`) — the `null` query is already not issued.
2. **Error** (`q.error`): `<Card data-testid="session-list" …>` containing `<p data-testid="session-list-error" role="alert" className="… text-destructive">{String(q.error?.message ?? q.error)}</p>` — never the empty state.
3. **Loading** (`q.isLoading`): `<p data-testid="session-list-loading">Loading your sessions…</p>` — never a flash of empty.
4. Compute `const rows = [...(q.data?.sessions ?? [])].sort(compareSessionsForList)`.
5. **Empty** (`rows.length === 0`): `<p data-testid="session-list-empty">You don't own any sessions yet. Create one above.</p>`.
6. **Populated**: a `data-testid="session-list"` container; each row an `<a>`:

```tsx
<a
  key={s.id}
  data-testid="session-list-item"
  data-session-id={s.id}
  href={`/dashboard/sessions/${s.id}`}
  className="flex items-center justify-between rounded-md border px-4 py-3 hover:bg-accent"
>
  <span data-testid="session-list-item-title" className="font-medium">
    {sessionDisplayTitle(s.title)}
  </span>
  <span data-testid="session-list-item-status" className="text-sm text-muted-foreground">
    {s.status}
  </span>
</a>
```

Wrap the list in a `Card` with a `CardTitle` "Your sessions" for visual parity with siblings. Rows render title + status only — never email (structural: the projection has none).

**File**: `src/pages/dashboard/index.astro`
**Changes**: Import and mount beside `NewSession`:

```astro
import SessionList from '@/components/SessionList'
...
  <NewSession client:only="react" />
  <SessionList client:only="react" />
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run astro check`, no new errors/warnings)
- [ ] Island mounts inside `RouteGuard`, hydrates only when authenticated
- [ ] Query uses server-side `where: { teacherId: user.id }` and is `null` until `user?.id` resolves
- [ ] Loading, empty (`session-list-empty`), error (`session-list-error`, `role="alert"`) states all render explicitly and are mutually exclusive
- [ ] Rows show title (with fallback) + status; each is an `<a>` to `/dashboard/sessions/:id` with `data-session-id`
- [ ] Failure paths behave as designed: query error logs `[SessionList] …` and shows the alert, never a falsely-empty list; missing title → placeholder

---

## Task 3: Unit tests for the pure helpers

### Overview
Test `compareSessionsForList` and `sessionDisplayTitle` beside the module — happy path plus hostile input (SPEC §116-118, §131).

### Changes Required
**File**: `src/lib/sessions.test.ts`
**Changes**: Add a `describe('SessionList display helpers', …)` block (real implementations, no mocking):
- `compareSessionsForList`: orders distinct `createdAt` ascending; equal `createdAt` falls back to `id` tie-break (deterministic); missing/`null` `createdAt` treated as 0 (no NaN); empty input array sorts to `[]`; sort is stable across a multi-row fixture.
- `sessionDisplayTitle`: returns trimmed title for a normal string; returns `SESSION_LIST_TITLE_FALLBACK` for `''`, whitespace-only, `null`, and `undefined`.

### Success Criteria
- [ ] `npm run test` passes
- [ ] Covers happy path + hostile input (missing title, equal `createdAt`, empty list, `null` timestamp)
- [ ] No mocking — pure functions exercised directly

---

## Task 4: E2E suite for the dashboard session list

### Overview
Add `e2e/dashboard-session-list.spec.ts` proving initial render, realtime update, navigation, scoping, and empty state against the live app; skip loudly without admin env. E2E is required because this is a UI + realtime change (SPEC §132-133).

### Changes Required
**File**: `e2e/dashboard-session-list.spec.ts` (new)
**Changes**: Follow `e2e/teacher-question-queue.spec.ts` structure — `test.describe` with the loud skip:

```ts
test.skip(!adminAvailable(),
  'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — dashboard-session-list e2e requires admin code minting + live-app realtime')
```

Reuse `signInViaUi`, `freshEmail`, `queryAdmin`. Per-suite helper to sign in a teacher, create a session via `new-session-open → new-session-title → new-session-submit → created-session` and return its title/id. Use explicit testid waits with generous timeouts (15–20s), **never `networkidle`**.

Legs:
1. **Happy path**: teacher with ≥1 owned session opens `/dashboard`; assert a `session-list-item` with matching `session-list-item-title` and a `session-list-item-status` is visible.
2. **Realtime**: with `/dashboard` open in context A, create a second session in context B (same user — reuse the session created via a second tab/context after signing in the same email, or an admin write via the `sessions` projection) and assert a new `session-list-item` appears in A with no reload. (Prefer driving the UI in a second context for the same user; admin write is the fallback per SPEC §126.)
3. **Navigation**: click a `session-list-item`; assert URL is `/dashboard/sessions/:id` and `session-root` is visible.
4. **Scoping**: sign in a different teacher (fresh email) who owns a session, then assert that the first teacher's `/dashboard` does **not** list the other user's session (assert by `data-session-id` absence).
5. **Empty/edge**: a freshly signed-in teacher with zero owned sessions sees `session-list-empty`, not a blank region.

### Success Criteria
- [ ] `npm run test:e2e` passes when admin env present; skips loudly (visible skip reason) when absent
- [ ] All five legs assert via explicit testids, no `networkidle`
- [ ] Realtime leg proves the live update (new row appears with no reload)
- [ ] Scoping leg proves another user's session is absent

---

## Task 5: Documentation updates

### Overview
Documentation is part of "done" (SPEC §135-148).

### Changes Required
**File**: `CLAUDE.md` and `AGENTS.md`
**Changes**: Add a cycle-0012 Data Layer note describing the `SessionList` island: the owner-scoped `sessions` live query (`where: { teacherId }`), its mount inside `RouteGuard` on `/dashboard` beside `NewSession`, the realtime-not-polling guarantee, the loading/empty/error states, and the fixed testids it introduces (`session-list`, `session-list-item` with `data-session-id`, `session-list-item-title`, `session-list-item-status`, `session-list-empty`, `session-list-loading`, `session-list-error`) for downstream reuse.

**File**: `README.md`
**Changes**: Note that the teacher dashboard now lists the teacher's own sessions live and lets them open one into facilitation.

### Success Criteria
- [ ] CLAUDE.md and AGENTS.md carry the cycle-0012 note with the full testid list
- [ ] README.md surfaces the new dashboard capability
- [ ] No stale references introduced

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] Opening `/dashboard` as a signed-in teacher renders a list of that user's owned sessions, each showing title and status — a session owned by a different user does not appear. *(user-observable benefit)* | Task 2, Task 4 (happy + scoping legs) | Server-side `where: { teacherId }` filter |
| [ ] Creating a session in a second browser context (same user) makes a new row appear in the open dashboard list without a manual reload. *(realtime, user-observable benefit)* | Task 2, Task 4 (realtime leg) | Live query, no polling |
| [ ] Clicking a session row navigates to `/dashboard/sessions/:id` and the facilitation view (`session-root`) renders for that session. *(navigation, user-observable benefit)* | Task 2, Task 4 (navigation leg) | `<a href>` row, destination unchanged |
| [ ] When the live query errors, the island renders an inline `role="alert"` error (`session-list-error`) and logs `[SessionList] …` via `console.error`; it does NOT render a falsely-empty or blank list. *(failure-path)* | Task 2 | Error checked before empty; logged + surfaced |
| [ ] When the signed-in teacher owns no sessions, an explicit empty-state element (`session-list-empty`) is shown — not a blank region. | Task 2, Task 4 (empty leg) | |
| [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`). | Task 3, Task 4 | New tests added; no existing tests modified |
| [ ] `npm run astro check` reports no new errors; no compiler/linter warnings introduced. | Task 1, Task 2 | Type-checked island + helpers |

---

## Testing Strategy

### Unit Tests
- `compareSessionsForList`: distinct timestamps order ascending; equal `createdAt` → deterministic `id` tie-break; `null`/missing `createdAt` → treated as 0 (no NaN, stable); empty list → `[]`.
- `sessionDisplayTitle`: normal title trimmed; `''` / whitespace / `null` / `undefined` → `SESSION_LIST_TITLE_FALLBACK`.
- Failure-path coverage: the hostile-input cases above (missing title, equal `createdAt`, empty list) are the failure scenarios for these pure helpers; the island's query-error and unresolved-auth paths are exercised in e2e/inspection (a query-error unit test would require mocking the InstantDB hook, which we avoid — prefer the real path).
- Mocking strategy: none — pure functions tested directly.

### Integration / E2E Tests
- `e2e/dashboard-session-list.spec.ts` (Task 4): happy / realtime / navigation / scoping / empty legs against the live app, skipping loudly without `INSTANT_ADMIN_TOKEN`. Realtime leg is the load-bearing assertion (proves the live update, not just initial render).

## Walkthrough Plan
- **Flow**: Sign in as a teacher → create a session via the dashboard `NewSession` control → land back on `/dashboard` and see it in the new `SessionList` → click the session row → arrive on the facilitation view `/dashboard/sessions/:id` (`session-root`). The subject is the real new `/dashboard` list + the click-through, never the home page.
- **Capture points** (ordered, named):
  - `01-login` — the `/login` island after submitting the email, code field visible (auth seam).
  - `02-dashboard-empty` — `/dashboard` showing the explicit `session-list-empty` state for a fresh teacher (no blank region).
  - `03-session-created` — after creating a session, `/dashboard` showing the new row in `session-list` (`session-list-item` with title + status).
  - `04-session-list-populated` — the populated list, highlighting title + `draft` status on the row.
  - `05-facilitation-view` — after clicking the row, the facilitation view at `/dashboard/sessions/:id` with `session-root` visible.
- **Preconditions / test data**: Auth via the deterministic admin-minted magic code (`signInViaUi` + `mintCode`, never a real inbox); a fresh `freshEmail()` teacher; the session is created in-scenario through the real `NewSession` UI (no seeding required). All realtime/render waits are explicit `getByTestId(...).toBeVisible()` waits with 15–20s budgets — never `networkidle` (InstantDB keeps the socket busy). The scenario skips loudly if `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID` are unset.
- **If no observable UI this cycle**: Not applicable — this cycle builds observable UI (the dashboard session list and its click-through). The walkthrough must exercise the real `/dashboard` and `/dashboard/sessions/:id` routes and must not degrade to the home-page fallback.

## Risk Assessment
- **Realtime flake in the e2e realtime leg**: mitigate with explicit testid waits, generous timeouts, and the existing `retries: 3` in `playwright.config.ts`; never `networkidle`.
- **`teacherId` is un-indexed (`src/lib/db.ts:48-59`)**: the `where` filter still works against the open-read rules at MVP scale; no index/schema change is in scope. If query performance ever matters it is a separate cycle — flagged, not addressed here.
- **Error/empty state collision**: mitigated by ordering branches so `q.error` is checked before the empty computation, guaranteeing an errored query never renders as falsely-empty.
- **Same-user second-context realtime setup**: signing the same email into a second context can be timing-sensitive; the SPEC sanctions an admin `sessions` write as the fallback to trigger the realtime row (`queryAdmin`/admin SDK), keeping the leg deterministic.
