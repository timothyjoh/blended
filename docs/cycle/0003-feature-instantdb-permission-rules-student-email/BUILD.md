E2e gate: **1 passed, 10 skipped loudly** — exactly as designed (the ungated synchronous invalid-write failure-path test runs; the live-app suites skip loudly without `INSTANT_ADMIN_TOKEN`, never false-green). All quality gates verified. Producing the build summary.

## Summary

This cycle moved two SPEC-mandated security invariants — student email privacy and session-state write authorization — from UI convention into committed, pushable InstantDB permission rules, and proved them from a real signed-in browser context.

**Files created (9):** `src/lib/perms.ts` (90 lines — the single source of permission rules, a pure default-exported object), `instant.perms.ts` (6 lines — root CLI adapter re-exporting the source), `src/lib/perms.test.ts` (78 lines — structural guard locking every rule's semantics + the re-export identity), `src/lib/pushPerms.ts` (28 lines — pure `resolveAppId` precondition), `scripts/push-perms.mjs` (62 lines — fail-loud, idempotent push runner), `src/lib/pushPerms.test.ts` (39 lines — unit + no-network integration test of the missing-credentials exit), `src/components/PermsProbe.tsx` (175 lines — dev-only raw read/write probe), `src/pages/dev/perms-probe.astro` (31 lines — production-gated probe route), `e2e/permissions.spec.ts` (160 lines — the primary two-user live-app gate).

**Files modified (8):** `src/lib/db.ts` (added denormalized `sessionResources.teacherId` ownership field; removed `participants.email` so client-readable roster rows carry no email — privacy is structural since InstantDB view rules are row-level), `package.json` (added `perms:push` script), `e2e/support/auth.ts` (extracted shared `signInViaUi` + `freshEmail` seam), `e2e/auth.spec.ts` (reuse the shared seam; behavior unchanged), `src/components/EventSpineHarness.tsx` (writes now as the signed-in user via `useAuth()`; `harness-needs-auth` notice + disabled create/join when signed out), `e2e/event-spine.spec.ts` (create/realtime tests sign in and skip loudly without the token; invalid-write stays ungated), `AGENTS.md` and `README.md` (data-layer authorization model + `npm run perms:push`).

**PLAN.md tasks complete:** Task 1 (schema deltas), Task 2 (rules + adapter + structural guard), Task 3 (fail-loud push wrapper), Task 4 (authenticated harness + shared sign-in seam), Task 5 (perms probe), Task 6 (`e2e/permissions.spec.ts`), and the documentation half of Task 7. The live push half of Task 7 is deferred (see deviations).

**Test suite:** `npm run test` → **50 passed (4 files)**. `npm run astro check` → **0 errors, 0 warnings, 33 hints** (hints are pre-existing `ElementRef` deprecations in unrelated `ui/` components). `npm run test:e2e` → **1 passed, 10 skipped** (the live-app suites skip loudly without `INSTANT_ADMIN_TOKEN`; the synchronous invalid-write failure-path test runs and passes).

**Coverage:** `npm run test:coverage` (v8). Aggregate **lines 66.66%, branches 61.29%, functions 64.7%** (the text reporter prints only `db.ts`/`theme.ts`/`utils.ts` because it omits fully-covered files; the JSON summary confirms the rest). New files: `perms.ts` 100/100/100, `pushPerms.ts` 100/100/100. `db.ts` unchanged at lines 89.47% / branch 69.49% / funcs 100% (the schema delta is pure declaration evaluated at import). `auth.ts` stays 100%. No per-file regression — adding two 100%-covered modules raises the aggregate versus the base branch; the only 0% files (`theme.ts`, `utils.ts`) are pre-existing and untouched.

**Failure modes handled this cycle:**
- **Missing-credentials push (validation + fail-loud):** `scripts/push-perms.mjs` calls `resolveAppId` and `process.exit(1)` with a clear `push-perms:` message *before* any network call when `PUBLIC_INSTANTDB_APP_ID` is missing/empty. Covered by `pushPerms.test.ts` (unit on `resolveAppId` for present/missing/whitespace, plus a no-network integration test that spawns the real runner with an empty app id and asserts non-zero exit + the clear stderr message). Verified manually: exit 1 with the message.
- **CLI/auth/network push failure (forwarded exit):** the runner forwards `instant-cli`'s non-zero status with a "check `instant-cli login` auth and network" message, and reports a clear error if the CLI cannot be spawned at all. No path reports success on failure.
- **Idempotency:** the push is declarative (re-running identical rules is a no-op) and the runner performs no local mutation; e2e uses fresh disposable emails/session ids per run; the `users` row is keyed to `auth.id`.
- **Denied read returns no partial leak:** the own-row-only `users` view rule yields zero rows for another user, surfaced as `no-email` in the probe (asserted in `permissions.spec.ts`).
- **Denied write surfaces an error and leaves state unchanged:** the probe renders `error:<message>` on a rejected `transact()` and `console.error`s it (never swallowed); the spec re-reads `probe-active-resource` and asserts it equals the owner's last value — proving the write was neither silently dropped nor applied. Cross-teacher denial is asserted separately.
- **Harness under owner-only rules:** a rejected harness write still surfaces to `harness-error` + `console.error` (unchanged contract); when signed out, the create/join buttons are disabled and a notice explains why.

**Deviations from PLAN.md:** The live `npm run perms:push` / `npx instant-cli push schema` execution (Task 7) could not be performed in this build environment — it is a shared-infrastructure change requiring interactive `instant-cli login` as the app operator, and the harness correctly gated the command. The fail-loud, idempotent wrapper is committed and its deterministic failure path is verified; pushing the rules and schema delta to the live Instant app remains the documented operator step (`npx instant-cli push schema` then `npm run perms:push`). The `src/lib/perms.ts` type annotation was intentionally omitted (per PLAN's stated fallback): keeping the literal inferred type gives the structural guard precise, non-optional property access while `astro check` confirms well-formedness — `InstantRules` is exported by `@instantdb/react`, but its all-optional entity blocks would force the guard to fight the type system.

**Deferred / follow-up:** (1) Operator must run `npx instant-cli push schema` and `npm run perms:push` against the live app, then run `e2e/permissions.spec.ts` with `INSTANT_ADMIN_TOKEN` set to confirm the live-app acceptance criteria — the "unavailable app" half of the push failure path is the CLI's forwarded non-zero exit, verifiable only against a live (mis)configuration. (2) The permissive `$default` leaves `messages`/`questions`/`endorsements` open by design — tightening their read-visibility policy is Batch-2 work, as scoped.

## Touched Files
- src/lib/db.ts
- src/lib/perms.ts
- instant.perms.ts
- src/lib/perms.test.ts
- src/lib/pushPerms.ts
- scripts/push-perms.mjs
- src/lib/pushPerms.test.ts
- src/components/PermsProbe.tsx
- src/pages/dev/perms-probe.astro
- src/components/EventSpineHarness.tsx
- e2e/permissions.spec.ts
- e2e/event-spine.spec.ts
- e2e/auth.spec.ts
- e2e/support/auth.ts
- package.json
- AGENTS.md
- README.md
