---
id: refl-0005-live-dual-write-and-observability-path-n
source: reflection
title: live-dual-write-and-observability-path-never-runs-without-admin-env
added_at: 2026-06-07T05:42:46.296Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0005"
---

The only coverage of the real production write path — `defaultBuildTxn`'s live `db.tx.sessions[...].update(...)` plus the `SessionCreated`/`sessions` dual-write and the observability assertions — lives in the e2e happy-path spec, which `test.skip`s whenever `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are unset (`e2e/create-session.spec.ts:14-17`). BUILD.md and REVIEW.md both acknowledge this: in an env without admin credentials the live dual-write is exercised by nothing, and the suite skips (loudly, but green).

The risk is a false green — a regression in the actual transaction path or the cycle-0003 permission rules would not be caught by CI until admin env is provisioned. A future cycle should wire the admin token + app id into the CI environment (and confirm the cycle-0003 rules are pushed live) so the dual-write and observability assertions actually run, rather than leaving the production path verified only by manual local runs.
