# SPEC — Cycle 0022: One-command ordered Instant deploy (`npm run db:push`)

## WHY

Provisioning the live Instant app today is a two-step, order-sensitive manual ritual. An operator must run `npm run schema:push` and then `npm run perms:push` — **in that exact order** — because the permission rules reference schema-defined links/attrs (`data.ref('participant.userId')`, `data.ref('session.teacherId')`) that only resolve once the schema delta is live (AGENTS.md:22-25). Nothing enforces the ordering or the stop-on-failure semantics across the two steps. An operator who runs perms first, or who runs perms after a schema push that failed, pushes ruleset references against an app whose schema is not yet live — the perms push can be rejected or, worse, the operator proceeds believing enforcement is provisioned when the schema half never landed. The ordering guarantee lives only in prose; there is no executable artifact that makes "schema first, then perms, and never perms if schema failed" a hard, observable property.

The live push itself (against the schema-enforced shared app) and the credentialed `e2e/permissions.spec.ts` run remain an operator action requiring `instant-cli login` auth, `PUBLIC_INSTANTDB_APP_ID`, and `INSTANT_ADMIN_TOKEN` — correctly gated out of the automated, tokenless build. This cycle does not perform that live push. It delivers the ordered, fail-loud orchestrator and the operator runbook that the live push will be executed through.

## CONCRETE USER BENEFIT

After this cycle, an operator can run a single command — `npm run db:push` — and the live Instant app's schema and permission rules are pushed in the correct order, with a hard guarantee that perms are **never** pushed if the schema push failed. The operator no longer has to remember the ordering, run two commands, or manually check the first command's exit code before running the second. When the schema push fails, the operator observes the run halt with a clear message naming which step failed, and the perms push is provably never attempted.

## USABLE END-STATE

- `npm run db:push` exists and runs `schema:push` then, only on its success, `perms:push`.
- A schema-push failure halts the run with a non-zero exit and a message identifying the failed step; the perms push does not run.
- A perms-push failure (after a successful schema push) surfaces a non-zero exit with a message identifying the perms step.
- The operator runbook documents the full live procedure end to end: authenticate `instant-cli`, set env, run `npm run db:push`, then run the credentialed `e2e/permissions.spec.ts` and confirm 0 skipped.
- AGENTS.md points operators at the single `db:push` command as the canonical deploy entrypoint, with the two underlying commands retained as the building blocks.

## Objective

This cycle delivers `npm run db:push`: a single, idempotent, fail-loud orchestrator that pushes the InstantDB schema and then the permission rules to the live app in the one correct order, halting before the perms step if the schema step fails. It converts the order-sensitive two-command ritual — whose correctness today lives only in AGENTS.md prose — into one executable artifact whose ordering and stop-on-failure semantics are covered by hermetic tests runnable in tokenless CI. It also ships the operator runbook that the gated live push and credentialed permission-e2e verification (the operator action tracked by the source issue) will be executed through.

## Source Issue

`refl-0003-push-perms-schema-to-live-instant-app-an` — "Push perms + schema to live Instant app and prove permissions e2e"

## Scope

### In Scope

- A `scripts/push-db.mjs` orchestrator wired to `npm run db:push` that invokes the existing `push-schema.mjs` then `push-perms.mjs` (reusing them, not reimplementing their logic), runs perms **only** when schema exits 0, forwards the first non-zero exit code, and prints a message naming which step failed. Idempotent (each underlying push is a declarative no-op when unchanged).
- Hermetic tests (no `child_process` mocking; spawn the real orchestrator, using a `PATH`/shim-dir stub for `npx instant-cli` matching the established pattern in `pushSchema.test.ts` / `pushPerms.test.ts`) proving: (a) missing/empty `PUBLIC_INSTANTDB_APP_ID` exits non-zero before any CLI call; (b) a failing schema step halts the run non-zero and the perms step is **never** invoked; (c) on a stubbed all-success run the orchestrator invokes schema then perms in that order and exits 0.
- An operator runbook at `docs/runbooks/db-push.md` documenting the full live procedure (auth `instant-cli`, set `PUBLIC_INSTANTDB_APP_ID` + `INSTANT_ADMIN_TOKEN`, run `npm run db:push`, then run `e2e/permissions.spec.ts` and confirm 0 skipped + all denial/propagation cases pass), with an AGENTS.md pointer to `npm run db:push` as the canonical deploy entrypoint.

### Out of Scope

- Executing the actual live push against the shared schema-enforced Instant app, and running the credentialed `e2e/permissions.spec.ts` to 0-skipped green — these require `instant-cli` auth + admin token against shared infrastructure and remain the operator action the source issue tracks. This cycle delivers the command and runbook they are performed through; it does not perform them.
- Changing the permission rules in `src/lib/perms.ts` / `instant.perms.ts` or the schema in `src/lib/db.ts`.
- Altering the loud-skip gating of `e2e/permissions.spec.ts`.
- Hardening the individual CLI-rejection / spawn-error exit branches of the underlying runners — tracked separately as `refl-0021`.

## Requirements

- `npm run db:push` runs `push-schema.mjs` first and `push-perms.mjs` second; the perms step is invoked if and only if the schema step exited 0.
- The orchestrator reuses the existing runners (spawns them or imports their shared logic) rather than duplicating the `instant-cli` invocation; the single source of each push's behavior remains the existing `.mjs` runner.
- Idempotent: re-running `npm run db:push` against an unchanged schema + ruleset is a safe no-op (inherited from the declarative `instant-cli push` underneath).
- Each failure surfaces a distinct, actionable message naming the failed step (`db:push: schema step failed (exit N) …` / `db:push: perms step failed (exit N) …`) on stderr.
- **Failure behavior**: On missing/empty `PUBLIC_INSTANTDB_APP_ID`, the run exits non-zero before any network call (inherited from the underlying runner's precondition) and the perms step is not reached. On a non-zero schema push (CLI un-spawnable, auth/network rejection, or schema rejection), the orchestrator halts immediately, exits with a non-zero code, names the schema step, and **never invokes the perms push** — the live app is never left with perms pushed against an unmigrated schema. On a non-zero perms push after a successful schema push, the orchestrator exits non-zero and names the perms step. No failure is swallowed; the exit code is forwarded (never collapsed to 0). The orchestrator performs no local mutation, so an interrupted run leaves the repo unchanged.

## Acceptance Criteria

- [ ] Running `npm run db:push` with a stubbed all-success `instant-cli` on `PATH` invokes the schema push then the perms push, in that order, and exits 0 (user-observable benefit: one command provisions both in the correct order).
- [ ] When the schema step exits non-zero (stubbed failing `instant-cli` for the schema push), `npm run db:push` exits non-zero, emits a message naming the schema step, and the perms push is provably never invoked (asserted via a marker the stub writes only when the perms command runs).
- [ ] With `PUBLIC_INSTANTDB_APP_ID` empty, `npm run db:push` exits non-zero before any CLI call and does not reach the perms step.
- [ ] When the perms step exits non-zero after a successful schema step, `npm run db:push` exits non-zero and emits a message naming the perms step.
- [ ] `docs/runbooks/db-push.md` exists and documents the full live procedure including running `e2e/permissions.spec.ts` to 0-skipped; AGENTS.md references `npm run db:push` as the canonical deploy entrypoint.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run build` / `astro check` clean).

## Testing Strategy

- **Framework**: Vitest, following the existing hermetic pattern in `src/lib/pushSchema.test.ts` and `src/lib/pushPerms.test.ts` — spawn the **real** `scripts/push-db.mjs` via `spawnSync(process.execPath, [runnerPath], { env })`; **no `child_process` mocking**.
- **Stub strategy**: prepend a temporary shim directory to `PATH` in which `npx` (or `instant-cli`) resolves to a small stub script whose exit code is parameterised per scenario, and which appends a marker (e.g. to a temp file or stderr) recording each subcommand it was called with — so the test can assert both ordering and that the perms command was/was not invoked.
- **Key scenarios**: happy path (both steps succeed → exit 0, schema-before-perms order asserted); schema-step failure (→ non-zero, schema step named, perms marker absent — the ordering/halt guarantee); perms-step failure after schema success (→ non-zero, perms step named); missing app id (→ non-zero before any CLI call, perms not reached); idempotent re-run (second invocation against the success stub still exits 0).
- **E2E**: no new UI; `e2e/permissions.spec.ts` continues to skip loudly in tokenless CI. The runbook documents its credentialed execution as the operator verification step. No Playwright changes required for this cycle.

## Documentation Updates

- **AGENTS.md**: update the deploy section to name `npm run db:push` as the canonical single-command, correctly-ordered entrypoint, retaining `npm run schema:push` / `npm run perms:push` as its documented building blocks and preserving the schema-first ordering rationale.
- **docs/runbooks/db-push.md**: new operator runbook — authenticate `instant-cli`, set `PUBLIC_INSTANTDB_APP_ID` + `INSTANT_ADMIN_TOKEN`, run `npm run db:push`, then run `e2e/permissions.spec.ts` and confirm 0 skipped with every denial/propagation case passing.
- **README.md**: add a one-line pointer to `npm run db:push` and the runbook under the project's setup/deploy notes.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- Existing runners `scripts/push-schema.mjs` and `scripts/push-perms.mjs`, their canonical `resolveAppId` specs (`src/lib/pushSchema.ts`, `src/lib/pushPerms.ts`), and the `schema:push` / `perms:push` npm scripts (all present).
- The hermetic-spawn + `PATH`-shim test pattern established in `src/lib/pushSchema.test.ts` / `src/lib/pushPerms.test.ts`.
- For the live procedure documented in the runbook (operator-only, not executed this cycle): an authenticated `instant-cli login` session, `PUBLIC_INSTANTDB_APP_ID`, and `INSTANT_ADMIN_TOKEN` against the shared Instant app.
