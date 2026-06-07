# Research: Cycle 0020

## Cycle Context
SPEC.md replaces the `/admin` placeholder paragraph (cycle 0019) with a read-only, realtime, system-wide session console reachable only by uber admins. It requires two new artifacts: a pure total aggregation helper `buildAdminSessionRows(sessions, participants, questions)` added to `src/lib/admin.ts` that folds the three projection lists into deterministically-ordered per-session rows (`{ id, title, status, teacherId, participantCount, activeResourceId, currentUrl, openQuestionCount }`), and an `AdminSessionList` React island mounted inside the existing `AdminRouteGuard` on `/admin` that runs **unscoped** realtime `db.useQuery` over `sessions`, `participants`, and `questions`, renders the helper's rows with mutually-exclusive loading/error/empty/populated states, and links each row to `/admin/sessions/:id`. No new schema, no perms push, no mutations, no email exposure. The cycle reuses the cycle-0019 admin role/guard and the existing session/participant/question projections verbatim.

## Current Codebase State

### Relevant Components
- **`/admin` page shell**: an Astro page mounting `AdminRouteGuard` as a nested `client:only="react"` island; the guard's children are currently a static `admin-root` heading + placeholder paragraph ("Observability surfaces arrive in a later cycle.") — `src/pages/admin.astro:18-23`.
- **`AdminRouteGuard`**: runs the own-`users`-row `db.useQuery`, folds `adminLevel` through `authorizeAdmin`, and hands `RouteGuard` a precomputed decision; logs query errors via `console.error('[AdminRouteGuard] …')` — `src/components/AdminRouteGuard.tsx:18-43`.
- **`RouteGuard`**: resolves loading/unauthenticated(→`/login?next=…`)/auth-error(→`route-guard-denied`)/authorized states; refines with the optional `authorize` decision (`loading`/`denied`/render children) — `src/components/RouteGuard.tsx:20-95`.
- **`authorizeAdmin`**: pure verdict — `error` beats `loading`, then `authorized` only when normalized `adminLevel === 'uber'`, else `denied`; total, never throws — `src/lib/routing.ts:66-77`.
- **`src/lib/admin.ts`**: db-free pure admin building blocks (cycle 0019): `ADMIN_LEVEL_NONE`/`ADMIN_LEVEL_UBER`, `normalizeAdminLevel`, `parseAdminEmails`, `isEmailAllowlisted`, `decideBootstrap` — the file the new `buildAdminSessionRows` helper lands in — `src/lib/admin.ts:1-86`.
- **`SessionList` island**: the closest existing precedent — an owner-scoped realtime `db.useQuery` over `sessions` with explicit mutually-exclusive unresolved/error/loading/empty/populated states and per-row drill-in links — `src/components/SessionList.tsx:25-128`.

### Existing Patterns to Follow
- **Pure-core / thin-wrapper seam**: deterministic logic lives in db-free pure functions co-located in `src/lib/*.ts` and unit-tested without a client. `admin.ts` helpers are all documented as TOTAL ("hostile/empty/missing input resolves to the safe default rather than throwing") — `src/lib/admin.ts:11-15`. The new helper must follow this verbatim.
- **Deterministic ordering comparator**: `compareSessionsForList` sorts `createdAt` asc, tie-broken by `id`; total over hostile input (missing `createdAt` → 0) — `src/lib/sessions.ts:797-805`. `SessionListRow` type is `{ id; title?; status?; createdAt? }` — `src/lib/sessions.ts:775-780`. The SPEC's required row ordering (createdAt asc, id tie-break) matches this exactly.
- **Non-blank title fallback**: `sessionDisplayTitle` trims and falls back to `SESSION_LIST_TITLE_FALLBACK` (`'(untitled session)'`) — `src/lib/sessions.ts:783-789`.
- **Island state ordering (the canonical failure-aware render)** in `SessionList`: (1) unresolved auth → `return null`; (2) error → inline `role="alert"` `session-list-error`, checked **before** empty; (3) loading → explicit `session-list-loading`; (4) sort rows via pure comparator; (5) empty → `session-list-empty`; (6) populated rows. Each row is `<a data-testid="session-list-item" data-session-id={s.id} href="/dashboard/sessions/${s.id}">` — `src/components/SessionList.tsx:33-126`.
- **Card primitives**: rows/containers use `Card`/`CardContent`/`CardHeader`/`CardTitle` from `@/components/ui/card` with Tailwind utilities — `src/components/SessionList.tsx:4`, `:60-126`.
- **Nested-island mount pattern**: protected islands are mounted as `client:only="react"` children of the guard so they hydrate only when authorized (`SessionList`/`NewSession` inside `RouteGuard` on `/dashboard`) — `src/pages/dashboard/index.astro:22-26`. `AdminSessionList` mounts the same way inside `AdminRouteGuard`.
- **Identity seam**: islands read identity through `useAuth` (never `db.useAuth()`), null-guarding the query until the id resolves — `src/components/SessionList.tsx:26-31`, `src/components/AdminRouteGuard.tsx:19-22`. (For the admin console the SPEC specifies an **unscoped** query — no `where` filter — distinct from `SessionList`'s owner scoping.)
- **Failure handling**: query errors are surfaced inline as `role="alert"` and logged via `console.error('[Component] …')`, NEVER swallowed, and the error state is checked **before** the empty state so an errored query never renders as falsely-empty — `src/components/SessionList.tsx:34-58`, `src/components/AdminRouteGuard.tsx:30`. No retry/timeout machinery exists in these islands; failure surfaces are render-state branches driven by `db.useQuery`'s `{ isLoading, error, data }`.
- **Observability**: the convention in this change area is `console.error('[ComponentName] <what> error:', err)` — `src/components/SessionList.tsx:32`, `src/components/AdminRouteGuard.tsx:30`. Structured `.cycle/log.jsonl` events are engine-level (cycle lifecycle), not product runtime; the product event spine (`sessionEvents`/`writeEvent`) is for mutations only and is explicitly **out of scope** (read-only console).
- **Idempotency / retry-safety**: not applicable to this read-only console — there are no mutations, locks, or dedup keys to respect. The only "guard" the planner must respect is the access guard (`AdminRouteGuard` → `RouteGuard`); the helper's totality (never throws on partial/orphan/missing input) is the safety mechanism the SPEC mandates.
- **Coding style**: TypeScript without semicolons, two-space indent, Tailwind utilities over ad-hoc CSS, `.tsx` for interactive islands — `AGENTS.md` "Coding Style & Naming Conventions".

### Dependencies & Integration Points
- **Schema (read-only, no change)** — `src/lib/db.ts:39`, `i.schema`:
  - `sessions`: `title`, `status<'draft'|'live'|'ended'|'archived'>`, `teacherId`, `createdAt`, `activeResourceId?`, `currentUrl?`, `currentUrlVersion?` — `src/lib/db.ts:55-77`.
  - `participants`: `sessionId` (indexed), `userId`, `role`, `username`, `joinedAt`, `lastSeenAt`, `chatStatus` — **no `email` field** (privacy is structural) — `src/lib/db.ts:100-112`.
  - `questions`: `sessionId` (indexed), `status`, `activeResourceIdAtSubmission?`, `addressedBy?`, `answerSummary?`, `createdAt` — `src/lib/db.ts:139-146`.
- **Open-question definition**: questions carry `status: 'submitted'` on creation and `status: 'answered'` when answered — `src/lib/sessions.ts:567`, `:701`, `:717`, `:724`; `src/lib/db.ts:439`, `:473`. The SPEC defines open-question count as `questions` for that session with `status !== 'answered'`.
- **Open-read permission rules (already permit unscoped client reads, no `perms:push`)** — `sessions.allow.view: 'true'` (`src/lib/perms.ts:73`), `participants.allow.view: 'true'` (`src/lib/perms.ts:131`), `questions: { allow: { $default: 'true' } }` (`src/lib/perms.ts:176`).
- **`db` client + `db.useQuery`**: the single InstantDB client/schema source; product code imports `db` from `src/lib/db.ts` (never re-inits) — `AGENTS.md` "Data Layer"; consumed in islands as `db.useQuery(query)` returning `{ data, isLoading, error }` — `src/components/SessionList.tsx:28`.
- **Drill-in target `/admin/sessions/:id`**: does not yet exist (the inspector page is a sibling cycle, out of scope); this cycle only emits the `<a href>` + `data-session-id`. No page exists under `src/pages/admin/` (only `src/pages/admin.astro` and `src/pages/api/admin/bootstrap.ts`).

### Test Infrastructure
- **Unit framework**: Vitest (`npm run test` → `vitest run`) — `package.json:11-13`. Co-located `*.test.ts` beside source in `src/lib/` (e.g. `src/lib/admin.test.ts`, `src/lib/sessions.test.ts`).
- **Unit conventions**: `describe`/`it`/`it.each`/`expect`; pure-function tests with no mocks; hostile-input rows tested explicitly. `src/lib/admin.test.ts` already exercises the cycle-0019 admin helpers (constants, `normalizeAdminLevel`, `parseAdminEmails`, `isEmailAllowlisted`, `decideBootstrap`) — `src/lib/admin.test.ts:1-150`. The SPEC adds `buildAdminSessionRows` coverage to this same file.
- **E2E framework**: Playwright (`npm run test:e2e`) under `e2e/`. Admin specs gate on `adminAvailable()` and **skip loudly** when `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are unset — `e2e/admin-route.spec.ts:14-18`.
- **E2E helpers**: `e2e/support/auth.ts` exports `adminAvailable` (`:14`), `mintCode` (`:23`), `freshEmail` (`:33`), `queryAdmin` (`:43`), `signInViaUi` (`:58`). `admin-route.spec.ts` uses allowlisted `admin@blended.test` and asserts denial via `route-guard-denied` testid + `admin-root` absence — `e2e/admin-route.spec.ts:60-79`.
- **Type/lint gate**: `npm run astro check` (also run in `build`) must be clean — `package.json:7`; `AGENTS.md` "Build, Test & Development Commands".
- **Failure-path coverage today**: unit-level failure paths exist for the admin helpers (legacy/garbage/empty/null input → safe default) — `src/lib/admin.test.ts:22-49`, `:90-149`. E2E failure paths exist for access denial: non-allowlisted signed-in user denied, unauthenticated bounce to `/login` — `e2e/admin-route.spec.ts:62-80`. No tests yet exercise `AdminSessionList` query-error or empty-state rendering (the island does not exist); `SessionList` provides the analogous render-state structure to mirror.

## Code References
- `src/pages/admin.astro:18-23` — placeholder children inside `AdminRouteGuard` that this cycle replaces with `AdminSessionList`.
- `src/components/AdminRouteGuard.tsx:18-43` — the guard the console mounts inside; reused verbatim, no new auth.
- `src/components/RouteGuard.tsx:20-95` — the four-state guard producing `route-guard-denied` / `route-guard-loading` / `/login` bounce.
- `src/lib/routing.ts:66-77` — `authorizeAdmin` pure verdict (`uber` only).
- `src/lib/admin.ts:1-86` — destination file for `buildAdminSessionRows`; documents the TOTAL pure-helper convention to follow.
- `src/components/SessionList.tsx:25-128` — render-state template (unresolved/error/loading/empty/populated), `role="alert"` + `console.error`, per-row `data-session-id` drill-in link.
- `src/lib/sessions.ts:775-805` — `SessionListRow` type, `sessionDisplayTitle`, `compareSessionsForList` (createdAt asc, id tie-break) — the ordering pattern the helper mirrors.
- `src/lib/db.ts:55-77` — `sessions` entity fields (`status`, `teacherId`, `activeResourceId?`, `currentUrl?`, `createdAt`).
- `src/lib/db.ts:100-112` — `participants` entity (`sessionId`, no `email`).
- `src/lib/db.ts:139-146` — `questions` entity (`sessionId`, `status`).
- `src/lib/perms.ts:73`, `:131`, `:176` — open `view: 'true'` rules on `sessions`/`participants`/`questions` (no perms push needed).
- `src/lib/sessions.ts:567`, `:701`, `:717`, `:724` — question status lifecycle `'submitted'`→`'answered'` defining "open" (`!== 'answered'`).
- `src/lib/admin.test.ts:1-150` — existing admin-helper unit suite the new tests extend.
- `e2e/admin-route.spec.ts:1-80` — admin E2E skip-loudly + denial-assertion pattern to extend for `e2e/admin-console.spec.ts`.
- `e2e/support/auth.ts:14,23,33,43,58` — admin E2E helpers.
- `src/pages/dashboard/index.astro:22-26` — nested `client:only="react"` mount pattern for an island inside a guard.

## Open Questions
- The SPEC requires participant/question rows be keyed back to sessions by `sessionId`; the `participants` and `questions` projection row shapes consumed by `buildAdminSessionRows` (which fields the unscoped `db.useQuery` returns and their optionality) should be confirmed against live query output during planning, since the helper must tolerate orphan rows referencing unknown `sessionId`s.
- The `activeResourceId`/`currentUrl` "none" affordance is specified as an explicit element but its exact rendered text/testid content is left to implementation; the fixed testid `admin-session-active-resource` / `admin-session-current-url` are mandated but the empty-value display string is unspecified.
- Whether `buildAdminSessionRows` should derive `title` display via the existing `sessionDisplayTitle` fallback or carry the raw `title` (the SPEC's row shape lists `title` without specifying fallback handling) is a planner decision.
