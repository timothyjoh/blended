# Implementation Plan: Cycle 0002

## Overview
This cycle delivers Blended's single shared passwordless sign-in gate: one reusable login React island (email → code → signed-in view with sign-out), one shared `useAuth` hook wrapping InstantDB auth, session persistence across reload, and idempotent first-sign-in creation of one `users` projection row keyed to the InstantDB auth user id, routed through `writeEvent()` under a reserved `IDENTITY_SCOPE` sentinel.

## Current State (from Research)
- `src/lib/db.ts` is the single source of the InstantDB client/schema. `users` entity (`email?`, `username`, `adminLevel`, `createdAt`) is defined at `src/lib/db.ts:40-47`; `writeEvent()` (the only sanctioned projection-write path) is at `src/lib/db.ts:275-313`; `ACTOR_ROLES` includes `'unknown'` (`src/lib/db.ts:29`).
- No auth code exists today (zero matches for `useAuth`, `sendMagicCode`, `IDENTITY_SCOPE`).
- `@instantdb/react@^1.0.43` exposes the full auth surface confirmed in `node_modules/@instantdb/core/dist/esm/index.d.ts:127-244`: `db.auth.sendMagicCode({email})`, `db.auth.signInWithMagicCode({email,code})`, `db.auth.signInWithToken(token)`, `db.auth.signOut()`, and `db.useAuth(): AuthState`. The auth `User` (`clientTypes.d.ts`) has `{ id, email?, refresh_token, isGuest, ... }` — its `id` is the stable identity key.
- Island↔page pattern: `.tsx` island mounted from `.astro` via `client:only="react"` (`src/pages/dev/event-spine.astro:17`); error surfacing uses `setError` + `console.error('[Tag] …', err)` + a `role="alert"` `data-testid` element (`src/components/EventSpineHarness.tsx:101-137`).
- UI primitives: `src/components/ui/button.tsx`, `input.tsx` (Tailwind + `cn`). `Layout.astro` accepts a `title` prop.
- Tests: Vitest specs live beside modules (`src/lib/db.test.ts`); Playwright in `e2e/` against port 4399, `retries: 3` (`playwright.config.ts`).

### Resolved Open Questions
1. **Deterministic Playwright code path** — InstantDB ships no client-side fixed test code, but the **admin SDK** (`@instantdb/admin`, not yet installed) exposes `db.auth.generateMagicCode(email) → { code }`, which mints a server-valid code **without sending an email**. Resolution: add `@instantdb/admin` as a **devDependency**, and a Playwright helper that, after the UI "send code" click, mints a fresh valid code via admin `generateMagicCode` (the most-recently-generated code is the valid one, sidestepping the email the UI queued) and types it into the code step. Requires `INSTANT_ADMIN_TOKEN` env (Node-side only, not Astro client env). When the token is absent, the auth e2e spec `test.skip`s with a loud, documented message — never a silent pass.
2. **`IDENTITY_SCOPE` event type vs. fold safety** — identity events are written under `sessionId = "identity"`, which is never a real session, so `rebuildSessionProjection`/`applyEvent` (which fold *session* lists keyed by a real sessionId, `src/lib/db.ts:185-235`) are never called with the identity list. Resolution: **do not** add a `UserSignedIn` case to `applyEvent`; identity-scope events are intentionally outside session folds. A unit test asserts `applyEvent` still throws `UnknownEventTypeError` on `UserSignedIn`, locking the decision so nobody folds identity events into a session by accident.
3. **`useAuth` location** — SPEC says `src/lib`. Resolution: hook at `src/lib/useAuth.ts`; pure, db-free helpers + the `IDENTITY_SCOPE` constant at `src/lib/auth.ts` (so they unit-test without InstantDB init). This is deliberate divergence from `src/hooks/` because SPEC §Scope names `src/lib` explicitly.
4. **Gate page route** — product surface (not dev-gated). Resolution: `/login` (`src/pages/login.astro`) renders `<AuthGate client:only="react" />`. `index.astro` is left unchanged (route guarding/redirects are out of scope).

## Desired End State
- Visiting `/login` shows an email-entry form; valid email → code step; correct code → signed-in view showing the derived username and a sign-out control; reload keeps the user signed in; sign-out returns to the email form.
- Exactly one `users` row exists per auth id (`username` = email local-part, `adminLevel: 0`), written via `writeEvent()` with a `sessionEvents` envelope; repeat sign-in creates no duplicate.
- Verify: `npm run test`, `npm run test:e2e`, `npm run astro check` all pass; grep for `db.tx.users` in product code returns only the `writeEvent`-routed call inside `useAuth`.

## What We're NOT Doing
- No route guarding, redirect-on-auth, or role-based routing (cycle `txt-20260606-213627`).
- No admin promotion / uber-admin bootstrap / `adminLevel > 0` logic (cycle `txt-20260606-213643`).
- No per-session `participants` row creation or join-via-link flow.
- No custom magic-code email styling/branding (InstantDB default).
- No change to `index.astro` navigation, no `applyEvent` change, no new product event types in the session fold.
- No password / OAuth / external IdP.
- No guest auth (`signInAsGuest`) in product code — magic-code only.

## Implementation Approach
Build bottom-up in vertical slices that each end in a passing test: (1) pure, db-free auth logic with Vitest; (2) the `useAuth` hook composing those helpers with InstantDB auth + idempotent `writeEvent` users-row creation; (3) the `AuthGate` island consuming the hook; (4) the `/login` page; (5) the deterministic e2e harness + full Playwright coverage; (6) docs. Slices 1–4 are independently inspectable; slice 5 ties them together end-to-end. All projection writes go through `writeEvent()` to honor ADR-0001. Error handling mirrors the established `setError` + `console.error('[Tag] …')` + `role="alert"` pattern.

## Failure & Resilience Decisions

**Task 1 (`src/lib/auth.ts` pure helpers)** — N/A — pure. No I/O; total functions over strings/primitives.

**Task 2 (`useAuth` hook — `sendCode`/`verifyCode`/`signOut`/idempotent row creation)**
- **Failure modes**: `sendMagicCode` rejects (network/InstantDB down) → rejection propagated to caller (the island), `error` state set, stay on email step. `signInWithMagicCode` rejects (wrong/expired code) → rejection propagated, caller stays on code step. `writeEvent` for the `users` row rejects → caught in the effect, logged, **not rethrown to crash the app**; auth state still reflects the live session and the guarded creation re-attempts on the next auth/query resolution.
- **Idempotency**: row creation is guarded by a query for an existing `users` row by auth id plus an in-flight ref; `shouldCreateUserRow(...)` returns true only when the query has loaded, the count is 0, and no write is in flight — safe across reloads, repeat sign-ins, and React re-renders. `writeEvent` itself is atomic (event + projection commit together, `src/lib/db.ts:262-273`), so a rejected creation leaves no partial row and is safe to retry. The InstantDB entity id IS the auth user id, so even a duplicate-effect race resolves to one row (same key, idempotent upsert).
- **Observability**: creation failures logged via `console.error('[useAuth] users row creation failed:', err)`; send/verify rejections are returned to the island which renders them in a `role="alert"` element.
- **No silent failure**: send/verify rejections propagate to the island (rendered + logged). The creation-effect catch logs and schedules retry rather than swallowing; it does not `catch {}` empty.

**Task 3 (`AuthGate.tsx` island)**
- **Failure modes**: invalid/empty email → `isValidEmail` gate sets a validation message and **does not** call `sendCode` (no state change/no advance). `sendCode`/`verifyCode` promise rejections caught via `try/catch` + `.catch(surface)` (mirrors `EventSpineHarness`), rendered inline; wrong code keeps the user on the code step able to retry/resend.
- **Idempotency**: in-memory UI; re-render/re-submit is harmless. Submit buttons disabled while a request is in flight to avoid duplicate `sendMagicCode`/`signInWithMagicCode` calls.
- **Observability**: `surface(err)` sets error state and `console.error('[AuthGate] …', err)`.
- **No silent failure**: every catch routes to `surface`; nothing is swallowed.

**Task 4 (`login.astro`)** — N/A — pure (static page shell that mounts the island; no runtime I/O of its own).

**Task 5 (e2e harness `e2e/support/auth.ts` + spec)**
- **Failure modes**: missing `INSTANT_ADMIN_TOKEN` → `test.skip(true, 'INSTANT_ADMIN_TOKEN unset — auth e2e requires admin code minting')` (loud skip, not a false green). Admin `generateMagicCode` network failure → the awaited call throws, failing the test with the real error.
- **Idempotency**: each test mints a unique email (`e2e+${crypto.randomUUID()}@blended.test`) so reruns never collide; admin code minting is read-through and side-effect-light.
- **Observability**: Playwright surfaces the thrown error + trace (`trace: 'on-first-retry'`).
- **No silent failure**: no `try/catch` that hides minting failure; skip path emits a visible reason string.

---

## Task 1: Pure auth core (`src/lib/auth.ts`)

### Overview
db-free, fully unit-testable building blocks: the `IDENTITY_SCOPE` sentinel, email validation, username derivation, and the "create users row only if absent" decision. Kept out of `db.ts` so tests need no InstantDB init.

### Changes Required
**File**: `src/lib/auth.ts` (new)
**Changes**:
```ts
/** Reserved non-session scope for identity-scoped writeEvent() calls (SPEC §41). */
export const IDENTITY_SCOPE = 'identity'

/** Identity-scope event type. Intentionally NOT folded by applyEvent (see db.ts). */
export const USER_SIGNED_IN = 'UserSignedIn'

/** Minimal, dependency-free email check — must reject empty/whitespace/malformed. */
export function isValidEmail(raw: string | null | undefined): boolean {
  if (!raw) return false
  const email = raw.trim()
  if (email === '') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Derived username = email local-part (SPEC §40 email privacy). */
export function deriveUsername(email: string | null | undefined): string {
  if (!email) return ''
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

/** Idempotency gate for first-sign-in users-row creation (SPEC §41). */
export function shouldCreateUserRow(input: {
  authUserId: string | null | undefined
  usersLoaded: boolean
  existingUserCount: number
  inFlight: boolean
}): boolean {
  const { authUserId, usersLoaded, existingUserCount, inFlight } = input
  return Boolean(authUserId) && usersLoaded && existingUserCount === 0 && !inFlight
}
```

**File**: `src/lib/auth.test.ts` (new) — Vitest beside the module (mirrors `src/lib/db.test.ts`).

### Success Criteria
- [ ] `npm run test` passes new specs.
- [ ] `isValidEmail` rejects `''`, `'   '`, `'foo'`, `'foo@'`, `'@bar.com'`, `'a b@c.com'`; accepts `'a@b.co'`.
- [ ] `deriveUsername('jane.doe@school.edu') === 'jane.doe'`; `deriveUsername('')==='' `.
- [ ] `shouldCreateUserRow` truth table covered (null id, not loaded, count>0, inFlight each → false; all-clear → true).
- [ ] `npm run astro check` clean.
- [ ] Failure paths behave as designed (pure — invalid inputs return falsey, never throw).

---

## Task 2: Shared `useAuth` hook (`src/lib/useAuth.ts`)

### Overview
The single app-wide auth seam wrapping `db.useAuth()` + the auth namespace, exposing `{ user, isLoading, error, username, sendCode, verifyCode, signOut }`, and performing idempotent first-sign-in `users`-row creation through `writeEvent()`.

### Changes Required
**File**: `src/lib/useAuth.ts` (new)
**Changes**:
```ts
import { useEffect, useRef, useState } from 'react'
import { db, writeEvent, type User } from '@/lib/db'
import { IDENTITY_SCOPE, USER_SIGNED_IN, deriveUsername, shouldCreateUserRow } from '@/lib/auth'

export type UseAuth = {
  user: User | null | undefined        // InstantDB auth user (id, email)
  isLoading: boolean
  error: string | null
  username: string                     // derived local-part; never raw email in UI
  sendCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): UseAuth {
  const { isLoading, user, error } = db.useAuth()
  const authUserId = user?.id ?? null
  const inFlight = useRef(false)

  // Query the users projection by auth id to drive the create-only-if-absent guard.
  const usersQ = db.useQuery(
    authUserId ? { users: { $: { where: { id: authUserId } } } } : null
  )
  const usersLoaded = !!authUserId && !usersQ.isLoading && !usersQ.error
  const existingUserCount = usersQ.data?.users?.length ?? 0

  useEffect(() => {
    if (!shouldCreateUserRow({ authUserId, usersLoaded, existingUserCount, inFlight: inFlight.current })) return
    inFlight.current = true
    const username = deriveUsername(user?.email)
    writeEvent(
      USER_SIGNED_IN,
      { sessionId: IDENTITY_SCOPE, actor: { id: authUserId!, role: 'unknown' },
        payload: { userId: authUserId, username } },
      [ db.tx.users[authUserId!].update({
          email: user?.email ?? undefined, username, adminLevel: 0, createdAt: Date.now() }) ]
    )
      .catch((err: unknown) => { console.error('[useAuth] users row creation failed:', err) })
      .finally(() => { inFlight.current = false })   // allow retry on next resolution
  }, [authUserId, usersLoaded, existingUserCount, user?.email])

  return {
    user, isLoading, error: error?.message ?? null, username: deriveUsername(user?.email),
    sendCode: (email) => db.auth.sendMagicCode({ email }).then(() => {}),
    verifyCode: (email, code) => db.auth.signInWithMagicCode({ email, code }).then(() => {}),
    signOut: () => db.auth.signOut(),
  }
}
```
Notes: `actor.role: 'unknown'` is in `ACTOR_ROLES` (`src/lib/db.ts:29`). The users entity id = auth user id (a UUID), so `db.tx.users[authUserId]` is the keyed upsert. `sessionId: IDENTITY_SCOPE` satisfies `writeEvent`'s mandatory-sessionId check (`src/lib/db.ts:281`).

**File**: `src/lib/db.ts` — add a one-line comment near `applyEvent`'s `default` branch noting identity-scope events (`UserSignedIn`) are intentionally never folded into a session projection. No behavioral change.

**File**: `src/lib/db.test.ts` — add one assertion that `applyEvent(emptyProjection('identity'), {type:'UserSignedIn', …})` throws `UnknownEventTypeError`, locking the "outside the fold" decision.

### Success Criteria
- [ ] `npm run astro check` passes (hook + types compile).
- [ ] New `db.test.ts` assertion passes (identity event not folded).
- [ ] Hook returns the documented shape; `username` is the email local-part.
- [ ] Manual/inspection: no `db.useAuth()` call exists in product code outside `useAuth.ts` (grep gate).
- [ ] Failure paths behave as designed: `sendCode`/`verifyCode` rejections propagate; creation `writeEvent` rejection is logged, `inFlight` reset, no crash, no rethrow.

---

## Task 3: Login UI island (`src/components/AuthGate.tsx`)

### Overview
The single reusable React island: email step → code step → signed-in view with sign-out, consuming `useAuth`, using `ui/button` + `ui/input`, Tailwind, and the established error-surface pattern. Drives all `data-testid` hooks the e2e suite asserts on.

### Changes Required
**File**: `src/components/AuthGate.tsx` (new)
**Changes** (behavioral outline):
- Local state: `step: 'email' | 'code'`, `email`, `code`, `formError`, `pending`.
- `useAuth()` for `{ user, isLoading, username, sendCode, verifyCode, signOut }`.
- Render branches:
  - `isLoading` → `<p data-testid="auth-loading">`.
  - `user` present → signed-in view: `data-testid="auth-signed-in"`, shows username via `data-testid="auth-username"` (**username only, never raw email** — SPEC §40), and a `data-testid="auth-signout"` button calling `signOut()`.
  - else `step==='email'` → form with `data-testid="auth-email-input"`, submit `data-testid="auth-send"`. On submit: `if (!isValidEmail(email)) { setFormError('Enter a valid email'); return }` (no `sendCode` call); else `pending`, `sendCode(email)` then `setStep('code')`, `.catch(surface)` (stay on email step).
  - `step==='code'` → `data-testid="auth-code-input"`, submit `data-testid="auth-verify"`, plus a resend control `data-testid="auth-resend"` that re-calls `sendCode`. On verify: `verifyCode(email, code)`; on reject `surface(err)` and **remain on code step**.
- Error element: `data-testid="auth-error" role="alert"` rendering `formError`.
- `surface(err)` sets `formError` + `console.error('[AuthGate] …', err)`; buttons disabled while `pending` to prevent duplicate calls.

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Island hydrates under `client:only="react"` (no "Invalid hook call" — covered by existing React dedupe, `astro.config.mjs:13-20`).
- [ ] Invalid email shows `auth-error` and issues no `sendMagicCode` (asserted in e2e).
- [ ] Wrong code keeps `step==='code'` and shows `auth-error`.
- [ ] Failure paths behave as designed: all promise rejections routed to `surface`, none swallowed.

---

## Task 4: Auth gate page (`src/pages/login.astro`)

### Overview
Product route mounting the island.

### Changes Required
**File**: `src/pages/login.astro` (new)
```astro
---
import Layout from '@/layouts/Layout.astro'
import AuthGate from '@/components/AuthGate'
---
<Layout title="Sign in — Blended">
  <div class="mx-auto mt-12 w-full max-w-sm px-4">
    <AuthGate client:only="react" />
  </div>
</Layout>
```
(Not dev-gated — this is a shipped surface. `index.astro` untouched.)

### Success Criteria
- [ ] `/login` renders the island in dev and a production build.
- [ ] `npm run astro check` + `astro build` succeed.
- [ ] N/A failure surface (static shell).

---

## Task 5: Deterministic e2e magic-code harness + Playwright coverage

### Overview
Add the admin-SDK code-minting seam and the full `auth.spec.ts` covering happy path, persistence, sign-out, and failure paths — without depending on a real inbox.

### Changes Required
**File**: `package.json` — add devDependency `@instantdb/admin` (matching the installed core/react `^1.0.x` line).

**File**: `e2e/support/auth.ts` (new) — admin code minting:
```ts
import { init } from '@instantdb/admin'
export function adminAvailable() { return !!process.env.INSTANT_ADMIN_TOKEN }
export async function mintCode(email: string): Promise<string> {
  const admin = init({
    appId: process.env.PUBLIC_INSTANTDB_APP_ID!,
    adminToken: process.env.INSTANT_ADMIN_TOKEN!,
  })
  const { code } = await admin.auth.generateMagicCode(email)  // no email sent; latest code is valid
  return code
}
```

**File**: `e2e/auth.spec.ts` (new) — mirrors `e2e/event-spine.spec.ts` conventions (unique ids, 15s hydration timeout, `data-testid` hooks):
- `test.skip(!adminAvailable(), 'INSTANT_ADMIN_TOKEN unset — auth e2e requires admin code minting')` at suite top.
- Helper `signIn(page)`: unique `email = e2e+${crypto.randomUUID()}@blended.test`; fill `auth-email-input`; click `auth-send`; await `auth-code-input` visible; `code = await mintCode(email)` (minted *after* send so it's the valid one); fill `auth-code-input`; click `auth-verify`; await `auth-signed-in`.
- **Happy path**: `signIn` → assert `auth-signed-in` visible and `auth-username` text equals the email local-part.
- **Persistence**: after sign-in, `page.reload()` → assert `auth-signed-in` still visible (no code re-entry).
- **Sign-out**: click `auth-signout` → assert `auth-email-input` (login gate) returns.
- **Failure — invalid email**: fill `auth-email-input` with `'not-an-email'`; click `auth-send`; assert `auth-error` visible AND `auth-code-input` absent (no advance, no `sendMagicCode`).
- **Failure — wrong code**: drive to code step; type `'000000'` (without minting); click `auth-verify`; assert `auth-error` visible AND `auth-code-input` still present (stayed on code step).

**File**: `.env.example` — append `INSTANT_ADMIN_TOKEN=` with a comment that it is **e2e-only** (admin token for deterministic magic-code minting; never used by client/product code).

### Success Criteria
- [ ] `npm run test:e2e` green when `INSTANT_ADMIN_TOKEN` is set; the suite skips loudly (visible reason) when unset — never a false pass.
- [ ] Happy/persistence/sign-out/invalid-email/wrong-code specs all pass.
- [ ] `@instantdb/admin` appears only under devDependencies; no product import references it (grep gate).
- [ ] Failure paths behave as designed: missing-token skip and admin/network errors surface, none swallowed.

---

## Task 6: Documentation updates

### Overview
Docs are part of "done" (SPEC §Documentation Updates).

### Changes Required
- **`AGENTS.md`** (Data Layer / project-structure sections): note that all auth state flows through the shared `useAuth` hook (`src/lib/useAuth.ts`) — product code MUST NOT call `db.useAuth()` directly; and that identity-scoped `users` creation uses the `IDENTITY_SCOPE` sentinel (`src/lib/auth.ts`) through `writeEvent()` with actor role `'unknown'`, and that `UserSignedIn` is intentionally outside the session fold.
- **`README.md`**: document the working `/login` email magic-code gate and how to exercise it locally (`PUBLIC_INSTANTDB_APP_ID` in `.env`, schema pushed via `npx instant-cli push schema`, and the `INSTANT_ADMIN_TOKEN` dev/test path for Playwright).
- **`.env.example`**: `INSTANT_ADMIN_TOKEN=` (e2e-only) — added in Task 5.
- **`release-notes.md`** (create if absent): note the magic-code sign-in gate and the new `INSTANT_ADMIN_TOKEN` test configuration.

### Success Criteria
- [ ] Each named doc reflects the shipped behavior and the `useAuth` / `IDENTITY_SCOPE` invariants.
- [ ] `.env.example` lists `INSTANT_ADMIN_TOKEN` with its e2e-only scope.
- [ ] N/A failure surface (docs).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **(User benefit)** A user can submit an email, receive a code, enter it, and the signed-in view renders showing their derived username — verified end-to-end by a Playwright test. | Task 3, Task 5 | Happy-path spec asserts `auth-signed-in` + `auth-username` |
| [ ] After sign-in, reloading the page keeps the user signed in (no code re-entry), verified by Playwright. | Task 5 | Persistence spec via `page.reload()` (InstantDB client session) |
| [ ] Clicking sign out clears the session and the login email-entry form returns, verified by Playwright. | Task 3, Task 5 | `auth-signout` → assert `auth-email-input` returns |
| [ ] After first sign-in, exactly one `users` row exists keyed to the InstantDB auth user id with `username` equal to the email local-part and `adminLevel: 0`; a second sign-in by the same user creates no duplicate row. | Task 1, Task 2 | `shouldCreateUserRow` guard + auth-id-keyed upsert; unit-tested guard, idempotent create effect |
| [ ] **(Failure path)** Submitting an invalid/empty email shows a validation error and issues no `sendMagicCode` call; entering a wrong code shows an inline error and leaves the user on the code step able to retry — verified by a Playwright assertion on the rendered error and unchanged step. | Task 3, Task 5 | `isValidEmail` pre-gate + invalid-email/wrong-code specs |
| [ ] The `users` row write goes through `writeEvent()` (a `sessionEvents` envelope is appended alongside it); no projection-only `db.tx.users[...]` write exists in product code. | Task 2 | Only `writeEvent`-routed write in `useAuth.ts`; grep gate |
| [ ] `npm run astro check` passes with no new type errors. | Tasks 1–4 | Type gate in each task's success criteria |
| [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`). | Task 2, Task 5 | `db.test.ts` extended, not broken; existing e2e untouched |
| [ ] No compiler/linter warnings introduced. | Tasks 1–6 | Code-style conventions (no semicolons, 2-space, Tailwind, `@/`) followed throughout |

---

## Testing Strategy

### Unit Tests (Vitest, `*.test.ts` beside module)
- `src/lib/auth.test.ts`: `isValidEmail` (empty, whitespace, malformed, valid); `deriveUsername` (normal, no-`@`, empty); `shouldCreateUserRow` full truth table.
- `src/lib/db.test.ts` (extended): `applyEvent` throws `UnknownEventTypeError` on a `UserSignedIn` event — locks identity-events-outside-the-fold.
- Failure-path tests: invalid-email inputs return `false` (never throw); `shouldCreateUserRow` returns `false` for each of `{null id, not loaded, count>0, inFlight}`.
- Mocking strategy: none — all unit targets are pure functions; no InstantDB stubbing needed (helpers are db-free by design).

### Integration / E2E Tests (Playwright, `e2e/auth.spec.ts`)
- Happy path: email → admin-minted code → signed-in view + derived username.
- Persistence: reload → still signed in.
- Sign-out: returns to email gate.
- Failure: invalid email (error, no advance, no `sendMagicCode`); wrong code (inline error, stays on code step).
- Deterministic code via `@instantdb/admin` `generateMagicCode` (no real inbox); suite skips loudly when `INSTANT_ADMIN_TOKEN` is unset.
- Anti-mock bias: tests drive the real island + real InstantDB auth against the live dev server (port 4399); only the *code retrieval* is replaced by the admin minting seam, because reading a real inbox is infeasible and forbidden by SPEC.

## Risk Assessment
- **Admin code vs. UI-sent code race**: the UI "send" queues its own code; minting via admin *after* the send makes the admin code the latest-valid one. Mitigation: always `mintCode` after the `auth-send` click; `retries: 3` absorbs transient timing.
- **`INSTANT_ADMIN_TOKEN` absent in CI**: spec skips loudly with a documented reason rather than passing falsely; documented in README/.env.example so the gate's true status is never ambiguous.
- **Schema not pushed to live Instant app**: `users` writes would be rejected; mitigated by the documented `npx instant-cli push schema` prerequisite (AGENTS.md / SPEC Dependencies) and by `writeEvent` rejection being logged (Task 2 observability) rather than crashing.
- **Double-fire of the creation effect under fast re-render**: mitigated by the `inFlight` ref + auth-id-keyed upsert (same key ⇒ single row); `shouldCreateUserRow` re-checks count after the query resolves.
- **`@instantdb/admin` version drift from core/react**: pin to the same `^1.0.x` minor as the installed `@instantdb/react`/`core` to keep the auth wire protocol compatible.
