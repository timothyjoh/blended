# Implementation Plan: Cycle 0021

## Overview
Add the missing root `instant.schema.ts` CLI adapter and a fail-loud, idempotent `npm run schema:push` runner — the exact counterpart of the existing `perms:push` infrastructure — push the committed Blended schema to the live Instant app, document the push as an ordered deploy-prerequisite (schema **before** perms), and prove end-to-end that a representative `writeEvent()` transaction is accepted by the now-migrated, schema-enforced live app.

## Current State (from Research)
- The canonical schema is a **named** export: `export const schema = i.schema({…})` at `src/lib/db.ts:39-214` (eight entities, seven links, all accreted additive fields). `db = init({ appId, schema })` at `src/lib/db.ts:216`.
- The perms push infrastructure to mirror exactly:
  - Adapter `instant.perms.ts:1-5` — `export { default } from './src/lib/perms'` (re-export, single definition; header comment explains why the root adapter exists).
  - Runner `scripts/push-perms.mjs:1-56` — pure `resolveAppId(env)` (throws before any network call), then `spawnSync('npx', ['instant-cli','push','perms','--app',appId], { stdio: 'inherit' })`, three distinct non-zero exit branches (resolve-throw, spawn `result.error`, CLI non-zero `result.status`), message prefix `push-perms:`. Documented idempotent (declarative push, no local mutation).
  - Pure seam `src/lib/pushPerms.ts:15-23` — `resolveAppId(env)`, db-free, unit-testable.
  - Tests `src/lib/pushPerms.test.ts:1-34` — unit-tests the pure seam AND spawns the real `.mjs` with empty app id asserting non-zero exit + stderr contains `push-perms:` and `PUBLIC_INSTANTDB_APP_ID`.
  - npm wiring `package.json:16` — `"perms:push": "node scripts/push-perms.mjs"`.
- Vitest config picks up both `src/**/*.test.ts` and `scripts/**/*.test.mjs`; `env.PUBLIC_INSTANTDB_APP_ID: 'test-app-id'` so importing `src/lib/db.ts` passes the init guard (`vitest.config.ts:8-27`).
- e2e seam: `e2e/support/auth.ts:14-49` (`adminAvailable()`, `mintCode()`, `signInViaUi()`, `queryAdmin()`); live-skip convention `test.skip(!adminAvailable(), …)` (`e2e/permissions.spec.ts:11-14`); writeEvent-acceptance proof pattern `e2e/create-session.spec.ts:38-60` (drive a mutation, `expect.poll` over `queryAdmin` until the projection row + matching `sessionEvents` row land).
- **None of `instant.schema.ts`, `scripts/push-schema.mjs`, `src/lib/pushSchema.ts`, or the `schema:push` npm script exist today.**

### Resolved Open Questions
- **Adapter export shape** — `instant-cli push schema` loads the root `instant.schema.ts` and reads the schema as the file's **default export** (the CLI-generated file uses `export default schema`). `src/lib/db.ts` exports `schema` as a *named* export. The adapter therefore re-exports the named `schema` as **both default and named**: `export { schema as default, schema } from './src/lib/db'`. This satisfies the SPEC acceptance criterion ("a re-export, not an `i.schema({…})` call") and the CLI's default-export expectation, with exactly one schema definition.
- **Introduce `src/lib/pushSchema.ts` pure seam?** — **Yes.** Mirroring `pushPerms.ts` keeps the failure-path coverage symmetric and deterministic (a pure `resolveAppId` unit test plus the spawn-the-runner integration test). Error-message prefix is **`push-schema:`** (distinct from `push-perms:`), wording otherwise identical.
- **Live push execution** — Gated on an authenticated `instant-cli login` session + a real `PUBLIC_INSTANTDB_APP_ID`. When absent in the build environment, the runner fails loudly (non-zero) and the live-verification e2e skips loudly; neither passes falsely.
- **Idempotency assertion** — Documented via the runner's design (declarative CLI push = no-op on unchanged schema; runner performs no local mutation), exactly as `push-perms` does. No programmatic second-push assertion is added (a re-push requires live credentials and would be a network call; the design guarantee + the live e2e's natural re-run safety suffice).

## Desired End State
- `npm run schema:push` exists, mirrors `perms:push`, and is the single sanctioned schema-push command — idempotent, fail-loud, non-zero on every failure path.
- Root `instant.schema.ts` re-exports the canonical `schema` (no second `i.schema(...)`).
- `scripts/push-schema.mjs` + `src/lib/pushSchema.ts` exist, mirroring the perms files; covered by `src/lib/pushSchema.test.ts`.
- AGENTS.md and README.md document the ordered runbook (`schema:push` → `perms:push`) with rationale; `.env.example` confirms the required keys.
- A live-verification e2e proves a `writeEvent()` transaction is accepted against the migrated schema-enforced app (skips loudly without admin env).
- Verify: `npm run test` green, `npm run astro check` clean, reading `instant.schema.ts` shows a re-export, spawning the runner with empty app id exits non-zero before any network call.

## What We're NOT Doing
- **No change to the schema itself** in `src/lib/db.ts` — no new entities, fields, or links. This cycle pushes the existing committed schema.
- **No tightening of the Batch-2 `questions` / `endorsements` permission rules** — separate deferred follow-up.
- **No combined "schema + perms" meta-runner**, no schema-diff preview, no CI automation of the push.
- **No product UI change** — no new routes, components, or testids.
- **No edit to `src/lib/perms.ts` or `instant.perms.ts`** and no contradiction of existing `perms:push` docs.

## Implementation Approach
Replicate the proven `perms:push` triplet exactly — pure seam (`src/lib/pushSchema.ts`) + `.mjs` runner (`scripts/push-schema.mjs`) + npm script — adjusted only for the schema verb and the named→default re-export shape of the adapter. Symmetry with the existing, reviewed perms infrastructure is the design (same fail-loud branches, same idempotency rationale, same test strategy). Documentation lands the ordering decision (schema first, so perms rules referencing schema-defined links/attrs resolve). The live push + writeEvent-acceptance proof reuse the established admin-gated, skip-loudly e2e conventions.

## Failure & Resilience Decisions

**Task 1 — `src/lib/pushSchema.ts` (`resolveAppId`)**: N/A — pure. Db-free, total over input, performs no I/O; throws a clear `push-schema:` error on missing/empty/whitespace app id (no swallow — the throw is the contract, exercised by callers and unit tests).

**Task 2 — `instant.schema.ts` adapter**: N/A — pure. A static re-export module with no runtime logic, I/O, or failure surface.

**Task 3 — `scripts/push-schema.mjs` runner** (subprocess + network via `instant-cli`):
- **Failure modes & response**: (a) missing/empty `PUBLIC_INSTANTDB_APP_ID` → `console.error` the `push-schema:` message + `process.exit(1)` **before** any spawn (no network call); (b) CLI un-spawnable (`result.error`, e.g. npx unavailable/offline) → `console.error` naming the cause + `process.exit(1)`; (c) CLI ran but rejected (`result.status !== 0`, auth/network/unreachable app) → `console.error` pointing at `instant-cli login`/connectivity + `process.exit(result.status || 1)` (forward the code, never collapse to 0). All three branches mirror `push-perms.mjs:42-56`.
- **Idempotency**: safe to re-run — `instant-cli push schema` is declarative (pushing an unchanged schema is a no-op); the runner performs **no local mutation**. The engine may retry the step freely.
- **Observability**: every error path writes a distinct, prefixed (`push-schema:`) message to **stderr** and exits non-zero; `stdio: 'inherit'` surfaces the CLI's own diagnostics live.
- **No silent failure**: there is no catch that resolves to success; the precondition throw, the spawn error, and the CLI non-zero status each force a non-zero exit. The live app is never left unmigrated while the command reports success.

**Task 4 — Documentation edits (AGENTS.md / README.md / .env.example)**: filesystem writes to docs only — no runtime failure surface. Idempotent (text edits). If an edit target string has drifted, the Edit tool fails loudly rather than silently no-op'ing.

**Task 5 — Tests (`src/lib/pushSchema.test.ts`)**: N/A for production failure surface; the test *itself* spawns the real runner (subprocess) and asserts a deterministic non-zero exit with no network call — a controlled, hermetic failure-path exercise.

**Task 6 — Live push + verification e2e**: the runner's failure decisions (Task 3) apply to the push; the e2e **skips loudly** (`test.skip(!adminAvailable(), …)`) when admin env is absent — it never passes falsely. `queryAdmin` throws on read failure (never swallowed).

---

## Task 1: Pure precondition seam — `src/lib/pushSchema.ts`

### Overview
Db-free, unit-testable `resolveAppId(env)` that throws a clear `push-schema:` error before any CLI invocation, mirroring `src/lib/pushPerms.ts`.

### Changes Required
**File**: `src/lib/pushSchema.ts` (new)
**Changes**: Header comment mirroring `pushPerms.ts:1-7` (adjusted to "schema-push"). One exported function:
```ts
export function resolveAppId(env: Record<string, string | undefined>): string {
  const appId = env.PUBLIC_INSTANTDB_APP_ID
  if (!appId || appId.trim() === '') {
    throw new Error(
      'push-schema: PUBLIC_INSTANTDB_APP_ID is missing or empty — cannot push schema (set it in .env)'
    )
  }
  return appId
}
```

### Success Criteria
- [ ] Compiles cleanly (`npm run astro check`)
- [ ] `resolveAppId({ PUBLIC_INSTANTDB_APP_ID: 'x' })` returns `'x'`; missing/empty/whitespace throws `/PUBLIC_INSTANTDB_APP_ID/`
- [ ] Failure path: throws (no silent return) on bad input

---

## Task 2: Root CLI adapter — `instant.schema.ts`

### Overview
Root file `instant-cli push schema` loads; re-exports the canonical `schema` from `src/lib/db.ts` as both default and named, with no second schema declaration.

### Changes Required
**File**: `instant.schema.ts` (new)
**Changes**: Header comment mirroring `instant.perms.ts:1-4` (explaining the adapter exists only because `instant-cli` loads a root `instant.schema.ts`, and re-exporting keeps exactly one definition), then:
```ts
export { schema as default, schema } from './src/lib/db'
```
Default re-export satisfies what `instant-cli push schema` reads; the named re-export keeps it readable. No `i.schema({…})` call appears in this file.

### Success Criteria
- [ ] Compiles cleanly (`npm run astro check`)
- [ ] File contains a re-export, NOT an `i.schema({…})` call (acceptance criterion #2)
- [ ] Default export resolves to the same object as `src/lib/db.ts`'s `schema` (single source of truth)

---

## Task 3: Fail-loud runner — `scripts/push-schema.mjs`

### Overview
`npm run schema:push` target. Resolves the app id before any network call, shells out to `instant-cli push schema --app <id>`, exits non-zero with a distinct message on every failure path. Idempotent.

### Changes Required
**File**: `scripts/push-schema.mjs` (new)
**Changes**: Mirror `scripts/push-perms.mjs:1-56` verbatim except: header references schema-push (cycle 0021); the inlined `resolveAppId` uses the `push-schema:` message; the spawn verb is `['instant-cli', 'push', 'schema', '--app', appId]`; all three error messages use the `push-schema:` prefix. Structure:
```js
import { spawnSync } from 'node:child_process'

function resolveAppId(env) {
  const appId = env.PUBLIC_INSTANTDB_APP_ID
  if (!appId || appId.trim() === '') {
    throw new Error('push-schema: PUBLIC_INSTANTDB_APP_ID is missing or empty — cannot push schema (set it in .env)')
  }
  return appId
}

let appId
try { appId = resolveAppId(process.env) }
catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) }

const result = spawnSync('npx', ['instant-cli', 'push', 'schema', '--app', appId], { stdio: 'inherit' })

if (result.error) {
  console.error(`push-schema: failed to run instant-cli (${result.error.message}) — is npx available and online?`)
  process.exit(1)
}
if (result.status !== 0) {
  console.error(`push-schema: instant-cli push schema failed (exit ${result.status}) — check \`instant-cli login\` auth and network`)
  process.exit(result.status || 1)
}
```
Header comment documents: idempotent (declarative push, no local mutation); the inlined app-id check mirrors `src/lib/pushSchema.ts#resolveAppId` because a `.mjs` cannot import the `.ts` without a loader.

**File**: `package.json`
**Changes**: Add `"schema:push": "node scripts/push-schema.mjs"` immediately above `"perms:push"` (so the ordered pair reads schema then perms in the scripts block).

### Success Criteria
- [ ] `npm run schema:push` is defined and resolves to the runner (acceptance #1)
- [ ] With `PUBLIC_INSTANTDB_APP_ID` empty/unset: exits non-zero, stderr names `push-schema:` + `PUBLIC_INSTANTDB_APP_ID`, **no** `npx`/network spawn (acceptance #4)
- [ ] CLI rejection forwards a non-zero exit with an auth/connectivity message (acceptance #5)
- [ ] No error path returns exit 0; idempotency documented in header

---

## Task 4: Documentation — AGENTS.md, README.md, .env.example

### Overview
Replace the incidental "if a deployment uses schema enforcement" prose with a concrete, ordered deploy-prerequisite runbook step (schema push **before** perms push) and surface the new command, without contradicting existing perms docs.

### Changes Required
**File**: `AGENTS.md`
**Changes**:
- `AGENTS.md:17` — replace "push the schema to the Instant app once with `npx instant-cli push schema`" with "run **`npm run schema:push`** (the fail-loud wrapper)".
- `AGENTS.md:29` — update the perms-push note: "after **`npm run schema:push`**" (not bare `npx instant-cli push schema`) so the schema delta is live first.
- Add a concrete **deploy-prerequisite runbook** statement near the Data Layer / Environment notes: run `npm run schema:push` **then** `npm run perms:push`, in that order, with the rationale — perms rules reference schema-defined links/attrs (e.g. `data.ref('participant.userId')`, `data.ref('session.teacherId')`), so the schema must be live first or those refs fail to resolve. Note `schema:push` is fail-loud (non-zero on missing app id / CLI / auth / network) and idempotent (declarative; safe to re-run).
- `AGENTS.md:71` (Environment & Secrets) — note `PUBLIC_INSTANTDB_APP_ID` is consumed by `npm run schema:push` as well as `perms:push`.

**File**: `README.md`
**Changes**:
- `README.md:44` commands table — add a row `| `npm run schema:push` | Push the InstantDB schema to the live app (fail-loud) |` directly **above** the `perms:push` row.
- `README.md:56-59` — replace "push the schema once with `npx instant-cli push schema`" with `npm run schema:push`, framed as the fail-loud, idempotent wrapper.
- `README.md:72-75` and the "Not yet live" note (`:80-85`) — update the ordering prose to `npm run schema:push` **then** `npm run perms:push`, replacing the bare `npx instant-cli push schema` references.

**File**: `.env.example`
**Changes**: Confirm/annotate `PUBLIC_INSTANTDB_APP_ID` (line 1) as required by `npm run schema:push` (and `perms:push`); note `INSTANT_ADMIN_TOKEN` additionally gates the live schema-verification e2e (no new key introduced).

### Success Criteria
- [ ] AGENTS.md presents an ordered runbook step (`schema:push` then `perms:push`) with rationale; no contradiction of existing perms docs (acceptance #6)
- [ ] README surfaces `npm run schema:push` beside `perms:push`
- [ ] `.env.example` documents the required keys; Edits applied (loud failure if target text drifted)

---

## Task 5: Tests — `src/lib/pushSchema.test.ts`

### Overview
Mirror `src/lib/pushPerms.test.ts`: unit-test the pure `resolveAppId`, and spawn the real `scripts/push-schema.mjs` with an empty app id asserting a deterministic non-zero, no-network failure.

### Changes Required
**File**: `src/lib/pushSchema.test.ts` (new)
**Changes**:
```ts
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveAppId } from './pushSchema'

const runnerPath = fileURLToPath(new URL('../../scripts/push-schema.mjs', import.meta.url))

describe('resolveAppId (schema push)', () => {
  it('returns the app id when present', () => {
    expect(resolveAppId({ PUBLIC_INSTANTDB_APP_ID: 'x' })).toBe('x')
  })
  it('throws a clear PUBLIC_INSTANTDB_APP_ID message when missing', () => {
    expect(() => resolveAppId({})).toThrow(/PUBLIC_INSTANTDB_APP_ID/)
  })
  it('throws when empty/whitespace (never silently push)', () => {
    expect(() => resolveAppId({ PUBLIC_INSTANTDB_APP_ID: '' })).toThrow(/PUBLIC_INSTANTDB_APP_ID/)
    expect(() => resolveAppId({ PUBLIC_INSTANTDB_APP_ID: '   ' })).toThrow(/PUBLIC_INSTANTDB_APP_ID/)
  })
})

describe('push-schema.mjs runner (failure path, no network)', () => {
  it('exits non-zero with a clear message when the app id is missing — before any CLI call', () => {
    const env = { ...process.env, PUBLIC_INSTANTDB_APP_ID: '' }
    const result = spawnSync(process.execPath, [runnerPath], { env, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('push-schema:')
    expect(result.stderr).toContain('PUBLIC_INSTANTDB_APP_ID')
  })
})
```

### Success Criteria
- [ ] Both describe blocks pass under `npm run test` (real runner, no mock of `child_process`)
- [ ] The spawn asserts non-zero exit + `push-schema:` + `PUBLIC_INSTANTDB_APP_ID` in stderr, with no network call (acceptance #4)
- [ ] All existing tests still pass (acceptance #7)

---

## Task 6: Live push + writeEvent-acceptance e2e — `e2e/schema-push.spec.ts`

### Overview
Given admin credentials, run the schema push and drive a representative `writeEvent()` dual-write against the live schema-enforced app, asserting the `sessionEvents` envelope + projection row are accepted via `queryAdmin`. Skips loudly without admin env.

### Changes Required
**File**: `e2e/schema-push.spec.ts` (new)
**Changes**: Mirror `e2e/create-session.spec.ts:38-60` + the loud-skip gate from `e2e/permissions.spec.ts:11-14`:
- `test.skip(!adminAvailable(), 'requires INSTANT_ADMIN_TOKEN and PUBLIC_INSTANTDB_APP_ID — skipping live schema-push verification')`.
- In a setup step, run the push runner against the live app: `spawnSync(process.execPath, [push-schema.mjs path], { env: process.env })` and assert exit 0 (the push succeeds, or the test surfaces the CLI's non-zero status loudly). *(If `instant-cli login` is unauthenticated in the build env, the runner exits non-zero and this assertion fails loudly — never a false pass.)*
- Sign in via `signInViaUi()` / `mintCode()`, drive a real product mutation that calls `writeEvent()` (reuse `createSession` flow as in `create-session.spec.ts`), then `expect.poll(() => queryAdmin({ sessions: { $: { where: { … } } } }))` until the projection row appears, and assert a matching `sessionEvents` row of the expected `type` exists — proving the transaction was **accepted** by the schema-enforced live app (acceptance #3).

### Success Criteria
- [ ] Spec skips loudly when admin env absent (never passes falsely)
- [ ] With admin env: push succeeds, the `writeEvent()` mutation's projection row + `sessionEvents` envelope land (acceptance #3)
- [ ] `queryAdmin` failure surfaces (throws), never swallowed

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ]` `npm run schema:push` exists in `package.json` and resolves to a runner that shells out to `instant-cli push schema` for the configured app. | Task 3 | Runner + npm wiring |
| `[ ]` Root `instant.schema.ts` re-exports the canonical `schema` from `src/lib/db.ts` with no second schema declaration (verifiable by reading the file: it contains a re-export, not an `i.schema({…})` call). | Task 2 | `export { schema as default, schema } from './src/lib/db'` |
| `[ ]` **User-observable benefit**: after `npm run schema:push` succeeds against the live app, a representative `writeEvent()` transaction is **accepted** (not rejected) by the schema-enforced live app — proven by an e2e/integration check that exercises the dual-write path against the live app and asserts the event + projection rows land (skips loudly without admin credentials). | Task 6 | Reuses `create-session.spec.ts` acceptance-proof pattern |
| `[ ]` **Failure path**: running the schema-push runner with `PUBLIC_INSTANTDB_APP_ID` unset/empty exits non-zero, prints a clear message instructing the operator to set it in `.env`, and makes no network call (mirrors `push-perms`'s integration test, which spawns the runner directly). | Task 3, Task 5 | Runner branch + spawn-the-runner test |
| `[ ]` **Failure path**: a CLI/auth/network rejection from `instant-cli push schema` causes the runner to exit non-zero forwarding the CLI's status, with a message pointing at auth/connectivity — never exit 0. | Task 3 | `result.error` + `result.status` branches; operator-verified via Task 6 live push |
| `[ ]` AGENTS.md documents `npm run schema:push` as a concrete deploy-prerequisite step ordered **before** `npm run perms:push`, with the ordering rationale stated. | Task 4 | Plus README + .env.example per Documentation Updates |
| `[ ]` All existing tests still pass (`npm run test`). | Task 5 | Full suite green after additions |
| `[ ]` `npm run astro check` reports no new errors; no compiler/linter warnings introduced. | Task 1, Task 2 | New TS files type-check clean |

## Testing Strategy

### Unit Tests
- **`src/lib/pushSchema.test.ts`** — pure `resolveAppId`: returns id when present; throws `/PUBLIC_INSTANTDB_APP_ID/` on missing, empty, and whitespace-only input (the "never silently push" guard).
- **Failure-path test** — spawn the real `scripts/push-schema.mjs` with `PUBLIC_INSTANTDB_APP_ID: ''`; assert non-zero exit + stderr contains `push-schema:` and `PUBLIC_INSTANTDB_APP_ID`, proving the no-network missing-credentials path deterministically (mirrors `pushPerms.test.ts:23-34`).
- **Mocking strategy** — none for the runner: spawn the real process (anti-mock bias). `child_process` is exercised for real; no network is reached because the resolve-throw precedes the spawn.

### Integration / E2E Tests
- **`e2e/schema-push.spec.ts`** (live, admin-gated) — run the push runner against the live app (assert exit 0), then drive a `writeEvent()`-backed mutation and `expect.poll` over `queryAdmin` until the projection row + matching `sessionEvents` envelope land, proving the schema-enforced live app **accepts** the transaction. `test.skip` loudly when `adminAvailable()` is false.
- **CLI-rejection leg** — the CLI/auth/network forwarded-non-zero path is exercised operationally by the live push in Task 6 (a failed/unauthenticated push fails the spec loudly); the missing-credentials half is the deterministic unit test above (same split documented in `pushPerms.test.ts:23-34`).
- **Idempotency** — documented via the runner's design (declarative `instant-cli push`, no local mutation); the live e2e is naturally re-run-safe (a second unchanged push is a no-op exit 0).

## Walkthrough Plan
- **No observable UI is built this cycle.** This is a CLI/deploy-tooling + documentation cycle (a root adapter, a push runner, an npm script, docs) plus a schema push to the live app. SPEC §Testing Strategy explicitly states "No UI changed, so no new component e2e is required." There are no new routes, components, or testids.
- **Flow**: there is no new product screen to exercise. The cycle's observable effect — a `writeEvent()` transaction being **accepted** by the migrated live app — is proven by the admin-gated `e2e/schema-push.spec.ts` (Task 6), not by a browser walkthrough of new UI.
- **Capture points**: none specific to this cycle's new functionality. Best-effort degraded evidence (optional, NOT new-this-cycle UI): a capture of the existing `/dev/event-spine` harness exercising the dual-write path could illustrate that writes land against the migrated schema, but this is pre-existing UI and must not be presented as this cycle's deliverable.
- **Preconditions / test data**: N/A for a new-UI walkthrough; the live verification (Task 6) requires `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID` and an authenticated `instant-cli login`, otherwise it skips loudly.
- **If no observable UI this cycle**: stated explicitly — **the `walkthrough_capture` may legitimately degrade** (the per-cycle `walkthrough.mjs` records no non-home captures and the runner falls back to the home page). The degradation sidecar's `reason` will correctly reflect that this cycle ships no observable UI behavior; this is expected, not a planning failure.

## Risk Assessment
- **`instant-cli` default-export expectation for `instant.schema.ts`**: resolved by re-exporting `schema` as **both** default and named — covers the CLI's read shape and the readability/single-definition requirement. Mitigation: if a given `instant-cli` version emits a schema-shape warning, the named re-export remains the canonical object; the live push in Task 6 surfaces any incompatibility loudly (non-zero exit), never a false pass.
- **Live credentials absent in the build environment**: the runner fails loudly (non-zero) and `e2e/schema-push.spec.ts` skips loudly — neither passes falsely. Mitigation: this is the intended, documented behavior; the deterministic unit test still proves the missing-credentials failure path with no network.
- **Doc-edit target drift** (AGENTS.md / README.md line references): mitigation — Edits match on exact existing strings (e.g. "push the schema … `npx instant-cli push schema`"); a drifted target fails the Edit loudly rather than silently no-op'ing.
- **Walkthrough degradation misread as a regression**: mitigation — explicitly documented above that this cycle builds no observable UI, so a degraded walkthrough is expected and correct.
