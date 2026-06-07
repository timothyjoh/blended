## Summary

Cycle 0022 delivers `npm run db:push` — a single, ordered, fail-loud, idempotent orchestrator that pushes the live Instant app's schema then perms in the one correct order, invoking perms **if and only if** the schema step exited 0.

### What was built

- **`scripts/push-db.mjs`** (new, 70 lines): the orchestrator. A `runStep(runnerPath, label)` helper spawns each existing sibling runner via `spawnSync(process.execPath, [runnerPath], { stdio: 'inherit' })` — reusing `push-schema.mjs` / `push-perms.mjs` as the single source of truth for each push (no duplicated `instant-cli` invocation, no duplicated `resolveAppId`). Control flow: spawn schema → on `result.error` print a `db:push: schema step failed (could not spawn …)` message and exit 1; on non-zero status print `db:push: schema step failed (exit N) — halting; perms NOT pushed (schema must be live before perms refs resolve)` and exit the forwarded code, **never reaching perms**; on success print an info line, then spawn perms, surfacing `db:push: perms step failed (exit N)` on its non-zero exit. The missing-app-id precondition is inherited from the schema runner (which exits 1 before any spawn), so the orchestrator halts before perms with no duplicated logic.
- **`package.json`** (+1 line): added `"db:push": "node scripts/push-db.mjs"` beside the retained `schema:push` / `perms:push` building blocks.
- **`scripts/push-db.test.mjs`** (new, ~120 lines): six hermetic Vitest scenarios spawning the **real** orchestrator → real runners → a `PATH`-shim `npx` stub (no `child_process` mocking). The stub records each push kind to a marker file and exits per-kind from env, so ordering and perms-not-invoked are asserted by reading the marker.
- **`docs/runbooks/db-push.md`** (new): operator runbook — `instant-cli login` → set `PUBLIC_INSTANTDB_APP_ID` + `INSTANT_ADMIN_TOKEN` → `npm run db:push` → run `e2e/permissions.spec.ts` and confirm 0 skipped with every denial/propagation case passing; documents expected success/failure messages and idempotency.
- **`AGENTS.md`** / **`README.md`**: deploy sections now name `npm run db:push` as the canonical single-command entrypoint, retaining the two underlying commands as documented building blocks and preserving the schema-first ordering rationale; README command table + a deploy callout point at the runbook.
- **`docs/cycle/0022-…/walkthrough.mjs`** (new): drives the real orchestrator hermetically (schema-failure-halt proof + ordered happy-path proof, logged to stderr), then captures the post-provisioning `writeEvent()` acceptance via the admin magic-code seam (`01-login-ready` → `02-dashboard-ready` → `03-writeevent-accepted`), degrading loudly to the real `/login` surface when the admin env is unset. CLI-only cycle: no home-page fallback.

### PLAN.md tasks complete

All five: Task 1 (orchestrator), Task 2 (npm wiring), Task 3 (hermetic tests), Task 4 (runbook), Task 5 (AGENTS.md + README pointers). All seven SPEC acceptance bullets are covered.

### Tests

Command: `npm test` (`vitest run`) → **13 test files, 473 tests passed**. The new `scripts/push-db.test.mjs` contributes 6 passing tests.

### Coverage

Command: `npm run test:coverage` → Statements **91.46%** (450/492), Branches **85.98%** (448/521), Functions **87.5%** (70/80), Lines **92.9%** (393/423). No regression: the coverage scope is the `src/lib` modules, none of which were touched this cycle (the orchestrator is a `.mjs` script verified hermetically by spawning the real process, matching the established `pushSchema.test.ts` / `pushPerms.test.ts` pattern, so its lines are not v8-instrumented — consistent with the existing runners). Per-file numbers are unchanged from the base branch.

### Build / lint

`npm run build` (`astro check && astro build`) exited **0**. The pre-existing CSS hint (`flex`) and the environmental `@astrojs/vercel` Node-version WARN are not introduced by this cycle (no CSS/Astro files were touched — only `.mjs`, `.md`, and `package.json`). No new compiler/linter warnings.

### Failure modes handled & failure-path tests

- **Schema-step failure halts before perms** — `runStep` returns the non-zero status; the orchestrator prints the schema-step message and exits the forwarded code without spawning perms. Test: `schema failure HALTS … perms is NEVER invoked` asserts `status !== 0`, the `db:push: schema step failed` message, and `calls === ['schema']` (perms marker absent).
- **Exit code forwarded, never collapsed to 0** — test `forwards the schema exit code` asserts `status === 3` for a `schemaExit: 3` stub.
- **Missing/empty `PUBLIC_INSTANTDB_APP_ID`** — inherited from the schema runner's pre-spawn precondition; the orchestrator never reaches perms. Test `empty PUBLIC_INSTANTDB_APP_ID exits non-zero BEFORE any CLI call` asserts non-zero, the `push-schema:` / `PUBLIC_INSTANTDB_APP_ID` message, and `calls === []`.
- **Perms-step failure after schema success** — test `perms failure after a successful schema push` asserts non-zero, the `db:push: perms step failed` message, and `calls === ['schema','perms']`.
- **Un-spawnable child** — `result.error` is treated as a named step failure with exit 1, never swallowed.
- **Idempotency** — orchestrator performs no local mutation; test `is idempotent: a re-run … still exits 0` runs it twice (fresh shim each) asserting both exit 0 with `['schema','perms']`. Temp shim dirs are cleaned in `afterEach`.

No silent failures introduced: every branch ends in `process.exit(non-zero)` or the natural exit-0 only after both children succeeded; no empty catch, no ignored rejection, no discarded exit code.

### Deviations from PLAN.md

None material. Added one extra `db:push: schema + perms pushed — deploy provisioning complete` success line for observability, and two extra test scenarios beyond the plan's five (explicit exit-code-forwarding assertion; the plan's idempotent re-run). The walkthrough additionally drives the real orchestrator hermetically (the plan noted CLI-only with no UI) so the screenshots are backed by a genuine ordering proof rather than a home-page fallback.

### Deferred / follow-up

- The actual live push against the shared Instant app and the credentialed `e2e/permissions.spec.ts` to 0-skipped remain the operator action the source issue tracks (out of scope; performed through the new runbook).
- Hardening the individual CLI-rejection / spawn-error exit branches of the underlying runners remains tracked by `refl-0021` (out of scope).

## Touched Files
- scripts/push-db.mjs
- scripts/push-db.test.mjs
- package.json
- docs/runbooks/db-push.md
- AGENTS.md
- README.md
- docs/cycle/0022-feature-push-perms-schema-to-live-instant-app-an/walkthrough.mjs
