# Implementation Plan: Cycle 0022

## Overview
Deliver `npm run db:push`: a single, idempotent, fail-loud orchestrator (`scripts/push-db.mjs`) that runs the existing schema-push then perms-push runners in the one correct order, invoking perms **if and only if** the schema step exited 0, forwarding the first non-zero exit code, and naming the failed step — plus hermetic Vitest coverage of the ordering/halt guarantee and an operator runbook.

## Current State (from Research)
- Two structurally-identical runners exist: `scripts/push-schema.mjs` and `scripts/push-perms.mjs`. Each validates `PUBLIC_INSTANTDB_APP_ID` (replicating its canonical `resolveAppId` from `src/lib/push{Schema,Perms}.ts`), then `spawnSync('npx', ['instant-cli','push',<kind>,'--app',appId], { stdio:'inherit' })`, with three non-zero exit legs (missing app id before any spawn; `result.error`; `result.status !== 0` forwarded). They perform no local mutation and are declaratively idempotent.
- npm scripts `schema:push` / `perms:push` exist (`package.json:16-17`); **no `db:push` exists**.
- Hermetic test pattern: spawn the real `.mjs` via `spawnSync(process.execPath, [runnerPath], { env, encoding:'utf8' })` and assert `result.status` + `result.stderr` substrings (`src/lib/pushSchema.test.ts:23-35`).
- Vitest `include` is `['src/**/*.test.ts','scripts/**/*.test.mjs']`, and injects `PUBLIC_INSTANTDB_APP_ID='test-app-id'` (`vitest.config.ts:11-13`).
- Ordering rationale (perms reference schema-defined refs) lives in `AGENTS.md:19-25`; deploy notes in `README.md:44-45,57-91`.
- The CLI-rejection / spawn-error legs of the underlying runners are hermetically uncovered, tracked by `refl-0021` — **out of scope here**.

## Desired End State
- `scripts/push-db.mjs` exists and is wired to `npm run db:push` in `package.json`.
- Running `npm run db:push` spawns the schema runner; only on its exit 0 spawns the perms runner; forwards the first non-zero exit; on failure prints a step-naming message to stderr.
- `scripts/push-db.test.mjs` proves: happy-path ordering (schema before perms, exit 0), schema-failure-halts (non-zero, schema named, perms marker absent), missing-app-id (non-zero before any CLI call, perms not reached), perms-failure-after-schema (non-zero, perms named), idempotent re-run (second success run still exits 0).
- `docs/runbooks/db-push.md` documents the full live procedure including running `e2e/permissions.spec.ts` to 0-skipped.
- `AGENTS.md` and `README.md` point at `npm run db:push` as the canonical deploy entrypoint, retaining the two underlying commands as building blocks.
- Verify: `npm run test` green, `npm run build` / `astro check` clean.

## What We're NOT Doing
- Not executing the actual live push against the shared Instant app, and not running the credentialed `e2e/permissions.spec.ts` to green — operator-only, gated out of tokenless CI.
- Not changing the permission rules (`src/lib/perms.ts` / `instant.perms.ts`) or the schema (`src/lib/db.ts` / `instant.schema.ts`).
- Not altering the loud-skip gating of `e2e/permissions.spec.ts` or `e2e/schema-push.spec.ts`.
- Not hardening the individual CLI-rejection / spawn-error exit branches of the underlying runners (tracked by `refl-0021`).
- Not reimplementing the `instant-cli` invocation — the orchestrator reuses the existing runners.
- No new UI; no Playwright changes.

## Implementation Approach
**Reuse mechanism (resolves RESEARCH open question):** spawn each existing runner as a child process via `spawnSync(process.execPath, [runnerPath], { env, stdio:'inherit' })`. The runners are top-level scripts that execute on import and call `process.exit` — they export no `run()` function — so child-process spawning is the lower-friction path, keeps each runner the single source of truth for its push behavior, and matches the established hermetic test pattern. The orchestrator adds **no** duplicated `resolveAppId` logic: the missing-app-id precondition is inherited from the schema runner, which exits 1 before any spawn, so the orchestrator naturally halts before reaching perms.

**Control flow:** spawn schema runner → if `result.error` or `result.status !== 0`, print the schema-step message and exit with `result.status || 1`; otherwise spawn perms runner → on failure print the perms-step message and exit with its code; otherwise exit 0.

**Failure-message wording (resolves RESEARCH open question):**
- Schema leg: `db:push: schema step failed (exit ${code}) — halting; perms NOT pushed (schema must be live before perms refs resolve)`
- Perms leg: `db:push: perms step failed (exit ${code})`
- A successful schema step emits an informational stdout line `db:push: schema pushed — pushing perms…` for observability.

**Test placement & shim (resolves RESEARCH open question):** the orchestrator test lives at `scripts/push-db.test.mjs` (co-located with the runner, within the `scripts/**/*.test.mjs` include glob). It uses `fs.mkdtempSync(path.join(os.tmpdir(), …))` to create a throwaway shim dir containing an executable `npx` stub (node shebang, `chmod 0o755`) prepended to `PATH`. The stub reads the push kind from `argv` (`schema` / `perms`), appends a line to a marker file (path via `STUB_MARKER` env), and exits with a per-kind code from env (`STUB_SCHEMA_EXIT` / `STUB_PERMS_EXIT`, default `0`). The test asserts ordering and presence/absence of the perms line by reading the marker file.

## Failure & Resilience Decisions

**Task 1 — `scripts/push-db.mjs` (subprocess execution):**
- **Failure modes:** (a) schema child un-spawnable (`result.error`) → print schema-step message, exit 1, never spawn perms. (b) schema child non-zero (`result.status !== 0`, includes missing-app-id exit 1, CLI rejection, network/auth) → print schema-step message naming exit code, exit `result.status || 1`, never spawn perms. (c) perms child un-spawnable or non-zero after schema success → print perms-step message, exit `result.status || 1`. The first non-zero exit is **forwarded, never collapsed to 0**.
- **Idempotency:** safe to re-run. The orchestrator performs no local mutation; each underlying `instant-cli push` is declarative (unchanged schema/ruleset → no-op). An interrupted run leaves the repo unchanged. The engine can retry/restart the step freely. No lock file needed.
- **Observability:** each failure prints one actionable line to `console.error` with the `db:push:` prefix and the failed step + forwarded exit code; the success transition prints an info line; `stdio:'inherit'` streams each runner's (and the CLI's) own output through.
- **No silent failure:** every branch ends in `process.exit(non-zero)` or the natural exit-0 only after both children succeeded; no `catch` swallows an error.

**Task 2 — `package.json` script wiring:** N/A — pure config (declarative npm script).

**Task 3 — `scripts/push-db.test.mjs` (filesystem writes + subprocess):**
- **Failure modes:** temp-dir / shim creation could fail → surfaced as a thrown test error (no try/catch swallowing); a flaky shim exit is deterministic (parameterised env).
- **Idempotency:** each test creates its own `mkdtemp` dir (unique) and cleans up in an `afterEach`/`finally`; re-runs are independent.
- **Observability:** failed assertions show the marker-file contents and `result.stderr`.
- **No silent failure:** assertions are explicit; no empty catch blocks.

**Tasks 4–5 — docs (`docs/runbooks/db-push.md`, `AGENTS.md`, `README.md`):** N/A — documentation only, no runtime failure surface.

---

## Task 1: Create the ordered fail-loud orchestrator `scripts/push-db.mjs`

### Overview
Add the orchestrator that spawns the schema runner, then the perms runner only on schema success, forwarding the first non-zero exit and naming the failed step.

### Changes Required
**File**: `scripts/push-db.mjs` (new)
**Changes**: ESM, no semicolons, two-space indent, top-of-file block comment documenting ordering + stop-on-failure + idempotency rationale (mirroring `push-schema.mjs:1-20`). Resolve sibling runner paths via `new URL('./push-schema.mjs', import.meta.url)` and `fileURLToPath`. Core logic:

```js
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function runStep(runnerPath, label) {
  const result = spawnSync(process.execPath, [runnerPath], { stdio: 'inherit' })
  if (result.error) {
    console.error(`db:push: ${label} step failed (could not spawn: ${result.error.message})`)
    process.exit(1)
  }
  if (result.status !== 0) return result.status || 1
  return 0
}

const schemaPath = fileURLToPath(new URL('./push-schema.mjs', import.meta.url))
const permsPath = fileURLToPath(new URL('./push-perms.mjs', import.meta.url))

const schemaExit = runStep(schemaPath, 'schema')
if (schemaExit !== 0) {
  console.error(
    `db:push: schema step failed (exit ${schemaExit}) — halting; perms NOT pushed (schema must be live before perms refs resolve)`
  )
  process.exit(schemaExit)
}

console.log('db:push: schema pushed — pushing perms…')

const permsExit = runStep(permsPath, 'perms')
if (permsExit !== 0) {
  console.error(`db:push: perms step failed (exit ${permsExit})`)
  process.exit(permsExit)
}
```

The schema runner's own missing-app-id precondition (exit 1 before any spawn) gives us the "missing app id → halt before perms" behavior without duplicating `resolveAppId`.

### Success Criteria
- [ ] File parses and runs under Node ESM (`node scripts/push-db.mjs` reaches the schema runner).
- [ ] Perms runner is spawned only when the schema step returns 0.
- [ ] First non-zero exit is forwarded (never collapsed to 0).
- [ ] Failure paths print the step-naming `db:push:` messages to stderr; no error swallowed.

---

## Task 2: Wire `npm run db:push`

### Overview
Expose the orchestrator as the canonical npm entrypoint.

### Changes Required
**File**: `package.json`
**Changes**: add to `scripts`, beside the existing two (`package.json:16-17`):
```json
"db:push": "node scripts/push-db.mjs"
```
Retain `schema:push` and `perms:push` as documented building blocks.

### Success Criteria
- [ ] `npm run db:push` resolves and executes `scripts/push-db.mjs`.
- [ ] `schema:push` / `perms:push` remain present.

---

## Task 3: Hermetic orchestrator tests `scripts/push-db.test.mjs`

### Overview
Spawn the real orchestrator with a `PATH`-shim `npx` stub; prove ordering, schema-failure-halt, missing-app-id, perms-failure, and idempotent re-run. No `child_process` mocking.

### Changes Required
**File**: `scripts/push-db.test.mjs` (new)
**Changes**: Vitest. Helper builds a temp shim dir per scenario:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const runnerPath = fileURLToPath(new URL('./push-db.mjs', import.meta.url))
const dirs = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function makeShim() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dbpush-'))
  dirs.push(dir)
  const marker = path.join(dir, 'calls.log')
  const npx = path.join(dir, 'npx')
  // node shim: record the push kind, exit per-kind code from env
  writeFileSync(npx, [
    '#!/usr/bin/env node',
    'const fs = require("node:fs")',
    'const kind = process.argv[4]', // npx instant-cli push <kind> --app <id>
    'fs.appendFileSync(process.env.STUB_MARKER, kind + "\\n")',
    'const code = kind === "schema" ? Number(process.env.STUB_SCHEMA_EXIT||0) : Number(process.env.STUB_PERMS_EXIT||0)',
    'process.exit(code)',
  ].join('\n'))
  chmodSync(npx, 0o755)
  return { dir, marker }
}

function run({ schemaExit = 0, permsExit = 0, appId = 'test-app-id' } = {}) {
  const { dir, marker } = makeShim()
  const env = {
    ...process.env,
    PATH: dir + path.delimiter + process.env.PATH,
    PUBLIC_INSTANTDB_APP_ID: appId,
    STUB_MARKER: marker,
    STUB_SCHEMA_EXIT: String(schemaExit),
    STUB_PERMS_EXIT: String(permsExit),
  }
  const result = spawnSync(process.execPath, [runnerPath], { env, encoding: 'utf8' })
  const calls = existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n').filter(Boolean) : []
  return { result, calls }
}
```

Scenarios:
- **happy path**: `run()` → `result.status === 0`; `calls` equals `['schema','perms']` (order asserted).
- **schema-failure-halts**: `run({ schemaExit: 3 })` → `result.status !== 0`; `result.stderr` contains `db:push: schema step failed`; `calls` is `['schema']` (perms marker **absent**).
- **missing-app-id**: `run({ appId: '' })` → `result.status !== 0`; `result.stderr` contains `push-schema:` and `PUBLIC_INSTANTDB_APP_ID`; `calls` is `[]` (no CLI call at all, perms not reached).
- **perms-failure-after-schema**: `run({ permsExit: 4 })` → `result.status !== 0`; `result.stderr` contains `db:push: perms step failed`; `calls` equals `['schema','perms']`.
- **idempotent re-run**: call `run()` twice (fresh shim each) → both `result.status === 0` and both produce `['schema','perms']`.

### Success Criteria
- [ ] All five scenarios pass under `npm run test`.
- [ ] No `child_process` mocking; the real orchestrator and real runners are spawned.
- [ ] Ordering (schema before perms) and perms-not-invoked-on-schema-failure are asserted via the marker file.
- [ ] Temp shim dirs are cleaned up in `afterEach`.

---

## Task 4: Operator runbook `docs/runbooks/db-push.md`

### Overview
Document the full live deploy procedure the gated push is performed through.

### Changes Required
**File**: `docs/runbooks/db-push.md` (new)
**Changes**: Steps in order: (1) `instant-cli login` (authenticate); (2) set `PUBLIC_INSTANTDB_APP_ID` and `INSTANT_ADMIN_TOKEN`; (3) run `npm run db:push` (state the schema-first / perms-only-on-schema-success guarantee and that a failure halts before perms); (4) run the credentialed `e2e/permissions.spec.ts` and **confirm 0 skipped** with every denial/propagation case passing. Note idempotency (safe to re-run) and the failure messages the operator should expect (`db:push: schema step failed …` / `db:push: perms step failed …`).

### Success Criteria
- [ ] File exists, covers auth → env → `db:push` → permission-e2e-to-0-skipped end to end.

---

## Task 5: Update `AGENTS.md` and `README.md` pointers

### Overview
Name `npm run db:push` as the canonical single-command, correctly-ordered deploy entrypoint.

### Changes Required
**File**: `AGENTS.md` (deploy/push-order section, `:19-25`)
**Changes**: present `npm run db:push` as the canonical entrypoint; retain `schema:push` / `perms:push` as documented building blocks; preserve the schema-first ordering rationale (perms reference `data.ref('participant.userId')` / `data.ref('session.teacherId')`).

**File**: `README.md` (command table `:44-45`, deploy prose `:57-91`)
**Changes**: add a one-line pointer to `npm run db:push` and to `docs/runbooks/db-push.md`.

### Success Criteria
- [ ] AGENTS.md references `npm run db:push` as canonical with the two underlying commands retained.
- [ ] README points at `db:push` and the runbook.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Running `npm run db:push` with a stubbed all-success `instant-cli` on `PATH` invokes the schema push then the perms push, in that order, and exits 0 (user-observable benefit: one command provisions both in the correct order).` | Task 1, Task 2, Task 3 | Happy-path scenario asserts `calls === ['schema','perms']`, exit 0 |
| `[ ] When the schema step exits non-zero (stubbed failing `instant-cli` for the schema push), `npm run db:push` exits non-zero, emits a message naming the schema step, and the perms push is provably never invoked (asserted via a marker the stub writes only when the perms command runs).` | Task 1, Task 3 | schema-failure-halts scenario: non-zero, `db:push: schema step failed`, perms marker absent |
| `[ ] With `PUBLIC_INSTANTDB_APP_ID` empty, `npm run db:push` exits non-zero before any CLI call and does not reach the perms step.` | Task 1, Task 3 | missing-app-id scenario: inherited from schema runner precondition; `calls === []` |
| `[ ] When the perms step exits non-zero after a successful schema step, `npm run db:push` exits non-zero and emits a message naming the perms step.` | Task 1, Task 3 | perms-failure scenario: non-zero, `db:push: perms step failed`, `calls === ['schema','perms']` |
| `[ ] `docs/runbooks/db-push.md` exists and documents the full live procedure including running `e2e/permissions.spec.ts` to 0-skipped; AGENTS.md references `npm run db:push` as the canonical deploy entrypoint.` | Task 4, Task 5 | Runbook + AGENTS.md pointer |
| `[ ] All existing tests still pass.` | Task 3 | New test added without altering existing; verified via `npm run test` |
| `[ ] No compiler/linter warnings introduced (`npm run build` / `astro check` clean).` | Task 1–5 | Verified via `npm run build` / `astro check` after changes |

---

## Testing Strategy

### Unit Tests
- No new pure-logic module is introduced (the orchestrator is glue over child processes; the canonical `resolveAppId` specs remain unchanged and already unit-tested in `src/lib/pushSchema.test.ts` / `src/lib/pushPerms.test.ts`).
- **Failure-path tests** (all in `scripts/push-db.test.mjs`, spawning the real orchestrator):
  - schema-step non-zero exit → orchestrator halts non-zero, schema named, perms marker absent.
  - missing/empty `PUBLIC_INSTANTDB_APP_ID` → non-zero before any CLI call (`calls === []`), perms not reached.
  - perms-step non-zero after schema success → non-zero, perms named.
  - shim records subcommands to a marker file, exercising real I/O (temp dir + executable shim) rather than mocking `child_process`.
- **Mocking strategy**: none for `child_process` — the real orchestrator and real runners run; only `npx`/`instant-cli` is replaced by a `PATH`-shim stub, matching `pushSchema.test.ts` / `pushPerms.test.ts`.

### Integration / E2E Tests
- Happy-path and idempotent-re-run scenarios in `scripts/push-db.test.mjs` are end-to-end over the real orchestrator → real runners → stubbed CLI.
- No new Playwright tests. `e2e/permissions.spec.ts` continues to skip loudly in tokenless CI; the runbook documents its credentialed execution as the operator verification step.

## Walkthrough Plan
- **No observable UI this cycle.** This cycle delivers a CLI orchestrator (`npm run db:push`), hermetic tests, and operator docs — it builds **no** new routes or screens and changes no UI behavior. Per SPEC's Testing Strategy ("E2E: no new UI"), there is nothing to demonstrate in a browser.
- The `walkthrough_capture` step may therefore legitimately degrade; a homepage-only fallback is not a meaningful demonstration of this cycle and is acknowledged here rather than silently produced.
- **CLI evidence in lieu of a screen walkthrough** (the real demonstration of what this cycle built): the orchestrator's behavior is proven by `scripts/push-db.test.mjs` — the schema-before-perms ordering, the schema-failure-halt (perms never invoked), the missing-app-id pre-CLI exit, and the perms-failure naming — runnable in tokenless CI via `npm run test`. The live operator flow is captured in `docs/runbooks/db-push.md`.

## Risk Assessment
- **`npx` shim not resolved on `PATH` in the test**: spawning without a shell searches `PATH` directly; the node-shebang stub is `chmod 0o755` and the shim dir is prepended to `PATH`. Mitigation: assert via the marker file that the stub actually ran (a missing marker fails the test loudly rather than passing silently).
- **`argv` index for the push kind in the stub**: `npx instant-cli push <kind> --app <id>` → `<kind>` is `process.argv[4]`. Mitigation: the happy-path test asserts the exact `['schema','perms']` sequence, catching any index drift immediately.
- **Node-spawns-node `result.error`**: extremely unlikely (same `process.execPath`), but handled — `runStep` treats `result.error` as a step failure with a named message and exit 1, so it is never swallowed.
- **Idempotent re-run correctness**: each test scenario uses a fresh shim/marker, so the re-run assertion reflects true re-run safety, not residual state.
