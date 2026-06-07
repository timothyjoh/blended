# Implementation Plan: Cycle 0007

## Overview

Deliver the student-join vertical slice end-to-end: a `/join/:joinCode` route (auth-gated) that, on a **live** Session, creates a student `Participant` idempotently via the sole sanctioned `joinSession` → `writeEvent('ParticipantJoined', …)` dual-write and routes to `/s/:joinCode`, a live-syncing student session view proving late-joiner sync, and the tightening of the currently fail-open `participants` permission rules to owner-scoping before any participant row is written.

## Current State (from Research)

- **`src/lib/sessions.ts`** holds the pure-core/thin-wrapper doctrine to extend: pure `build*` builders totally validate-then-throw before producing a plan; thin async wrappers (`createSession`/`startSession`/`endSession`) route the dual-write through `writeEvent`. `isJoinEnabled(session)` (`:293`) is the sole join gate (`true` iff `status === 'live'`). Wrappers take injectable `deps` (`write?`, `buildTxn?`); `createSession`/`startSession` are explicitly **not** idempotent — `joinSession` must **be**.
- **`src/lib/db.ts`** — `writeEvent(type, meta, projectionTxns)` (`:326`) is the only sanctioned projection-write path (non-empty `projectionTxns`, atomic, throws-before-write). `applyEvent` folds `ParticipantJoined` keyed on `participantId ?? event.id` with payload `{ participantId, userId, role, username }` (`:246`-`:266`). The `participants` entity (`:81`-`:93`) has **no `email` field** (structural privacy); fields are `sessionId` (indexed), `userId`, `role`, `username`, `joinedAt`, `lastSeenAt`, `chatStatus`. Only link today is `sessionResourceSession` (`:136`-`:140`).
- **`src/lib/perms.ts`** — `participants` is **fail-open** (`create/update/delete = 'auth.id != null'`, `:95`-`:102`); `sessions.view = 'true'` (`:50`, join route may read any session); `sessionEvents.create = 'auth.id != null'` (`:86`, keeps `writeEvent` legal for student actors). `sessionResources` (`:58`-`:77`) is the precedent for link-based owner scoping (`data.ref('session.teacherId')`).
- **`src/lib/auth.ts`** — `deriveUsername(email)` = email local-part (`:35`); `shouldCreateUserRow` (`:47`-`:55`) is the create-only-if-absent idempotency model (live-query count + `inFlight` latch).
- **`src/lib/useAuth.ts`** — single auth seam; `{ user, isLoading, error, username }`. Product code never calls `db.useAuth()` directly.
- **`src/components/RouteGuard.tsx`** — single client auth gate: loading shell (no flash-redirect), `window.location.replace(loginRedirectTarget(...))` on resolved-no-user, `route-guard-denied` on error. Wrapping a page in it gives the `?next=` round-trip for free.
- **`src/components/SessionLifecycle.tsx`** — reference live-query island: `db.useQuery`, `q.isLoading`/`q.error` handling, `surface(err)` = inline `role="alert"` + `console.error`, status-derived UI.
- **`src/pages/dashboard/sessions/[id].astro`** — param-route shell: `const { id = '' } = Astro.params`; mount `client:only="react"` island inside a guard, param passed as a definite-string prop.
- **e2e**: `e2e/support/auth.ts` — `adminAvailable()`, `signInViaUi`, `freshEmail`, `mintCode`, `queryAdmin`; multi-context pattern in `e2e/permissions.spec.ts`. Vitest specs co-located (`*.test.ts`); `npm run test`, `npm run test:e2e`, `npm run astro check`.

## Resolved Open Questions

1. **Idempotency seam.** Mirror the established `shouldCreateUserRow` model. The join island runs a live query `db.useQuery({ participants: { $: { where: { sessionId, userId } } } })`; a new pure helper `shouldCreateParticipant({ authUserId, participantsLoaded, existingCount, inFlight })` decides create-vs-no-op. The live-query precheck plus an `inFlight` ref latch is the idempotency guarantee — identical to first-sign-in users-row creation. The narrow double-submit race is acceptable for MVP (same posture as `useAuth`), and is documented.
2. **Participant id.** A fresh `id()` per create attempt, used as **both** the `participants` entity id and the `participantId` in the `ParticipantJoined` payload, so the fold (`participantId ?? event.id`) reproduces the same row (log/projection consistency). No deterministic-id scheme — InstantDB ids are random UUIDs and the precheck already enforces single-row.
3. **Tightened `participants` rule + teacher slot.** Mirror `sessionResources` exactly: add a `participantSession` link (forward `session` on `participants`, reverse `participants` on `sessions`) so teacher ownership is checkable against the **real** parent session, not a forgeable field. Binds: `['isOwnRow', 'auth.id == data.userId', 'isSessionOwner', "auth.id in data.ref('session.teacherId')", 'isAdmin', 'false']`; `create/update/delete = 'isOwnRow || isSessionOwner || isAdmin'`, `view = 'true'`. The join write sets the `session` link so the teacher clause resolves for future teacher-side ops. `isOwnRow` alone admits the student's own create (`auth.id == data.userId`).
4. **`/s/:joinCode` resolution.** The student view re-resolves the Session by `joinCode` via a live query plus a `participants` live query keyed on `sessionId`. Reads are open (`sessions.view = 'true'`), so it renders status + present-participant usernames regardless of membership; an unknown `joinCode` renders a non-blank not-found state. It does **not** add a not-a-participant gate (out of scope) — it is a read-only presence/status surface.

## Desired End State

- Routes `/join/[joinCode]` and `/s/[joinCode]` exist, each mounting a `client:only="react"` island inside `RouteGuard`.
- `src/lib/sessions.ts` exports `buildParticipantJoin` (pure builder), `shouldCreateParticipant` (pure idempotency helper), and `joinSession` (thin wrapper) — all unit-tested.
- `src/lib/perms.ts` `participants` block is owner-scoped (no longer `auth.id != null` for writes); `src/lib/db.ts` has the `participantSession` link; `src/lib/perms.test.ts` pins the tightened semantics.
- A student opening a live Session's link authenticates, a `Participant{role:'student', username:<local-part>}` + `ParticipantJoined` event are committed in one transaction, and they land on `/s/<joinCode>`; re-opening creates no second row; unknown/non-live links show clear non-blank states and write nothing.
- Verify: `npm run test`, `npm run test:e2e`, `npm run astro check` all green; `e2e/join-via-link.spec.ts` (multi-context late-joiner + failure paths) passes; schema + perms pushed (`npx instant-cli push schema` then `npm run perms:push`).

## What We're NOT Doing

- Participant roster UI, chat/messages, questions, resource display/sync — `/s/:joinCode` shows only minimal status + present usernames.
- Teacher-side "view participants" awareness UI.
- `ParticipantLeft` / presence-heartbeat / reconnect events; `lastSeenAt` updates beyond the initial join value.
- Manual display-name editing (students do not set names in MVP).
- A not-a-participant gate on `/s/:joinCode` (read-only view; reads are open).
- Any new auth path — auth gating reuses `RouteGuard`/`useAuth` and the existing magic-code flow.

## Implementation Approach

Security-first ordering: tighten the `participants` rules and add the ownership link **before** any participant row can be written (Task 1), so the fail-open hole flagged in `AGENTS.md` never coexists with real rows. Then build the pure, unit-testable core (`buildParticipantJoin` + `shouldCreateParticipant` + `joinSession`, Task 2), following the exact pure-core/thin-wrapper split already proven for create/lifecycle. Then the two thin UI islands and their `.astro` shells (Tasks 3–4), reusing `RouteGuard`, `db.useQuery`, and the `surface(err)` failure pattern verbatim. Finally the multi-context e2e + docs (Tasks 5–6). Every mutation routes through `writeEvent`; idempotency is a live-query precheck plus an `inFlight` latch, mirroring `useAuth`'s users-row creation.

## Failure & Resilience Decisions

**Task 1 — perms + schema link (config push).**
- **Failure modes**: `npx instant-cli push schema` / `npm run perms:push` can fail (network, auth, schema conflict on the new link). Response: propagate — the push script exits non-zero; the rules/schema are not silently half-applied. The structural unit test fails loudly if the in-repo rule strings drift from intent.
- **Idempotency**: Pushes are declarative and idempotent — re-running pushes the same schema/rules. Adding a link is additive; re-push is a no-op once present.
- **Observability**: CLI output on push; `perms.test.ts` assertions are the in-repo regression guard.
- **No silent failure**: a failed push is a non-zero exit; a loosened rule fails the structural test.

**Task 2 — `buildParticipantJoin` / `shouldCreateParticipant` / `joinSession`.**
- **Failure modes**: `buildParticipantJoin` throws synchronously on missing `sessionId`/`userId`/blank derived `username` — writing nothing. `joinSession` delegates the actual write to `writeEvent`, whose rejection (permission, network, schema) propagates; the single transaction means no partial participant row.
- **Idempotency**: `joinSession` is required idempotent per (user, session): the island precheck (`shouldCreateParticipant` over the live `participants` count) makes a repeat call a no-op before any write. `buildParticipantJoin`/`shouldCreateParticipant` are pure.
- **Observability**: the `ParticipantJoined` envelope IS the observability record; the builder's throw carries a descriptive message; the island `console.error`s on catch.
- **No silent failure**: builder throws propagate to the island catch → inline `role="alert"` + `console.error`; `writeEvent` rejection is never swallowed.

**Task 3 — Join island (`JoinSession.tsx`).**
- **Failure modes**: `db.useQuery` error (surface, render error state, no write); unknown `joinCode` (not-found state, no write); non-live session (not-open state, no write); `joinSession` rejection (inline `role="alert"` + `console.error`, no false "joined", no partial row); auth still resolving (loading shell via `RouteGuard`, no flash-redirect).
- **Idempotency**: create gated by `shouldCreateParticipant` + `inFlight` ref; a reload for an already-joined user routes straight to `/s/:joinCode` without a write. The post-success navigation (`window.location.assign`) is safe to re-run.
- **Observability**: `console.error('[JoinSession] …')` on query error and write rejection; testid'd states (`join-loading`, `join-not-found`, `join-not-open`, `join-error`).
- **No silent failure**: every error path renders an observable state and/or logs; no catch swallows.

**Task 4 — Student session island (`StudentSession.tsx`).**
- **Failure modes**: `db.useQuery` error (surface inline + `console.error`); unknown `joinCode` (not-found state). Read-only — no writes, so no partial-write surface.
- **Idempotency**: N/A — read-only live query, re-renders are pure reads.
- **Observability**: `console.error('[StudentSession] …')` on query error; testid'd states (`student-session-root`, `student-session-status`, `student-session-presence`).
- **No silent failure**: query error renders a visible state and logs.

**Task 5 — e2e.** N/A for product resilience; the spec itself skips loudly without `INSTANT_ADMIN_TOKEN` (never a false green) and uses `queryAdmin` (throws on failure, never swallowed). `retries: 3` absorbs realtime flake.

**Task 6 — docs.** N/A — pure documentation, no failure surface.

---

## Task 1: Tighten `participants` permission rules + add ownership link

### Overview
Close the fail-open `participants` hole before any participant row is written. Add a `participantSession` link so teacher ownership is checkable against the real parent session (mirroring `sessionResources`), scope writes to the row owner (`auth.id == data.userId`) plus the owning teacher and reserved admin slot, and pin the new semantics structurally.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**: Add a link in the `links` block alongside `sessionResourceSession`:
```ts
participantSession: {
  forward: { on: 'participants', has: 'one', label: 'session' },
  reverse: { on: 'sessions', has: 'many', label: 'participants' },
},
```

**File**: `src/lib/perms.ts`
**Changes**: Replace the fail-open `participants` block with owner-scoping mirroring `sessionResources`:
```ts
participants: {
  // Owner-scoped (cycle 0007), closing the fail-open hole flagged in AGENTS.md
  // before any participant row exists. `isOwnRow` admits a user managing their
  // OWN row (auth.id == data.userId); `isSessionOwner` admits the owning teacher
  // checked against the LINKED parent session's teacherId (forgery-proof, like
  // sessionResources); `isAdmin` reserves the future client-admin slot (false
  // today; the admin SDK bypasses rules). Reads stay open so presence is visible.
  // Rows carry NO email by design (privacy is structural — see db.ts).
  bind: [
    'isOwnRow', 'auth.id == data.userId',
    'isSessionOwner', "auth.id in data.ref('session.teacherId')",
    'isAdmin', 'false',
  ],
  allow: {
    view: 'true',
    create: 'isOwnRow || isSessionOwner || isAdmin',
    update: 'isOwnRow || isSessionOwner || isAdmin',
    delete: 'isOwnRow || isSessionOwner || isAdmin',
  },
},
```

**File**: `src/lib/perms.test.ts`
**Changes**: Replace the current `participants` test (`:55`-`:62`, which pins `'auth.id != null'`) with the tightened semantics, keeping the no-email structural assertion:
```ts
it('participants: owner-scoped writes (own row or owning teacher), no email, reads open', () => {
  expect(JSON.stringify(rules.participants).toLowerCase()).not.toContain('email')
  expect(rules.participants.allow.view).toBe('true')
  for (const op of ['create', 'update', 'delete'] as const) {
    const expr = rules.participants.allow[op]
    expect(expr).not.toBe('true')
    expect(expr).not.toBe('auth.id != null') // regression: no longer fail-open
    expect(expr).toContain('isOwnRow')
  }
  expect(rules.participants.bind).toContain('auth.id == data.userId')
  expect(rules.participants.bind).toContain("auth.id in data.ref('session.teacherId')")
  expect(rules.participants.bind).toContain('isAdmin')
})
```

**Push**: `npx instant-cli push schema` then `npm run perms:push`.

### Success Criteria
- [ ] `npm run astro check` passes (link + rules well-formed)
- [ ] `npm run test` passes including the updated `perms.test.ts`
- [ ] Structural test rejects any reversion to `'auth.id != null'` for participant writes
- [ ] Schema + perms pushed successfully (non-zero exit on failure surfaces)
- [ ] Failure paths behave as designed (push failure is loud; loosened rule fails the test)

---

## Task 2: Pure core — `buildParticipantJoin`, `shouldCreateParticipant`, `joinSession`

### Overview
Add the sole sanctioned participant-create path to `src/lib/sessions.ts`, following the existing pure-core/thin-wrapper doctrine, with the idempotency decision helper.

### Changes Required
**File**: `src/lib/sessions.ts`
**Changes**: Append a participant-join section:
```ts
export type ParticipantRecord = {
  id: string
  sessionId: string
  userId: string
  role: 'student'
  username: string
  joinedAt: number
  lastSeenAt: number
  chatStatus: 'allowed'
}

export type BuildParticipantJoinInput = {
  sessionId: string | null | undefined
  userId: string | null | undefined
  username: string | null | undefined
  participantId?: string
  now?: number
}

export type ParticipantJoinPlan = { record: ParticipantRecord; meta: WriteEventMeta }

// Pure builder: totally validates BEFORE producing any plan. participantId ===
// payload.participantId === record.id so the ParticipantJoined fold reproduces
// the row. Email is NEVER part of the record (structural privacy).
export function buildParticipantJoin(input: BuildParticipantJoinInput): ParticipantJoinPlan {
  const sessionId = input.sessionId
  if (!sessionId) throw new Error('joinSession: a sessionId is required')
  const userId = input.userId
  if (!userId) throw new Error('joinSession: must be signed in to join a session')
  const username = (input.username ?? '').trim()
  if (username === '') throw new Error('joinSession: a username is required')

  const participantId = input.participantId ?? id()
  const at = input.now ?? Date.now()
  const record: ParticipantRecord = {
    id: participantId, sessionId, userId, role: 'student',
    username, joinedAt: at, lastSeenAt: at, chatStatus: 'allowed',
  }
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: userId, role: 'student' },
    payload: { participantId, userId, role: 'student', username },
  }
  return { record, meta }
}

// Pure idempotency gate, mirroring shouldCreateUserRow. True ONLY when an auth id
// exists, the participants query has loaded, no row exists for (user, session),
// and no create is already in flight — safe across reloads and re-renders.
export function shouldCreateParticipant(input: {
  authUserId: string | null | undefined
  participantsLoaded: boolean
  existingCount: number
  inFlight: boolean
}): boolean {
  const { authUserId, participantsLoaded, existingCount, inFlight } = input
  return Boolean(authUserId) && participantsLoaded && existingCount === 0 && !inFlight
}

export type JoinSessionDeps = {
  write?: typeof writeEvent
  buildTxn?: (record: ParticipantRecord) => ProjectionTxn
}

const defaultParticipantTxn = (r: ParticipantRecord): ProjectionTxn =>
  db.tx.participants[r.id]
    .update({
      sessionId: r.sessionId, userId: r.userId, role: r.role, username: r.username,
      joinedAt: r.joinedAt, lastSeenAt: r.lastSeenAt, chatStatus: r.chatStatus,
    })
    .link({ session: r.sessionId })

// Thin wrapper: builds the plan (sync-throws on bad input, writing nothing), then
// dual-writes the ParticipantJoined envelope + participants projection (incl. the
// session link) in ONE writeEvent transaction. A rejected join leaves no partial
// row. Idempotency per (user, session) is enforced by the CALLER's precheck via
// shouldCreateParticipant — this wrapper assumes the row is absent. Rejection
// propagates, never swallowed.
export async function joinSession(
  input: BuildParticipantJoinInput,
  deps: JoinSessionDeps = {}
): Promise<ParticipantRecord> {
  const plan = buildParticipantJoin(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultParticipantTxn
  await write('ParticipantJoined', plan.meta, [buildTxn(plan.record)])
  return plan.record
}
```

**File**: `src/lib/sessions.test.ts`
**Changes**: Add unit coverage (see Testing Strategy).

### Success Criteria
- [ ] `npm run astro check` passes; `npm run test` passes
- [ ] `buildParticipantJoin` produces a record with no `email` key and a `ParticipantJoined` envelope with `actor.role: 'student'` and `sessionId` set; `participantId === record.id === payload.participantId`
- [ ] Rejects missing `sessionId`, missing `userId`, blank/whitespace `username` — writing nothing
- [ ] `shouldCreateParticipant` returns false when a row exists, when not loaded, when no auth id, or when in flight
- [ ] `joinSession` calls the injected `write` exactly once with the built plan; a rejected `write` propagates (no swallow)

---

## Task 3: Join route + island (`/join/[joinCode]`)

### Overview
The auth-gated join entry point: resolve the Session by `joinCode` (live query), gate eligibility on `isJoinEnabled`, idempotently create the student participant via `joinSession`, and route to `/s/<joinCode>`. Clear non-blank states for loading / not-found / not-open / error.

### Changes Required
**File**: `src/components/JoinSession.tsx` (new)
**Changes**: `client:only="react"` island, prop `{ joinCode: string }`, mounted inside `RouteGuard` (so the `?next=/join/<code>` bounce is automatic). Reads identity via `useAuth`. Runs two live queries:
```ts
const sessionQ = db.useQuery(joinCode ? { sessions: { $: { where: { joinCode } } } } : null)
const session = sessionQ.data?.sessions?.[0] ?? null
const partsQ = db.useQuery(
  session?.id && user?.id
    ? { participants: { $: { where: { sessionId: session.id, userId: user.id } } } }
    : null
)
```
Logic:
- `sessionQ.isLoading` → `join-loading` shell.
- `sessionQ.error` → `console.error('[JoinSession] …')` + `join-error` (`role="alert"`).
- no `session` → `join-not-found` state (no write).
- `!isJoinEnabled(session)` → `join-not-open` state (no write).
- already a participant (`partsQ` count > 0) → `window.location.assign('/s/' + joinCode)` (no write).
- else, in an effect gated by `shouldCreateParticipant({ authUserId: user.id, participantsLoaded: !partsQ.isLoading && !partsQ.error, existingCount, inFlight: inFlight.current })`: set `inFlight`, call `joinSession({ sessionId: session.id, userId: user.id, username })` in try/catch; on success `window.location.assign('/s/' + joinCode)`; on error `surface(err)` → `join-error` + `console.error`; `finally` clears `inFlight`.

Follow `SessionLifecycle`'s `surface(err)` and testid conventions. Stable testids: `join-loading`, `join-not-found`, `join-not-open`, `join-error`, plus a `join-root` wrapper.

**File**: `src/pages/join/[joinCode].astro` (new)
**Changes**: Mirror `dashboard/sessions/[id].astro`:
```astro
---
import Layout from '@/layouts/Layout.astro'
import RouteGuard from '@/components/RouteGuard'
import JoinSession from '@/components/JoinSession'
const { joinCode = '' } = Astro.params
---
<Layout title="Join session — Blended">
  <div class="mx-auto mt-12 w-full max-w-2xl px-4">
    <RouteGuard client:only="react">
      <JoinSession client:only="react" joinCode={joinCode} />
    </RouteGuard>
  </div>
</Layout>
```

### Success Criteria
- [ ] `npm run astro check` passes
- [ ] Unauthenticated visit to `/join/<code>` bounces to `/login?next=%2Fjoin%2F<code>` (RouteGuard)
- [ ] Live session + first visit creates exactly one participant and navigates to `/s/<code>`
- [ ] Already-joined reload navigates to `/s/<code>` with no second write
- [ ] Unknown code → `join-not-found`, no write; non-live → `join-not-open`, no write
- [ ] `joinSession` rejection renders `join-error` (`role="alert"`) + `console.error`, no false success, no partial row

---

## Task 4: Student session view (`/s/[joinCode]`)

### Overview
A live-syncing read-only presence/status surface inside the auth gate, proving late-joiner sync: a context that loads after others immediately reflects current Session status and the set of present participant usernames.

### Changes Required
**File**: `src/components/StudentSession.tsx` (new)
**Changes**: `client:only="react"` island, prop `{ joinCode: string }`, inside `RouteGuard`. Live queries:
```ts
const sessionQ = db.useQuery(joinCode ? { sessions: { $: { where: { joinCode } } } } : null)
const session = sessionQ.data?.sessions?.[0] ?? null
const partsQ = db.useQuery(session?.id ? { participants: { $: { where: { sessionId: session.id } } } } : null)
```
- `sessionQ.isLoading` → loading shell.
- `sessionQ.error` → `console.error('[StudentSession] …')` + inline `role="alert"`.
- no `session` → not-found state.
- else render `student-session-root` containing `student-session-status` (`{session.status}`) and `student-session-presence` listing each participant's `username` (each with a stable child testid, e.g. `student-session-presence-item`). Never render email (it is not on the row).

**File**: `src/pages/s/[joinCode].astro` (new)
**Changes**: Same shell pattern as Task 3, mounting `StudentSession` inside `RouteGuard`, title "Session — Blended".

### Success Criteria
- [ ] `npm run astro check` passes
- [ ] `/s/<code>` renders `student-session-root` with `student-session-status` reflecting live status and `student-session-presence` listing present usernames
- [ ] A context loading after others immediately shows the same status + present-participants set (live query, no manual refresh)
- [ ] Unknown code → non-blank not-found state; query error surfaces inline + logs
- [ ] No `email` appears anywhere in the rendered output

---

## Task 5: E2E coverage (`e2e/join-via-link.spec.ts`)

### Overview
Multi-context Playwright test for the late-joiner sync benefit plus the failure paths, with admin-query observability.

### Changes Required
**File**: `e2e/join-via-link.spec.ts` (new)
**Changes**: `test.skip(!adminAvailable(), …)` loud-skip. Helper: teacher context A signs in (`signInViaUi(freshEmail())`), creates a session, opens the detail page, clicks Start, reads `session-joincode`. Tests:
- **Happy path / late-joiner**: B (`browser.newContext()`) signs in, visits `/join/<code>`, lands on `/s/<code>` (`student-session-root`). C signs in later, joins, and C's `/s/<code>` immediately shows the same `student-session-status` (`live`) and a presence set including B and C. Assert via `queryAdmin({ participants: { $: { where: { sessionId } } } })` that two `role: 'student'` rows exist with `username` === each email local-part and **no `email` field** on the rows; assert a `ParticipantJoined` event exists per join.
- **Idempotency**: B reloads `/join/<code>`, lands in `/s/<code>`; `queryAdmin` participant count for (B, session) stays 1.
- **Failure — unknown code**: any signed-in context visits `/join/<random>` → `join-not-found`; `queryAdmin` shows no participant created.
- **Failure — non-live**: create a session but do **not** start it (or end it); visit `/join/<code>` → `join-not-open`; no participant created.

Use explicit testid waits (`toHaveText` / `toBeVisible` with timeouts), never `networkidle`. Reuse `queryAdmin`/`signInViaUi`/`freshEmail`.

### Success Criteria
- [ ] `npm run test:e2e` passes (with `retries: 3` absorbing realtime flake) when admin env present; skips loudly otherwise
- [ ] Late-joiner context observes the shared current state without refresh
- [ ] Admin assertions confirm `role: 'student'`, local-part `username`, absent `email`, and per-join `ParticipantJoined`
- [ ] Idempotency, unknown-code, and non-live assertions all hold (no stray participant rows)

---

## Task 6: Documentation updates

### Overview
Docs are part of "done" per SPEC.

### Changes Required
**File**: `CLAUDE.md`, `AGENTS.md`
**Changes**: Add a "Student join (cycle 0007)" entry: `joinSession`/`buildParticipantJoin` as the sole sanctioned participant-create path; email-local-part `username` rule; idempotency-per-(user,session) guarantee; new `/join/:joinCode` and `/s/:joinCode` routes; fixed testids (`join-loading`, `join-not-found`, `join-not-open`, `join-error`, `student-session-root`, `student-session-status`, `student-session-presence`); resolution of the flagged fail-open `participants` hole (now owner-scoped via `isOwnRow`/`isSessionOwner` + the new `participantSession` link); note participant rows carry no email by design.

**File**: `README.md`, `release-notes.md`
**Changes**: Surface the user-facing change — "Students can now join a live session via its link and land in the session view."

### Success Criteria
- [ ] AGENTS.md no longer describes the `participants` rules as a fail-open blocker
- [ ] Docs name the sanctioned path, routes, testids, and email-privacy invariant
- [ ] Release note / README reflect the user-facing capability

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] **User-observable benefit:** After a Teacher starts a Session, a Student opening `/join/<joinCode>` and authenticating is routed to `/s/<joinCode>` and a `Participant` exists with `role === 'student'` and `username` === the email local-part (verifiable via admin query in e2e).` | Tasks 2, 3, 4, 5 | builder + island + view + e2e admin assertion |
| `[ ] A `ParticipantJoined` event is appended for the join, and folding the Session's event log via `applyEvent` reproduces the same participant projection row (log/projection consistency).` | Tasks 2, 5 | `participantId === record.id === payload.participantId` folds cleanly; e2e asserts event presence |
| `[ ] Reloading `/join/<joinCode>` (or re-opening it) as an already-joined user routes in **without** creating a second participant row for that (user, session).` | Tasks 2, 3, 5 | `shouldCreateParticipant` precheck + `inFlight` latch; e2e count-stays-1 |
| `[ ] The participant row carries no `email` field, and another student querying the Session cannot read any participant's email (structural privacy holds at the data layer).` | Tasks 2, 4, 5 | record has no email key; view never renders email; e2e admin asserts absent |
| `[ ] **Failure path:** Opening `/join/<unknownCode>` shows a clear non-blank "not found" state and creates no participant row; opening the link for a `draft` or `ended` Session shows a clear "not open" state and creates no participant row.` | Tasks 3, 5 | `join-not-found` / `join-not-open` states; e2e asserts no write |
| `[ ] **Failure path:** A signed-in user attempting to create/update/delete a participant row whose `userId` is not their own `auth.id` is rejected by the permission rules (asserted by the structural perms unit test, and an e2e admin-token check where applicable), leaving the row unchanged.` | Task 1 | owner-scoped rules + `perms.test.ts`; admin SDK bypasses rules so e2e check is via the structural test (the admin-token check does not exercise client rules) |
| `[ ] **Late-joiner sync (Playwright):** Teacher (context A) starts a Session; Student (context B) joins via the link and lands in `/s/<joinCode>`; a THIRD context (C) joins later and its `/s/<joinCode>` view immediately reflects the same current Session state (live status and the present-participants set) as the others.` | Tasks 4, 5 | live `db.useQuery` view + multi-context e2e |
| `[ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).` | Tasks 1–5 | full suite green |
| `[ ] `npm run astro check` passes with no new warnings.` | Tasks 1–4 | checked each task |

## Testing Strategy

### Unit Tests
- **`src/lib/sessions.test.ts`** (`buildParticipantJoin`): valid input → record with `role: 'student'`, local-part `username`, `joinedAt === lastSeenAt === now`, `chatStatus: 'allowed'`, and `id === participantId === meta.payload.participantId`; `meta.actor` = `{ id: userId, role: 'student' }`, `meta.sessionId` set. Assert the produced record has **no** `email` key (`expect(Object.keys(record)).not.toContain('email')`). Rejections: missing `sessionId`, missing `userId`, blank/whitespace `username` — each throws and produces nothing.
- **Email-local-part derivation**: `deriveUsername` is already tested; add a join-context assertion that a multi-dot/symbol address (e.g. `a.b+tag@x.io`) yields `a.b+tag`.
- **`shouldCreateParticipant`**: true only when authUserId present + loaded + count 0 + not in flight; false for each missing condition (existing row, not loaded, no auth id, in flight).
- **`joinSession`**: with an injected `write` spy + `buildTxn`, asserts one call with `'ParticipantJoined'` and the built meta; an injected rejecting `write` propagates (no swallow).
- **`src/lib/perms.test.ts`**: tightened `participants` assertions (Task 1) — writes not `'true'`, not `'auth.id != null'`, contain `isOwnRow`; binds contain `auth.id == data.userId`, `auth.id in data.ref('session.teacherId')`, `isAdmin`; no `email` substring; reads open. Root re-export test still holds.
- **Failure-path tests**: builder rejections (above); `joinSession` write-rejection propagation; `shouldCreateParticipant` false-when-row-exists (idempotency).
- **Mocking**: prefer real pure functions; the only injected seams are `joinSession`'s `write`/`buildTxn` deps (already the established pattern). No DOM/network mocking in unit scope.

### Integration / E2E Tests
- `e2e/join-via-link.spec.ts` (Task 5): multi-context A/B/C late-joiner happy path with `queryAdmin` observability (two student rows, local-part usernames, absent email, per-join `ParticipantJoined`); idempotent reload (count stays 1); unknown-code → `join-not-found` + no write; non-live → `join-not-open` + no write. Explicit testid waits, no `networkidle`, loud-skip without admin env, `retries: 3`.

## Walkthrough Plan

- **Flow**: Drives the REAL cycle-0007 routes, never the home page. Teacher context: sign in (admin-minted code) → `/dashboard` → create a session → open `/dashboard/sessions/[id]` → Start (→ `live`) → read the `session-joincode`. Student context B (`page.context().browser().newContext()`): sign in → `/join/<code>` → lands on `/s/<code>` (`student-session-root`). Student context C: sign in → `/join/<code>` → its `/s/<code>` shows the same `live` status and a presence set including B and C (late-joiner sync). Then a failure leg: visit `/join/<random>` (→ `join-not-found`) and the link for an unstarted/ended session (→ `join-not-open`).
- **Capture points** (ordered, named):
  - `01-teacher-session-live` — teacher detail page showing `session-status: live` and `session-joincode` (the shared link source).
  - `02-student-join-landing` — student B on `/s/<code>` immediately after joining (`student-session-root`, `student-session-status`).
  - `03-student-session-live` — B's `/s/<code>` presence surface listing the present username(s).
  - `04-late-joiner-presence` — C's `/s/<code>` reflecting the same `live` status and the expanded present-participants set (proves late-joiner sync).
  - `05-join-not-found` — `/join/<unknownCode>` showing the non-blank not-found state.
  - `06-join-not-open` — the link for a non-live session showing the not-open state.
- **Preconditions / test data**: auth via admin-minted magic codes (`@instantdb/admin` `generateMagicCode`, never a real inbox), reimplemented inline so the script imports nothing from project `.ts` source (matching cycle 0006's walkthrough). A freshly created + started session (no pre-seeding). Multiple browser contexts for the teacher and the two students. Realtime waits on explicit testid elements (`session-status`, `student-session-root`, `student-session-presence`), never `networkidle` (InstantDB keeps the socket busy). When `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID` are unset, the scenario degrades LOUDLY to capturing the observable `/login` page (it does not fall back to the home page).
- **If no observable UI this cycle**: N/A — this cycle builds clearly observable UI (`/join/:joinCode` states and the `/s/:joinCode` live presence view), which are the walkthrough subject.

## Risk Assessment
- **InstantDB realtime flake in the late-joiner multi-context test**: mitigate with explicit testid waits + generous timeouts + `retries: 3` (existing convention); no `networkidle`.
- **Double-submit race creating two participant rows**: mitigated by the `shouldCreateParticipant` precheck + `inFlight` ref latch, identical to `useAuth`'s users-row creation; the residual narrow race is accepted for MVP and documented.
- **New `participantSession` link migration**: additive and idempotent; pushed before any write (Task 1 precedes Tasks 3–5). `astro check` confirms well-formedness; structural test guards the rule strings.
- **`isOwnRow` create evaluation**: on create `data.userId` is the student's own id (`auth.id`), so `auth.id == data.userId` admits the legitimate self-join while rejecting a forged-userId row — verified by the structural test and the e2e failure leg.
- **Reaching `/s/:joinCode` without joining**: by design the view is read-only over open reads; it renders presence/status or a non-blank not-found state — no crash, no write, out of scope to gate further.
