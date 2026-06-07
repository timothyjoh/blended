---
id: refl-0021-schema-push-cli-rejection-and-spawn-erro
title: Hermetically cover schema-push CLI-rejection and spawn-error exit branches
workflow: feature
depends_on: []
triaged_at: 2026-06-07T13:55:06.075Z
source: triage
priority: medium
---
## Problem

`scripts/push-schema.mjs:46-60` has three non-zero exit branches, but only the missing-app-id branch is covered hermetically. In `src/lib/pushSchema.test.ts` the runner is spawned with an empty `PUBLIC_INSTANTDB_APP_ID`, which exercises only that one leg. The other two:

- `result.error` — the CLI cannot be spawned at all (un-spawnable `npx instant-cli`).
- `result.status !== 0` — the CLI runs but rejects (auth/network failure); this is the **exit-code-forwarding** leg.

...are only "operationally exercised" by `e2e/schema-push.spec.ts`, which `test.skip`s whenever admin credentials are absent. So in **tokenless CI**, SPEC AC#5 (a CLI rejection forwards a non-zero exit and never collapses to 0) is verified by nothing. A regression in exit-code forwarding or in the auth/connectivity error messaging would ship green.

The identical untested split exists in the sibling `push-perms.mjs`; review (adversarial finding #6) explicitly accepted it as a consistent convention, so both runners should be hardened the same way.

## Approach

This is achievable **without** the `child_process` mocking the suite deliberately avoids. Spawn the real runner with a `PATH` (or a tiny shim directory) where `npx instant-cli` resolves to a stub script that exits non-zero, then assert the runner:

- forwards a non-zero status (does not collapse to 0), and
- emits the auth/connectivity error message.

Add a second variant that points the runner at a non-existent CLI binary to drive the `result.error` (spawn-failure) branch and assert its distinct handling.

Apply the same hermetic coverage to `push-perms.mjs` so the two runners stay symmetric.

## Acceptance

- Hermetic tests cover both the `result.error` (un-spawnable CLI) and `result.status !== 0` (CLI rejection) branches of `push-schema.mjs`, runnable in tokenless CI with no admin credentials.
- The CLI-rejection test asserts a non-zero exit is forwarded (SPEC AC#5) and that the auth/connectivity message is surfaced.
- Equivalent hermetic coverage added for `push-perms.mjs`.
- No `child_process` mocking introduced; the real runner is spawned against a stub/shim on `PATH`.

## Out of scope

Actually executing the live push against the schema-enforced app — already tracked by `refl-0003` / `refl-0005`. Do not re-file or duplicate that here.
