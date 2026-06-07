# SPEC — Cycle 0006: Teacher Starts / Ends a Session (Lifecycle State Machine)

## WHY
Cycle 0005 made a `Session` creatable: a signed-in user opens the dashboard, types a title, and gets a `draft` session they own with an unguessable join code. But `draft` is a dead end. A `draft` session is invisible to students by design (SPEC §6.2 — join is enabled only once `live`), and there is no product path to move a session forward or to close it. The session lifecycle table (SPEC §6.2) defines `draft → live` (start) and `live → ended` (end) as the spine of every live classroom, yet today nothing can drive those transitions, append the `SessionStarted` / `SessionEnded` events the replay timeline depends on, or flip the gate that later lets students in. Until a teacher can start and end a session, the created session can never host a class, and every downstream cycle (join-via-link, resource activation, messages, cursor voting, replay) is unreachable because it presupposes a `live` session.

## CONCRETE USER BENEFIT
The teacher of a `draft` session can open that session, click **Start**, and watch it become `live` — at which point the session visibly advertises that students can now join (the join gate flips on). When class is over they click **End** and the session becomes `ended`, visibly closing live participation. They could previously only mint a frozen `draft`; now they can run a session through its real lifecycle and see the join gate open and close as a direct consequence.

## USABLE END-STATE
From the session detail page (`/dashboard/sessions/[id]`, already owner-guarded), the owning teacher:
- Sees the session's current status and a **Start** control when it is `draft`.
- Clicks **Start**: status becomes `live`, `SessionStarted` is appended, and the page shows that joining is now enabled (the join code is presented as active).
- Sees an **End** control while `live`; clicks it: status becomes `ended`, `SessionEnded` is appended, and the page shows live participation is closed (join disabled).
- On an illegal transition (e.g. an `ended` session, or a stale tab trying to start an already-`live` session) or a non-owner attempt, sees a clear inline error and the session's status is unchanged — no half-applied transition.

## Objective
This cycle delivers the session lifecycle state machine as one vertical slice: a pure legal-transition guard enforcing SPEC §6.2 (`draft → live`, `live → ended`), the `buildSessionStart` / `buildSessionEnd` builders and their thin `startSession` / `endSession` wrappers that dual-write the `SessionStarted` / `SessionEnded` envelope plus the `sessions` projection update through `writeEvent()`, `applyEvent` fold cases for the two new events so the log still rebuilds the projection, an `isJoinEnabled` predicate that is true only when `live`, and owner-only Start/End controls on the existing session detail page that reflect live status and the join gate. It makes the created session runnable — the precondition for join, resources, and replay — while honoring the single-write-path (`writeEvent`) and single-auth-seam (`useAuth`) invariants and the owner-only `sessions` permission rule from cycle 0003.

## Source Issue
`txt-20260606-213630-start-end-session` — "Teacher starts / ends a session (lifecycle state machine)"

## Scope

### In Scope
- **Lifecycle core in `src/lib/sessions.ts`** (mirroring the cycle-0005 pure-core split): a legal-transition table / `assertLegalTransition(from, to)` guard implementing SPEC §6.2 (`draft → live`, `live → ended` only); pure builders `buildSessionStart` / `buildSessionEnd` that totally validate the transition **and** owner identity (actor id must equal `session.teacherId`) and a present `sessionId`, then produce the `SessionStarted` / `SessionEnded` envelope meta (`actor.role: 'teacher'`) plus the `sessions` projection txn (`status` → `live`/`ended`, stamping `startedAt`/`endedAt`); thin async wrappers `startSession` / `endSession` that route the dual-write through `writeEvent` (injectable deps for tests); new `applyEvent` cases for `SessionStarted` and `SessionEnded` (update `status` on the folded session, leaving log/projection consistent); and a pure `isJoinEnabled(session)` predicate returning `true` only when `status === 'live'`.
- **Owner-only Start/End UI on `/dashboard/sessions/[id]`** (replacing the placeholder shell content inside the existing `SessionRouteGuard`): a `client:only` island that reads the live session via `db.useQuery`, shows current status, renders **Start** when `draft` and **End** when `live`, calls `startSession`/`endSession` with the signed-in user's id (from `useAuth`), surfaces a visible join-enablement state driven by `isJoinEnabled` (active when `live`, otherwise not-yet/closed), and shows an inline error on any failed/illegal transition. A link from the cycle-0005 post-create card to the new session's detail page so the flow is reachable end-to-end without a session list.
- **Tests**: Vitest over the lifecycle core (transition guard, builders, ownership/illegal-transition rejection, `applyEvent` fold cases, `isJoinEnabled`) and Playwright over the start→end flow on the detail page (status transitions, join-gate state, ordered `SessionStarted`/`SessionEnded` events via the admin observability query, and an illegal/non-owner failure path).

### Out of Scope
- The student join-via-link flow itself (separate issue) — this slice only flips the **enablement gate** (`isJoinEnabled`) on `live`; it does not build a join UI, create `participants` rows, or perform a real cross-context student join.
- `archived` state and the `draft → archived` / `ended → archived` transitions, and replay/event-timeline reconstruction UI (deferred).
- A dashboard session list / navigation index, editing or deleting sessions, and resource queuing/activation.
- Auto-closing live prompts or cursor votes on end (none exist yet) beyond appending `SessionEnded`.

## Requirements
- Start/end route **exclusively** through `writeEvent()` — one `db.transact()` appends the `SessionStarted` / `SessionEnded` envelope and updates the `sessions` projection together (ADR-0001/ADR-0003). No `db.tx.sessions[…]` write happens outside `writeEvent`.
- The legal-transition guard is the single source of §6.2 truth: `draft → live` and `live → ended` are the only permitted transitions in this cycle; any other (`draft → ended`, `live → live`, `ended → *`, missing/unknown current status) is rejected **before** any transaction is issued. Illegal transitions MUST fail with an actionable error and MUST NOT partially mutate the projection (SPEC §6.2).
- Ownership is enforced in depth: the builder rejects when the actor id ≠ `session.teacherId`; the UI lives behind `SessionRouteGuard` (owner-only); and the cycle-0003 data-layer rule (`auth.id == data.teacherId`) is the backstop that holds even against a hand-crafted client. The `actor` passed to `writeEvent` is `{ id: user.id, role: 'teacher' }`.
- `SessionStarted` sets `status: 'live'` and stamps `startedAt`; `SessionEnded` sets `status: 'ended'` and stamps `endedAt` (SPEC §5.2 — both conditional timestamps become required after their transition). The event `payload` carries `{ id }` plus the new status/timestamp so the new `applyEvent` cases fold cleanly and the rebuilt projection matches the live row (observability).
- `applyEvent` gains `SessionStarted` / `SessionEnded` cases that update the folded session's `status`; an event whose prior session is absent is handled without throwing a spurious `UnknownEventTypeError` (the two new types are now known). `rebuildSessionProjection` over `[SessionCreated, SessionStarted, SessionEnded]` yields a session with `status: 'ended'`.
- `isJoinEnabled(session)` is pure and total: `true` iff `status === 'live'`; `false` for `draft`, `ended`, `archived`, null/absent session, or unknown status. The detail UI's join-state affordance is derived solely from this predicate so the gate cannot drift from status.
- UI reuses `Layout`/Tailwind and the existing `@/components/ui` primitives (`button`, `card`); no new UI library. Identity is read via `useAuth`, never `db.useAuth()`. Raw email is never shown.
- **Failure behavior**:
  - Illegal transition (start a non-`draft`, end a non-`live`, unknown/missing status) → the builder throws synchronously, `writeEvent` is never called, nothing is written, and the UI shows an inline error (`data-testid="session-lifecycle-error"`); the displayed status is unchanged.
  - Non-owner attempt → the builder refuses (actor ≠ `teacherId`) and, even if bypassed, the data-layer permission rule rejects the transaction; the rejection is surfaced (`console.error` + inline), never swallowed.
  - `writeEvent` rejection (permission denial, network/dependency failure, or a concurrent transition that changed the row) → the rejection propagates and is surfaced; because the event append and projection update share one transaction, a rejected transition leaves no partial state (no orphan event, no half-changed status).
  - Stale UI (the live `db.useQuery` already moved the session past the expected `from` state) → the builder's transition check, fed the current status, rejects rather than re-appending a duplicate lifecycle event.

## Acceptance Criteria
- [ ] On `/dashboard/sessions/[id]` for a `draft` session they own, the teacher clicks **Start**, the status shown becomes `live`, and the page indicates joining is now enabled (`data-testid="session-status"` reads `live`; the join-enabled affordance is shown) — *user-observable benefit: the teacher can now run the session live and students would be able to join.*
- [ ] The teacher then clicks **End**, the status shown becomes `ended`, and the page indicates live participation is closed (join disabled).
- [ ] After start then end, exactly one `SessionStarted` and one `SessionEnded` `sessionEvents` row exist for the session id, and `SessionStarted.occurredAt` precedes `SessionEnded.occurredAt` (ordered observability check via the admin query); the live `sessions` row ends with `status === 'ended'`, a set `startedAt`, and a set `endedAt`.
- [ ] `rebuildSessionProjection(sessionId, [SessionCreated, SessionStarted, SessionEnded])` returns a session with `status === 'ended'`; the two new event types do not raise `UnknownEventTypeError` (unit test).
- [ ] `isJoinEnabled` returns `true` only for `status === 'live'` and `false` for `draft`/`ended`/`archived`/null/unknown (unit test). *(join-gate criterion)*
- [ ] An illegal transition — e.g. `buildSessionEnd` on a `draft` session or `buildSessionStart` on an `ended` session — throws, writes nothing, and leaves the projection unchanged; in the UI a forced illegal/stale transition shows `session-lifecycle-error` and the displayed status does not change (unit + e2e). *(failure-path criterion)*
- [ ] A non-owner / forced-`writeEvent`-rejection start or end propagates the error to the caller and surfaces it inline, leaving no partial state — the error is not swallowed (unit test via a rejecting `writeEvent`, with ownership rejection asserted in the builder). *(failure-path criterion)*
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`, `npm run astro check`).
- [ ] No compiler/linter warnings introduced; `npm run astro check` is clean.

## Testing Strategy
- **Vitest** (`src/lib/sessions.test.ts`, extending the existing file) over the pure cores, no DOM/InstantDB:
  - `assertLegalTransition` / transition table: permits `draft → live` and `live → ended`; rejects `draft → ended`, `live → live`, every `ended → *`, and unknown/missing `from`.
  - `buildSessionStart` / `buildSessionEnd`: produce meta with `actor.role === 'teacher'`, `sessionId === payload.id`, projection txn setting the new `status` and stamping `startedAt`/`endedAt`; reject before producing any plan on an illegal transition, a non-owner actor (actor id ≠ `teacherId`), or a missing `sessionId`.
  - `startSession` / `endSession` failure path: a stubbed/rejecting `writeEvent` causes the wrapper to reject (error propagated, not swallowed); the legal path calls `writeEvent` exactly once with the expected type and a single projection txn.
  - `applyEvent` fold: `SessionStarted` / `SessionEnded` update status; `rebuildSessionProjection` over the full lifecycle yields `ended`; neither type throws `UnknownEventTypeError`.
  - `isJoinEnabled`: truth table across all statuses plus null/unknown.
- **Playwright** (`e2e/session-lifecycle.spec.ts`) against the port-4399 dev server, reusing `signInViaUi` / `freshEmail` / `queryAdmin` from `e2e/support/auth.ts` and **skipping loudly** when `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID` are unset (mirrors `create-session.spec.ts`):
  - Happy path: sign in → create a session (cycle-0005 flow) → open its detail page → assert `draft` + join disabled → **Start** → assert `live` + join enabled → **End** → assert `ended` + join closed.
  - Observability: query the live app for the session id and assert one `SessionStarted` and one `SessionEnded` row in `occurredAt` order, and the `sessions` row at `status === 'ended'` with `startedAt`/`endedAt` set.
  - Failure path: drive an illegal/stale transition (e.g. attempt End on a still-`draft` session via a controls-visible state or a re-click after end) and assert `session-lifecycle-error` appears and the status is unchanged.
  - Note in the spec that a real cross-context student join is deferred to the join cycle; this suite verifies the **join-enablement gate state**, not an actual student join.
- E2E is required because the dual-write, the live status reflection, and the join-gate affordance are only observable in a hydrated browser against live auth and InstantDB.

## Documentation Updates
- **AGENTS.md**: extend the cycle-0005 "Session creation" note with a "Session lifecycle" line — sessions transition via `startSession` / `endSession` (`src/lib/sessions.ts`), the only sanctioned paths, routing `SessionStarted` / `SessionEnded` through `writeEvent`; the legal-transition guard pins SPEC §6.2 (`draft → live → ended`); ownership is enforced in the builder, the `SessionRouteGuard`, and the data-layer rule; `isJoinEnabled` is the sanctioned join gate (true only when `live`); `applyEvent` now folds the two lifecycle events. List the new detail-page testids downstream cycles reuse: `session-start`, `session-end`, `session-status`, `session-join-state`, `session-lifecycle-error`.
- **README.md**: surface that a teacher can now start and end a session from its detail page, that starting opens the join gate and ending closes live participation.
- **release-notes.md**: one line noting the session lifecycle (start/end with `SessionStarted`/`SessionEnded` events and the join-enablement gate) is live; no new env/config keys.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Cycle 0005 `createSession` / `src/lib/sessions.ts` (the pure-core split this cycle extends) and the cycle-0005 post-create card the detail link hangs off; the `sessions` schema fields `status`, `startedAt`, `endedAt` (already present, SPEC §5.2) — `src/lib/db.ts`.
- `writeEvent()` dual-write helper and `applyEvent` / `rebuildSessionProjection` in `src/lib/db.ts` (the new fold cases land here).
- Cycle 0004 `SessionRouteGuard` (`src/components/SessionRouteGuard.tsx`) and the `/dashboard/sessions/[id]` route shell, which already own-gate the detail page; the shared `useAuth` hook (cycle 0002) for the signed-in user id.
- Cycle 0003 permission rules pushed live: owner-only `sessions` writes (`auth.id == data.teacherId`) and append-only `sessionEvents`. If a transition write is rejected with a schema/permission error, run `npx instant-cli push schema` then `npm run perms:push`.
- Env: `PUBLIC_INSTANTDB_APP_ID` (app); `INSTANT_ADMIN_TOKEN` (e2e-only deterministic sign-in + admin observability query, else the suite skips loudly).
