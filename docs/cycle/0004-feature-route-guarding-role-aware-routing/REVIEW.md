# Review: Cycle 0004

## Overall Verdict
PASS — no fixes needed

All seven SPEC acceptance criteria are satisfiable end-to-end, the new pure module (`src/lib/routing.ts`) is at 100% line/branch/function coverage, `npm run test` passes (73 tests, 5 files), `npm run astro check` is clean (0 errors, 0 warnings), failure paths are fail-safe and observable, SPEC has a populated `## Acceptance Criteria` section, PLAN has a complete `## SPEC Acceptance Traceability` section, and every in-scope documentation claim is backed by a real `file:line`.

## Code Quality Review

### Summary
A tight, well-factored vertical slice. The pure/impure split (total helpers in `routing.ts`; React-bound query in `SessionRouteGuard`; redirect side effects latched behind `useRef` in `RouteGuard`/`AuthGate`) is clean and matches the established `auth.ts`/`useAuth.ts` patterns from RESEARCH.md. Failure handling is deliberately fail-safe: hostile `next` → `/dashboard`, query error/zero-row → `denied`, auth error → `route-guard-denied` (logged, never collapsed to "authenticated").

### Findings
1. **Observability (minor / non-blocking)**: `console.error` is called in the render body rather than in an effect — `RouteGuard.tsx:49` and `SessionRouteGuard.tsx:28`. While auth/query errors persist this re-logs on every re-render (and double-logs under StrictMode). This is the safe direction (over-logging, not swallowing) and does not trip any NEEDS-FIX trigger; noted only as a cleanliness observation. No fix required.
2. **Defensive param default (acceptable)**: `src/pages/dashboard/sessions/[id].astro:11` uses `const { id = '' }` to satisfy Astro's possibly-undefined typing; an empty id deterministically resolves to `denied` via `authorizeOwnership`. Honest and safe.

### Spec Compliance Checklist
- [x] `RouteGuard` reads identity exclusively via `useAuth` (`RouteGuard.tsx:27`), never `db.useAuth()`.
- [x] Loading state renders `route-guard-loading` and does not redirect (`RouteGuard.tsx:31-35,59-65`).
- [x] Unauthenticated → `window.location.replace` to `/login?next=<encoded pathname+search>` (`RouteGuard.tsx:38-43`, `routing.ts:30-33`).
- [x] `safeNextPath` returns destination only for same-origin absolute path; rejects `//`, scheme, control chars, empty/null (`routing.ts:21-27`).
- [x] After sign-in `AuthGate` navigates to `safeNextPath(next)`; already-signed-in `/login` → `/dashboard` (`AuthGate.tsx:40-44`).
- [x] Ownership guard queries `sessions` by id and authorizes only on `teacherId === user.id` (`SessionRouteGuard.tsx:25-36`, `routing.ts:43-53`).
- [x] Placeholder pages reuse `Layout.astro` + Tailwind primitives; no new UI lib.
- [x] Failure behavior: hostile `next` → `/dashboard`; query error/zero-row → `route-guard-denied` + `console.error`; auth `error` surfaced not swallowed.
- [x] SPEC `## Acceptance Criteria` present with 7 testable bullets; PLAN `## SPEC Acceptance Traceability` re-quotes all 7 verbatim with covering task ids.
- [x] Docs updated (AGENTS.md, README.md, release-notes.md) per SPEC.

## Adversarial Test Review

### Summary
Strong for the unit layer; e2e is well-structured and honest but environment-gated (unrunnable here without `INSTANT_ADMIN_TOKEN`).

### Findings
1. **Anti-mock (positive)**: `src/lib/routing.test.ts` uses zero mocks — all three helpers are pure, tested against real implementations. 27 cases including table-driven failure paths.
2. **Failure-path coverage (positive)**: `routing.test.ts:27-39` covers `''`, `//evil`, `/\evil`, `https://`, `http://`, `javascript:`, CRLF, tab, bare token, null/undefined — directly satisfying the open-redirect acceptance bullet. `authorizeOwnership` covers error-wins-over-loading, mismatch, and all missing-id permutations (`:79-98`).
3. **Assertion quality (positive)**: assertions are specific (`toBe('/dashboard')`, exact encoded `?next=` strings, `toHaveURL(/regex/)`, `toHaveCount(0)`) — no weak `toBeTruthy`.
4. **Honest e2e (positive)**: the deep-link round-trip test (`route-guarding.spec.ts:44-60`) uses a non-existent random id and asserts only URL round-trip (not `session-root`), correctly avoiding a false assertion since a non-existent session resolves to `denied`. The denial test (`:69-98`) asserts both `route-guard-denied` visible AND `session-root` absent across two browser contexts.
5. **Skip-loudly (positive)**: `route-guarding.spec.ts:10-13` skips with an explicit reason when the admin token is absent — never a false green.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`)
- Line / branch / function (aggregate, scope `src/lib/**/*.ts`): 71.26% / 68.69% / 70%
- New module `src/lib/routing.ts`: 100% / 100% / 100% (verified via json-summary)
- Regressions vs base (per-file): none. Aggregate sub-100% is driven entirely by pre-existing untested `theme.ts` (0%) and `utils.ts` (0%) and pre-existing `db.ts` (89.47% lines) — none touched this cycle. Adding a fully-tested module raises, not lowers, the aggregate.
- New code without tests: none in unit scope. `.tsx` islands (`RouteGuard`, `SessionRouteGuard`, `AuthGate`) and `useAuth.ts` are intentionally outside unit scope per `vitest.config.ts` and are exercised by the Playwright suite, consistent with the established convention.
- Specific scenarios missing tests: none in unit scope. The four e2e behaviors (bounce+return, deep-link round-trip, bare-login landing, ownership denial) are structured but unexecuted in this environment (no `INSTANT_ADMIN_TOKEN`); this is the documented project convention, not a gap introduced by this cycle.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `RouteGuard` is the single client-side gate, consumes `useAuth` (never `db.useAuth()`) | `AGENTS.md:32` | `src/components/RouteGuard.tsx:27` | OK |
| Unauthenticated bounce to `/login?next=<encoded dest>` via `window.location.replace` | `AGENTS.md:32` | `src/components/RouteGuard.tsx:38-43`, `src/lib/routing.ts:30-33` | OK |
| `route-guard-denied` on auth error / failed ownership, logged via `console.error` | `AGENTS.md:32` | `src/components/RouteGuard.tsx:48-55`, `src/components/SessionRouteGuard.tsx:28` | OK |
| `safeNextPath` honors only same-origin absolute path, else `/dashboard` | `AGENTS.md:32`, `README.md:121-123` | `src/lib/routing.ts:21-27` | OK |
| `AuthGate` calls `safeNextPath` after sign-in; already-signed-in `/login` → `/dashboard` | `AGENTS.md:32`, `README.md:114-115` | `src/components/AuthGate.tsx:40-44`, `src/lib/routing.ts:12,22` | OK |
| `SessionRouteGuard` runs `sessions` `db.useQuery`, folds via `authorizeOwnership` (`teacherId === user.id`) | `AGENTS.md:32` | `src/components/SessionRouteGuard.tsx:25-36`, `src/lib/routing.ts:43-53` | OK |
| Fixed testids `route-guard-loading`/`route-guard-denied`/`dashboard-root`/`session-root` | `AGENTS.md:32`, `README.md:120` | `RouteGuard.tsx:51,61`; `dashboard/index.astro:14`; `sessions/[id].astro:18` | OK |
| Deep link `/dashboard/sessions/<id>` id preserved across login round-trip | `README.md:113` | `src/lib/routing.ts:30-33`, `src/components/AuthGate.tsx:43`; e2e `route-guarding.spec.ts:44-60` | OK |
| Crafted `?next=` off-origin (`//evil`, `https://evil`) discarded → `/dashboard` | `README.md:121-123`, `release-notes.md:16-17` | `src/lib/routing.ts:23-25`; `routing.test.ts:27-39` | OK |
| e2e suite `e2e/route-guarding.spec.ts` reuses `INSTANT_ADMIN_TOKEN`, skips loudly when unset | `README.md:123-124`, `release-notes.md:19-20` | `e2e/route-guarding.spec.ts:10-13`, `e2e/support/auth.ts:14-16` | OK |
| Placeholder routes `/dashboard` and `/dashboard/sessions/[id]` (thin shells) | `README.md:119-120`, `release-notes.md:18` | `src/pages/dashboard/index.astro`, `src/pages/dashboard/sessions/[id].astro` | OK |

All enumerated in-scope doc claims are backed; no unbacked claims.
