---
id: refl-0003-push-perms-schema-to-live-instant-app-an
title: Push perms + schema to live Instant app and prove permissions e2e
workflow: feature
depends_on:
  - refl-0001-push-blended-schema-to-live-instant-app
triaged_at: 2026-06-07T00:54:54.020Z
source: triage
priority: critical
---
Cycle 0003's central deliverable — moving student-email privacy and session-write authorization out of UI convention and into enforced InstantDB rules — is currently **inert on the running app**. The rules and schema exist in the repo, but `npx instant-cli push schema` and `npm run perms:push` were never executed (no `instant-cli` auth, no `PUBLIC_INSTANTDB_APP_ID` / `INSTANT_ADMIN_TOKEN` in the build env), so zero enforcement is live and `e2e/permissions.spec.ts` has never run against a real app (it skips loudly without the admin token). This is an operator action against shared infrastructure, correctly gated out of the automated build but acknowledged across `BUILD.md:11,25,27`, `REVIEW.md` finding 1, and `MUST-FIX.md` Task 1 (status: could-not-fix). File it here so it is tracked and not lost.

## What to do (as the app operator)

1. Authenticate `instant-cli` and set the build/run env: `PUBLIC_INSTANTDB_APP_ID` and `INSTANT_ADMIN_TOKEN`.
2. Run `npx instant-cli push schema` — must exit 0.
3. Run `npm run perms:push` — must exit 0.
4. With the env set, run `e2e/permissions.spec.ts` and confirm **0 skipped** and all assertions pass:
   - email-privacy denial,
   - raw-write denial with unchanged state,
   - owner realtime propagation,
   - cross-teacher denial,
   - the new resource-injection denial.
5. Drop the "deferred" caveat from `BUILD.md` once enforcement is live and the suite is green.

## Done when

- Both push commands have exited 0 against the live Instant app.
- `e2e/permissions.spec.ts` runs with 0 skipped and passes every denial/propagation case above.
- The deferred caveat is removed from `BUILD.md` so the docs reflect that enforcement is actually live.

Depends on `refl-0001` (push Blended schema to the live app), which establishes the same `instant-cli` auth + env path this work reuses.
