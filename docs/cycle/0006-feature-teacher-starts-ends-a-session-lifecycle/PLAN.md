# Implementation Plan: Cycle 0006

## Overview
This cycle makes a created `draft` session runnable: a pure legal-transition guard (`draft → live`, `live → ended`), pure `buildSessionStart` / `buildSessionEnd` builders plus thin `startSession` / `endSession` wrappers that dual-write `SessionStarted` / `SessionEnded` envelopes and the `sessions` projection through `writeEvent`, two new `applyEvent` fold cases, a pure `isJoinEnabled` predicate, and owner-only Start/End controls on `/dashboard/sessions/[id]` that reflect live status and the join gate.

## Current State (from Research)
- `src/lib/sessions.ts` holds the cycle-0005 pure-core split: `generateJoinCode`, `buildSessionCreate` (validate-before-build, sync-throw), `createSession` (thin wrapper with injectable `CreateSessionDeps { write?, buildTxn? }`). `SessionRecord.status` is hardcoded `'draft'`. The new lifecycle core lands here.
- `writeEvent(type, meta, projectionTxns)` (`src/lib/db.ts:302-340`) is the single dual-write choke point: validates synchronously, then appends the `sessionEvents` envelope + projection txns in one `db.transact()`.
- `applyEvent` (`src/lib/db.ts:208-250`) has `SessionCreated` and `ParticipantJoined` cases; `default` throws `UnknownEventTypeError`. `SessionProjection.session` carries only `{ id, title, status, teacherId }` (no timestamps). `rebuildSessionProjection` sorts via `compareEvents`, then folds.
- The `sessions` entity already carries `status` (union `'draft'|'live'|'ended'|'archived'`), `startedAt?`, `endedAt?` — **no schema change needed**.
- `/dashboard/sessions/[id].astro` renders `SessionRouteGuard client:only="react"` (owner-gated, cycle 0004) wrapping a placeholder `<h1 data-testid="session-root">`. The island reads the live session via `db.useQuery`.
- `NewSession.tsx` renders the `created-session` card after create; it has no link to the detail page yet. Island conventions: identity via `useAuth`, inline `role="alert"` error + `console.error` on failure (never swallowed), UI state untouched on failure.
- `src/lib/routing.ts` is the pure-total-helper convention to mirror for `isJoinEnabled` / `assertLegalTransition`.
- Tests: `src/lib/sessions.test.ts`, `src/lib/db.test.ts` (Vitest, injected deps, no DOM/InstantDB); `e2e/create-session.spec.ts` (Playwright template with skip-loudly guard, `signInViaUi` / `freshEmail` / `queryAdmin` from `e2e/support/auth.ts`).

### Resolved Open Questions
1. **Projection timestamps**: The folded `SessionProjection.session` object will **not** gain `startedAt`/`endedAt`. SPEC acceptance for the fold requires only `status === 'ended'`; the live `sessions` row carries the timestamps. Keeping the projection type unchanged minimizes blast radius and satisfies the fold acceptance test exactly. The event `payload` still carries the timestamp for observability.
2. **Affordance/control placement & link type**: The detail island shows a status line (`session-status`), a join-state line (`session-join-state`), a `Start` button (`session-start`, shown only when `draft`), an `End` button (`session-end`, shown only when `live`), and an inline error (`session-lifecycle-error`). The post-create card link is a plain styled `<a>` (`data-testid="created-session-link"`) to `/dashboard/sessions/${created.id}` — no router dependency, reachable end-to-end.
3. **Island input type**: The island reads the live `Session` via `db.useQuery` for status display; the builders operate on a minimal session-like input `{ id, status, teacherId }` so they stay db-free and unit-testable.

## Desired End State
- `src/lib/sessions.ts` exports `assertLegalTransition`, `buildSessionStart`, `buildSessionEnd`, `startSession`, `endSession`, `isJoinEnabled`, plus their input/plan types.
- `src/lib/db.ts` `applyEvent` folds `SessionStarted` / `SessionEnded`; `rebuildSessionProjection([SessionCreated, SessionStarted, SessionEnded])` yields `status === 'ended'` and neither new type throws.
- `/dashboard/sessions/[id]` renders a lifecycle island (inside `SessionRouteGuard`) with Start/End controls, live status, join-gate affordance, inline error.
- `NewSession` post-create card links to the new session's detail page.
- Docs updated (AGENTS.md, README.md, release-notes.md).
- Verify: `npm run test`, `npm run test:e2e`, `npm run astro check` all pass; the lifecycle e2e drives draft → live → ended with ordered-event observability and a failure path.

## What We're NOT Doing
- No student join-via-link UI, no `participants` rows, no real cross-context student join. This slice only flips the **enablement gate** (`isJoinEnabled`) on `live`.
- No `archived` state, no `draft → archived` / `ended → archived` transitions.
- No replay / event-timeline reconstruction UI.
- No dashboard session list / index, no session editing or deletion, no resource queuing/activation.
- No auto-closing of prompts/votes on end (none exist).
- No schema migration (`status`/`startedAt`/`endedAt` already exist).
- No addition of `startedAt`/`endedAt` to the folded `SessionProjection.session` type.

## Implementation Approach
Extend the cycle-0005 pure-core pattern exactly: a legal-transition table is the single source of §6.2 truth; pure builders validate the transition **and** owner identity **and** a present `sessionId` and throw before producing any plan; thin async wrappers route the dual-write through `writeEvent` with injectable deps. The transition guard fed the *current* status is the stale-tab / duplicate-event protection (re-issuing `start` on a `live` session is rejected, not deduped — `writeEvent` is intentionally non-idempotent). `applyEvent` gains two narrow, no-mutation fold cases that update `status` and tolerate an absent prior session. The UI is a `client:only` island mirroring `NewSession`'s identity/error conventions, deriving its join affordance solely from `isJoinEnabled` so the gate cannot drift from status.

## Failure & Resilience Decisions

**Task 1 — Pure transition guard, builders, `isJoinEnabled`**: N/A — pure. Builders throw synchronously on illegal transition, non-owner actor (`actorId !== session.teacherId`), or missing `sessionId`, *before* any plan/txn is produced — so a caller can never write on invalid input. `isJoinEnabled` and `assertLegalTransition` are total over null/absent/unknown status (`isJoinEnabled` returns `false`; `assertLegalTransition` throws on unknown/missing `from`). No I/O.

**Task 2 — `startSession` / `endSession` wrappers**:
- **Failure modes**: (a) illegal transition / non-owner / missing id → builder throws synchronously, `writeEvent` never called, nothing written; (b) `writeEvent` rejection (permission denial, network, concurrent row change) → the promise rejection **propagates** to the caller; because event append + projection update share one `db.transact()`, a rejected transition leaves no partial state.
- **Idempotency**: NOT idempotent by design (each call appends a fresh event). Re-run safety comes from the legal-transition guard fed the *current* status — a retry on an already-transitioned session is rejected by the guard, not deduped, so no duplicate lifecycle event is appended.
- **Observability**: rejection surfaces to the caller; the UI logs `console.error('[SessionLifecycle] …', err)` and renders an inline `role="alert"`. The durable record is the `sessionEvents` append (actorId, actorRole, occurredAt, payload).
- **No silent failure**: confirmed — builder throws propagate; wrapper `await write(...)` rejection propagates; UI `catch` surfaces both inline and to console. Nothing swallowed.

**Task 3 — `applyEvent` fold cases**: N/A — pure, in-memory. The two new types become *known* cases (no longer fall through to `UnknownEventTypeError`); an event whose prior `session` is absent builds a minimal session from payload rather than throwing. No mutation (returns new projection objects).

**Task 4 — Lifecycle island + detail page wiring**:
- **Failure modes**: query error from `db.useQuery` → logged (`console.error('[SessionLifecycle] …')`) and rendered as a non-actionable state (no controls, error visible); `startSession`/`endSession` rejection → caught, surfaced inline (`session-lifecycle-error`) + console; displayed status unchanged (driven by live query, which never advanced).
- **Idempotency**: controls are disabled while a transition is `pending` to prevent double-fire; the guard rejects any stale re-issue regardless. The island never writes outside `startSession`/`endSession` → `writeEvent`.
- **Observability**: `console.error` with `[SessionLifecycle]` tag on every failure path; inline alert for the user.
- **No silent failure**: confirmed — every `catch` sets inline error AND `console.error`; no empty catch.

**Task 5 — Docs**: N/A — pure (markdown edits, no runtime failure surface).

---

## Task 1: Lifecycle pure core — transition guard, builders, `isJoinEnabled`

### Overview
Add the db-free, dependency-injectable lifecycle logic to `src/lib/sessions.ts`, mirroring `buildSessionCreate`.

### Changes Required
**File**: `src/lib/sessions.ts`

Add the legal-transition table and guard:
```ts
export type SessionStatus = 'draft' | 'live' | 'ended' | 'archived'

/** SPEC §6.2 — the ONLY transitions this cycle permits. Single source of truth. */
const LEGAL_TRANSITIONS: Record<string, SessionStatus[]> = {
  draft: ['live'],
  live: ['ended'],
}

/** Throws on any transition not in the §6.2 table (incl. unknown/missing `from`). */
export function assertLegalTransition(from: string | null | undefined, to: SessionStatus): void {
  const allowed = from ? LEGAL_TRANSITIONS[from] : undefined
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal session transition: ${from ?? '(none)'} → ${to}`)
  }
}
```

Add a session-like input + transition plan types and the two builders:
```ts
export type SessionLike = { id: string; status: string; teacherId: string }
export type BuildTransitionInput = {
  session: SessionLike
  actorId: string | null | undefined
  now?: number
}
export type SessionTransitionPlan = {
  sessionId: string
  meta: WriteEventMeta
  update: { status: SessionStatus; startedAt?: number; endedAt?: number }
}

export function buildSessionStart(input: BuildTransitionInput): SessionTransitionPlan {
  const { session, actorId } = input
  if (!session?.id) throw new Error('startSession: a sessionId is required')
  if (!actorId || actorId !== session.teacherId) {
    throw new Error('startSession: only the owning teacher can start this session')
  }
  assertLegalTransition(session.status, 'live')
  const startedAt = input.now ?? Date.now()
  return {
    sessionId: session.id,
    meta: {
      sessionId: session.id,
      actor: { id: actorId, role: 'teacher' },
      payload: { id: session.id, status: 'live', startedAt },
    },
    update: { status: 'live', startedAt },
  }
}

export function buildSessionEnd(input: BuildTransitionInput): SessionTransitionPlan {
  // identical shape; assertLegalTransition(session.status, 'ended'); stamps endedAt
}
```

Add the pure join-gate predicate:
```ts
/** Pure, total: true iff the session is live. False for draft/ended/archived/null/unknown. */
export function isJoinEnabled(session: { status?: string } | null | undefined): boolean {
  return !!session && session.status === 'live'
}
```

### Success Criteria
- [ ] Compiles cleanly (`npm run astro check`)
- [ ] Unit tests pass: `assertLegalTransition` permits `draft→live` / `live→ended`, rejects `draft→ended`, `live→live`, every `ended→*`, unknown/missing `from`.
- [ ] `buildSessionStart`/`buildSessionEnd` produce `actor.role === 'teacher'`, `sessionId === payload.id`, correct `update` (status + `startedAt`/`endedAt`); reject (throw, no plan) on illegal transition, non-owner actor, missing `sessionId`.
- [ ] `isJoinEnabled` truth table across all statuses + null/unknown.
- [ ] Failure paths behave as designed (synchronous throw, nothing produced).

---

## Task 2: `startSession` / `endSession` thin wrappers

### Overview
Add the impure dual-write wrappers, mirroring `createSession`'s injectable-deps shape.

### Changes Required
**File**: `src/lib/sessions.ts`
```ts
export type TransitionDeps = {
  write?: typeof writeEvent
  buildTxn?: (plan: SessionTransitionPlan) => ProjectionTxn
}

const defaultTransitionTxn = (plan: SessionTransitionPlan): ProjectionTxn =>
  db.tx.sessions[plan.sessionId].update(plan.update)

export async function startSession(
  input: BuildTransitionInput,
  deps: TransitionDeps = {}
): Promise<SessionTransitionPlan> {
  const plan = buildSessionStart(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultTransitionTxn
  await write('SessionStarted', plan.meta, [buildTxn(plan)])
  return plan
}

export async function endSession(
  input: BuildTransitionInput,
  deps: TransitionDeps = {}
): Promise<SessionTransitionPlan> {
  // builds via buildSessionEnd, writes 'SessionEnded'
}
```
Document (doc comment) the non-idempotency + guard-as-retry-safety + atomicity, mirroring `createSession`.

### Success Criteria
- [ ] Compiles cleanly.
- [ ] Legal path calls `write` exactly once with the correct type (`SessionStarted`/`SessionEnded`) and a single projection txn.
- [ ] A stubbed/rejecting `write` causes the wrapper to reject (error propagated, not swallowed).
- [ ] An illegal/non-owner input rejects from the builder before `write` is called (assert `write` not invoked).
- [ ] Failure paths behave as designed.

---

## Task 3: `applyEvent` fold cases for `SessionStarted` / `SessionEnded`

### Overview
Make the two lifecycle types *known* fold cases so the log still rebuilds the projection and they no longer hit `UnknownEventTypeError`.

### Changes Required
**File**: `src/lib/db.ts` (`applyEvent`, `src/lib/db.ts:208-250`)
```ts
case 'SessionStarted': {
  const p = event.payload as { id?: string }
  const prev = projection.session
  return {
    ...projection,
    session: prev
      ? { ...prev, status: 'live' }
      : { id: p.id ?? projection.sessionId, title: '', status: 'live', teacherId: '' },
  }
}
case 'SessionEnded': {
  // identical shape; status: 'ended'
}
```
Add a one-line comment that these mirror `SessionCreated`'s defensive, no-mutation style and tolerate an absent prior session (out-of-order/partial logs) without throwing.

### Success Criteria
- [ ] Compiles cleanly.
- [ ] `applyEvent` with `SessionStarted`/`SessionEnded` updates `status`, does not mutate input, does not throw.
- [ ] `rebuildSessionProjection(id, [SessionCreated, SessionStarted, SessionEnded])` → `session.status === 'ended'`.
- [ ] An absent-prior-session fold yields a minimal session at the event's status (no `UnknownEventTypeError`).
- [ ] Existing `applyEvent` tests (incl. identity-event-not-folded throw) still pass.

---

## Task 4: Lifecycle island + detail-page wiring + post-create link

### Overview
Replace the placeholder shell with a `client:only` lifecycle island that shows status, the join gate, and owner-only Start/End controls; link the post-create card to the detail page.

### Changes Required
**File**: `src/components/SessionLifecycle.tsx` (new)
- `useAuth()` for `user.id`; `db.useQuery({ sessions: { $: { where: { id: sessionId } } } })` for the live session.
- On `q.error`: `console.error('[SessionLifecycle] …', q.error)` and render the error/non-actionable state (no controls).
- Read `session = q.data?.sessions?.[0]`. Render:
  - `<span data-testid="session-status">{session.status}</span>`
  - join affordance derived solely from `isJoinEnabled(session)`: `data-testid="session-join-state"` reading e.g. `enabled` when live, `disabled` (with not-yet/closed copy keyed off status) otherwise.
  - `Button data-testid="session-start"` shown only when `status === 'draft'`; `Button data-testid="session-end"` shown only when `status === 'live'`.
  - inline `<p data-testid="session-lifecycle-error" role="alert">` on failure.
- Handlers call `startSession`/`endSession` with `{ session: { id, status, teacherId }, actorId: user.id }`; `try/catch` sets inline error + `console.error`; `pending` state disables the active control; on rejection the displayed status is unchanged (driven by live query).
- Defense-in-depth: refuse to call with no `user.id`.
- Reuse `Layout`/Tailwind + `@/components/ui` `button`, `card` only. Never `db.useAuth()`, never raw email.

**File**: `src/pages/dashboard/sessions/[id].astro`
- Replace the placeholder `<h1 data-testid="session-root">` content with `<SessionLifecycle client:only="react" sessionId={id} />` inside the existing `SessionRouteGuard`. Keep `session-root` as a wrapper testid if route-guarding e2e depends on it; otherwise retain it on a container element.

**File**: `src/components/NewSession.tsx`
- In the `created-session` card, add `<a data-testid="created-session-link" href={`/dashboard/sessions/${created.id}`}>Open session</a>` (styled with existing Button/anchor classes) so the flow reaches the detail page without a session list.

### Success Criteria
- [ ] Compiles cleanly; `npm run astro check` clean.
- [ ] Detail page renders status, join state, and the correct control per status, behind `SessionRouteGuard`.
- [ ] Start flips status→`live` + join enabled; End flips→`ended` + join closed (verified by e2e, Task in Testing).
- [ ] Illegal/stale transition shows `session-lifecycle-error`, status unchanged.
- [ ] Post-create card links to the detail page.
- [ ] Failure paths surface inline + `console.error`, never swallowed.

---

## Task 5: Documentation updates

### Overview
Docs are part of "done."

### Changes Required
- **AGENTS.md**: extend the cycle-0005 "Session creation" note with a "Session lifecycle" line — `startSession`/`endSession` (`src/lib/sessions.ts`) are the only sanctioned transition paths, routing `SessionStarted`/`SessionEnded` through `writeEvent`; the legal-transition guard pins SPEC §6.2 (`draft → live → ended`); ownership enforced in builder + `SessionRouteGuard` + data-layer rule; `isJoinEnabled` is the sanctioned join gate (true only when `live`); `applyEvent` now folds the two lifecycle events. Register new testids: `session-start`, `session-end`, `session-status`, `session-join-state`, `session-lifecycle-error`, `created-session-link`.
- **README.md**: a teacher can start/end a session from its detail page; start opens the join gate, end closes live participation.
- **release-notes.md** (and `docs/release-notes.md` if both exist): one line — session lifecycle (start/end with `SessionStarted`/`SessionEnded` events + join-enablement gate) is live; no new env/config keys.

### Success Criteria
- [ ] AGENTS.md, README.md, release-notes.md updated and consistent with shipped behavior and testids.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] On /dashboard/sessions/[id] for a draft session they own, the teacher clicks Start, the status shown becomes live, and the page indicates joining is now enabled (data-testid="session-status" reads live; the join-enabled affordance is shown) — user-observable benefit: the teacher can now run the session live and students would be able to join.` | Task 4 (UI), Task 2 (`startSession`), Task 1 (`isJoinEnabled`); e2e in Testing | |
| `[ ] The teacher then clicks End, the status shown becomes ended, and the page indicates live participation is closed (join disabled).` | Task 4, Task 2 (`endSession`), Task 1 | |
| `[ ] After start then end, exactly one SessionStarted and one SessionEnded sessionEvents row exist for the session id, and SessionStarted.occurredAt precedes SessionEnded.occurredAt (ordered observability check via the admin query); the live sessions row ends with status === 'ended', a set startedAt, and a set endedAt.` | Task 2 (dual-write payloads/timestamps); e2e observability in Testing | `occurredAt` stamped by `writeEvent`; `startedAt`/`endedAt` in projection `update` |
| `[ ] rebuildSessionProjection(sessionId, [SessionCreated, SessionStarted, SessionEnded]) returns a session with status === 'ended'; the two new event types do not raise UnknownEventTypeError (unit test).` | Task 3 | |
| `[ ] isJoinEnabled returns true only for status === 'live' and false for draft/ended/archived/null/unknown (unit test). (join-gate criterion)` | Task 1 | |
| `[ ] An illegal transition — e.g. buildSessionEnd on a draft session or buildSessionStart on an ended session — throws, writes nothing, and leaves the projection unchanged; in the UI a forced illegal/stale transition shows session-lifecycle-error and the displayed status does not change (unit + e2e). (failure-path criterion)` | Task 1 (builder throw), Task 2 (no write), Task 4 (UI error); unit + e2e in Testing | |
| `[ ] A non-owner / forced-writeEvent-rejection start or end propagates the error to the caller and surfaces it inline, leaving no partial state — the error is not swallowed (unit test via a rejecting writeEvent, with ownership rejection asserted in the builder). (failure-path criterion)` | Task 1 (owner rejection), Task 2 (rejecting `write` propagation), Task 4 (inline surface) | |
| `[ ] All existing tests still pass (npm run test, npm run test:e2e, npm run astro check).` | Tasks 1–5 (regression); Testing Strategy | |
| `[ ] No compiler/linter warnings introduced; npm run astro check is clean.` | Tasks 1–5 | |

---

## Testing Strategy

### Unit Tests
**File**: `src/lib/sessions.test.ts` (extend)
- `assertLegalTransition`: permits `draft→live`, `live→ended`; rejects `draft→ended`, `live→live`, `ended→live`, `ended→ended`, `archived→*`, and unknown/missing `from` (`null`, `undefined`, `'bogus'`).
- `buildSessionStart` / `buildSessionEnd`: assert `meta.actor.role === 'teacher'`, `meta.sessionId === meta.payload.id`, `update.status` + `startedAt`/`endedAt` (use injected `now` for determinism); throw (no plan) on illegal transition, non-owner actor (`actorId !== teacherId`, incl. `null`), and missing `session.id`.
- `startSession` / `endSession` (failure path, the named failure modes): with an injected resolving `write` spy → called exactly once with the right type and a single txn (use injected `buildTxn` returning a sentinel to avoid `db`); with a rejecting `write` → wrapper rejects (error propagated). With an illegal/non-owner input → rejects from builder and the `write` spy is never called (idempotency/guard-as-retry-safety assertion).
- `isJoinEnabled`: truth table — `live`→true; `draft`/`ended`/`archived`/`'bogus'`/`undefined status`/`null`/`undefined`→false.

**File**: `src/lib/db.test.ts` (extend)
- `applyEvent` `SessionStarted`/`SessionEnded`: update `status`, do not mutate the input projection, do not throw; absent-prior-session fold yields a minimal session at the event status (I/O-error analog: missing field defaults).
- `rebuildSessionProjection([SessionCreated, SessionStarted, SessionEnded])` → `status === 'ended'`; out-of-order input still folds deterministically.
- Confirm the existing identity-event-not-folded throw test still passes (the two new types are now known, but `UserSignedIn` still hits `default`).

**Mocking strategy**: prefer real implementations — builders/predicates are pure (no mocks). Wrappers use the existing injectable-deps seam (`write`, `buildTxn`) — a thin spy/rejecting function, not a heavy mock. No InstantDB or DOM in unit scope.

### Integration / E2E Tests
**File**: `e2e/session-lifecycle.spec.ts` (new; mirrors `create-session.spec.ts`)
- Skip loudly when `!adminAvailable()` (same message style as create-session), reusing `signInViaUi`, `freshEmail`, `queryAdmin`.
- **Happy path**: sign in → `/dashboard` → create a session (cycle-0005 flow) → click `created-session-link` to the detail page → assert `session-status` reads `draft` and join disabled (`session-join-state`) → click `session-start` → assert `session-status` reads `live` + join enabled → click `session-end` → assert `session-status` reads `ended` + join closed.
- **Observability**: poll `queryAdmin` for the session id — assert exactly one `SessionStarted` and one `SessionEnded` `sessionEvents` row and `SessionStarted.occurredAt < SessionEnded.occurredAt`; assert the live `sessions` row at `status === 'ended'` with `startedAt` and `endedAt` set.
- **Failure path**: drive an illegal/stale transition (re-click `session-end` after end, or attempt End while still `draft` via a controls-visible state) and assert `session-lifecycle-error` is visible and `session-status` is unchanged.
- Note in the spec header that a real cross-context student join is deferred to the join cycle — this suite verifies the **join-enablement gate state**, not an actual student join.
- Use explicit element waits (`getByTestId(...).toBeVisible({ timeout })` and `.toHaveText(...)`), never `networkidle` (InstantDB keeps the socket busy).

---

## Walkthrough Plan
- **Flow**: Over the real cycle routes (never the home page): `/login` (deterministic test-code sign-in) → `/dashboard` → create a session → follow the post-create link to `/dashboard/sessions/[id]` → on the detail page, observe `draft` + join disabled → click **Start** (→ `live`, join enabled) → click **End** (→ `ended`, join closed). The detail page is the subject — it is what this cycle built.
- **Capture points** (ordered, named):
  - `01-signed-in-dashboard` — authenticated `/dashboard` with the New session control.
  - `02-session-created` — the post-create card showing draft status, join code, and the new "Open session" link.
  - `03-session-detail-draft` — the detail page showing `session-status` = `draft`, join disabled, and the **Start** control.
  - `04-session-live-join-enabled` — after Start: `session-status` = `live`, join-enabled affordance shown, **End** control visible.
  - `05-session-ended-join-closed` — after End: `session-status` = `ended`, join closed.
  - `06-lifecycle-error` — a forced illegal/stale transition showing `session-lifecycle-error` with status unchanged.
- **Preconditions / test data**: magic-code auth via the admin-minted deterministic code (`signInViaUi` + `freshEmail` from `e2e/support/auth.ts`) — never a real inbox; a freshly created session via the cycle-0005 flow (no pre-seeding required); skip loudly when `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID` are unset; realtime waits on explicit testid elements (`session-status`, `session-join-state`), not `networkidle`.
- **If no observable UI this cycle**: not applicable — this cycle builds observable UI (the lifecycle controls and join-gate affordance on the detail page).

## Risk Assessment
- **Stale live query vs. guard rejection drift**: the displayed status comes from `db.useQuery`; the guard is fed that same status. Mitigation: derive the control shown and the builder's `from` from the same live `session` object; disable the control while `pending`. The guard still rejects any stale re-issue.
- **`SessionRouteGuard` `session-root` testid coupling**: route-guarding e2e may assert `session-root`. Mitigation: keep `session-root` on a container element inside the island/guard, not delete it, so existing guard specs still pass.
- **Permission/schema rejection on transition write**: if a transition is rejected with a schema/permission error, run `npx instant-cli push schema` then `npm run perms:push` (cycle-0003 owner-only `sessions` rule already covers `auth.id == data.teacherId`). The rejection surfaces inline + console, never partial state (single transaction).
- **Projection type minimalism vs. observability of timestamps**: timestamps live on the `sessions` row, not the folded projection. Mitigation: e2e observability asserts `startedAt`/`endedAt` on the live `sessions` row (admin query), satisfying SPEC without widening the projection type.
