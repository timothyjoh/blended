# SPEC — Cycle 0005: Teacher Creates a Session (Draft)

## WHY
Authentication (cycle 0002), the data-layer permission rules (cycle 0003), and the protected `/dashboard` shell (cycle 0004) are all in place, but the dashboard is still an empty placeholder heading. There is no way to bring a `Session` into existence. Every downstream cycle — listing sessions, starting/ending a session, queuing resources, the join-via-link flow — assumes a `Session` row already exists with a `teacherId`, a `draft` status, and a shareable `joinCode`. Today nothing in the product can create one (only the dev-only `/dev/event-spine` scratch harness writes session rows). Until a real user can create a session from the dashboard, the entire session lifecycle is unreachable, and "becoming the teacher of a session" — which the SPEC defines as session-scoped, not an account type — has no entry point.

## CONCRETE USER BENEFIT
A signed-in user can open the dashboard, click "New session", type a title, and create a real session that they own. Immediately afterward they can observe the created session — its `draft` status and its generated, hard-to-guess join code — on screen. They have become the teacher of that session simply by creating it, with no special account type. This is the first product surface where a user's action durably changes session state.

## USABLE END-STATE
From the dashboard, a signed-in user:
- Sees a "New session" control behind the existing route guard.
- Enters a title and submits; a `Session` is created in `draft` with `teacherId` set to themselves and an unguessable `joinCode`.
- Sees the just-created session reflected back (title, `draft` status, join code) without navigating away.
- On a blank/whitespace title or a failed write, sees a clear inline error and no half-created session — the session is created only when the write succeeds.

## Objective
This cycle delivers the "New session" vertical slice on the protected dashboard: a title-collecting UI control, a `createSession` action that generates an unguessable `joinCode` and writes a `draft` `Session` owned by the creating user, the `SessionCreated` event dual-write through `writeEvent()` (event envelope + `sessions` projection in one transaction), and an immediate on-screen confirmation of the created session. It makes session creation — the precondition for every later session-lifecycle cycle — reachable and observable for the first time, while honoring the single-write-path (`writeEvent`) and single-auth-seam (`useAuth`) invariants.

## Source Issue
`txt-20260606-213628-create-session-draft` — "Teacher creates a session (draft)"

## Scope

### In Scope
- A `createSession` action module (`src/lib/sessions.ts`) with two unit-testable pure cores — an unguessable `generateJoinCode()` (crypto-backed, injectable RNG for tests) and a `buildSessionCreate(input)` builder that produces the `SessionCreated` event meta and the `sessions` projection transaction — plus a thin `createSession()` wrapper that calls `writeEvent('SessionCreated', …, [sessions txn])`. Sets `status: 'draft'`, `teacherId` to the creating auth user, the generated `joinCode`, `title`, `createdAt`, and `interactionMode: 'none'`; appends the event and projection atomically.
- A "New session" UI on `/dashboard` (`src/components/NewSession.tsx`, rendered inside the existing `RouteGuard`): a control that reveals a title input + submit, calls `createSession` with the title and the signed-in user's id (from `useAuth`), and renders the resulting session (title, `draft` status, `joinCode`) on success or an inline error on failure.
- Playwright coverage proving a signed-in user creates a session that appears in `draft` with a join code, and that a corresponding `SessionCreated` `sessionEvents` row exists for it (observability check).

### Out of Scope
- Listing/enumerating existing sessions, or persisting the created session into a dashboard list (`txt-…-dashboard-session-list`).
- Starting, ending, archiving, or otherwise transitioning the session (`txt-…-start-end-session`).
- Resources, join-as-participant, `joinSlug` generation, and any teacher-vs-student role UI beyond the fact that creating makes you the teacher.
- Editing or deleting a created session; navigating into the session detail page after creation.

## Requirements
- Session creation routes exclusively through `writeEvent()` — a single `db.transact()` appends the `SessionCreated` envelope and the `sessions` projection row together (ADR-0001/ADR-0003). No `db.tx.sessions[…]` write happens outside `writeEvent()`.
- `teacherId` on the projection equals the creating user's auth id (read via `useAuth`, never `db.useAuth()` directly), satisfying the cycle-0003 owner-only `sessions` write rule (`auth.id == data.teacherId`). The `actor` passed to `writeEvent` is `{ id: user.id, role: 'teacher' }`.
- The new session's `sessionId` (the `writeEvent` meta `sessionId`) is the `sessions` row id, generated with `id()` from `@/lib/db` (UUID). The `SessionCreated` payload carries `{ id, title, teacherId }` so it folds cleanly through the existing `applyEvent` `SessionCreated` case.
- `generateJoinCode()` produces an unguessable token (SPEC §16.2 — bearer access, MUST be unguessable) using a cryptographically strong source (`crypto.getRandomValues`), from an unambiguous character set, of sufficient length for MVP privacy. It is pure given an injected RNG so it is deterministically unit-testable; in production it defaults to the platform CSPRNG.
- Title is required: empty or whitespace-only input is rejected before any transaction is issued (mirrors `isValidEmail`'s total-validation style); the title is trimmed before storage.
- Any authenticated user can create a session — there is no account-type gate; the only precondition is being signed in (enforced by the surrounding `RouteGuard`).
- UI reuses `Layout`/Tailwind and the existing `@/components/ui` primitives (`button`, `input`, `card`); no new UI library is introduced. Raw email is never shown (SPEC §40 — unaffected here, but the surface shows `username`/title only).
- **Failure behavior**:
  - Blank/whitespace title → `createSession` throws/returns a validation error synchronously, writes nothing, and the UI shows an inline error (`data-testid="new-session-error"`); no session row and no event are created.
  - `writeEvent` rejection (permission denial, `joinCode` unique-constraint collision, or network/dependency failure) → the rejection propagates and is surfaced (logged via `console.error` and shown inline), never swallowed; because the event append and projection share one transaction, a rejected create leaves no partial state (no orphan event, no orphan session).
  - Signed-out / unresolved auth → the surrounding `RouteGuard` already prevents reaching the control; `createSession` additionally refuses to write when no auth user id is available.

## Acceptance Criteria
- [ ] A signed-in user on `/dashboard` enters a title, submits, and sees the created session rendered with `status` `draft` and a non-empty join code (`data-testid` for the created session, its status, and its join code) — the user-observable benefit: they can now create a session they own. 
- [ ] The created `sessions` row has `teacherId` equal to the creating user's auth id and `status === 'draft'` (asserted via query in the e2e check).
- [ ] Exactly one `sessionEvents` row of `type: 'SessionCreated'` exists for the created session id, written in the same transaction as the projection (observability check).
- [ ] `generateJoinCode()` returns codes of the specified length drawn only from the allowed charset, and two successive calls with the real CSPRNG differ; with an injected deterministic RNG the output is reproducible (unit test). *(unguessability / determinism criterion)*
- [ ] Submitting a blank or whitespace-only title produces an inline error (`new-session-error`), and **no** `sessions` row and **no** `SessionCreated` event are written (unit test on the validation path; e2e asserts no new row appears). *(failure-path criterion)*
- [ ] A rejected `createSession` write (simulated/asserted at the unit level via a forced `writeEvent` rejection) surfaces the error to the caller and leaves no created-session UI state — the error is propagated, not swallowed. *(failure-path criterion)*
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`, `npm run astro check`).
- [ ] No compiler/linter warnings introduced; `npm run astro check` is clean.

## Testing Strategy
- **Vitest** (`src/lib/sessions.test.ts`) over the pure cores, with no DOM/InstantDB dependency:
  - `generateJoinCode`: correct length, charset membership, determinism under an injected RNG, distinctness under the real CSPRNG.
  - `buildSessionCreate`: produces meta with `actor.role === 'teacher'`, `sessionId === payload.id`, projection txn setting `status: 'draft'`, trimmed `title`, `teacherId`, `joinCode`, `interactionMode: 'none'`, `createdAt`; rejects empty/whitespace title before producing any txn.
  - `createSession` failure path: a stubbed/rejecting `writeEvent` causes `createSession` to reject (error propagated, not swallowed).
- **Playwright** (`e2e/create-session.spec.ts`) against the port-4399 dev server, reusing `signInViaUi` / `freshEmail` from `e2e/support/auth.ts` and **skipping loudly** when `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID` are unset (mirrors `auth.spec.ts` / `route-guarding.spec.ts`):
  - Happy path: sign in → open dashboard → create a session with a title → assert the created session shows `draft` status and a join code.
  - Observability: query the live app for the created session id and assert one `SessionCreated` `sessionEvents` row and a `sessions` row with `teacherId === user.id`, `status === 'draft'`.
  - Failure path: submit a blank title → assert the inline error appears and no session is created.
- E2E is required because the create flow's dual-write and the on-screen confirmation are only observable in a hydrated browser against live auth and InstantDB.

## Documentation Updates
- **AGENTS.md**: under the Data Layer / route-guarding notes, add a short "Session creation" line — sessions are created via `createSession` (`src/lib/sessions.ts`) which routes through `writeEvent('SessionCreated', …)`; `generateJoinCode` is the sanctioned unguessable join-code source; creating a session is what makes a user its teacher (session-scoped role, no account type). Note the new dashboard testids reused by downstream cycles.
- **README.md**: surface that signed-in users can now create a draft session from the dashboard and receive a shareable join code.
- **release-notes.md**: one line noting session creation (draft + join code) is live, plus any new env/config notes (none expected beyond existing keys).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `writeEvent()` dual-write helper and the `sessions` schema (`title`, `status`, `teacherId`, unique `joinCode`, `createdAt`, `interactionMode`) — cycle 0001 (`src/lib/db.ts`), including the existing `SessionCreated` case in `applyEvent`.
- Cycle 0003 permission rules pushed live: owner-only `sessions` writes (`auth.id == data.teacherId`) and append-only `sessionEvents` — the create transaction must satisfy both. If writes are rejected with a schema/permission error, run `npx instant-cli push schema` then `npm run perms:push`.
- The shared `useAuth` hook (cycle 0002) for the signed-in user id, and the `RouteGuard` (cycle 0004) wrapping `/dashboard` so the control is only reachable when authenticated.
- Astro server output with React islands; `@/components/ui` (`button`, `input`, `card`) and Tailwind already present; `crypto.getRandomValues` available in the browser/runtime.
- Env: `PUBLIC_INSTANTDB_APP_ID` (app); `INSTANT_ADMIN_TOKEN` (e2e-only deterministic sign-in, else the suite skips loudly).
