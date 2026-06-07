I now have everything needed to write the research document.

```markdown
# Research: Cycle 0007

## Cycle Context

SPEC.md (`docs/cycle/0007-feature-student-joins-via-link-and-becomes-a-par/SPEC.md`) asks for the **student join vertical slice end-to-end**: a `/join/:joinCode` route that gates auth via the existing `RouteGuard`, looks up the Session by `joinCode` via a live query, and on a `live` Session calls a single sanctioned `joinSession` path (pure `buildParticipantJoin` builder + `joinSession` wrapper in `src/lib/sessions.ts`) that routes a dual-write through `writeEvent('ParticipantJoined', …)` — committing the `ParticipantJoined` envelope and a `participants` projection row (`role: 'student'`, `username` = email local-part, `userId`, `sessionId`, `joinedAt`, `lastSeenAt`, `chatStatus: 'allowed'`) in one transaction — then routes to `/s/:joinCode`. It must be idempotent per (user, session). It also requires a `/s/:joinCode` student session view backed by a live `db.useQuery` (proving late-joiner sync), clear non-blank states for unknown / non-live / unauthenticated / error cases, and tightening the currently fail-open `participants` permission rules in `src/lib/perms.ts` to owner-scoping before any participant rows are written.

## Current Codebase State

### Relevant Components

- **Session domain logic (creation + lifecycle)**: `src/lib/sessions.ts` — holds the pure-core/thin-wrapper pattern this cycle must extend with `buildParticipantJoin` / `joinSession`. `createSession` (`:125`), `startSession`/`endSession` (`:261`,`:277`), pure builders `buildSessionCreate` (`:75`), `buildSessionStart`/`buildSessionEnd` (`:199`,`:223`), and the join gate `isJoinEnabled(session)` (`:293`, `true` iff `status === 'live'`). `SessionStatus` type at `:147`.
- **Event spine / dual-write choke point**: `src/lib/db.ts` — `writeEvent(type, meta, projectionTxns)` (`:326`), the only sanctioned projection-write path. `applyEvent` already folds `ParticipantJoined` keyed by `participantId ?? event.id` (`:246`-`:266`). `participants` entity schema (`:81`-`:93`) — fields `sessionId` (indexed), `userId`, `role` (`'teacher'|'student'|'assistant'|'ai'`), `username`, `joinedAt`, `lastSeenAt`, `chatStatus`; **no `email` field by design** (`:86`-`:89`). `id()` re-exported (`:147`). `WriteEventMeta` / `ProjectionTxn` types (`:292`,`:303`).
- **Permission rules**: `src/lib/perms.ts` — `participants` block currently **fail-open** (`create/update/delete = 'auth.id != null'`, `:95`-`:102`). This is the block SPEC requires tightening to owner-scoping. `sessions` reads are open (`view: 'true'`, `:51`) so the join route can query a session it doesn't own. `sessionEvents.create = 'auth.id != null'` (`:86`) keeps `writeEvent` legal for student actors. Root adapter `instant.perms.ts` re-exports this object (pinned by test `:68`-`:72`).
- **Auth seam**: `src/lib/useAuth.ts` — `useAuth()` (`:32`) exposes `{ user, isLoading, error, username, … }`; `username`/`deriveUsername` give the email local-part. Product code must consume identity here, never `db.useAuth()` directly.
- **Pure auth helpers**: `src/lib/auth.ts` — `deriveUsername(email)` (`:35`, email local-part = `slice(0, indexOf('@'))`), `isValidEmail` (`:24`), `IDENTITY_SCOPE`/`USER_SIGNED_IN` sentinels.
- **Route guards**: `src/components/RouteGuard.tsx` — single client gate (`:20`); states `route-guard-loading`, unauthenticated bounce via `window.location.replace(loginRedirectTarget(...))` (`:38`), `route-guard-denied`, children. `src/components/SessionRouteGuard.tsx` — ownership wrapper running a `sessions` `db.useQuery` folded through `authorizeOwnership` (not directly applicable to students, but the query-then-precompute-decision pattern is the model for a join gate that needs to inspect the session before rendering).
- **Routing helpers**: `src/lib/routing.ts` — `safeNextPath` (`:21`, open-redirect-safe), `loginRedirectTarget` (`:30`, builds `/login?next=<encoded dest>`), `authorizeOwnership` (`:43`), `DEFAULT_LANDING = '/dashboard'`.
- **Reference islands for the new islands**: `src/components/SessionLifecycle.tsx` (live `db.useQuery` on a session, identity via `useAuth`, inline `role="alert"` + `console.error` failure surface, status-driven derived state) and `src/components/NewSession.tsx` (action island calling a `sessions.ts` wrapper, `surface(err)` pattern, testid'd UI). `src/components/AuthGate.tsx` shows the `next` round-trip via `safeNextPath(readNext())` (`:40`-`:44`).
- **Page shells**: `src/pages/dashboard/sessions/[id].astro` — the model for a param route mounting an island inside a guard (`const { id = '' } = Astro.params`; `<SessionRouteGuard client:only="react" sessionId={id}>`). `src/pages/dashboard/index.astro` shows `RouteGuard` wrapping a nested `client:only="react"` island. `src/pages/login.astro` is the auth surface bounced to. Layout: `src/layouts/Layout.astro`.

### Existing Patterns to Follow

- **Pure-core + thin-wrapper split** (`src/lib/sessions.ts:1`-`:11`, `:136`-`:145`): a pure builder (`build*`) totally validates input and throws BEFORE producing any plan/transaction; a thin async wrapper (`createSession`/`startSession`) builds the plan then dual-writes via `writeEvent`. Builders take injectable deps (`now?`, `sessionId?`, deterministic RNG) for unit tests; wrappers take injectable `deps` (`write?`, `buildTxn?`). `buildParticipantJoin`/`joinSession` are specified to follow this exactly.
- **All mutations through `writeEvent`** (`src/lib/db.ts:305`-`:363`, AGENTS.md "Data Layer"): event envelope + projection update in ONE `db.transact([eventTx, ...projectionTxns])`; projection-only writes are forbidden in product code. `projectionTxns` MUST be non-empty (`:343`). Envelope actor for a join is `{ id: user.id, role: 'student' }`, `sessionId` = joined session id.
- **`applyEvent` `ParticipantJoined` fold** (`src/lib/db.ts:246`-`:266`): payload shape `{ participantId, userId, role, username }`; the produced projection row must match this fold for log/projection consistency (acceptance criterion). EventSpineHarness (`src/components/EventSpineHarness.tsx:76`-`:93`) already demonstrates the full `ParticipantJoined` dual-write call shape (payload + `db.tx.participants[participantId].update({ sessionId, userId, role, username, joinedAt, lastSeenAt, chatStatus })`).
- **Live query + status-derived gate** (`src/components/SessionLifecycle.tsx:25`-`:33`,`:97`): `db.useQuery({ sessions: { $: { where: { … } } } })`, `q.isLoading`/`q.error` handled, join affordance derived solely from `isJoinEnabled`. The join route should look up by `joinCode` (`where: { joinCode }`); `joinCode` is `unique` (`src/lib/db.ts:52`) and already used as an admin query key in e2e (`e2e/create-session.spec.ts:42`).
- **Idempotency pattern**: `shouldCreateUserRow` (`src/lib/auth.ts:47`-`:55`) is the existing model for a "create-only-if-absent" guard driven by an existing-row count from a live query — the analog for the SPEC's idempotency-per-(user, session) requirement (query existing `participants` where `sessionId` + `userId`, no-op if present). Contrast: `createSession`/`startSession` are explicitly **NOT** idempotent (`src/lib/sessions.ts:118`-`:123`,`:250`-`:259`); `joinSession` is required to BE idempotent — a new constraint, not an existing pattern to copy verbatim.
- **Failure handling** (consistent across islands): builders/`writeEvent` throw synchronously on bad input writing nothing (`src/lib/db.ts:331`-`:347`, `src/lib/sessions.ts:76`-`:79`). Islands wrap calls in `try/catch` with a `surface(err)` helper that sets an inline `role="alert"` testid'd element AND `console.error`s — never swallowed (`src/components/SessionLifecycle.tsx:35`-`:39`,`:68`-`:76`; `src/components/NewSession.tsx:28`-`:32`,`:57`-`:61`). Single-transaction guarantee means a rejected write leaves no partial row. Guards never flash-redirect: loading renders the loading shell, redirect fires only after auth RESOLVES to no-user (`src/components/RouteGuard.tsx:31`-`:44`).
- **Observability**: structured events are the `sessionEvents` log via `writeEvent` (the `ParticipantJoined` envelope IS the observability record); UI errors go to `console.error` with a bracketed component tag (`[SessionLifecycle]`, `[NewSession]`, `[useAuth]`). No metrics layer. The engine's own run log is `.cycle/log.jsonl` (not touched by product code).
- **Astro param-route shell** (`src/pages/dashboard/sessions/[id].astro:13`-`:22`): `const { x = '' } = Astro.params`; mount `client:only="react"` island(s) inside a guard, passing the param as a definite-string prop.
- **Testid convention**: stable `data-testid`s on every state for downstream cycles (SPEC names `join-loading`, `join-not-found`, `join-not-open`, `join-error`, `student-session-root`, `student-session-status`, `student-session-presence`). Existing testids: `route-guard-loading`, `route-guard-denied`, `session-status`, `session-join-state`, `auth-*`, `new-session-*`, `created-session-*`.
- **No semicolons, two-space indent, TypeScript/`.tsx` islands + `.astro` shells, `@/` import alias** (AGENTS.md "Coding Style").

### Dependencies & Integration Points

- **`writeEvent` / `applyEvent`** — `src/lib/db.ts` (dual-write spine; `ParticipantJoined` already folded).
- **`db.useQuery`** (`@instantdb/react`) — session lookup by `joinCode` and participant live query; `sessions` reads are open per `src/lib/perms.ts:51`.
- **`useAuth`** — `src/lib/useAuth.ts` (identity + `username`/local-part).
- **`RouteGuard`** — `src/components/RouteGuard.tsx` (auth gate); **`safeNextPath`/`loginRedirectTarget`** — `src/lib/routing.ts` (post-login `next` flow, no open redirect).
- **`isJoinEnabled`** — `src/lib/sessions.ts:293` (sole join-eligibility derivation).
- **Permission rules** — `src/lib/perms.ts` `participants` block, pushed via `npm run perms:push` after `npx instant-cli push schema`; root adapter `instant.perms.ts`.
- **Env**: `PUBLIC_INSTANTDB_APP_ID` (app, required at `db.ts` module init `:26`); `INSTANT_ADMIN_TOKEN` (e2e-only, for `queryAdmin` observability assertions).

### Test Infrastructure

- **Test frameworks**: Vitest for pure logic (`npm run test`, co-located `*.test.ts` beside the module); Playwright for e2e (`npm run test:e2e`, specs in `e2e/`). Always run `npm run astro check`.
- **Test conventions**: unit specs name-match their module (`src/lib/sessions.test.ts`, `src/lib/perms.test.ts`); e2e specs name-match the page/feature (`e2e/session-lifecycle.spec.ts`). Playwright config (`playwright.config.ts`) sets `retries: 3`, `baseURL: http://localhost:4399`, and starts its own dev server on port 4399.
- **e2e seam**: `e2e/support/auth.ts` — `adminAvailable()` gate, `signInViaUi(page, email)` (full magic-code sign-in via admin-minted code), `freshEmail()`, `mintCode()`, and `queryAdmin(query)` Node-side admin read for observability. Specs `test.skip(!adminAvailable(), …)` loudly when the token is unset (never a false green). Multi-context pattern (separate `browser.newContext()` per user) demonstrated in `e2e/permissions.spec.ts:36`-`:60` and the late-joiner-style flow modeled in `e2e/session-lifecycle.spec.ts:24`-`:39`.
- **Current coverage of the change area**:
  - `src/lib/sessions.test.ts` — covers `generateJoinCode`, `buildSessionCreate`, lifecycle builders/wrappers, `isJoinEnabled`. No `buildParticipantJoin`/`joinSession` yet (they don't exist).
  - `src/lib/perms.test.ts:55`-`:62` — pins the *current* fail-open `participants` rules (`create/update/delete === 'auth.id != null'`) and asserts no `email` semantics (`:58`); this test will need updating when the rules tighten.
  - `src/lib/db.test.ts:79`-`:84` — pins the `ParticipantJoined` fold (payload `{ participantId, userId, role, username }`).
  - `e2e/permissions.spec.ts` — exercises `users`/`sessions`/`sessionResources` rules via `/dev/perms-probe`; does NOT yet cover `participants` rules.
  - No `/join` or `/s` route, no `buildParticipantJoin`, no `joinSession`, no `e2e/join-via-link.spec.ts` exist yet (confirmed by repo-wide grep).
- **Failure-path test coverage**: established convention — `src/lib/sessions.test.ts` asserts builder rejections; `e2e/session-lifecycle.spec.ts:95`-`:108` asserts an illegal transition surfaces an inline error with status unchanged; `e2e/auth.spec.ts` covers invalid-input auth paths; `e2e/permissions.spec.ts` asserts denied writes leave state unchanged. SPEC requires extending this to unknown-code / non-live / `writeEvent`-rejection join paths and the owner-scoped participant-perms unit + e2e assertions.

## Code References

- `src/lib/sessions.ts:293` — `isJoinEnabled(session)`: sole join gate, `true` iff `status === 'live'`.
- `src/lib/sessions.ts:1`-`:11`, `:136`-`:145` — pure-core/thin-wrapper doctrine the new `buildParticipantJoin`/`joinSession` must follow.
- `src/lib/db.ts:326`-`:363` — `writeEvent`: dual-write choke point; non-empty `projectionTxns` required; atomic; throws-before-write.
- `src/lib/db.ts:246`-`:266` — `applyEvent` `ParticipantJoined` fold (payload `{ participantId, userId, role, username }`).
- `src/lib/db.ts:81`-`:93` — `participants` entity schema; no `email` field (structural privacy).
- `src/lib/perms.ts:95`-`:102` — fail-open `participants` rules this cycle must tighten to owner-scoping (`auth.id == data.userId` + owning teacher/admin slot).
- `src/lib/perms.ts:42`-`:56` — `sessions` rules: open reads (join route can query), owner-only writes; `isOwner`/`isAdmin` bind pattern to mirror.
- `src/lib/auth.ts:35`-`:39` — `deriveUsername(email)` = email local-part (username default).
- `src/lib/auth.ts:47`-`:55` — `shouldCreateUserRow`: model for the create-only-if-absent idempotency guard.
- `src/lib/routing.ts:21`-`:33` — `safeNextPath` / `loginRedirectTarget` (post-login `next`, no open redirect).
- `src/components/RouteGuard.tsx:20`-`:84` — the auth gate the join page must mount inside.
- `src/components/SessionRouteGuard.tsx:17`-`:39` — query-then-precompute-decision pattern for a guard that must inspect a session.
- `src/components/SessionLifecycle.tsx:25`-`:76`,`:97` — live-query island + `isJoinEnabled`-derived state + `surface(err)`/`role="alert"` failure pattern.
- `src/components/NewSession.tsx:28`-`:61` — action-island calling a `sessions.ts` wrapper with inline-error handling.
- `src/components/EventSpineHarness.tsx:68`-`:94` — concrete `ParticipantJoined` dual-write call shape (payload + participant projection txn).
- `src/pages/dashboard/sessions/[id].astro:13`-`:22` — param-route shell mounting an island inside a guard.
- `src/lib/perms.test.ts:55`-`:62` — structural test currently pinning the fail-open participant rules (must update).
- `src/lib/db.test.ts:79`-`:84` — `ParticipantJoined` fold unit test (payload contract).
- `e2e/support/auth.ts:43`-`:71` — `queryAdmin` + `signInViaUi` seams for observability and multi-context e2e.
- `e2e/session-lifecycle.spec.ts:24`-`:39`,`:95`-`:108` — create-session-and-open helper + failure-path (inline error, status unchanged) e2e model.
- `e2e/permissions.spec.ts:33`-`:60` — multi-context (teacher + student) e2e pattern for data-layer rule assertions.

## Open Questions

- **Participant lookup query shape for idempotency**: SPEC requires idempotency per (user, session) but does not pin whether the join island queries existing `participants` by `{ sessionId, userId }` to decide no-op vs create, or whether `buildParticipantJoin` exposes a separate pure decision helper (the SPEC Testing Strategy mentions an "idempotency decision helper"). The plan must define the exact seam (`participants` is not currently `db.useQuery`'d anywhere).
- **Participant id derivation**: whether the participant row id is a fresh `id()` per join attempt (and idempotency is enforced purely by the pre-check) or deterministically derived from (sessionId, userId) so a duplicate write keys to the same row. The `applyEvent` fold keys on `participantId ?? event.id` (`src/lib/db.ts:253`); the plan must choose an id strategy consistent with the idempotency guarantee.
- **Owner/admin slot in the tightened `participants` rule**: SPEC says `create/update/delete` restricted to `auth.id == data.userId` "plus the owning Teacher / admin slot." The exact CEL expression (whether a teacher clause uses a `data.ref(...)` link traversal like `sessionResources` does, or `isAdmin: 'false'` reserved-slot only) and the corresponding `bind` are unspecified — the plan must define them and the matching `perms.test.ts` assertions. Note `participants` has no link to `sessions` in the schema today (`src/lib/db.ts:130`-`:140` defines only `sessionResourceSession`), so a teacher-ownership clause via link traversal would require a new link.
- **`/s/:joinCode` resolution**: whether the student view re-resolves the session by `joinCode` (live query) and what it renders if the user is not yet a participant (e.g. reached `/s/:joinCode` directly without joining) — the SPEC describes minimal presence/status but not the not-a-participant edge for the `/s` route specifically.
```
