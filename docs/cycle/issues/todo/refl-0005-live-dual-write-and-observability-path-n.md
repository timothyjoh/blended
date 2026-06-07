---
id: refl-0005-live-dual-write-and-observability-path-n
title: Run the live dual-write + observability path in CI (provision admin env)
workflow: feature
depends_on:
  - refl-0003-push-perms-schema-to-live-instant-app-an
triaged_at: 2026-06-07T05:46:25.389Z
source: triage
priority: medium
---
## Problem

The only coverage of the real production write path — `defaultBuildTxn`'s live `db.tx.sessions[...].update(...)`, the `SessionCreated`/`sessions` dual-write, and the observability assertions — lives in the e2e happy-path spec, which `test.skip`s whenever `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID` are unset (`e2e/create-session.spec.ts:14-17`). BUILD.md and REVIEW.md both acknowledge this: in an env without admin credentials the live dual-write is exercised by nothing, and the suite skips loudly but green.

The risk is a **false green** — a regression in the actual transaction path or the cycle-0003 permission rules would not be caught by CI until admin env is provisioned. The production path is currently verified only by manual local runs.

## Goal

Wire the admin token + app id into the CI environment so the dual-write and observability assertions actually run in CI, rather than being silently skipped.

## Scope

- Provision `INSTANT_ADMIN_TOKEN` and `PUBLIC_INSTANTDB_APP_ID` as CI secrets/env and confirm `e2e/create-session.spec.ts` no longer hits the `test.skip` guard in CI.
- Confirm the cycle-0003 permission rules are pushed live against the app the CI token targets (depends on the perms/schema push work) so the live path runs against the real rules.
- Verify the happy-path spec executes the live `db.tx.sessions[...].update(...)`, the `SessionCreated`/`sessions` dual-write, and the observability assertions in CI and goes red on a regression in that path.
- Make the skip condition fail loudly in CI specifically (e.g. CI should error rather than silently skip when admin env is missing), so a future credential rotation can't silently restore the false-green.

## Out of scope

Do not expand the e2e suite beyond the existing happy-path coverage; this is about making the existing live-path assertions run, not adding new scenarios.
