All gates green: 90 unit tests pass, astro check clean (0 errors / 0 warnings), e2e spec loads and skips loudly without admin env.

## Summary

This cycle delivers the "New session" vertical slice end-to-end. **Files created:** `src/lib/sessions.ts` (134 lines — the `createSession` action module with the pure `generateJoinCode` and `buildSessionCreate` cores plus the thin `writeEvent`-routed wrapper); `src/lib/sessions.test.ts` (134 lines — 17 unit tests); `src/components/NewSession.tsx` (118 lines — the dashboard control); `e2e/create-session.spec.ts` (78 lines — happy-path, observability, and blank-title failure-path specs). **Files modified:** `src/pages/dashboard/index.astro` (mounted `NewSession` as a nested `client:only` island inside the existing `RouteGuard`, preserving `dashboard-root`); `e2e/support/auth.ts` (added the `queryAdmin` Node-side admin-read helper); `AGENTS.md`, `README.md`, `release-notes.md` (docs). All five PLAN.md tasks are complete (action module, unit tests, dashboard control, e2e + admin helper, documentation).

**Test command & result:** `npm run test` → 6 files, 90 tests passed (17 new). `npm run astro check` → 0 errors, 0 warnings. `npx playwright test create-session` → 2 skipped (loudly, admin env unset, as designed).

**Coverage:** `npm run test:coverage` — Lines 76.99% (was 71.26%), Branches 70.67% (was 68.69%), Functions 72% (was 70%), Statements 75.53% (was 70%). No per-file regression; every metric rose. `sessions.ts` lands at 96.55% stmts / 83.33% branch — the single uncovered line is `defaultBuildTxn` (the real `db.tx.sessions[...].update(...)` production path, exercised by the e2e suite, deliberately injected away in unit tests to avoid a live `db.transact`).

**Failure modes handled:** (1) **Validation** — `buildSessionCreate` rejects blank/whitespace title and missing `teacherId` synchronously before any txn (`it.each` tests over `''`/`'   '`/`'\t\n'` titles → `/title is required/`, and `null`/`undefined`/`''` teacherId → `/signed in/`); the e2e blank-title spec asserts the inline `new-session-error` and zero `created-session`. (2) **Rejected write** — `createSession` propagates a rejecting injected `write` (`rejects.toThrow(/permission denied/)`), never swallowed; the "invalid input doesn't call write" test asserts validate-before-act. (3) **Atomicity / no partial state** — the dual-write shares one `writeEvent` transaction, so a rejected create leaves no orphan event or session. (4) **Missing auth** — `NewSession` guards `if (!user?.id)` as defense-in-depth behind `RouteGuard` and surfaces an inline error. (5) **Idempotency** — non-idempotent by design (fresh `sessionId`/`joinCode` per call), with submit disabled while pending to block double-submit; documented in the wrapper's contract.

**Deviations from PLAN.md:** one — `src/lib/sessions.ts` imports `./db` (relative) rather than `@/lib/db`, because the `@/` alias is not resolved under Vitest's node environment (matching the relative-import convention already used by `src/lib/db.test.ts`); the `.tsx` island still uses `@/` aliases, which Astro resolves.

**Deferred / follow-up:** none beyond the SPEC's explicit out-of-scope items (session listing, lifecycle transitions, join-as-participant, edit/delete). The e2e happy-path and observability assertions are only runnable once `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID` are provisioned and the cycle-0003 permission rules are pushed live; the suite skips loudly until then.

## Touched Files
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- src/components/NewSession.tsx
- src/pages/dashboard/index.astro
- e2e/support/auth.ts
- e2e/create-session.spec.ts
- AGENTS.md
- README.md
- release-notes.md
