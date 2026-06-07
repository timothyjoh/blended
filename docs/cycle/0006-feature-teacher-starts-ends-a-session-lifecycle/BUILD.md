All gates pass. Final summary:

## Summary

Cycle 0006 delivers the session lifecycle state machine as one vertical slice extending the cycle-0005 pure-core split.

**Files modified/created:**
- `src/lib/sessions.ts` (+~165 lines): added `SessionStatus`, the `LEGAL_TRANSITIONS` table + `assertLegalTransition` guard (SPEC §6.2 single source of truth), pure builders `buildSessionStart` / `buildSessionEnd` (total validation of transition + owner identity + present `sessionId` before producing any plan), thin async wrappers `startSession` / `endSession` (injectable deps, dual-write via `writeEvent`), and the pure-total `isJoinEnabled` predicate.
- `src/lib/db.ts` (+24 lines): `applyEvent` fold cases for `SessionStarted` / `SessionEnded` (status → `live`/`ended`, no-mutation, tolerate absent prior session).
- `src/components/SessionLifecycle.tsx` (new, ~180 lines): the `client:only` detail-page island — `useAuth` identity, live `db.useQuery`, status + join-gate affordance derived solely from `isJoinEnabled`, Start/End controls, inline `role="alert"` error + `console.error` on every failure.
- `src/pages/dashboard/sessions/[id].astro`: mounts `SessionLifecycle` inside the existing `SessionRouteGuard` (nested-island pattern matching the dashboard); `session-root` testid retained on the island container for the ownership-guard e2e.
- `src/components/NewSession.tsx` (+8 lines): `created-session-link` "Open session" anchor to the detail page.
- `src/lib/sessions.test.ts` (+~180 lines) and `src/lib/db.test.ts` (+~55 lines): unit coverage.
- `e2e/session-lifecycle.spec.ts` (new): happy-path draft→live→ended + ordered observability + illegal-transition failure path.
- `AGENTS.md`, `README.md`, `release-notes.md`: docs.
- `docs/cycle/0006-feature-teacher-starts-ends-a-session-lifecycle/walkthrough.mjs` (new): 6-capture lifecycle walkthrough.

**PLAN tasks complete:** Tasks 1 (pure core), 2 (wrappers), 3 (fold cases), 4 (island + wiring + link), 5 (docs), plus the unit + e2e testing strategy and the walkthrough plan.

**Test suite:** `npm test` → 6 files, **130 passed**. `npm run astro check` → **0 errors, 0 warnings** (89 files). `npx playwright test session-lifecycle` → both specs **skip loudly** (admin env unset, by design; `playwright.config.ts` already sets `retries: 3`).

**Coverage:** `npm run test:coverage` — overall lines **82%** (was 76.99% at base), stmts **79.77%** (75.53%), branch **73.74%** (70.67%), funcs **75%** (72%). No regression — every metric improved. `sessions.ts` 95.16% stmts / 83.33% branch; `db.ts` 90% stmts / 71.01% branch. The only uncovered new line is `defaultTransitionTxn` (`sessions.ts:106`), the production-only `db.tx` default-dep path, mirroring the pre-existing uncovered `defaultBuildTxn`.

**Failure modes handled & their tests:** illegal transition (builders throw synchronously before any write — `assertLegalTransition` tests + `startSession`/`endSession` "rejects … without calling write" assert the write spy is never invoked); non-owner actor (builder rejects `actorId !== teacherId` — unit tests + cycle-0003 data-layer backstop); rejected `writeEvent` propagation (rejecting-write unit test asserts the rejection is not swallowed); atomicity (single transaction → no partial state, documented); non-idempotency with guard-as-retry-safety fed the live status (documented + tested via illegal re-issue rejection); stale UI (e2e illegal-transition spec + guard); query error in the island (`console.error` + non-actionable render); absent-prior-session fold (db.test minimal-session case). No empty catches or discarded rejections introduced.

**Deviations from PLAN:** (1) Both Start and End controls are always rendered (not strictly contextual-only) so an illegal transition is observable through a clickable control — this is the deterministic way to satisfy the SPEC's "controls-visible state" failure-path e2e (contextual hide/show makes the post-transition control unmountable and untestable); the non-applicable control uses the `outline` variant. Documented in README known limitations. (2) `release-notes.md` (root) was updated; `docs/release-notes.md` is an unrelated theme-picker artifact and was intentionally left untouched.

**Deferred / follow-up:** student join-via-link flow, `participants` rows, `archived` state and its transitions, replay/timeline UI, session list/index — all explicitly out of scope.

## Touched Files
- src/lib/sessions.ts
- src/lib/db.ts
- src/lib/sessions.test.ts
- src/lib/db.test.ts
- src/components/SessionLifecycle.tsx
- src/components/NewSession.tsx
- src/pages/dashboard/sessions/[id].astro
- e2e/session-lifecycle.spec.ts
- AGENTS.md
- README.md
- release-notes.md
- docs/cycle/0006-feature-teacher-starts-ends-a-session-lifecycle/walkthrough.mjs
