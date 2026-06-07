# SPEC — Cycle 0007: Student joins via link and becomes a participant

## WHY

Today a Teacher can create and start a live Session (cycles 0005–0006), but there is no way for a Student to actually get *into* one. There is no `/join/:joinCode` route, no participant-creation path, and the `participants` permission rules are still fail-open (any signed-in user can mutate or delete any participant row — flagged in `AGENTS.md` as a blocker that this cycle must close before any participant rows exist). A live Session has no audience: the core promise of SPEC §1.3 ("students join via a low-friction session link and passwordless auth") is unmet.

## CONCRETE USER BENEFIT

A Student can open a teacher-shared join link, sign in with a magic code, and land **inside the live Session** as a participant — and a Student who joins *late* immediately sees the Session's current shared state, not a blank or stale page. Two people on different devices opening the same link both appear as participants of the one Session.

## USABLE END-STATE

- A Teacher starts a Session and shares its join link (`/join/<joinCode>`).
- A Student opens that link. If not signed in, they authenticate via magic code (existing flow) and are returned to the link.
- On a **live** Session, a `Participant{role: student, username: <email local-part>}` is created (idempotently), a `ParticipantJoined` event is appended, and the Student is routed to `/s/<joinCode>` — the student session view.
- The student session view is driven by a live query, so a Student who joins after others immediately reflects the Session's current shared state (its live status and the set of present participants), proving real-time late-joiner sync.
- Opening a link for an unknown or non-live (draft/ended) Session shows a clear, non-blank explanatory state and creates no participant.

## Objective

Deliver the student join vertical slice end-to-end: the `/join/:joinCode` route with its auth gate, a single sanctioned `joinSession` path that creates the student `Participant` and appends `ParticipantJoined` in one dual-write transaction, routing into the `/s/:joinCode` student session view that live-syncs current Session state, and the participant permission-rule tightening that must precede writing any participant row. Email stays private (it is never stored on the participant row — privacy is structural, per cycle 0003); the live display name is the email local-part only.

## Source Issue

`txt-20260606-213631-join-via-link-participant` — "Student joins via link and becomes a participant"

## Scope

### In Scope

- **Join flow** — `/join/[joinCode]` page + island: gates auth via the existing `RouteGuard` (unauthenticated → bounce to `/login?next=/join/<joinCode>`), looks up the Session by `joinCode`, and on a live Session calls the sole sanctioned `joinSession` create path (pure `buildParticipantJoin` builder + `joinSession` wrapper in `src/lib/sessions.ts`) which routes the dual-write through `writeEvent('ParticipantJoined', …)` — committing the `ParticipantJoined` envelope and the `participants` projection row (`role: 'student'`, `username` = email local-part, `userId`, `sessionId`, `joinedAt`, `lastSeenAt`, `chatStatus: 'allowed'`) in one transaction — then routes to `/s/<joinCode>`. Idempotent: a user already a participant of the Session is routed straight in without creating a second row. Unknown / non-live Sessions render a clear, non-blank state and create nothing.
- **Student session view** — `/s/[joinCode]` page + island, mounted inside the auth gate, subscribing via `db.useQuery` to the live Session and its participants so a late joiner immediately reflects current shared state. Renders a minimal presence/status surface (Session status + set of present participant usernames) — enough to *prove* live sync, not the full roster.
- **Participant permission rules** — tighten `participants` in `src/lib/perms.ts`: `create`/`update`/`delete` restricted to the row owner (`auth.id == data.userId`) plus the owning Teacher / admin slot, closing the fail-open hole flagged in `AGENTS.md` before any participant rows are written. Pinned by the structural unit test.

### Out of Scope

- Participant roster UI, chat/messages, questions, and resource display/sync (their own issues) — the `/s/:joinCode` view shows only the minimal presence/status proof of sync.
- Teacher-side "view participants" awareness UI.
- `ParticipantLeft` / presence-heartbeat / reconnect events and `lastSeenAt` updates beyond the initial join value.
- Manual display-name editing (SPEC §12.3: students do not set names in MVP).

## Requirements

- The join route MUST resolve the Session by `joinCode` via a live query and MUST gate on authentication using the existing `RouteGuard` / `useAuth` (no new auth path); the post-login `next` MUST flow through `safeNextPath` (no open redirect).
- Participant creation MUST route exclusively through `joinSession` → `writeEvent('ParticipantJoined', …)` (ADR-0001/0003); no projection-only `participants` write may exist in product code. The envelope actor is `{ id: user.id, role: 'student' }` and `sessionId` is the joined Session's id.
- `username` MUST default to the authenticated user's email local-part (SPEC §12.3). Email MUST NOT be stored on the `participants` row (privacy is structural — the field does not exist on the entity) and MUST NOT be displayed to other students.
- The join gate MUST derive eligibility solely from `isJoinEnabled(session)` (true only when `status === 'live'`).
- `joinSession` MUST be idempotent per (user, session): a repeat call / reload for a user already participating routes in without creating a duplicate participant row.
- `buildParticipantJoin` MUST totally validate input (present `sessionId`, present `userId`, non-empty derived `username`) and reject before producing any transaction.
- The `participants` permission rules MUST forbid a signed-in user from creating, updating, or deleting a participant row they do not own (`auth.id != data.userId`), except the owning Teacher / admin slot.
- **Failure behavior**:
  - **Unknown `joinCode`** (no matching Session): render a clear "session not found" state; create no participant; do not route to `/s/:joinCode`.
  - **Non-live Session** (draft or ended): render a clear "this session isn't open" state; create no participant.
  - **Unauthenticated**: redirect to `/login?next=<encoded /join/joinCode>` rather than rendering blank.
  - **`writeEvent` rejection** (permission rule, network, or schema): surface the failure inline (`role="alert"`) **and** `console.error` — never swallowed, never collapsed to a false "joined" state; leave no partial participant row (single-transaction guarantee).
  - **Auth still resolving**: render the loading state; never flash-redirect (consistent with `RouteGuard`).

## Acceptance Criteria

- [ ] **User-observable benefit:** After a Teacher starts a Session, a Student opening `/join/<joinCode>` and authenticating is routed to `/s/<joinCode>` and a `Participant` exists with `role === 'student'` and `username` === the email local-part (verifiable via admin query in e2e).
- [ ] A `ParticipantJoined` event is appended for the join, and folding the Session's event log via `applyEvent` reproduces the same participant projection row (log/projection consistency).
- [ ] Reloading `/join/<joinCode>` (or re-opening it) as an already-joined user routes in **without** creating a second participant row for that (user, session).
- [ ] The participant row carries no `email` field, and another student querying the Session cannot read any participant's email (structural privacy holds at the data layer).
- [ ] **Failure path:** Opening `/join/<unknownCode>` shows a clear non-blank "not found" state and creates no participant row; opening the link for a `draft` or `ended` Session shows a clear "not open" state and creates no participant row.
- [ ] **Failure path:** A signed-in user attempting to create/update/delete a participant row whose `userId` is not their own `auth.id` is rejected by the permission rules (asserted by the structural perms unit test, and an e2e admin-token check where applicable), leaving the row unchanged.
- [ ] **Late-joiner sync (Playwright):** Teacher (context A) starts a Session; Student (context B) joins via the link and lands in `/s/<joinCode>`; a THIRD context (C) joins later and its `/s/<joinCode>` view immediately reflects the same current Session state (live status and the present-participants set) as the others.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).
- [ ] `npm run astro check` passes with no new warnings.

## Testing Strategy

- **Vitest** (pure logic): `buildParticipantJoin` — valid input produces the correct `participants` projection row + `ParticipantJoined` envelope meta (`actor.role: 'student'`, `sessionId` set); rejects missing `sessionId`/`userId`/blank `username`; verify email is absent from the produced row. Email-local-part derivation (happy path + an address with multiple dots/symbols). Idempotency decision helper (already-participant → no-op). `src/lib/perms.test.ts` extended to pin the tightened `participants` create/update/delete owner-scoping.
- **Playwright** (`e2e/join-via-link.spec.ts`): multi-context test per the issue Verification block — A starts; B joins (auth + land); C joins late and immediately sees the shared current state. Failure-path e2e: opening an unknown code and a non-live session shows the explanatory non-blank state and writes no participant (admin-query assertion). Reuse the `queryAdmin` helper (`e2e/support/auth.ts`) for observability assertions; skip loudly without `INSTANT_ADMIN_TOKEN` per existing convention. `retries: 3` continues to absorb realtime-sync flake.
- New page islands get stable testids for downstream cycles (e.g. `join-loading`, `join-not-found`, `join-not-open`, `join-error`, `student-session-root`, `student-session-status`, `student-session-presence`).

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: add a "Student join (cycle 0007)" entry documenting `joinSession` / `buildParticipantJoin` as the sole sanctioned participant-create path, the email-local-part username rule, the idempotency-per-(user,session) guarantee, the new `/join/:joinCode` and `/s/:joinCode` routes, the fixed testids above, and the resolution of the flagged fail-open `participants` permission hole (now owner-scoped). Note that `participants` rows carry no email by design.
- **README.md / release-notes.md**: surface the user-facing change — "Students can now join a live session via its link and land in the session view."

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- Magic-code auth + `useAuth` (cycle 0002) and `safeNextPath` / `RouteGuard` / `SessionRouteGuard` (cycle 0004).
- `createSession` + `generateJoinCode` (cycle 0005) and `startSession` / `isJoinEnabled` lifecycle (cycle 0006) — a Session must be `live` to be joinable.
- InstantDB permission rules + structural email privacy (cycle 0003); this cycle tightens the `participants` rules before writing participant rows.
- `writeEvent` dual-write spine and the existing `ParticipantJoined` fold in `applyEvent` (`src/lib/db.ts`).
- `PUBLIC_INSTANTDB_APP_ID` (app); `INSTANT_ADMIN_TOKEN` (e2e-only, for admin-query assertions). Schema/perms pushed via `npx instant-cli push schema` then `npm run perms:push`.
