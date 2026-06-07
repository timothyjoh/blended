## Summary

Cycle 0004 was resumed after an interruption: the prior build pass had already landed the pure routing helpers, both guard islands, the `AuthGate` redirect, the two placeholder pages, and the e2e spec on the working tree (all present and verified against PLAN.md). This pass completed the one outstanding PLAN task — **Task 6 (documentation)** — and re-verified the full gate.

**Files modified this pass:** `AGENTS.md` (+1 paragraph, the "Route guarding" note under the Auth section: `RouteGuard` as the single client-side gate consuming `useAuth`, `safeNextPath` as the only sanctioned open-redirect-safe destination resolver, `SessionRouteGuard`/`authorizeOwnership` ownership flow, placeholder nature of the routes, and the fixed testid set), `README.md` (+1 "Protected routes (route guarding)" section describing the sign-in gate, intended-destination round-trip, deep-link preservation, ownership denial, and open-redirect safety), `release-notes.md` (+1 "Cycle 0004" section, ~20 lines, listing the guard, ownership denial, open-redirect safety, placeholder routes, reused testids, and the new e2e suite with no new env vars).

**Files already in place from the interrupted pass (verified, unchanged this turn):** `src/lib/routing.ts` (54 lines — `DEFAULT_LANDING`, `safeNextPath`, `loginRedirectTarget`, `authorizeOwnership`), `src/lib/routing.test.ts` (99 lines, 27 cases), `src/components/RouteGuard.tsx` (84 lines), `src/components/SessionRouteGuard.tsx` (39 lines), `src/pages/dashboard/index.astro` (18 lines), `src/pages/dashboard/sessions/[id].astro` (21 lines), `e2e/route-guarding.spec.ts` (99 lines), and the post-sign-in / already-signed-in redirect in `src/components/AuthGate.tsx`.

**PLAN.md tasks complete:** Task 1 (pure routing helpers + unit tests), Task 2 (`RouteGuard` + `/dashboard`), Task 3 (`AuthGate` redirect round-trip), Task 4 (`SessionRouteGuard` + `/dashboard/sessions/[id]`), Task 5 (Playwright e2e), Task 6 (docs) — all six.

**Test suite:** `npm run test` → **5 files, 73 tests passed**. `npm run astro check` → **0 errors, 0 warnings, 33 hints** (the 33 hints are pre-existing `ts(6385) 'ElementRef' is deprecated` notices in the unmodified shadcn `src/components/ui/*` primitives — not introduced this cycle). `npm run test:e2e` is environment-gated: `e2e/route-guarding.spec.ts` skips loudly without `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` (mirrors `auth.spec.ts`/`permissions.spec.ts`), so it is not runnable in this build environment; it is structured to assert observable URL + testid outcomes for all four acceptance scenarios when the admin token is provisioned.

**Coverage:** `npm run test:coverage` → **Statements 70% (77/110), Branches 68.69% (79/115), Functions 70% (14/20), Lines 71.26% (62/87)** over the `src/lib/**/*.ts` scope. No regression vs the base branch: the only new in-scope module, `src/lib/routing.ts`, is fully exercised by `routing.test.ts` (it does not appear in the sub-100% file table, which lists only `db.ts` 89.47% lines, `theme.ts` 0%, and `utils.ts` 0% — all pre-existing). Adding a fully-tested pure module raises, not lowers, the aggregate. The `.tsx` islands and `useAuth.ts` are intentionally outside unit scope (per `vitest.config.ts`) and are covered by the Playwright suite, consistent with the established convention.

**Failure modes handled (and their covering tests):** (1) **Open-redirect / hostile `next`** — `safeNextPath` discards off-origin (`//evil`, `https://evil`, `javascript:`), CRLF/tab-smuggling, bare-relative, and empty/null/undefined inputs, resolving to `/dashboard`; covered by the table-driven failure cases in `routing.test.ts`. (2) **Ownership query error / zero-row id** — `authorizeOwnership` returns `denied` (error wins over loading, so no infinite spinner), `SessionRouteGuard` logs via `console.error('[SessionRouteGuard]', …)` and never renders children; covered by the `authorizeOwnership` error/missing-id unit cases and the two-context denial e2e. (3) **Auth-subsystem error** — `RouteGuard` logs `console.error('[RouteGuard] auth error:', …)` and renders `route-guard-denied`, never collapsing to "authenticated". (4) **Flash-redirect before auth resolves** — the redirect effect early-returns while `isLoading`, rendering `route-guard-loading`. (5) **Idempotency** — both the guard bounce and the `AuthGate` return fire once via a `useRef` latch, and `window.location.replace` to the same target is a no-op. No errors are silently swallowed (no empty catch, no ignored rejection).

**Deviations from PLAN.md:** none. The `[id].astro` page uses `const { id = '' }` to satisfy Astro's possibly-undefined param typing (an empty id deterministically resolves to the guard's denial state), a minor hardening within PLAN's stated approach.

**Deferred / follow-up:** the real `/dashboard`, session, and join screen contents (their own cycles); admin role gating and `/admin`; join-as-participant logic for `/join/:joinCode` — all explicitly out of scope per SPEC. The route-guard e2e remains unexecuted in this environment pending `INSTANT_ADMIN_TOKEN` and a live cycle-0003 perms push.

## Touched Files
- AGENTS.md
- README.md
- release-notes.md
- src/lib/routing.ts
- src/lib/routing.test.ts
- src/components/RouteGuard.tsx
- src/components/SessionRouteGuard.tsx
- src/components/AuthGate.tsx
- src/pages/dashboard/index.astro
- src/pages/dashboard/sessions/[id].astro
- e2e/route-guarding.spec.ts
