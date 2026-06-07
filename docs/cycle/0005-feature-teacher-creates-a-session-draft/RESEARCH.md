# Research: Cycle 0005

## Cycle Context
SPEC 0005 delivers the "New session" vertical slice on the protected `/dashboard`. It requires a new action module `src/lib/sessions.ts` with two unit-testable pure cores — a crypto-backed `generateJoinCode()` (injectable RNG) and a `buildSessionCreate(input)` builder producing the `SessionCreated` event meta + the `sessions` projection transaction — plus a thin `createSession()` wrapper that calls `writeEvent('SessionCreated', …, [sessions txn])`. It also requires a `src/components/NewSession.tsx` React island rendered inside the existing `RouteGuard` on `/dashboard` that collects a title, reads the signed-in user id via `useAuth`, calls `createSession`, and renders the created session (title, `draft` status, `joinCode`) on success or an inline error (`data-testid="new-session-error"`) on failure. The created session must be set to `status: 'draft'`, `teacherId = user.id`, `interactionMode: 'none'`, generated `joinCode`, trimmed `title`, `createdAt`, with `sessionId === payload.id === id()`. Tests: Vitest over the pure cores (`src/lib/sessions.test.ts`) and Playwright (`e2e/create-session.spec.ts`). None of these files exist today.

## Current Codebase State

### Relevant Components
- Data spine / `writeEvent` choke point: defines schema, `db`, `writeEvent()`, `id`, `applyEvent` — `src/lib/db.ts:1`
- `sessions` entity schema (fields the projection must set): `title`, `status<'draft'|'live'|'ended'|'archived'>`, `teacherId`, unique `joinCode`, optional `joinSlug`, `createdAt`, optional `startedAt`/`endedAt`/`activeResourceId`, `interactionMode<'none'|'cursor_vote'>` — `src/lib/db.ts:48`
- `writeEvent(type, meta, projectionTxns)` dual-write helper — `src/lib/db.ts:302`
- `SessionCreated` fold case (consumes `{ id, title, teacherId }`, forces `status: 'draft'`) — `src/lib/db.ts:210`
- `id()` UUID generator re-export — `src/lib/db.ts:147`
- Auth seam hook `useAuth` (exposes `{ user, isLoading, error, username, … }`) — `src/lib/useAuth.ts:32`
- Route guard wrapping protected islands — `src/components/RouteGuard.tsx:20`
- Dashboard shell where `NewSession` must mount (currently only an `h1` with `dashboard-root`, inside `RouteGuard client:only="react"`) — `src/pages/dashboard/index.astro:1`
- Reference dual-write usage for `SessionCreated` (dev-only, not a product surface) — `src/components/EventSpineHarness.tsx:38`
- UI primitives available: `Button` — `src/components/ui/button.tsx`; `Input` — `src/components/ui/input.tsx`; `Card`/`CardHeader`/`CardTitle`/`CardContent`/… — `src/components/ui/card.tsx`
- Pure auth building blocks (style model for new pure cores; `isValidEmail` total-validation pattern) — `src/lib/auth.ts:24`

### Existing Patterns to Follow
- **Single write path**: every product mutation goes through `writeEvent()`; it appends a `sessionEvents` envelope + caller-supplied projection txn(s) in one `db.transact([eventTx, ...projectionTxns])` — `src/lib/db.ts:326`-`339`. Projection-only writes outside `writeEvent` are disallowed (AGENTS.md "Data Layer").
- **`SessionCreated` shape** (working reference): `writeEvent('SessionCreated', { sessionId, actor: { id: actorId, role: 'teacher' }, payload: { id: sessionId, title, teacherId: actorId } }, [ db.tx.sessions[sessionId].update({ title, status: 'draft', teacherId: actorId, joinCode, createdAt: Date.now(), interactionMode: 'none' }) ])` — `src/components/EventSpineHarness.tsx:45`-`62`. SPEC requires `sessionId` = the new `sessions` row id from `id()`.
- **Pure-core extraction for testability**: db-free pure logic lives in `src/lib/auth.ts` so it unit-tests without initializing the InstantDB client (which needs `PUBLIC_INSTANTDB_APP_ID` at import). `isValidEmail` is total over its input, trims, returns boolean, never throws — `src/lib/auth.ts:24`-`29`. SPEC wants `generateJoinCode`/`buildSessionCreate` to mirror this (pure, injectable RNG).
- **Single auth seam**: components read identity through `useAuth`, never `db.useAuth()` directly — `src/lib/useAuth.ts:33`, AGENTS.md "Auth". `useAuth` returns `user?.id` as the auth id.
- **Component-with-action pattern** (`useState` for error, `try/catch` around the synchronous `writeEvent` validation, `.catch()` on the returned promise, surfaced both inline and via `console.error`) — `src/components/EventSpineHarness.tsx:38`-`119`; product version with inline `data-testid="auth-error"` error, `role="alert"`, disabled-while-pending submit — `src/components/AuthGate.tsx:114`,`193`.
- **`RouteGuard` mounting**: protected islands render as children of `<RouteGuard client:only="react">` in the `.astro` page — `src/pages/dashboard/index.astro:14`.
- **Failure handling**:
  - `writeEvent` validates ALL input synchronously and throws BEFORE issuing any transaction (writes nothing on invalid input) — `src/lib/db.ts:307`-`323`. On a rejected transaction it fails atomically (event append + projection share one `db.transact`), and the rejection propagates to the caller — documented at `src/lib/db.ts:281`-`301`.
  - Callers wrap the synchronous-throw path in `try/catch` and attach `.catch()` to the promise; the message is set into state for inline display AND `console.error`'d — never swallowed — `src/components/EventSpineHarness.tsx:43`-`119`, `src/lib/useAuth.ts:77`-`82`.
  - Owner-only `sessions` write rule (`auth.id == data.teacherId`) means an unauthenticated or mismatched-`teacherId` write is rejected at the data layer — AGENTS.md "Permission rules"; guard against missing auth id before writing as in `EventSpineHarness` (`if (!actorId) …`) — `src/components/EventSpineHarness.tsx:40`-`42`.
- **Observability**: structured events are the `sessionEvents` rows themselves (`type`, `actorRole`, `actorId`, `occurredAt`, `receivedAt`, `payload`) stamped in `writeEvent` — `src/lib/db.ts:326`-`336`. Error logging convention is `console.error('[ComponentName] …', err)` — `src/components/EventSpineHarness.tsx:118`, `src/components/RouteGuard.tsx:49`, `src/lib/useAuth.ts:81`. Cycle/run-level events are in `.cycle/log.jsonl` (engine-owned, not product code).
- **Idempotency / retry-safety**: `writeEvent` is explicitly NOT idempotent (each call appends a fresh event); atomicity makes retry safe (a rejected call leaves no partial state) — `src/lib/db.ts:296`-`299`. The `users`-row creation uses an `inFlight` ref + a `shouldCreateUserRow` guard for its keyed upsert — `src/lib/useAuth.ts:35`,`45`-`55`; `src/lib/auth.ts:47`. No analogous guard exists for session creation (each create is intended to be a distinct new session).

### Dependencies & Integration Points
- `writeEvent`, `db`, `id`, `db.tx.sessions[...].update(...)`, `Session` type — `src/lib/db.ts`
- `useAuth` for the signed-in user id — `src/lib/useAuth.ts`
- `RouteGuard` (cycle 0004) wrapping `/dashboard` — `src/components/RouteGuard.tsx`, `src/pages/dashboard/index.astro`
- UI primitives `@/components/ui/{button,input,card}` and Tailwind — `src/components/ui/`
- `crypto.getRandomValues` (browser/runtime CSPRNG) for `generateJoinCode`; `crypto.randomUUID` is already used in tests/e2e (`e2e/support/auth.ts:34`)
- Live cycle-0003 permission rules (owner-only `sessions` writes, append-only `sessionEvents`) must be pushed for writes to succeed — `src/lib/perms.ts`; push via `npx instant-cli push schema` then `npm run perms:push` (AGENTS.md "Permission rules", SPEC Dependencies)
- e2e sign-in seam: `signInViaUi`, `freshEmail`, `mintCode`, `adminAvailable` — `e2e/support/auth.ts:14`,`23`,`33`,`44`
- Env: `PUBLIC_INSTANTDB_APP_ID` (app, required at `db.ts` import) — `src/lib/db.ts:26`; `INSTANT_ADMIN_TOKEN` (e2e-only deterministic sign-in) — `e2e/support/auth.ts:15`

### Test Infrastructure
- **Frameworks**: Vitest (unit) and Playwright (e2e). Scripts: `npm run test`, `npm run test:e2e`, `npm run astro check` — `package.json` scripts block.
- **Vitest config**: `environment: 'node'`, `include: ['src/**/*.test.ts']` (note: `.ts`, not `.tsx`), env injects `PUBLIC_INSTANTDB_APP_ID: 'test-app-id'` so importing `db.ts` succeeds; coverage scope is `src/lib/**/*.ts` excluding `useAuth.ts` and tests — `vitest.config.ts:1`-`33`. React `.tsx` islands and the hook are intentionally outside unit scope (covered by Playwright).
- **Unit test conventions**: specs live beside their module as `*.test.ts`; `describe`/`it`; `it.each([...])` for table-driven invalid-input cases; assert `toThrow(/regex/)` for failure paths — `src/lib/auth.test.ts:1`-`44`, `src/lib/db.test.ts:138`-`185`. A non-empty dummy `ProjectionTxn[]` stand-in (`[{} as ProjectionTxn]`) is used for validation cases that throw before `db.transact` — `src/lib/db.test.ts:16`.
- **e2e conventions**: specs in `e2e/`, named after the page/feature; `test.describe` with `test.skip(!adminAvailable(), '…unset…')` to skip loudly when env is absent; `client:only` islands get a 15s first-assertion budget and 20s realtime budgets; per-context sign-in via `signInViaUi`; fresh disposable emails/session ids per run; `data-testid` selectors via `page.getByTestId` — `e2e/route-guarding.spec.ts:9`-`67`, `e2e/permissions.spec.ts:10`-`108`. `playwright.config.ts` runs its own dev server on port 4399 with `retries: 3` — `playwright.config.ts:1`-`44`.
- **Failure-path coverage today**: `writeEvent` synchronous-validation throws are unit-covered — `src/lib/db.test.ts:138`-`185`; `applyEvent` unknown-type loud-throw — `src/lib/db.test.ts:73`-`106`; permission-denial and injection rejections are e2e-covered via the dev probe — `e2e/permissions.spec.ts:82`-`104`; the dev harness invalid-write (projection-only) path is exercised by the event-spine e2e. No `sessions.ts`, `NewSession.tsx`, or `create-session.spec.ts` tests exist yet (`grep` for `createSession`/`generateJoinCode`/`buildSessionCreate` returns nothing outside the planned scope).
- **Dev probes available for e2e**: `/dev/event-spine` (`src/components/EventSpineHarness.tsx`) and `/dev/perms-probe` (`src/components/PermsProbe.tsx`) issue live reads/writes and render results to testids; `PermsProbe` uses `db.queryOnce(...)` to read live rows — `src/components/PermsProbe.tsx:48`-`50`. These are gated out of production by their `.astro` routes (`src/pages/dev/`).

## Code References
- `src/lib/db.ts:48` — `sessions` entity definition (all fields the projection sets, unique `joinCode`)
- `src/lib/db.ts:210` — `applyEvent` `SessionCreated` case (payload `{ id, title, teacherId }`, status forced `draft`)
- `src/lib/db.ts:302`-`340` — `writeEvent` signature, synchronous validation, single-transaction dual-write
- `src/lib/db.ts:147` — `id()` re-export (UUIDs for entity ids)
- `src/components/EventSpineHarness.tsx:38`-`66` — canonical `SessionCreated` dual-write + missing-auth guard + error surfacing
- `src/lib/auth.ts:24`-`29` — `isValidEmail` total-validation/trim style to mirror for title validation
- `src/lib/useAuth.ts:32`-`98` — auth seam returning `{ user, isLoading, error, username }`
- `src/components/RouteGuard.tsx:20`-`84` — guard states/testids the new control renders behind
- `src/pages/dashboard/index.astro:12`-`18` — dashboard shell; `NewSession` mounts inside `RouteGuard` here, alongside/replacing the `dashboard-root` `h1`
- `src/components/AuthGate.tsx:114`,`193` — inline error (`role="alert"`, `text-destructive`) + disabled-while-pending submit pattern
- `src/components/ui/button.tsx`, `input.tsx`, `card.tsx` — UI primitives to reuse
- `e2e/support/auth.ts:14`-`57` — `adminAvailable`/`freshEmail`/`mintCode`/`signInViaUi` reused by the new e2e
- `e2e/permissions.spec.ts:42`-`47` — pattern for capturing `teacherId` and asserting a write `ok` against the live app
- `src/lib/db.test.ts:138`-`185` — unit failure-path style (`toThrow(/regex/)`, dummy `ProjectionTxn`)
- `vitest.config.ts:1`-`33` — unit scope: `src/**/*.test.ts`, node env, `useAuth` excluded from coverage
- `playwright.config.ts:1`-`44` — e2e runner on port 4399, retries: 3

## Open Questions
- **Observability assertion mechanism in e2e**: the SPEC's "query the live app for the created session id and assert one `SessionCreated` `sessionEvents` row" — does the planner intend a new/extended dev probe (like `PermsProbe`'s `db.queryOnce`) rendering the event/row to a testid, a Node-side `@instantdb/admin` query inside the spec (admin token already available in `e2e/support`), or asserting against the on-screen rendered session only? `e2e/support/auth.ts` currently exposes only code-minting, no admin query helper.
- **`createSession` return contract**: whether the wrapper returns the created `Session` (or `{ sessionId, joinCode, … }`) for the UI to render, versus the UI re-querying via `db.useQuery`. SPEC describes "renders the resulting session … on success," but the exact return shape of `createSession`/`buildSessionCreate` (and how `NewSession` obtains the rendered values without navigating away) is unspecified.
- **`generateJoinCode` exact length / charset**: SPEC mandates "unambiguous character set" and "sufficient length for MVP privacy" but fixes no concrete value — the planner must pin the length and charset constant that the unit test (`charset membership`, `correct length`) will assert against.
- **Testid names for the created-session surface**: SPEC fixes `new-session-error`; the testids for the created session, its status, and its join code (referenced in acceptance criteria and to be documented in AGENTS.md for downstream cycles) are not yet named.
- **Whether the new control replaces or sits beside `dashboard-root`**: existing e2e (`route-guarding.spec.ts:41`,`66`) asserts `dashboard-root` visibility; the planner must preserve that testid when adding `NewSession` to `src/pages/dashboard/index.astro`.
