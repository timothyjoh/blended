---
id: refl-0002-establish-runnable-gate-for-useauth-inte
source: reflection
title: establish-runnable-gate-for-useauth-integration-path
added_at: 2026-06-06T23:27:11.351Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0002"
---

The `useAuth` runtime logic — the idempotent `writeEvent` creation effect, the `.catch`/`.finally` retry path, and the `db.useQuery` create-only-if-absent guard (`src/lib/useAuth.ts:45-86`) — is exercised ONLY by `e2e/auth.spec.ts`, which `test.skip`s loudly whenever `INSTANT_ADMIN_TOKEN` is unset (every CI/headless run today). It is also excluded from unit coverage by documented decision. So the integration path island → hook → InstantDB auth → keyed `users` upsert currently has no runnable verification gate. Both REVIEW.md (Findings 1 & 6) and BUILD.md call this out as asserted-but-unrun.

This matters because every future auth-dependent cycle (route guarding, session creation, participant rows, admin promotion) builds on integration behavior that no gate confirms. This is distinct from the already-filed schema-push follow-up (`refl-0001-push-blended-schema-to-live-instant-app`): that lands the schema live, while this is about provisioning `INSTANT_ADMIN_TOKEN` in the test environment and wiring `npm run test:e2e` into a gate so the auth suite actually runs green. Suggested direction: once the schema is pushed, provision the e2e admin token in CI and promote the auth spec to a required, non-skipped check.
