Verification complete: build exits 0 (the only WARN is the pre-existing `@astrojs/vercel` Node-version notice, not introduced by this cycle — no Astro/CSS files touched), 473 tests pass, coverage shows no regression. All doc claims are backed. Producing the review.

# Review: Cycle 0022

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, tightly-scoped cycle. `scripts/push-db.mjs` is a small, fail-loud orchestrator that reuses the existing schema/perms runners by spawning them as child processes — no duplicated `instant-cli` invocation, no duplicated `resolveAppId`. Every SPEC acceptance bullet is implemented and covered by a hermetic, no-mock test. Build is clean, all 473 tests pass, coverage is unchanged from base.

### Findings
1. **Reuse / single-source-of-truth**: Orchestrator spawns the real `push-schema.mjs` then `push-perms.mjs` rather than reimplementing them; the missing-app-id precondition is correctly inherited from the schema runner (exit 1 before any spawn) — `scripts/push-db.mjs:49-66`.
2. **Fail-loud, no swallowed errors**: Every branch ends in `process.exit(non-zero)` with a step-naming `db:push:` message, or the natural exit 0 only after both children succeed. The first non-zero exit is forwarded, never collapsed to 0 — `scripts/push-db.mjs:45,57,65`. An un-spawnable child is reported with the step name and exit 1, never ignored — `scripts/push-db.mjs:39-44`.
3. **Stop-on-failure guarantee**: Perms is reached only when `schemaExit === 0`; a non-zero schema step halts before the perms spawn — `scripts/push-db.mjs:52-58`. This is the core ordering invariant the SPEC demands and it is structurally enforced, not conventional.
4. **Idempotency**: Orchestrator performs no local mutation; safety is inherited from the declarative `instant-cli push` underneath and documented in the header block — `scripts/push-db.mjs:27-29`. An interrupted run leaves the repo unchanged.
5. **Style adherence**: ESM, no semicolons, two-space indent, top-of-file rationale block comment — matches `scripts/push-schema.mjs:1-20` exactly (RESEARCH pattern).
6. **Minor (defensive leg, untested)**: The orchestrator's own `result.error` (un-spawnable child) branch — `scripts/push-db.mjs:39-44` — has no hermetic test. This is a node-spawns-node case (same `process.execPath`) that is near-impossible to trigger, and the PLAN's Risk Assessment acknowledges it. Not a defect; noted for completeness.

### Spec Compliance Checklist
- [x] `npm run db:push` exists and runs schema then perms — `package.json:18`, `scripts/push-db.mjs:52-66`
- [x] Perms invoked iff schema exited 0 — `scripts/push-db.mjs:52-58`
- [x] Schema-push failure halts non-zero, names the step, perms never run — `scripts/push-db.mjs:53-57`; test `scripts/push-db.test.mjs:72-79`
- [x] Empty `PUBLIC_INSTANTDB_APP_ID` exits non-zero before any CLI call — inherited from `push-schema.mjs:33-40`; test `scripts/push-db.test.mjs:81-88` (`calls === []`)
- [x] Perms-push failure after schema success surfaces non-zero + perms-step message — `scripts/push-db.mjs:62-65`; test `scripts/push-db.test.mjs:90-95`
- [x] Exit code forwarded, never collapsed to 0 — `scripts/push-db.mjs:45,57,65`; test `scripts/push-db.test.mjs:97-100`
- [x] `docs/runbooks/db-push.md` documents auth → env → `db:push` → `e2e/permissions.spec.ts` to 0-skipped — `docs/runbooks/db-push.md:37-104`
- [x] AGENTS.md / README.md point at `npm run db:push` as canonical entrypoint, retaining building blocks — `AGENTS.md:21-28`, `README.md:44-46,84-90`
- [x] All existing tests pass — 473/473
- [x] Build / `astro check` clean — `npm run build` exit 0 (only the pre-existing environmental Vercel Node-version WARN, not introduced this cycle)
- [x] SPEC has a populated `## Acceptance Criteria` section — `SPEC.md:52-60` (7 testable bullets)
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting all 7 AC bullets verbatim with covering tasks — `PLAN.md:236-247`
- [x] CONCRETE USER BENEFIT realizable: one command provisions both pushes in order with a hard never-perms-if-schema-failed guarantee — proven end-to-end by `scripts/push-db.test.mjs`. The actual live push is correctly out of scope (operator action, gated out of tokenless CI).

## Adversarial Test Review

### Summary
Strong. Tests spawn the **real** orchestrator → **real** runners → a PATH-shim `npx` stub, with **zero** `child_process` mocking. Ordering and the perms-never-invoked guarantee are asserted via a marker file the stub writes, so the tests verify real process behavior, not mock interactions.

### Findings
1. **No mock abuse**: Only the external `npx`/`instant-cli` is replaced (a temp PATH shim, `chmod 0o755`); the orchestrator and both runners execute for real — `scripts/push-db.test.mjs:26-46`.
2. **Failure paths covered, not just happy path**: schema-failure-halt, perms-failure, missing-app-id, and explicit exit-code forwarding are all tested — `scripts/push-db.test.mjs:72-100`.
3. **Strong assertions**: ordering asserted as exact sequence `toEqual(['schema','perms'])`; the halt guarantee asserts the perms marker is **absent** (`toEqual(['schema'])` + `not.toContain('perms')`); forwarding asserts the precise code `toBe(3)` — `scripts/push-db.test.mjs:69,77-78,99`. No weak `toBeTruthy()` placeholders.
4. **Boundary condition**: empty app id verifies `calls === []` — no CLI call at all — `scripts/push-db.test.mjs:81-88`.
5. **Test independence**: each scenario builds its own `mkdtempSync` shim/marker and cleans up in `afterEach` — `scripts/push-db.test.mjs:18-20,27-28`. The idempotent-re-run test uses a fresh shim per call, so it reflects true re-run safety, not residual state — `scripts/push-db.test.mjs:102-109`.
6. **Minor gap (non-blocking)**: the un-spawnable-child legs (`result.error`) of both the orchestrator and the underlying runners are not hermetically exercised — the runner legs are explicitly tracked out-of-scope by `refl-0021` (`SPEC.md:42`), and the orchestrator leg is a near-impossible node-spawns-node failure.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`)
- Line / branch / function: Lines 92.9% (393/423), Branches 85.98% (448/521), Functions 87.5% (70/80), Statements 91.46% (450/492)
- Regressions vs base (per-file): none — coverage scope is `src/lib/*`, and no `src/lib` file was touched this cycle. `admin.ts`, `db.ts`, `embed.ts`, `sessions.ts`, `theme.ts`, `utils.ts` percentages are unchanged.
- New code without tests: none material. The orchestrator (`scripts/push-db.mjs`, a `.mjs` glue script) is not v8-instrumented in the `src/lib`-scoped coverage run, consistent with the existing `push-schema.mjs` / `push-perms.mjs` runners; it is verified hermetically by spawning the real process in `scripts/push-db.test.mjs` (6 passing tests).
- Specific scenarios missing tests: only the defensive `result.error` (un-spawnable child) legs — noted above as near-untriggerable and partly out-of-scope (`refl-0021`).

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `npm run db:push` command exists | `README.md:44` | `package.json:18` | OK |
| `db:push` runs schema first, then perms iff schema exited 0 | `AGENTS.md:26` | `scripts/push-db.mjs:52-66` | OK |
| Failure message `db:push: schema step failed (exit N) — halting; perms NOT pushed …` | `AGENTS.md:26` | `scripts/push-db.mjs:54-56` | OK |
| Failure message `db:push: perms step failed (exit N)` | `AGENTS.md:26` | `scripts/push-db.mjs:64` | OK |
| First non-zero exit forwarded, never collapsed to 0 | `AGENTS.md:26` | `scripts/push-db.mjs:45,57,65` | OK |
| Success output `db:push: schema pushed — pushing perms…` / `… deploy provisioning complete` | `docs/runbooks/db-push.md:67-68` | `scripts/push-db.mjs:60,68` | OK |
| Missing/empty app id: `push-schema: PUBLIC_INSTANTDB_APP_ID is missing or empty …`, halts before perms | `docs/runbooks/db-push.md:76` | `scripts/push-schema.mjs:25-30` | OK |
| `e2e/permissions.spec.ts` skips loudly when `INSTANT_ADMIN_TOKEN` absent | `docs/runbooks/db-push.md:95` | `e2e/permissions.spec.ts:11-14` | OK |
| Denial/propagation cases (owning-teacher mutate, participant append, non-owner denial) | `docs/runbooks/db-push.md:99-101` | `src/lib/perms.ts:92,156-158` | OK |
| Runbook link target exists | `README.md:90`, `AGENTS.md:26` | `docs/runbooks/db-push.md:1` | OK |

No unbacked claims.
