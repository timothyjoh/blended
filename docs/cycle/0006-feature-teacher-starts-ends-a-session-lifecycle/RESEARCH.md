# Research: Cycle 0006

## Cycle Context
SPEC.md (`docs/cycle/0006-feature-teacher-starts-ends-a-session-lifecycle/SPEC.md`) asks for the session lifecycle state machine as one vertical slice extending cycle 0005's session-creation core. Concretely: a pure legal-transition guard enforcing SPEC §6.2 (`draft → live`, `live → ended` only); pure builders `buildSessionStart` / `buildSessionEnd` that validate the transition + owner identity and produce the `SessionStarted` / `SessionEnded` envelope meta plus the `sessions` projection txn (stamping `startedAt`/`endedAt`); thin async wrappers `startSession` / `endSession` routing the dual-write through `writeEvent()`; new `applyEvent` fold cases for the two events so the log still rebuilds the projection; a pure `isJoinEnabled(session)` predicate (`true` iff `status === 'live'`); and owner-only Start/End controls on the existing `/dashboard/sessions/[id]` detail page (replacing the placeholder shell) that reflect status and the join gate, with an inline error on illegal/non-owner/failed transitions. All while honoring single-write-path (`writeEvent`), single-auth-seam (`useAuth`), and the cycle-0003 owner-only `sessions` permission rule.

## Current Codebase State

### Relevant Components
- **Session lifecycle core (to be extended)**: `src/lib/sessions.ts` holds the cycle-0005 pure-core split — `generateJoinCode`, `buildSessionCreate` (pure builder, validate-before-build), `createSession` (thin async wrapper) — `src/lib/sessions.ts:1-135`. This is where the new transition guard, `buildSessionStart`/`buildSessionEnd`, `startSession`/`endSession`, and `isJoinEnabled` land.
- **`SessionRecord` type**: `status: 'draft'` is hardcoded (literal) in the cycle-0005 record — `src/lib/sessions.ts:44-53`. The broader `Session` entity status union is `'draft' | 'live' | 'ended' | 'archived'`.
- **Dual-write choke point**: `writeEvent(type, meta, projectionTxns)` appends a §7.2 `sessionEvents` envelope + projection txn(s) in one `db.transact()` — `src/lib/db.ts:302-340`. Validates synchronously before issuing the transaction (`src/lib/db.ts:307-323`).
- **Fold / replay**: `applyEvent` switch over event type with a `SessionCreated` case and a `ParticipantJoined` case; `default` throws `UnknownEventTypeError` — `src/lib/db.ts:208-250`. `rebuildSessionProjection` sorts via `compareEvents` then folds — `src/lib/db.ts:256-262`.
- **`SessionProjection` shape**: `session: { id; title; status; teacherId } | null` — `src/lib/db.ts:173-177`. Note: the folded `session` object carries only those four fields (no `startedAt`/`endedAt`); the `SessionCreated` case sets `status: 'draft'` literally — `src/lib/db.ts:210-221`.
- **`sessions` entity** (already carries the needed fields): `status: i.string<'draft'|'live'|'ended'|'archived'>()`, `startedAt: i.number().optional()`, `endedAt: i.number().optional()` — `src/lib/db.ts:48-59`. No schema change required for this cycle.
- **Session detail page (placeholder to replace)**: `src/pages/dashboard/sessions/[id].astro` renders `SessionRouteGuard client:only="react"` wrapping a placeholder `<h1 data-testid="session-root">` — `src/pages/dashboard/sessions/[id].astro:1-22`. The `[id]` param is passed straight to the island, defaulting to `''`.
- **Ownership guard**: `SessionRouteGuard` (`src/components/SessionRouteGuard.tsx:17-39`) runs the `sessions` `db.useQuery`, folds through `authorizeOwnership` (`session.teacherId === user.id`), and hands `RouteGuard` a precomputed decision. Already owner-gates the detail page.
- **Post-create card (detail link hangs off here)**: `NewSession` renders the `created-session` card after a successful create — `src/components/NewSession.tsx:94-117`. No link to the detail page exists yet; the SPEC asks to add one from this card.
- **Auth seam**: `useAuth` exposes `{ user, isLoading, error, username, … }` — `src/lib/useAuth.ts:32-98`. Product code reads identity exclusively here.

### Existing Patterns to Follow
- **Pure-core split (validate-before-build, injectable deps)**: builders validate totally and `throw` BEFORE producing any plan/txn; thin async wrappers default real deps but accept injected ones for tests. `buildSessionCreate` throws on blank title / missing `teacherId` (`src/lib/sessions.ts:75-97`); `createSession` accepts `CreateSessionDeps { write?, buildTxn? }` (`src/lib/sessions.ts:100-134`). Mirror this for `buildSessionStart`/`buildSessionEnd` + `startSession`/`endSession`.
- **Envelope meta shape**: `WriteEventMeta = { sessionId, actor: {id, role}, payload, … }`; `buildSessionCreate` sets `actor: { id: teacherId, role: 'teacher' }`, `sessionId === payload.id` — `src/lib/sessions.ts:91-95`. SPEC requires the same `actor.role: 'teacher'` and `sessionId === payload.id` for the new builders.
- **Projection txn builder**: `defaultBuildTxn` returns `db.tx.sessions[r.id].update({...})` — `src/lib/sessions.ts:105-113`. New transitions issue `db.tx.sessions[id].update({ status, startedAt|endedAt })` via `writeEvent`, never directly.
- **`applyEvent` fold case shape**: each case narrows `event.payload`, defensively coerces field types (`typeof p.x === 'string' ? … : default`), and returns a new projection object (no mutation) — `src/lib/db.ts:210-242`. New `SessionStarted`/`SessionEnded` cases update the folded `session.status` (and must handle an absent prior `session` without throwing a spurious `UnknownEventTypeError`).
- **`UserSignedIn` is intentionally outside the fold**: identity events hit `default` and throw by design — `src/lib/db.ts:243-249`, locked by a test at `src/lib/db.test.ts:97-105`. The two new lifecycle types must become *known* cases so they no longer fall through.
- **Pure total predicates / helpers convention**: `routing.ts` helpers (`authorizeOwnership`, `safeNextPath`) are total — hostile/missing input resolves to a safe default, never throws (`src/lib/routing.ts`). `isJoinEnabled` should follow: total over null/absent/unknown status, returning `false`.
- **UI island pattern**: `client:only="react"` islands inside a guard, identity via `useAuth` (never `db.useAuth()`), inline `role="alert"` error + `console.error` on failure, never swallowed — `NewSession.tsx:28-55`. `NewSession` keeps created-session UI state untouched on failure (no half-applied state) — `src/components/NewSession.tsx:47-54`.
- **Failure handling (today's approach)**:
  - Builders throw synchronously on invalid input *before* any txn — `src/lib/sessions.ts:77,79`; `writeEvent` likewise validates before transacting — `src/lib/db.ts:307-323`.
  - Atomicity: event append + projection share one `db.transact()`, so a rejected write leaves no partial state — `src/lib/db.ts:338-339`, documented `src/lib/sessions.ts:115-124`.
  - Async rejections propagate to the caller; UI catches and surfaces (`surface()` sets inline error + `console.error`) — `src/components/NewSession.tsx:28-32, 47-54`.
  - Query errors are logged and folded to a `denied` decision, never swallowed — `src/components/SessionRouteGuard.tsx:28`, `src/lib/routing.ts:authorizeOwnership` (error wins over loading).
- **Observability conventions**: the durable observability surface is the `sessionEvents` append log written by `writeEvent` (`actorId`, `actorRole`, `occurredAt`, `receivedAt`, `payload`) — `src/lib/db.ts:326-336`. There is no metrics system in product code. E2e asserts observability via the Node-side admin read `queryAdmin` (`e2e/support/auth.ts:43-49`). The engine-level event stream is `.cycle/log.jsonl` (cycle lifecycle, not product code). UI surfaces failures via `console.error` with a bracketed component tag (`[NewSession]`, `[SessionRouteGuard]`, `[RouteGuard]`, `[useAuth]`).
- **Idempotency / retry-safety**: `writeEvent` is NOT idempotent by design (each call appends a fresh event) — `src/lib/db.ts:296-298`; `createSession` is NOT idempotent (fresh id per call) — `src/lib/sessions.ts:118-120`. The retry-safety the SPEC relies on for transitions is the **legal-transition guard fed the current status**: re-issuing `start` on an already-`live` session must be rejected by the guard (stale-tab / duplicate-event protection), not deduped. `RouteGuard`/`useAuth` use one-shot `useRef` latches against double-fire (`RouteGuard.tsx:29`, `useAuth.ts:35`).

### Dependencies & Integration Points
- `writeEvent`, `applyEvent`, `rebuildSessionProjection`, `db`, `id`, `ProjectionTxn`, `WriteEventMeta`, `Session`, `UnknownEventTypeError` — all from `src/lib/db.ts` (the single schema/client module).
- `createSession` core + cycle-0005 post-create card — `src/lib/sessions.ts`, `src/components/NewSession.tsx`.
- `SessionRouteGuard` + `/dashboard/sessions/[id]` route shell — `src/components/SessionRouteGuard.tsx`, `src/pages/dashboard/sessions/[id].astro`.
- `useAuth` for the signed-in user id — `src/lib/useAuth.ts`.
- UI primitives available under `src/components/ui/`: `button.tsx`, `card.tsx`, `input.tsx`, `badge.tsx`, plus others — SPEC restricts new UI to `button` and `card`.
- Cycle-0003 permission rules (data-layer backstop): owner-only `sessions` writes (`auth.id == data.teacherId`), append-only `sessionEvents` — described in AGENTS.md; source `src/lib/perms.ts`. Push with `npx instant-cli push schema` then `npm run perms:push` if a transition write is rejected.
- E2e helpers: `signInViaUi`, `freshEmail`, `queryAdmin`, `adminAvailable`, `mintCode` — `e2e/support/auth.ts:14-71`.

### Test Infrastructure
- **Frameworks**: Vitest for pure-logic unit specs (`npm run test`, `:watch`, `:coverage`); Playwright for browser/e2e (`npm run test:e2e`, dev server on port 4399, `retries: 3`); plus `npm run astro check`.
- **Conventions**: unit specs co-located as `*.test.ts` beside the module; e2e specs in `e2e/` named after the feature. Pure cores are unit-tested with injected deps (no DOM/InstantDB); `.tsx` islands and hooks stay outside unit scope and are covered by e2e.
- **Current coverage of the change area**:
  - `src/lib/sessions.test.ts:1-129` — covers `generateJoinCode`, `buildSessionCreate` (incl. blank/missing-teacherId rejection), `createSession` (success, rejected-write propagation, sync-throw-without-write). The SPEC extends THIS file for the lifecycle core.
  - `src/lib/db.test.ts:52-134` — `applyEvent` fold (`SessionCreated`, `ParticipantJoined`, unknown-type throw, no-mutation, identity-event-not-folded), `rebuildSessionProjection` determinism, `writeEvent` input validation. New `SessionStarted`/`SessionEnded` fold cases extend here.
  - `e2e/create-session.spec.ts:1-76` — the create flow + observability via `queryAdmin` + blank-title failure path; the template the new `e2e/session-lifecycle.spec.ts` mirrors (skip-loudly guard at `:15-18`).
- **Failure-path test coverage (exists today)**:
  - Unit: rejected-write propagation and sync-throw-without-write — `src/lib/sessions.test.ts:104-128`; unknown-event-type throw — `src/lib/db.test.ts:74-82, 109-134`; `writeEvent` validation throws — `src/lib/db.test.ts:138-182`.
  - E2e: blank-title inline error + no session created — `e2e/create-session.spec.ts:63-75`; route-guarding denial paths — `e2e/route-guarding.spec.ts`; permission rules end-to-end — `e2e/permissions.spec.ts`.

## Code References
- `src/lib/sessions.ts:44-53` — `SessionRecord` type with hardcoded `status: 'draft'`.
- `src/lib/sessions.ts:75-97` — `buildSessionCreate` pure builder (validate-before-build; `actor.role: 'teacher'`, `sessionId === payload.id`).
- `src/lib/sessions.ts:100-134` — `createSession` thin wrapper + `CreateSessionDeps` injection + `defaultBuildTxn`.
- `src/lib/db.ts:48-59` — `sessions` entity: `status` union, `startedAt`/`endedAt` optional (present, no migration needed).
- `src/lib/db.ts:173-177` — `SessionProjection.session` shape (only `id/title/status/teacherId`).
- `src/lib/db.ts:208-250` — `applyEvent` switch (`SessionCreated`, `ParticipantJoined`, `default` throws `UnknownEventTypeError`).
- `src/lib/db.ts:256-262` — `rebuildSessionProjection`.
- `src/lib/db.ts:302-340` — `writeEvent` (validation, envelope stamping, single atomic transaction).
- `src/components/SessionRouteGuard.tsx:17-39` — ownership query + `authorizeOwnership` fold for the detail route.
- `src/components/NewSession.tsx:20-120` — cycle-0005 island pattern (useAuth, inline error/console.error, post-create card to add a detail link to).
- `src/pages/dashboard/sessions/[id].astro:1-22` — placeholder detail shell to replace with the lifecycle island.
- `src/lib/routing.ts` — pure total-helper convention (`authorizeOwnership`, `safeNextPath`) to mirror for `isJoinEnabled`/`assertLegalTransition`.
- `e2e/support/auth.ts:14-71` — `adminAvailable`, `freshEmail`, `signInViaUi`, `queryAdmin`, `mintCode`.
- `e2e/create-session.spec.ts:14-76` — e2e template (skip-loudly + observability via `queryAdmin`).
- `src/lib/db.test.ts:36-50, 52-134` — `applyEvent`/`rebuildSessionProjection` test fixtures and structure to extend.
- AGENTS.md "Session creation (cycle 0005)" + "Permission rules" sections — invariants (single write path, owner-only `sessions`, append-only `sessionEvents`) and the existing testid registry the SPEC extends.
- `README.md`, `docs/release-notes.md`, `release-notes.md` — doc targets named in the SPEC's Documentation Updates.

## Open Questions
- The `SessionProjection.session` object currently has no `startedAt`/`endedAt` fields (`src/lib/db.ts:173-177`); the SPEC's acceptance for `applyEvent` only requires `status === 'ended'` after the full lifecycle fold. Whether the folded projection type should additionally carry the timestamps (vs. only the live `sessions` row carrying them) is a planner decision — the SPEC text emphasizes `status` for the fold and timestamps on the live projection row.
- Exact placement/labels of the join-enablement affordance (`session-join-state`) and the Start/End controls within the detail island, and whether the detail link from the post-create card is a plain anchor or a `Button` — left to the plan; the SPEC fixes only the testids (`session-start`, `session-end`, `session-status`, `session-join-state`, `session-lifecycle-error`).
- Whether the lifecycle island reuses `SessionRecord` or reads the live `Session` entity type from `db.useQuery` for status display — the SPEC says the island reads the live session via `db.useQuery`; the builders operate on a session-like input carrying `status` + `teacherId`.
