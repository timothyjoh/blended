# Research: Cycle 0022

## Cycle Context

SPEC.md asks for a single ordered, fail-loud deploy orchestrator: a new `scripts/push-db.mjs` wired to `npm run db:push` that runs the existing `push-schema.mjs` first and `push-perms.mjs` second — invoking perms **if and only if** the schema step exits 0 — forwarding the first non-zero exit code and printing a message naming the failed step. It reuses the existing runners rather than reimplementing the `instant-cli` invocation, stays idempotent (each underlying push is a declarative no-op when unchanged), and performs no local mutation. The cycle also ships hermetic Vitest tests (spawn the real orchestrator with a `PATH`/shim stub for `instant-cli`; no `child_process` mocking) covering happy path / schema-failure-halts / missing-app-id / perms-failure, plus an operator runbook at `docs/runbooks/db-push.md` and pointers from AGENTS.md and README.md. It does **not** execute the live push or change the schema/perms rules or the loud-skip gating.

## Current Codebase State

### Relevant Components

- **Schema-push runner**: validates `PUBLIC_INSTANTDB_APP_ID`, then `spawnSync('npx', ['instant-cli', 'push', 'schema', '--app', appId], { stdio: 'inherit' })`; three non-zero exit branches (missing app id, `result.error`, `result.status !== 0`) — `scripts/push-schema.mjs:1-60`.
- **Perms-push runner**: structurally identical to the schema runner with a `push-perms:` message prefix and `push perms` subcommand — `scripts/push-perms.mjs:1-56`.
- **Canonical app-id precondition (schema)**: pure, db-free, unit-tested `resolveAppId(env)` throwing on missing/empty/whitespace id — `src/lib/pushSchema.ts:16-24`.
- **Canonical app-id precondition (perms)**: same shape, `push-perms:` prefix — `src/lib/pushPerms.ts:15-23`.
- **npm scripts**: `"schema:push": "node scripts/push-schema.mjs"`, `"perms:push": "node scripts/push-perms.mjs"` — `package.json:16-17`. No `db:push` script exists yet.
- **Schema-push hermetic test**: spawns the real `push-schema.mjs` with empty app id, asserts non-zero + `push-schema:` + `PUBLIC_INSTANTDB_APP_ID` in stderr — `src/lib/pushSchema.test.ts:23-35`.
- **Perms-push hermetic test**: same pattern for `push-perms.mjs` — `src/lib/pushPerms.test.ts:23-35`.

### Existing Patterns to Follow

- **`.mjs` runner mirrors a pure `.ts` spec**: each runner replicates the one-line `resolveAppId` from its `src/lib/push*.ts` (a `.mjs` cannot import the `.ts` without a loader); the `.ts` is the canonical unit-tested spec — `scripts/push-schema.mjs:16-31`, `src/lib/pushSchema.ts:16-24`.
- **Spawn pattern**: `spawnSync('npx', ['instant-cli', 'push', <kind>, '--app', appId], { stdio: 'inherit' })` — `scripts/push-schema.mjs:42-44`, `scripts/push-perms.mjs:38-40`.
- **Hermetic-spawn test pattern**: `runnerPath = fileURLToPath(new URL('../../scripts/<runner>.mjs', import.meta.url))`, then `spawnSync(process.execPath, [runnerPath], { env, encoding: 'utf8' })`, asserting `result.status` and `result.stderr` substrings — `src/lib/pushSchema.test.ts:6,29-33`.
- **Failure handling (existing, three legs per runner)**:
  - Missing/empty app id → `console.error(message)` + `process.exit(1)` **before** any spawn — `scripts/push-schema.mjs:34-40`.
  - `result.error` (CLI un-spawnable) → distinct message + `process.exit(1)` — `scripts/push-schema.mjs:46-52`.
  - `result.status !== 0` (CLI ran but rejected) → forwards exit code via `process.exit(result.status || 1)` (never collapsed to 0), names auth/network cause — `scripts/push-schema.mjs:54-59`.
  - Each message carries a runner-specific prefix (`push-schema:` / `push-perms:`); errors go to stderr. The same three legs of `push-schema.mjs`/`push-perms.mjs` (beyond missing-app-id) are noted as hermetically uncovered in the sibling issue — `docs/cycle/issues/todo/refl-0021-schema-push-cli-rejection-and-spawn-erro.md:10-30`.
- **Observability conventions**: failures print a single actionable line to `console.error`/stderr with a `<runner>:` prefix and the cause; the runners use `stdio: 'inherit'` so the CLI's own output streams through. No `.cycle/log.jsonl` structured events are emitted by these runners. Cycle-level events live in `.cycle/log.jsonl` (e.g. the `cycle.start` entry), written by the engine, not by these scripts.
- **Idempotency / retry-safety**: inherited from declarative `instant-cli push` (pushing an unchanged schema/ruleset is a no-op); the runners perform no local mutation, so an interrupted run leaves the repo unchanged — documented at `scripts/push-schema.mjs:12-14`, `scripts/push-perms.mjs:9-11`. No lock files or dedup keys are used by the runners.
- **Code style**: ESM, no semicolons, two-space indent, top-of-file block comment documenting failure/ordering rationale — `scripts/push-schema.mjs:1-20`.

### Dependencies & Integration Points

- **`instant-cli`** invoked via `npx instant-cli push <schema|perms> --app <id>` — `scripts/push-schema.mjs:42`, `scripts/push-perms.mjs:38`. Loads root `instant.schema.ts` / `instant.perms.ts`.
- **`PUBLIC_INSTANTDB_APP_ID`** — required env precondition for both runners — `scripts/push-schema.mjs:24`, `src/lib/pushSchema.ts:17`.
- **`INSTANT_ADMIN_TOKEN`** + authenticated `instant-cli login` — needed only for the live push and credentialed e2e (operator-only this cycle).
- **Ordering rationale documented in AGENTS.md**: "schema first, then perms" because perms reference `data.ref('participant.userId')` / `data.ref('session.teacherId')` which resolve only once the schema is live — `AGENTS.md:19-25` ("Deploy prerequisite runbook (push order)").
- **README deploy notes**: command table rows for `schema:push` / `perms:push` (`README.md:44-45`); deploy prose at `README.md:57-91`.
- **e2e/permissions.spec.ts**: drives the live data-layer permission probe; `test.skip(!adminAvailable(), …)` skips loudly when admin env unset — `e2e/permissions.spec.ts:11-14`.
- **e2e/schema-push.spec.ts**: spawns the real `push-schema.mjs` then verifies a live `writeEvent()` is accepted; same loud-skip gate — `e2e/schema-push.spec.ts:20-40`.

### Test Infrastructure

- **Framework**: Vitest (`vitest run` via `npm run test`) — `package.json:11`; config at `vitest.config.ts`.
- **Include globs**: `['src/**/*.test.ts', 'scripts/**/*.test.mjs']` — so a test placed at `scripts/*.test.mjs` is picked up, in addition to `src/lib/*.test.ts` — `vitest.config.ts` (`test.include`).
- **Test env**: `test.env.PUBLIC_INSTANTDB_APP_ID = 'test-app-id'` is injected for all Vitest runs; runner-spawning tests override env explicitly via the `spawnSync` `env` option — `vitest.config.ts`, `src/lib/pushSchema.test.ts:29-30`.
- **Conventions**: tests co-located with the pure logic in `src/lib/<name>.test.ts`; runner integration tests spawn the real `.mjs` (no `child_process` mocking). Node test environment (`environment: 'node'`).
- **Current coverage of the change area**: each runner's **missing-app-id** branch is hermetically covered (`pushSchema.test.ts:23-35`, `pushPerms.test.ts:23-35`); the `result.error` and `result.status !== 0` branches are **not** hermetically covered (only operationally via the skip-gated `e2e/schema-push.spec.ts`) — explicitly noted in `docs/cycle/issues/todo/refl-0021-schema-push-cli-rejection-and-spawn-erro.md:10-17`. No orchestrator (`push-db.mjs`) or its tests exist yet.
- **Failure-path test coverage**: present for the missing-app-id leg of both runners (asserts non-zero exit + prefixed stderr); absent for CLI-rejection / spawn-error legs in tokenless CI (tracked by `refl-0021`, out of scope here per `SPEC.md:42`). No ordering/halt test exists yet (this cycle introduces it).
- **e2e**: Playwright (`npm run test:e2e`); permission and schema-push specs skip loudly without admin env — `e2e/permissions.spec.ts:11-14`, `e2e/schema-push.spec.ts:21-24`.

## Code References

- `scripts/push-schema.mjs:23-31` — replicated `resolveAppId` (missing/empty throws).
- `scripts/push-schema.mjs:33-40` — missing-app-id branch: error before any spawn, `exit(1)`.
- `scripts/push-schema.mjs:42-44` — `spawnSync('npx', ['instant-cli','push','schema','--app',appId], { stdio:'inherit' })`.
- `scripts/push-schema.mjs:46-59` — `result.error` and `result.status !== 0` branches; exit-code forwarding.
- `scripts/push-perms.mjs:38-55` — perms equivalent of the above.
- `src/lib/pushSchema.ts:16-24` / `src/lib/pushPerms.ts:15-23` — canonical pure preconditions.
- `package.json:16-17` — `schema:push` / `perms:push` npm scripts (no `db:push`).
- `src/lib/pushSchema.test.ts:23-35` / `src/lib/pushPerms.test.ts:23-35` — hermetic missing-app-id tests + spawn pattern.
- `vitest.config.ts` — `include` covers `scripts/**/*.test.mjs`; env injects `PUBLIC_INSTANTDB_APP_ID`.
- `AGENTS.md:19-25` — push-order runbook and ordering rationale prose to update with the `db:push` pointer.
- `README.md:44-45`, `README.md:57-91` — command table + deploy prose to point at `db:push`.
- `e2e/permissions.spec.ts:11-14` — loud-skip gate the runbook references for the operator verification step.
- `e2e/schema-push.spec.ts:20-40` — existing real-runner-spawn + live-verify pattern.
- `docs/cycle/issues/todo/refl-0021-schema-push-cli-rejection-and-spawn-erro.md:10-37` — sibling issue hardening the underlying runners' CLI-rejection/spawn-error legs (explicitly out of scope for this cycle, `SPEC.md:42`).

## Open Questions

- **Reuse mechanism**: SPEC permits either spawning the existing `.mjs` runners as child processes or importing shared logic (`SPEC.md:33,47`). The runners are top-level scripts (no exported `run()` function — they execute on import via `process.exit`), so spawning each as a child process (`spawnSync(process.execPath, [runnerPath], { env, stdio:'inherit' })`) is the lower-friction path that matches the existing test pattern; the planner must confirm which approach to take.
- **Stub/shim location**: the hermetic test must place a `PATH`-shim that intercepts `npx`/`instant-cli` and records subcommands + a perms-invocation marker (`SPEC.md:64-66`). The planner must decide where the shim and its marker file live (temp dir vs. fixture) and whether the orchestrator test goes in `scripts/*.test.mjs` or `src/lib/*.test.ts` (both are in the Vitest `include`).
- **Exact failure-message wording**: SPEC suggests `db:push: schema step failed (exit N) …` / `db:push: perms step failed (exit N) …` (`SPEC.md:49`); the planner should fix the precise strings the tests will assert.
