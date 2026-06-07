# Implementation Plan: Cycle 0013

## Overview
Flip the InstantDB global `$default` permission catch-all from world-open (`allow.$default: 'true'`) to deny-by-default (`'false'`), and give the entities that previously inherited the permissive default (`messages`, `questions`, `endorsements`, plus the `todos` demo namespace) explicit, behavior-preserving `allow` blocks — so no present or future schema entity silently inherits world-writable permissions.

## Current State (from Research)
- `src/lib/perms.ts:21-117` is the single source of the permission rules. The catch-all to flip is at `src/lib/perms.ts:26` (`$default: { allow: { $default: 'true' } }`); its rationale comment is `src/lib/perms.ts:22-25`.
- Entities with explicit rules today: `users`, `sessions`, `sessionResources`, `sessionEvents`, `participants` (`src/lib/perms.ts:28-114`). Entities relying on the catch-all: `messages` (`db.ts:107-119`), `questions` (`db.ts:120-127`), `endorsements` (`db.ts:128-133`). The schema defines **eight** entities; there is **no `todos` entity** in `src/lib/db.ts:38-134`.
- The structural guard `src/lib/perms.test.ts:75-77` currently asserts `$default` stays open — this is the SPEC-named assertion to replace. The root-adapter identity test (`:79-83`) and the participants regression guards (`:55-73`) must keep passing unchanged.
- `instant.perms.ts:5` re-exports `./src/lib/perms` verbatim; the rules object is a plain inferred literal (no `InstantRules<…>` annotation) so the guard gets precise property access (`perms.ts:14-19`).
- Live behavior is proven by `e2e/permissions.spec.ts:1-168` driving the dev-only raw read/write harness `PermsProbe` (`src/components/PermsProbe.tsx`) at `/dev/perms-probe` (`src/pages/dev/perms-probe.astro`, production-gated). There is **no** probe handler that writes to a default-governed/undeclared entity.
- `npm run perms:push` (`scripts/push-perms.mjs`) is a fail-loud, idempotent wrapper around `instant-cli push perms`; the e2e suite skips loudly without `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID`.
- Product write paths that must stay green: `messages` (`submitChatMessage` → `writeEvent('ChatMessageSubmitted', …)`), `questions` (`writeEvent('QuestionCreated' | 'QuestionAnswered', …)`), all routed through `writeEvent()` (`db.ts:479-517`). `endorsements` is defined in schema but has no product write path yet.

### Resolved Open Questions
- **`todos` is not a schema entity.** Resolution: keep `messages`/`questions`/`endorsements` as the three real default-governed schema entities, and additionally add an explicit, intentionally-open `todos` block to satisfy SPEC Acceptance bullet #2 verbatim and make the documented "demo stays open" intent visible. The schema-entity structural guard iterates `schema.entities` (which does **not** include `todos`), so `todos` is an extra explicit-but-inert rule (schema enforcement already rejects writes to an undefined entity); it documents intent rather than gating anything.
- **Behavior-preserving expressions.** Today every op (incl. `view`) is fully open via the catch-all. The faithful preservation is per-entity `allow: { $default: 'true' }` — an entity-local explicit open rule (its OWN `$default`, not the global one), keeping all four flows green while deferring the real read/write policy to Batch-2 per SPEC Out-of-Scope.
- **The e2e rejection target.** Because the four named entities stay open, the unauthorized-write rejection must target a genuinely **undeclared** entity, which under the new global `$default: 'false'` is rejected by the live app — this is precisely the "next entity is locked by default" demonstration.
- **`perms:push` this cycle.** Yes — the live deny-by-default must be pushed for the e2e to observe it. Consistent with the SPEC failure model, the structural guard is the in-repo authority; if the push cannot reach the app it fails loudly and the e2e skips loudly. No schema push is needed (no entity/field delta; `endorsements` already exists).

## Desired End State
- `rules.$default.allow.$default === 'false'`. Every schema entity has an explicit `allow` block; `messages`/`questions`/`endorsements`/`todos` carry an explicit `allow: { $default: 'true' }` preserving today's open behavior.
- The structural guard fails loudly if `$default` is reverted to `'true'` OR if any schema entity lacks an explicit rule (driven by iterating `schema.entities`).
- `PermsProbe` gains an "undeclared write" handler; `e2e/permissions.spec.ts` asserts that write is rejected (deny-by-default), with existing flows still green.
- `AGENTS.md`, `README.md`, and the `perms.ts` header reflect deny-by-default.
- Verify: `npm test` (vitest) green; `npm run astro check` clean; `npm run test:e2e` green (or skips loudly without admin env); `npm run perms:push` succeeds against the live app.

## What We're NOT Doing
- NOT designing the real read-visibility / write-authorization policy for `messages`, `questions`, `endorsements` (restricting reads to participants, edits to authors) — that stays a deferred Batch-2 follow-up; this cycle only makes their current openness explicit.
- NOT re-implementing the `participants` owner-scoped write rule (shipped cycle 0007) — only regression-verifying it.
- NOT any UI/product-surface change (the `/dev/perms-probe` harness is a dev-only test seam, not product UI).
- NOT adding the `InstantRules<…>` type annotation — the rules object stays a plain inferred literal.
- NOT a schema push — no entity/field delta this cycle.

## Implementation Approach
A single data-layer change rippled through its guard, its live-behavior probe, and its docs. Task 1 makes the rules deny-by-default with explicit per-entity open blocks. Task 2 rewrites the structural guard to pin the new invariant and to fail loudly for any future entity added without a rule (by iterating the actual schema). Task 3 adds the undeclared-entity write probe + e2e leg that proves the live deny. Task 4 pushes the rules to the live app. Task 5 updates docs. The vertical-slice ordering keeps each task independently testable: the in-repo guard (Task 1+2) is authoritative even if the live push (Task 4) is deferred.

## Failure & Resilience Decisions

- **Task 1 (edit `perms.ts`)** — N/A — pure declarative object; no I/O. Correctness is enforced live by InstantDB and pinned by the Task 2 guard + `astro check`.
- **Task 2 (structural guard test)** — N/A — pure in-memory assertions over imported literals. Failure mode is a failing test (intended): the guard MUST fail if `$default` is loosened or a schema entity lacks a rule. No silent pass — `Object.keys(schema.entities)` drives the iteration so an un-ruled future entity surfaces as a concrete failing expectation.
- **Task 3 (probe handler + e2e leg)** — The probe issues a raw `db.transact` to an undeclared entity; the live rules reject it and the promise rejects. **Failure modes**: the transaction is rejected (expected) → surfaced via `surface()` to `probe-write-result` as `error:<message>` and `console.error('[PermsProbe] …)` — never swallowed (mirrors existing handlers `PermsProbe.tsx:35-39,56-65`). **Idempotency**: re-running the probe is safe — it never persists a row (deny) and even on a hypothetical accept it writes a fresh `id()`-keyed throwaway row; no shared state mutated. **Observability**: the rendered testid + console error are the diagnostic surface; the e2e asserts both the `error:` verdict and (for open entities) success. **No silent failure**: the e2e fails if a rejection does not occur (the deny regressed).
- **Task 4 (`perms:push`)** — Delegates to `scripts/push-perms.mjs`. **Failure modes**: missing `PUBLIC_INSTANTDB_APP_ID`, un-spawnable CLI, non-zero CLI exit, auth/network failure → the runner exits non-zero with a clear message BEFORE/around the network call, leaving the live app's prior (still-protective-or-prior) rules intact; the failure surfaces to the operator. **Idempotency**: declarative rules — re-pushing identical rules is a no-op, safe to re-run; the engine may retry the step. **Observability**: non-zero exit + stderr message; the structural guard remains the in-repo authority if the push cannot reach the app. **No silent failure**: every failure path is a non-zero exit, never a swallowed error.
- **Task 5 (docs)** — N/A — pure text; no failure surface.

---

## Task 1: Deny-by-default `$default` + explicit blocks for the formerly-default-governed entities

### Overview
Flip the global catch-all to deny-by-default and give `messages`, `questions`, `endorsements`, and the `todos` demo namespace explicit, intentionally-open `allow` blocks, and replace the catch-all rationale header comment.

### Changes Required
**File**: `src/lib/perms.ts`
**Changes**:
- Replace the catch-all comment (`:22-25`) and rule (`:26`):
  ```ts
  // Deny-by-default: any entity WITHOUT an explicit block below — including any
  // future schema entity and any undeclared namespace — is non-readable and
  // non-writable by a client. Openness must now be an explicit, reviewable
  // decision per entity (below), never silent inheritance. Intentionally-open
  // namespaces: `todos` (demo), and the Batch-2 namespaces `messages` /
  // `questions` / `endorsements`, whose real read/write policy is deferred.
  $default: { allow: { $default: 'false' } },
  ```
- Add four explicit blocks (placed after the `participants` block, before the closing `}`), each preserving today's fully-open behavior via the entity-local `$default`:
  ```ts
  // Intentionally OPEN demo namespace (no typed schema entity; explicit so the
  // openness is reviewable, not inherited from the global default).
  todos: { allow: { $default: 'true' } },

  // Batch-2 namespaces — kept at today's fully-open behavior EXPLICITLY so no
  // product flow (student chat, question promotion/queue, endorsements) regresses.
  // The real participant/owner-scoped read+write policy is a deferred Batch-2
  // follow-up (the `messageSession`/`question*` links already exist to enable it).
  messages: { allow: { $default: 'true' } },
  questions: { allow: { $default: 'true' } },
  endorsements: { allow: { $default: 'true' } },
  ```
- Update the module header (`:1-20`) to state the deny-by-default posture and the requirement that every new schema entity ships with an explicit rule.

### Success Criteria
- [ ] `npm run astro check` clean (object stays a well-formed inferred literal).
- [ ] `rules.$default.allow.$default === 'false'`.
- [ ] `messages`/`questions`/`endorsements`/`todos` each have an explicit `allow` block.
- [ ] No regression in existing structural assertions for `users`/`sessions`/`sessionResources`/`sessionEvents`/`participants`.

---

## Task 2: Rewrite the structural guard for deny-by-default + per-schema-entity coverage

### Overview
Replace the `$default stays open` assertion with a deny-by-default guard, add explicit-open assertions for the four newly-explicit entities, and add a schema-driven guard that fails if any schema entity lacks a rule.

### Changes Required
**File**: `src/lib/perms.test.ts`
**Changes**:
- Add `import { schema } from './db'`.
- Replace the `$default stays open` test (`:75-77`) with:
  ```ts
  it('$default denies by default — no entity falls back to world-open', () => {
    expect(rules.$default.allow.$default).toBe('false')
    expect(rules.$default.allow.$default).not.toBe('true')
  })

  it('every schema entity has an explicit rule (no silent fall-through)', () => {
    for (const name of Object.keys(schema.entities)) {
      expect(rules, `schema entity "${name}" must have an explicit permission rule`).toHaveProperty(name)
    }
  })

  it('formerly-default-governed entities are explicitly open (intent visible, not inherited)', () => {
    for (const name of ['todos', 'messages', 'questions', 'endorsements'] as const) {
      expect(rules[name].allow.$default).toBe('true')
    }
  })
  ```
- Leave the participants regression guards (`:55-73`) and the root-adapter identity test (`:79-83`) unchanged.

### Success Criteria
- [ ] `npm test` green.
- [ ] Reverting `$default` to `'true'` makes the deny-by-default test fail (verify by spot-check, not committed).
- [ ] Removing any one of the four explicit blocks makes the schema-coverage or explicit-open test fail.
- [ ] Participants + root-adapter identity tests still pass unchanged.

---

## Task 3: Undeclared-entity write probe + e2e deny-by-default rejection leg

### Overview
Add a `PermsProbe` handler that raw-writes to an undeclared entity, and extend `e2e/permissions.spec.ts` to assert the live rules reject it (proving deny-by-default), while existing flows stay green.

### Changes Required
**File**: `src/components/PermsProbe.tsx`
**Changes**: Add a handler mirroring `writeSession` that targets an undeclared namespace, and a button:
```tsx
// Deny-by-default proof: a raw write to an UNDECLARED namespace. Under the
// global `$default: 'false'` rule the live app rejects it — the promise rejects
// and we render the permission error (never swallowed).
function writeUndeclared() {
  setWriteResult('…')
  try {
    db.transact((db.tx as Record<string, any>).forbiddenProbe[id()].update({ note: 'probe-' + Date.now() }))
      .then(() => setWriteResult('ok'))
      .catch((err: unknown) => surface(setWriteResult, err))
  } catch (err) {
    surface(setWriteResult, err)
  }
}
```
```tsx
<button data-testid="probe-write-undeclared" onClick={writeUndeclared} className="btn">
  Write undeclared entity (raw)
</button>
```

**File**: `e2e/permissions.spec.ts`
**Changes**: Add a new test in the `data-layer permission rules` describe block:
```ts
test('deny-by-default: a signed-in client cannot write an undeclared/default-governed entity', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signInViaUi(page, freshEmail())
  await gotoProbe(page, { targetSessionId: freshSessionId() })
  await page.getByTestId('probe-write-undeclared').click()
  await expect(page.getByTestId('probe-write-result')).toContainText('error:', { timeout: 20_000 })
  await ctx.close()
})
```

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] With rules pushed (Task 4), the new e2e test passes (undeclared write rejected); without admin env it skips loudly.
- [ ] Existing e2e legs (owner write propagates, student/resource/inject/cross-teacher denials, email privacy) still pass.
- [ ] Probe error path renders `error:` and logs `console.error('[PermsProbe] …')` — no swallowed error.

---

## Task 4: Push the deny-by-default rules to the live app

### Overview
Push the updated rules so the live app enforces deny-by-default (required for the Task 3 e2e to observe the rejection). No schema push needed.

### Changes Required
**Command**: `npm run perms:push` (`scripts/push-perms.mjs` → `npx instant-cli push perms`), with `PUBLIC_INSTANTDB_APP_ID` set. No schema delta this cycle, so `npx instant-cli push schema` is a no-op and is not required.

### Success Criteria
- [ ] `npm run perms:push` exits zero against the live app; re-run is a no-op (idempotent).
- [ ] On any failure (missing app id / CLI / auth / network) the runner exits non-zero with a clear message and the live rules retain their prior state.
- [ ] The live `e2e/permissions.spec.ts` deny-by-default leg passes against the pushed rules.

---

## Task 5: Documentation — AGENTS.md, README.md, perms.ts header

### Overview
Reconcile the docs that describe the permissive `$default` with the new deny-by-default posture and the every-new-entity-needs-a-rule requirement.

### Changes Required
**File**: `AGENTS.md`
**Changes**: Replace the line (`:26`) "A permissive `$default` keeps `todos` and the out-of-scope Batch-2 namespaces at today's behavior" with a deny-by-default statement: the global `$default` denies all ops; `todos`/`messages`/`questions`/`endorsements` carry explicit intentionally-open blocks; every new schema entity MUST ship with an explicit permission rule (enforced by the structural guard). Adjust the `messages` note (`:40`) to say `messages` is now explicitly open via its own block (not the global default), tightening still deferred.

**File**: `README.md`
**Changes**: Update the "Chat messages still run under the permissive `$default` rule" note (`:308-318`) to: `messages` now carries an explicit `allow: { $default: 'true' }` block (openness is explicit, not inherited); the global default denies by default; the participant/owner-scoped tightening remains the deferred Batch-2 follow-up.

**File**: `src/lib/perms.ts` header — covered in Task 1.

### Success Criteria
- [ ] No doc still describes `$default` as permissive/world-open.
- [ ] AGENTS.md states the every-new-entity-needs-an-explicit-rule invariant.
- [ ] README reflects explicit-open `messages` + deny-by-default global default.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] rules.$default.allow.$default === 'false' — verified by the structural guard test in src/lib/perms.test.ts.` | Task 1, Task 2 | Flip in Task 1; guard in Task 2 |
| `[ ] Each of todos, messages, questions, endorsements has an explicit allow block in rules, and none of them resolves its write/read policy through the global $default catch-all.` | Task 1, Task 2 | Per-entity `allow: { $default: 'true' }` (entity-local, not global); guard asserts each |
| `[ ] User-benefit / failure-path: a crafted authenticated client attempting to write to a default-governed or undeclared entity is rejected by the live permission rules — exercised in e2e/permissions.spec.ts (unauthorized write fails and leaves the row unchanged).` | Task 3, Task 4 | Targets an undeclared entity (the four named entities stay open); rejection proven against pushed rules |
| `[ ] The participants owner-scoped write invariant from cycle 0007 still holds (existing perms.test.ts participants assertions pass unchanged).` | Task 2 | Participants guards (`perms.test.ts:55-73`) left unchanged |
| `[ ] The teacher question queue, student chat send/stream, and endorsements flows still function — covered by their existing e2e specs passing.` | Task 1, Task 4 | Explicit-open blocks preserve behavior; existing e2e specs re-run |
| `[ ] instant.perms.ts still re-exports the exact src/lib/perms.ts object (existing root-adapter identity test passes).` | Task 1 | `instant.perms.ts` untouched; identity test (`:79-83`) unchanged |
| `[ ] All existing tests still pass.` | Task 2, Task 3 | Full `npm test` + `npm run test:e2e` |
| `[ ] No compiler/linter warnings introduced (npm run astro check clean).` | Task 1, Task 3 | `astro check` after each edit |

---

## Testing Strategy

### Unit Tests
- **Happy path** (`src/lib/perms.test.ts`): assert `$default.allow.$default === 'false'`; assert every key in `Object.keys(schema.entities)` exists in `rules`; assert `todos`/`messages`/`questions`/`endorsements` each have `allow.$default === 'true'`.
- **Failure-path tests** (the guard IS the failure detector): the deny-by-default assertion fails if `$default` is reverted to `'true'`; the schema-coverage assertion fails if a schema entity lacks a rule (the named failure mode "future entity added without a rule"); the explicit-open assertion fails if one of the four blocks is removed.
- **Regression**: existing `users`/`sessions`/`sessionResources`/`sessionEvents`/`participants` structural assertions and the root-adapter identity test pass unchanged.
- **Mocking strategy**: none — assert over the real imported `rules` and real `schema` literals (no mocking; the rules are pure declarative data).

### Integration / E2E Tests
- `e2e/permissions.spec.ts`: new leg — a signed-in client's raw write to the undeclared `forbiddenProbe` entity is rejected (`error:`), proving deny-by-default against the live pushed rules; skips loudly without `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID`. Existing legs (owner write propagation, student/resource/inject/cross-teacher denials, email privacy) re-run unchanged.
- Existing flow specs that must stay green (preserve-behavior verification): `e2e/student-chat.spec.ts` (messages), `e2e/auto-create-question.spec.ts` (question promotion), `e2e/teacher-question-queue.spec.ts` (question answer), `e2e/join-via-link.spec.ts` (participants).

## Walkthrough Plan
This cycle builds **no product UI** — it is a data-layer authorization change. The only observable surface is the **dev-only** `PermsProbe` harness at `/dev/perms-probe`, which renders the live rules' verdict; the walkthrough exercises THIS cycle's new deny-by-default behavior over that real (non-home) route rather than degrading to the home page.

- **Flow**: sign in via the deterministic admin/test code-minting seam (same as `e2e/permissions.spec.ts`, never a real inbox) → navigate to `/dev/perms-probe?targetSessionId=<fresh>` → wait on the explicit `perms-probe` testid (not `networkidle` — InstantDB keeps the socket busy) → click "Write undeclared entity (raw)" → observe the rendered `error:` verdict proving the global `$default: 'false'` rejected the write → (contrast) click "Write session (raw)"/an open-entity action to show preserved flows still behave.
- **Capture points** (ordered, named):
  - `01-probe-loaded` — `/dev/perms-probe` harness mounted, signed-in self id visible (`probe-self-id`).
  - `02-undeclared-write-denied` — `probe-write-result` shows `error:` after the undeclared write (deny-by-default in force).
  - `03-open-flow-intact` — an existing open/owner action still resolves (e.g. `probe-active-resource` reflects an owner write), showing no flow regressed.
- **Preconditions / test data**: `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID` for deterministic sign-in (skips loudly if absent); the rules pushed live via Task 4; a fresh `targetSessionId`; realtime assertions wait on explicit probe testids, never `networkidle`.
- **If no observable UI this cycle**: there is no *product* UI; the demonstration uses the dev `PermsProbe` harness, which IS observable. If the admin/auth env or the live push is unavailable, the walkthrough **degrades loudly** (mirroring the e2e skip) rather than silently falling back to the home page — this is stated explicitly, not left to the fallback.

## Risk Assessment
- **`todos` is not a real schema entity** → the explicit `todos` block is inert under schema enforcement. Mitigation: documented as intentional (satisfies SPEC bullet #2 verbatim, makes "demo stays open" visible); the schema-coverage guard iterates `schema.entities` so it never *requires* `todos`, avoiding a false-failing test.
- **Writing to an undeclared entity may be rejected by schema-enforcement rather than the `$default` rule** → either way the live app rejects the write, which is exactly the SPEC criterion ("default-governed OR undeclared entity is rejected") and the "next entity is locked by default" guarantee. Mitigation: the e2e asserts the rejection (the observable invariant), not the rejection's internal source.
- **Live push could mask a behavior regression in the four open flows** → Mitigation: re-run the existing chat/question/join e2e specs after the push; explicit `allow: { $default: 'true' }` is behavior-identical to the prior global catch-all for those entities.
- **`perms:push` cannot reach the app in CI** → Mitigation: the runner fails loudly (non-zero), the e2e skips loudly, and the structural guard remains the authoritative in-repo proof of the invariant.
