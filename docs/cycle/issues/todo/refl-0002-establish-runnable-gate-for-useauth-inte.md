---
id: refl-0002-establish-runnable-gate-for-useauth-inte
title: Establish a runnable verification gate for the useAuth integration path
workflow: feature
depends_on:
  - refl-0001-push-blended-schema-to-live-instant-app
triaged_at: 2026-06-06T23:29:20.789Z
source: triage
priority: medium
---
## Problem

The `useAuth` runtime logic in `src/lib/useAuth.ts:45-86` — the idempotent `writeEvent` creation effect, the `.catch`/`.finally` retry path, and the `db.useQuery` create-only-if-absent guard — is exercised **only** by `e2e/auth.spec.ts`. That spec calls `test.skip` loudly whenever `INSTANT_ADMIN_TOKEN` is unset, which is every CI/headless run today. The same logic is excluded from unit coverage by documented decision.

The net result: the integration path (island → hook → InstantDB auth → keyed `users` upsert) currently has **no runnable verification gate**. Both REVIEW.md (Findings 1 & 6) and BUILD.md flag this as asserted-but-unrun. Every future auth-dependent cycle (route guarding, session creation, participant rows, admin promotion) builds on integration behavior that no gate confirms.

## Scope

Provision the e2e admin token in the test environment and wire the auth e2e suite into a required, non-skipped gate so the integration path actually runs green.

- Provision `INSTANT_ADMIN_TOKEN` for the test/CI environment (secret store + local `.env` documentation), so `e2e/auth.spec.ts` no longer hits its `test.skip` guard.
- Wire `npm run test:e2e` (or the auth subset) into a CI gate so the auth suite runs on every headless run instead of silently skipping.
- Confirm the suite actually exercises `src/lib/useAuth.ts:45-86`: the `writeEvent` creation effect, the retry `.catch`/`.finally` path, and the create-only-if-absent `db.useQuery` guard. Add or tighten assertions if the existing spec does not cover all three.
- Make the gate hard-fail (not skip) when the token is missing in CI, so the suite cannot silently regress to no-op again.

## Dependencies & boundaries

- Depends on the live schema being pushed (`refl-0001`): the e2e auth flow upserts into the `users` entity, which requires the schema to exist in the live Instant app first.
- This is **distinct** from `refl-0001` itself — that lands the schema live; this lands a runnable, non-skipped gate around the auth integration path. Do not duplicate the schema-push work here.
- Do not expand scope into route guarding, session creation, or admin promotion — those are separate queued cycles. This cycle only makes the existing auth integration path verifiable.

## Done when

- `e2e/auth.spec.ts` runs (not skipped) in a headless/CI run and passes green against the live schema.
- A missing `INSTANT_ADMIN_TOKEN` in CI fails the gate loudly rather than skipping.
- The three runtime behaviors in `src/lib/useAuth.ts:45-86` are each asserted by the running suite.
