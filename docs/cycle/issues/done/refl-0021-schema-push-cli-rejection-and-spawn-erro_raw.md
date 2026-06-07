---
id: refl-0021-schema-push-cli-rejection-and-spawn-erro
source: reflection
title: schema-push cli-rejection and spawn-error branches lack a hermetic test
added_at: 2026-06-07T13:51:08.594Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0021"
---

`scripts/push-schema.mjs:46-60` has three non-zero exit branches, but only the missing-app-id branch is covered hermetically (`src/lib/pushSchema.test.ts` spawns the real runner with an empty `PUBLIC_INSTANTDB_APP_ID`). The `result.error` (un-spawnable CLI) and `result.status !== 0` (auth/network rejection, the exit-code-forwarding leg) branches are only "operationally exercised" by `e2e/schema-push.spec.ts`, which `test.skip`s whenever admin credentials are absent. So in tokenless CI, SPEC AC#5 (CLI rejection forwards a non-zero exit, never collapses to 0) is verified by nothing — a regression in the exit-code forwarding or in the error messaging would ship green. The same untested split exists in the sibling `push-perms.mjs`, and review (adversarial finding #6) explicitly accepted it as consistent convention.

This is achievable without the `child_process` mocking the suite deliberately avoids: spawn the real runner with a `PATH` (or a tiny shim) where `npx instant-cli` resolves to a stub that exits non-zero, and assert the runner forwards a non-zero status with the auth/connectivity message. A future cycle that touches the runner's exit semantics will otherwise have no hermetic safety net. Note: the distinct follow-up of *actually executing* the live push against the schema-enforced app is already tracked by `refl-0003`/`refl-0005` and is not re-filed here.
