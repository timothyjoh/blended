# Implementation Plan: Cycle 0003

## Overview
Author, commit, and push a single InstantDB permission-rules artifact that moves two spec-mandated invariants from UI convention into the data layer: **student email privacy** (a user's `email` is readable only by that user) and **session-state write authorization** (only the owning teacher — or a reserved admin path — may mutate `sessions`/`sessionResources`, while any authenticated participant may still append to `sessionEvents`). Prove both from a real student-authenticated browser context with a new Playwright spec, with a fail-loud push wrapper and updated docs.

## Current State (from Research)
- The Blended `i.schema` (all eight entities) and the `db` client live inline in **one** module, `src/lib/db.ts`; `requireAppId()` throws at module-init if `PUBLIC_INSTANTDB_APP_ID` is unset (so importing `db.ts` has a side effect). There is **no** `instant.schema.ts` / `instant.perms.ts` anywhere in the repo.
- `users.email` is `optional`, the `users` row id **is** the InstantDB auth user id (`auth.id`), and `sessions.teacherId` is the auth user id. `sessionResources` references its session only by a plain indexed string `sessionId` — **not** traversable in a rule. `participants` carries an `email` field but **no participant rows are written yet**.
- All product mutations route through `writeEvent(type, meta, projectionTxns)` (atomic event + projection in one `db.transact()`, validate-before-write, throw-not-swallow). First-sign-in `users`-row creation routes through it under `IDENTITY_SCOPE` with `actor.id = authUserId`.
- The dev harness `EventSpineHarness.tsx` writes `sessions`/`participants` from an **unauthenticated** context using literal ids (`teacherId: 'dev-teacher'`) — it would be rejected by any owner-only `sessions` rule.
- Test infra: Vitest (`include: ['src/**/*.test.ts']`, env injects `PUBLIC_INSTANTDB_APP_ID`); Playwright (`testDir: 'e2e'`, `retries: 3`, dev server on port 4399). The deterministic two-user sign-in seam already exists: `e2e/support/auth.ts` (`adminAvailable()`, `mintCode()`), and the skip-loudly pattern is `test.skip(!adminAvailable(), …)` in `e2e/auth.spec.ts`. `@instantdb/admin` transactions bypass permission rules (server god-mode) — this is the reserved system path.
- `instant-cli` is **not** a dependency; it is invoked on demand via `npx instant-cli`. The existing convention is `npx instant-cli push schema`.

### Resolved Open Questions
1. **Perms-push prerequisites / `instant.schema.ts`.** `instant-cli push perms` reads `instant.perms.ts` and validates against the app's **already-pushed live schema**; it does not require a local `instant.schema.ts` (that file is only for `push schema`). We therefore **do not** create `instant.schema.ts` (avoiding the `init()` import side-effect and preserving the single-source-in-`db.ts` rule). The rules object is defined once in `src/lib/perms.ts` (pure, no side effect) and re-exported by a root `instant.perms.ts` CLI adapter. Auth is the operator's `instant-cli login` token; app id is passed via `--app $PUBLIC_INSTANTDB_APP_ID`. Missing app id / auth / network → the wrapper or CLI exits non-zero with a clear message.
2. **`sessionResources` ownership traversal.** Add a **denormalized `teacherId: i.string().indexed()`** to `sessionResources` (mirrors `sessions.teacherId`), so the rule is a direct `auth.id == data.teacherId` — no link-graph traversal. Explicitly authorized by SPEC scope ("a denormalized owner field"). Zero call-site breakage: no code creates resource rows yet; future `writeEvent` resource creators must populate it (documented).
3. **System/admin write path.** System/admin actions run through `@instantdb/admin`, which **bypasses** permission rules — so no rule clause is needed for them today. The future *client-side* admin slot is reserved by a `bind`ed `isAdmin` placeholder evaluating to `"false"`, with a one-line pointer to ADR-0003 (`User.adminLevel`). This pushes cleanly without referencing a not-yet-existing `$users` link.
4. **Dev-harness compatibility.** Owner-only `sessions` rules reject the unauthenticated `dev-teacher` write, so the harness is **authenticated** (SPEC names "harness sign-in" as an acceptable resolution): it consumes `useAuth()` and writes with `teacherId = user.id`. `event-spine.spec.ts` signs the writing context in via the shared seam and gains a per-test `test.skip(!adminAvailable(), …)` on the write/realtime tests (the synchronous invalid-write test stays ungated — it throws in `writeEvent` before any transaction and needs no auth). Session/resource **reads** stay open (`view: "true"`), so the realtime observer context needs no auth.
5. **First-sign-in `users` write.** The `users` rule is `view/create/update = "auth.id == data.id"`, `delete = "false"`. Because the `users` row id **is** `auth.id`, first-sign-in create (`db.tx.users[authUserId].update(...)`) satisfies `data.id == auth.id` and remains permitted; own-row read for the `shouldCreateUserRow` guard remains permitted; no other user's row is readable.
6. **Field-level email privacy.** InstantDB view rules are **row-level**, not column-level — a rule cannot return a `participants` row while hiding its `email`. Therefore email privacy is enforced structurally: the canonical email lives **only** on the own-row-locked `users` namespace, and the `email` field is **removed** from the `participants` entity so participant rows (which classmates can read) carry no email at all. Safe now: no participant rows exist and no code references `participants.email`.

## Desired End State
- `src/lib/perms.ts` (single source of the rules) and a root `instant.perms.ts` adapter are committed; the rules are pushed to the live Instant app via a fail-loud `npm run perms:push`.
- `sessionResources` has a `teacherId` ownership field; `participants` no longer has `email`.
- A student-authenticated browser context cannot read another user's `email` (query returns no email) and cannot write `sessions`/`sessionResources`/`activeResourceId` (permission error, state unchanged); the owning teacher's writes succeed and propagate in realtime; a second teacher's write to the first teacher's session is rejected.
- `e2e/permissions.spec.ts` proves all of the above (skips loudly without `INSTANT_ADMIN_TOKEN`); existing suites still pass; `npm run test`, `npm run test:e2e`, and `npm run astro check` are clean.
- `AGENTS.md` and `README.md` document the data-layer authorization model and the push command.

Verify: `npm run test` (Vitest, incl. perms structural guard + push-wrapper fail-loud), `npm run test:e2e` (Playwright incl. `permissions.spec.ts`), `npm run astro check`, and the live-app denial observable in the probe.

## What We're NOT Doing
- Organization-scoped permission rules.
- Moderation / message-visibility policy for `messages` / `questions` / `endorsements` (Batch 2) — these stay at today's behavior under a permissive `$default`.
- The `currentUrl` teacher-broadcast field (cycle `txt-20260606-213636`) — only the existing `sessions.activeResourceId` projection is protected this cycle; the owner-only `sessions` policy is written so the later field inherits it.
- Admin console / admin-promotion UI — only the rule slot is reserved (admin SDK already bypasses rules).
- Creating `instant.schema.ts` or changing the schema beyond the one ownership field added and the one private field removed.
- Field/column-level read masking (InstantDB doesn't support it; privacy is structural).

## Implementation Approach
Build bottom-up in verifiable slices: (1) make ownership checkable and email structurally private via minimal schema deltas; (2) author the rules as a pure module with a structural guard unit test; (3) add a fail-loud, idempotent push wrapper with a deterministic missing-credentials test; (4) reconcile the dev harness with owner-only rules via authenticated writes and a shared sign-in seam; (5) add a dev probe that issues raw client reads/writes and surfaces outcomes; (6) prove both invariants end-to-end in a two-user Playwright spec; (7) push to the live app and update docs. Rules are owner-restricted writes with open reads for `sessions`/`sessionResources` (students must follow the lesson), own-row-only for `users`, append-only authenticated writes for `sessionEvents`, and a permissive `$default` so `todos` and Batch-2 namespaces keep today's behavior.

## Failure & Resilience Decisions

- **Task 1 (schema edit in `db.ts`)** — N/A — pure schema declaration. (Operational note: the schema must be pushed for the new `sessionResources.teacherId` to be accepted; that is the existing `push schema` operator step, surfaced loudly via the CLI's non-zero exit, not changed here.)
- **Task 2 (`src/lib/perms.ts` / `instant.perms.ts`)** — N/A — pure in-memory object literal, no I/O.
- **Task 3 (push wrapper `scripts/push-perms.mjs` + `src/lib/pushPerms.ts`)**:
  - **Failure modes**: missing/empty `PUBLIC_INSTANTDB_APP_ID` → wrapper prints a clear `push-perms: …` message and `process.exit(1)` **before** any network call; `instant-cli` non-zero exit (auth/network/unreachable app) → wrapper forwards the CLI's exit code and prints a clear "perms push failed" message; CLI not installable via `npx` → propagated non-zero.
  - **Idempotency**: `instant-cli push perms` is declarative — pushing identical rules is a no-op; re-runs are safe. The wrapper performs no local mutation.
  - **Observability**: env-precondition message and forwarded exit code on stderr; the CLI's own output streams through.
  - **No silent failure**: every failure path exits non-zero with a message; success is the only path that exits 0.
- **Task 4 (harness auth + `event-spine.spec.ts`)**:
  - **Failure modes**: a rejected `db.transact()` (e.g. mis-owned write) propagates to the existing `surface()` → visible `harness-error` testid + `console.error` (unchanged contract). Sign-in failure in the spec surfaces in the test, never swallowed.
  - **Idempotency**: `writeEvent` is not idempotent by design, but each e2e test uses a fresh disposable `sessionId`; the `users` row is keyed to `auth.id` (keyed upsert). Re-runs don't collide.
  - **Observability**: `harness-error` testid, `console.error`, Playwright trace on retry.
  - **No silent failure**: write rejections surface to the UI and the test assertion.
- **Task 5 (`PermsProbe.tsx`)**:
  - **Failure modes**: `db.transact()` rejection (permission denial) is caught and rendered to a `probe-write-result` testid (e.g. `error: <message>`); `db.queryOnce()` rejection rendered to `probe-read-result`. Denied reads return zero rows (rendered as "no email"), not a partial leak.
  - **Idempotency**: probe actions target ids supplied via query params; writes are last-write-wins on a single field — safe to repeat. Reads are pure.
  - **Observability**: outcome testids + `console.error` on the catch path.
  - **No silent failure**: both success and the surfaced error are rendered; nothing is swallowed.
- **Task 6 (`permissions.spec.ts`)**:
  - **Failure modes**: missing `INSTANT_ADMIN_TOKEN`/app id → `test.skip(!adminAvailable(), …)` (skips loudly, never false-green). Realtime-sync flake absorbed by `retries: 3` + explicit timeouts.
  - **Idempotency**: fresh disposable emails/session ids per run; no cross-run state.
  - **Observability**: Playwright HTML report + trace-on-retry.
  - **No silent failure**: every assertion is explicit; a denial that does not occur fails the test.
- **Task 7 (push execution + docs)** — push uses the Task 3 wrapper (covered above); doc edits are pure text.

---

## Task 1: Make resource ownership checkable and email structurally private

### Overview
Add the minimal denormalized owner field to `sessionResources` so a rule can check ownership, and remove `email` from `participants` so client-readable participant rows carry no email (privacy is enforced by storage location, since InstantDB view rules are row-level).

### Changes Required
**File**: `src/lib/db.ts`
**Changes**:
- In the `sessionResources` entity (`db.ts:60-70`), add an indexed owner field mirroring `sessions.teacherId`:
  ```ts
  sessionResources: i.entity({
    sessionId: i.string().indexed(),
    teacherId: i.string().indexed(), // owner = parent session's teacher (auth id); enables owner-only perms (cycle 0003)
    url: i.string(),
    // …unchanged…
  }),
  ```
- In the `participants` entity (`db.ts:71-81`), **remove** the `email` field (and its comment). The canonical private email lives only on `users` (SPEC §38). Leave `username`, `userId`, `role`, `sessionId`, timestamps, `chatStatus` unchanged.

### Success Criteria
- [ ] `npm run astro check` clean (the `Participant` / `SessionResource` `InstaQLEntity` types regenerate; confirm no code references `participants.email` or constructs a `sessionResources` row missing `teacherId` — `grep -rn "participants" src` / `sessionResources` shows none today).
- [ ] `npm run test` passes (existing `db.test.ts` / `auth.test.ts` unaffected).
- [ ] `grep -rn "\.email" src/components src/lib | grep -i participant` returns nothing.
- [ ] Failure paths behave as designed (N/A — pure schema; runtime acceptance depends on the schema push noted in Task 7).

---

## Task 2: Author the permission rules (single source + CLI adapter + structural guard)

### Overview
Define the rules once in a pure module, expose them to the CLI via a root adapter, and lock the intended semantics with a structural Vitest guard so no future edit silently loosens a rule.

### Changes Required
**File**: `src/lib/perms.ts` (new — the single source of permission rules)
**Changes**: a pure default-exported object. Attempt `import type { InstantRules } from '@instantdb/react'`; if that symbol is not exported (the bundled `.d.ts` did not surface it — verify at implement time), omit the type annotation rather than block. Shape:
```ts
// Single source of InstantDB permission rules (cycle 0003). Pushed via
// `npm run perms:push` (scripts/push-perms.mjs → `instant-cli push perms`).
// Reads stay open where students must follow the lesson; writes are owner-only.
// System/admin actions run through @instantdb/admin, which BYPASSES these rules.
const rules = {
  // Permissive default preserves today's behavior for `todos` (demo, must stay
  // open) and the Batch-2 namespaces (messages/questions/endorsements), whose
  // real read-visibility policy is out of scope this cycle.
  $default: { allow: { $default: 'true' } },

  users: {
    // Row-level: a user can only ever see/create/update their OWN row, so no
    // client can read another user's `email`. Row id IS the auth id.
    allow: { view: 'auth.id == data.id', create: 'auth.id == data.id', update: 'auth.id == data.id', delete: 'false' },
  },

  sessions: {
    // isAdmin reserves the future client-admin slot (ADR-0003 User.adminLevel);
    // it evaluates false today — server/admin writes use the admin SDK instead.
    bind: ['isOwner', 'auth.id == data.teacherId', 'isAdmin', 'false'],
    allow: { view: 'true', create: 'isOwner || isAdmin', update: 'isOwner || isAdmin', delete: 'isOwner || isAdmin' },
  },

  sessionResources: {
    bind: ['isOwner', 'auth.id == data.teacherId', 'isAdmin', 'false'],
    allow: { view: 'true', create: 'isOwner || isAdmin', update: 'isOwner || isAdmin', delete: 'isOwner || isAdmin' },
  },

  // Append-only by any AUTHENTICATED participant (keeps writeEvent legal,
  // incl. first-sign-in IDENTITY_SCOPE writes); no client update/delete.
  sessionEvents: {
    allow: { view: 'true', create: 'auth.id != null', update: 'false', delete: 'false' },
  },

  // No client-readable email field anymore; writes by authenticated participants.
  participants: {
    allow: { view: 'true', create: 'auth.id != null', update: 'auth.id != null', delete: 'auth.id != null' },
  },
}

export default rules
```
**File**: `instant.perms.ts` (new, repo root — CLI adapter; what `instant-cli push perms` loads)
```ts
// CLI entrypoint for `instant-cli push perms`. The rules themselves live in
// src/lib/perms.ts (single source, unit-tested). This file only re-exports them.
export { default } from './src/lib/perms'
```
**File**: `src/lib/perms.test.ts` (new — structural guard, covered by the existing `src/**/*.test.ts` glob)
**Changes**: import the default export and assert the invariants that must never silently regress:
- `users.allow.view === 'auth.id == data.id'` and `users.allow.delete === 'false'`.
- `sessions` and `sessionResources` `create/update/delete` are **not** `'true'` and reference `isOwner` (owner-bound); their `bind` contains `isOwner` and `isAdmin`.
- `sessionEvents.allow.update === 'false'` and `delete === 'false'` (append-only); `create === 'auth.id != null'`.
- `participants` has no email semantics (rules object carries no participant email rule) and writes require `auth.id != null`.
- `$default.allow.$default === 'true'` (todos/Batch-2 stay open).

### Success Criteria
- [ ] `npm run astro check` clean (perms module type-checks; the type import either resolves or is omitted).
- [ ] `npm run test` passes including `perms.test.ts`.
- [ ] `instant.perms.ts` default export deep-equals `src/lib/perms.ts` default export (re-export verified by a single assertion in the guard test or by import equality).
- [ ] Failure paths: N/A — pure module.

---

## Task 3: Fail-loud, idempotent perms-push wrapper

### Overview
Provide `npm run perms:push` that validates prerequisites and shells out to `instant-cli push perms`, exiting non-zero with a clear message on missing credentials or CLI failure — satisfying the SPEC's "push must fail loudly" requirement deterministically.

### Changes Required
**File**: `src/lib/pushPerms.ts` (new — pure precondition logic, unit-testable under the `src/**` glob)
```ts
/** Resolve the Instant app id for a perms push, or throw a clear error. Pure. */
export function resolveAppId(env: Record<string, string | undefined>): string {
  const appId = env.PUBLIC_INSTANTDB_APP_ID
  if (!appId || appId.trim() === '') {
    throw new Error('push-perms: PUBLIC_INSTANTDB_APP_ID is missing or empty — cannot push perms (set it in .env)')
  }
  return appId
}
```
**File**: `scripts/push-perms.mjs` (new — the runner)
**Changes**: read `process.env`, replicate the one-line app-id precondition (Node `.mjs` cannot import the `.ts` directly without a loader; `resolveAppId` is the canonical spec mirrored here and unit-tested). On missing app id → `console.error(message)` + `process.exit(1)` **before** any network call. Otherwise `spawnSync('npx', ['instant-cli', 'push', 'perms', '--app', appId], { stdio: 'inherit' })`; if `status !== 0`, `console.error('push-perms: instant-cli push perms failed (exit <status>) — check instant-cli login/auth and network')` and `process.exit(status || 1)`; on success exit 0.
**File**: `package.json`
**Changes**: add script `"perms:push": "node scripts/push-perms.mjs"`.
**File**: `src/lib/pushPerms.test.ts` (new)
**Changes**:
- Unit: `resolveAppId({ PUBLIC_INSTANTDB_APP_ID: 'x' })` returns `'x'`; `resolveAppId({})` and `resolveAppId({ PUBLIC_INSTANTDB_APP_ID: '' })` throw with a message containing `PUBLIC_INSTANTDB_APP_ID`.
- Integration (deterministic, no network): `spawnSync(process.execPath, ['scripts/push-perms.mjs'], { env: { ...process.env, PUBLIC_INSTANTDB_APP_ID: '' } })` asserts `status !== 0` (non-zero) **and** stderr contains the clear `push-perms:` message. This proves the missing-credentials half of the failure-path acceptance without touching the network (the script exits before spawning the CLI).

### Success Criteria
- [ ] `npm run test` passes including `pushPerms.test.ts`.
- [ ] `node scripts/push-perms.mjs` with empty `PUBLIC_INSTANTDB_APP_ID` exits non-zero and prints the clear message (asserted in the integration test).
- [ ] Re-running `npm run perms:push` against the live app is idempotent (declarative push).
- [ ] Failure paths behave as designed: missing creds → non-zero + message before network; CLI non-zero → forwarded exit + message; no error swallowed.

---

## Task 4: Authenticate the dev harness and share the sign-in seam

### Overview
Owner-only `sessions` rules reject the harness's unauthenticated `dev-teacher` write, so the harness writes as the signed-in user (`teacherId = user.id`), keeping `/dev/event-spine` working under the new rules. Extract a reusable UI sign-in helper and update `event-spine.spec.ts` to sign the writing context in (skip-loudly without the admin token).

### Changes Required
**File**: `e2e/support/auth.ts`
**Changes**: add a shared `signInViaUi(page, email)` that drives `/login` (`auth-email-input` → `auth-send` → `mintCode(email)` → `auth-code-input` → `auth-verify` → wait for `auth-signed-in`), mirroring the inline helper in `auth.spec.ts`. Keep `adminAvailable()` / `mintCode()` unchanged.
**File**: `e2e/auth.spec.ts`
**Changes**: (optional DRY) replace the local `signIn` with the shared `signInViaUi` to avoid divergence. Behavior unchanged.
**File**: `src/components/EventSpineHarness.tsx`
**Changes**: consume `useAuth()`; derive `const actorId = user?.id ?? null`. Use `actorId` for `sessions.teacherId` / event `actor.id` (and for the participant `userId`) instead of the literal `'dev-teacher'` / `'dev-student'`. When signed out, render a `data-testid="harness-needs-auth"` notice and disable the create/join buttons (the synchronous invalid-write button may remain, since it throws before any transaction and exercises no rule). Keep the existing `surface()` error contract.
**File**: `e2e/event-spine.spec.ts`
**Changes**: for the **create** and **realtime** tests, add `test.skip(!adminAvailable(), 'INSTANT_ADMIN_TOKEN unset — harness writes require an authenticated owner under perms')` and `await signInViaUi(writerPage, freshEmail())` before navigating to the harness; the realtime observer context stays unauthenticated (reads are open). Leave the **invalid-write** test ungated and unauthenticated (it asserts the synchronous `writeEvent` validation, independent of perms).

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] `npm run test:e2e` passes: with the admin token, the authenticated harness create/realtime tests pass against the live owner-only rules; without it they skip loudly; the invalid-write test passes in both cases.
- [ ] `/dev/event-spine` still demonstrates the dual-write spine for a signed-in user.
- [ ] Failure paths behave as designed: a rejected write surfaces to `harness-error` + `console.error`; sign-in failure surfaces in the test.

---

## Task 5: Permissions probe dev surface

### Overview
A dev-only, production-gated surface that issues **raw** client reads/writes (bypassing `writeEvent`) so the e2e spec can attempt a forbidden email read and a forbidden session write from a real student-authenticated context and observe the outcome.

### Changes Required
**File**: `src/components/PermsProbe.tsx` (new)
**Changes**: read `targetUserId`, `targetSessionId`, `targetTeacherId` from query params. Consume `useAuth()` (so the probe acts as the signed-in user). Render:
- A live `db.useQuery({ sessions: { $: { where: { id: targetSessionId } } } })` showing the session's `activeResourceId` in `data-testid="probe-active-resource"` (for the realtime-propagation assertion and the post-denial unchanged re-read).
- Button `probe-read-email`: `await db.queryOnce({ users: { $: { where: { id: targetUserId } } } })`; render `probe-read-result` = `"email:<value>"` if a row with email comes back, else `"no-email"` (denied/own-row-filtered → zero rows).
- Button `probe-write-session`: `db.transact(db.tx.sessions[targetSessionId].update({ activeResourceId: 'probe-' + Date.now() })).then(() => setWrite('ok')).catch(e => setWrite('error:' + e.message))`; render to `probe-write-result`.
- Button `probe-create-owned-session`: legitimately create a session the signed-in user owns via `writeEvent('SessionCreated', { sessionId, actor: { id: user.id, role: 'teacher' }, … }, [db.tx.sessions[sessionId].update({ …, teacherId: user.id })])` (proves owner create is allowed). Surface success/error to `probe-write-result`.
- Button `probe-write-resource`: raw `db.transact(db.tx.sessionResources[id()].update({ sessionId: targetSessionId, teacherId: targetTeacherId, … }))` → outcome to `probe-write-result` (proves resource ownership rule).

All catches set a result testid and `console.error` — never swallowed.
**File**: `src/pages/dev/perms-probe.astro` (new)
**Changes**: mirror `dev/event-spine.astro` — render `<PermsProbe client:only="react" />` only when `!import.meta.env.PROD`, else a `data-testid="dev-disabled"` notice.

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] `/dev/perms-probe` renders for a signed-in user in dev and is disabled in a production build.
- [ ] Outcome testids reflect success and surfaced permission errors.
- [ ] Failure paths behave as designed: denied read → `no-email` (zero rows, no partial leak); denied write → `error:<permission message>`; both also `console.error`.

---

## Task 6: End-to-end proof of both invariants (`e2e/permissions.spec.ts`)

### Overview
Sign in two distinct users (a teacher and a student) in two browser contexts via the admin-mint seam and prove email privacy, write authorization, owner propagation, cross-teacher denial, and the failure-path permission error.

### Changes Required
**File**: `e2e/permissions.spec.ts` (new)
**Changes**: `test.describe` with `test.skip(!adminAvailable(), '…INSTANT_ADMIN_TOKEN unset — permission e2e requires admin code minting')`. Use fresh disposable emails and a fresh `sessionId` per test. Scenarios:
1. **Owner create + realtime propagation (happy path)**: teacher context signs in (`signInViaUi`), opens `/dev/perms-probe?...`, clicks `probe-create-owned-session` → `ok`; student context signs in, opens the probe for the same session → observes `probe-active-resource`; teacher clicks `probe-write-session` → student's `probe-active-resource` updates in realtime (allow 20s, `retries: 3`).
2. **Email privacy (denial)**: student context clicks `probe-read-email` targeting the teacher's user id → `probe-read-result` is `no-email`.
3. **Write authorization (denial + failure path)**: student context clicks `probe-write-session` (and `probe-write-resource`) on the teacher's session → `probe-write-result` contains `error:` (permission), and a re-read of `probe-active-resource` is unchanged from the teacher's last value — proving the write was neither silently dropped nor applied.
4. **Cross-teacher denial**: a second teacher signs in and attempts `probe-write-session` against the first teacher's session → `error:`.
5. **Regression**: the cycle-0002 auth flow (`auth.spec.ts`), first-sign-in `users`-row creation (implicit in every `signInViaUi`), and `/dev/event-spine` (Task 4) still pass under the pushed rules.

To obtain the teacher's user id for the email-read target, capture it after teacher sign-in (e.g. the probe renders `data-testid="probe-self-id"` = `user.id`).

### Success Criteria
- [ ] `npm run test:e2e` passes with `INSTANT_ADMIN_TOKEN` set against the live app with rules pushed; skips loudly when unset.
- [ ] Each acceptance scenario (privacy, authorization, propagation, cross-teacher, failure-path error) asserted explicitly.
- [ ] Failure paths behave as designed: denials surface as `error:`/`no-email`; missing token → skip, never false-green.

---

## Task 7: Push rules to the live app and document the model

### Overview
Push the schema (for the new `sessionResources.teacherId`) and the perms to the live Instant app, then document the data-layer authorization model and the push command.

### Changes Required
- **Push**: run `npx instant-cli push schema` (so the added `teacherId` and removed `participants.email` are reflected) then `npm run perms:push`. Both fail loudly (non-zero) on auth/network errors.
**File**: `AGENTS.md`
**Changes**: add a "Permission rules / data-layer authorization" note under the Data Layer section: `src/lib/perms.ts` is the single source (root `instant.perms.ts` is the CLI adapter); `users` is own-row-only (private email lives **only** here — participant rows carry no email); `sessions` and `sessionResources` are owner-only writes (`auth.id == data.teacherId`) with open reads; `sessionEvents` is append-only by authenticated participants; system/admin actions use `@instantdb/admin` (bypasses rules), with a reserved `isAdmin` client slot (ADR-0003); push with `npm run perms:push` (and `npx instant-cli push schema` for schema), mirroring the existing schema-push note.
**File**: `README.md`
**Changes**: under the schema-push section, note that permission rules now exist and must be pushed (`npm run perms:push`) after `push schema`; no new required env var (the e2e-only `INSTANT_ADMIN_TOKEN` is already documented).

### Success Criteria
- [ ] Rules pushed to the live Instant app; `e2e/permissions.spec.ts` green against it.
- [ ] `AGENTS.md` and `README.md` describe owner-restricted namespaces, where private email lives, and the push command.
- [ ] Failure paths behave as designed: a failed push exits non-zero with a clear message (Task 3); docs are pure text.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] **(User benefit)** From a student-authenticated browser context, a raw query for another participant's / user's `email` returns no email value (denied or empty) — the classmate's address is unreadable by any client query.` | Task 6 | Rule in Task 2 (`users.view = auth.id == data.id`), probe in Task 5. |
| `[ ] **(User benefit)** From a student-authenticated context, a raw write to `sessions`, `sessionResources`, or `sessions.activeResourceId` is rejected and the stored value is unchanged; then the owning teacher changes the active resource and the student's realtime view updates — proving authorized writes still propagate while unauthorized ones are blocked.` | Task 6 | Owner-only `sessions`/`sessionResources` rules (Task 2); `activeResourceId` protected via row-level `sessions` update; probe scenarios 1+3 (Task 5). |
| `[ ] The owning teacher can create/update their own session and its resources; a different authenticated teacher attempting to write that session is rejected.` | Task 6 | Probe `probe-create-owned-session` / cross-teacher scenario; denormalized `sessionResources.teacherId` (Task 1). |
| `[ ] **(Failure path)** A student `transact()` against a protected namespace surfaces an InstantDB permission error (observable in the e2e probe) and leaves the row unmodified — the write is not silently dropped or silently applied.` | Task 6 | Probe surfaces `error:<message>` (Task 5); unchanged re-read asserted. |
| `[ ] **(Failure path)** Running the perms push with an unavailable Instant app / missing credentials exits non-zero with a clear message rather than reporting success.` | Task 3 | Missing-credentials half deterministically tested; unavailable-app half is the CLI's forwarded non-zero exit (documented operator verification). |
| `[ ] `instant.perms.ts` is committed and the rules are pushed to the live Instant app.` | Task 2, Task 7 | Committed in Task 2 (root adapter + `src/lib/perms.ts` source); pushed in Task 7. |
| `[ ] `AGENTS.md` documents the data-layer authorization model (which namespaces are owner-restricted, where private email lives, and how to push perms).` | Task 7 | |
| `[ ] First-sign-in `users`-row creation, the cycle-0002 auth flow, and the `/dev/event-spine` harness still work under the new rules.` | Task 4, Task 6 | `users` create rule permits own-row first-sign-in (Task 2); harness authenticated (Task 4); regression asserted (Task 6). |
| `[ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).` | Task 4, Task 6 | `event-spine.spec.ts` updated for auth; full suite green. |
| `[ ] No compiler/linter warnings introduced (`npm run astro check` clean).` | Task 1–7 | Verified per task and at the end. |

---

## Testing Strategy

### Unit Tests
- **`src/lib/perms.test.ts`** (structural guard): asserts `users` own-row-only view + no delete; `sessions`/`sessionResources` create/update/delete are owner-bound (not `'true'`) and carry `isOwner`/`isAdmin` binds; `sessionEvents` update/delete `'false'` + create `'auth.id != null'`; `$default` open (todos/Batch-2 preserved); root `instant.perms.ts` re-export equals the source. Guards against accidental loosening.
- **`src/lib/pushPerms.test.ts`**: `resolveAppId` returns the id when present; throws a clear `PUBLIC_INSTANTDB_APP_ID` message when missing/empty.
- **Failure-path tests**:
  - *Missing credentials* (Task 3 integration): spawn the real `scripts/push-perms.mjs` with `PUBLIC_INSTANTDB_APP_ID=''` → asserts non-zero exit **and** clear stderr message, with no network call.
  - *Schema-level email removal / ownership field* (Task 1): `astro check` + grep guards that no row constructs `participants.email` or omits `sessionResources.teacherId`.
- **Mocking strategy**: none — real module imports and a real subprocess spawn of the actual wrapper. Vitest already injects `PUBLIC_INSTANTDB_APP_ID` for `src/**` imports; the wrapper integration test overrides it to empty explicitly.

### Integration / E2E Tests
- **`e2e/permissions.spec.ts`** (primary gate, live Instant app, two browser contexts via the admin-mint seam, `retries: 3`, skip-loudly without `INSTANT_ADMIN_TOKEN`):
  - Happy path: owner teacher writes `activeResourceId`; student context observes the realtime update.
  - Email privacy (denial): student raw query for the teacher's `email` → `no-email`.
  - Write authorization (denial / failure path): student raw `transact()` on `sessions` / `sessionResources` / `activeResourceId` → permission `error:`, stored value unchanged on re-read.
  - Cross-teacher denial: second teacher → `error:`.
  - Owner create allowed: teacher creates own session/resource.
- **`e2e/event-spine.spec.ts`** (updated): authenticated harness create + realtime under owner rules (skip-loudly without token); invalid-write synchronous failure path unchanged and ungated.
- **`e2e/auth.spec.ts`** (regression): unchanged behavior via the shared `signInViaUi` helper.

## Risk Assessment
- **`instant-cli push perms` might require a local `instant.schema.ts`.** Mitigation: `push perms` validates against the live schema, so the perms-only artifact is sufficient; if the CLI demands a schema file, it fails loudly (non-zero, clear CLI message) and the documented fallback is to also run `npx instant-cli push schema` (already in the flow) — we still avoid committing a duplicate schema definition (single source stays in `db.ts`).
- **`InstantRules` type not found in bundled `.d.ts`.** Mitigation: write `src/lib/perms.ts` as a plain object literal; the type import is optional and only for editor ergonomics. `astro check` confirms either path compiles.
- **CEL `create` rules reference `data.<field>` for not-yet-existing rows.** Mitigation: on create InstantDB exposes the new row's attributes as `data`; `auth.id == data.teacherId` is the documented owner-create idiom. A student setting `teacherId = their own id` only creates a session they own (no hijack of another teacher's session), which is acceptable.
- **Permissive `$default` leaves `messages`/`questions`/`endorsements` open.** Mitigation: those namespaces have no writers yet and their visibility policy is explicitly Batch-2/out-of-scope; this preserves status quo (no regression) and the `todos` exemption. Documented as a Batch-2 follow-up to tighten the default.
- **Authenticating the harness changes `event-spine.spec.ts` to skip without the admin token.** Mitigation: the invalid-write test stays ungated (preserving some coverage tokenless); skip-loudly matches the established `auth.spec.ts` convention and is sanctioned by the SPEC; CI runs with the token set.
- **Realtime-sync flake in propagation assertions.** Mitigation: `retries: 3` (existing config) plus explicit 15–20s timeouts mirroring `event-spine.spec.ts`.
- **InstantDB cannot field-mask `email`.** Mitigation: privacy is enforced structurally (email only on the own-row-locked `users` namespace; removed from `participants`), which is the SPEC-mandated design, not a workaround.
