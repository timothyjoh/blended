---
id: refl-0003-push-perms-schema-to-live-instant-app-an
source: reflection
title: push perms+schema to live Instant app and prove permissions e2e
added_at: 2026-06-07T00:51:58.749Z
triage_attempts: 0
priority: critical
origin_cycle_id: "0003"
---

The cycle's central deliverable — moving student-email privacy and session-write authorization from UI convention into enforced InstantDB rules — is **inert on the running app**. `npx instant-cli push schema` and `npm run perms:push` were never executed (no `instant-cli` auth, no `PUBLIC_INSTANTDB_APP_ID`/`INSTANT_ADMIN_TOKEN` in the build env), so zero enforcement exists yet and `e2e/permissions.spec.ts` has never run against a live app (it skips loudly without the admin token). See `BUILD.md:11,25,27`, `REVIEW.md` finding 1, and `MUST-FIX.md` Task 1 (status: could-not-fix).

This is an operator action against shared infrastructure, correctly gated out of the automated build, and is acknowledged across BUILD/MUST-FIX/FIX but not yet filed as a tracked issue. File it so it is not lost: as the app operator run `npx instant-cli push schema` then `npm run perms:push` (both must exit 0), set the env and confirm `e2e/permissions.spec.ts` runs (0 skipped) and passes — email-privacy denial, raw-write denial with unchanged state, owner realtime propagation, cross-teacher denial, and the new resource-injection denial — then drop the "deferred" caveat from BUILD.md.
