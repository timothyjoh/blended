# Review: Cycle 0019

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, well-factored vertical slice that turns the dormant `users.adminLevel` placeholder into a trustworthy, server-only global capability. Every SPEC acceptance bullet is implemented and covered; the pure helpers are total, failure branches fail-safe (deny/500/401, never fail-open), all writes are atomic, and docs are accurate. Build is green (`astro check`: 0 errors / 0 warnings), 449 unit tests pass, and new in-scope library code is at 100% coverage.

### Findings
1. **Security (unforgeability) — verified correct**: the elevated `'uber'` write exists *only* in the admin-SDK path; the `users` rule pins client writes to `adminLevel == 'none'` on both create (`data`) and update (post-merge `newData`), closing the no-op-update preservation hole — `src/lib/perms.ts:57-58`.
2. **Fail-safe — verified correct**: every endpoint branch returns a distinct status with a logged `[api/admin/bootstrap] …` cause and writes nothing on failure; the SDK-unavailable case fails closed with `500` rather than proceeding — `src/pages/api/admin/bootstrap.ts:38-42, 55, 73, 104`. The client degrade path logs and leaves the user non-admin — `src/lib/useAuth.ts:108-114`. The guard forces `denied` on query error — `src/components/AdminRouteGuard.tsx:28-35`.
3. **Atomicity / idempotency — verified correct**: elevation appends the event and updates the row in one `admin.transact` — `src/pages/api/admin/bootstrap.ts:99-102`; `decideBootstrap` short-circuits an already-`uber` caller so re-bootstrap writes nothing — `src/lib/admin.ts:78`.
4. **Minor — concurrent first-time bootstrap** (out of required scope): the endpoint reads the current level then transacts (`bootstrap.ts:68-102`); two simultaneous *first-time* POSTs for the same not-yet-`uber` user could both observe `'none'` and append two `AdminBootstrapped` events. The `useAuth` `bootstrapped` ref latch (`useAuth.ts:38, 103`) prevents this within a single session, and SPEC scopes idempotency to *already-`uber` re-bootstrap* (which is fully guarded), so this is an observation only, not a defect against SPEC.
5. **Token choice — verified correct**: `useAuth` POSTs `user.refresh_token` and the endpoint verifies it via `admin.auth.verifyToken`, the InstantDB-sanctioned server verification path — `src/lib/useAuth.ts:104` / `src/pages/api/admin/bootstrap.ts:53`.
6. **No-flash — verified correct**: the guard reuses `RouteGuard`'s loading/denied shells and reads the persisted `adminLevel`; an unresolved query renders `loading`, never the protected children — `src/components/AdminRouteGuard.tsx:31-37`.

### Spec Compliance Checklist
- [x] Trustworthy `adminLevel` named domain value via `src/lib/admin.ts`; no scattered `'uber'`/`'none'` literals at call sites
- [x] Schema `i.number()` → `i.string<AdminLevel>()` with read-time tolerance (`normalizeAdminLevel`) — `src/lib/db.ts:52`
- [x] Server-only `POST /api/admin/bootstrap` verifies token, elevates only allowlisted/not-yet-uber, atomically with `AdminBootstrapped` under `IDENTITY_SCOPE`
- [x] Shared pure `buildEventEnvelope` extracted from `writeEvent` and reused by the endpoint — `src/lib/db.ts:708`
- [x] Tightened `users` rule forbids client `adminLevel` elevation (create + post-merge update)
- [x] `useAuth` first-sign-in writes `ADMIN_LEVEL_NONE`; ref-latched, idempotent bootstrap POST
- [x] Total `authorizeAdmin` (error > loading > uber-only) + `AdminRouteGuard` + `/admin` page (`admin-root`)
- [x] `ADMIN_EMAILS` server-only (read only via `process.env` at `bootstrap.ts:63`; all other references are comments) — never imported by a client island
- [x] Failure behaviors: empty allowlist, missing token, bad token, not-allowlisted, idempotent re-bootstrap, network error, self-elevation rejection — all implemented and tested
- [x] Docs updated: AGENTS.md, README.md, .env.example
- [x] All existing tests pass (449); `astro check` clean
- [x] SPEC `## Acceptance Criteria` present with testable bullets; PLAN `## SPEC Acceptance Traceability` present and re-quotes every AC bullet verbatim with a covering task

## Adversarial Test Review

### Summary
Strong. Tests assert specific values (not truthiness), exhaustively cover legacy/hostile/missing inputs via `it.each`, and the e2e suite exercises real failure paths against the live app rather than mocks.

### Findings
1. **Boundary coverage — strong**: `normalizeAdminLevel`/`authorizeAdmin` are tested over `'uber'`, `'none'`, legacy `0`/`1`, `undefined`, `null`, wrong-case, padded, object, array, boolean — `src/lib/admin.test.ts:24-39`, `src/lib/routing.test.ts:115-126`.
2. **Failure-path tests present (not happy-path only)**: empty allowlist, missing email, non-allowlisted, already-uber, error-beats-loading — `src/lib/admin.test.ts:118-143`, `src/lib/routing.test.ts:109-112`.
3. **Structural perms test is specific**: asserts both ops contain `adminLevel == 'none'` AND never contain `'uber'`, and that update checks `newData` — `src/lib/perms.test.ts:21-32`. Assertions are exact string matches, not weak truthiness.
4. **No mock abuse**: pure helpers run against real implementations; e2e drives the real browser + live admin SDK and asserts persisted state via the admin query seam (`adminLevel === 'uber'`, event count deltas) — `e2e/admin-route.spec.ts:45-59`.
5. **Idempotency proven at the e2e layer**: reload re-fires bootstrap, then asserts the `AdminBootstrapped` count delta is exactly 0 — `e2e/admin-route.spec.ts:54-59`.
6. **Acknowledged deviation (acceptable)**: the `writeEvent`-regression check is satisfied structurally (`writeEvent` literally calls the unit-tested `buildEventEnvelope`) rather than by spying `db.transact`; the SDK-unavailable `500` is covered by the env-guard branch + client degrade path rather than a live e2e (the dev server's token can't be unset per-request). Both are documented in BUILD.md and reasonable.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`, scope `src/lib/**/*.ts`)
- Line / branch / function: **92.5% / 85.35% / 86.3%** (total)
- Per new in-scope file: `src/lib/admin.ts` **L100 / B100 / F100**; `src/lib/routing.ts` **L100 / B100 / F100**; `src/lib/perms.ts` **L100 / B100 / F100**; `src/lib/db.ts` **L93.24 / B87.16 / F100**
- Regressions vs base (per-file): none — `db.ts` lines rose (the extracted `buildEventEnvelope` is now directly unit-tested); `theme.ts`/`utils.ts` remain `0%` but are untouched by this cycle
- New code without tests: the `.tsx` island (`AdminRouteGuard`) and `src/pages/**` API route are outside the `src/lib/**/*.ts` unit-coverage scope by the existing island convention; both are exercised by `e2e/admin-route.spec.ts`
- Specific scenarios missing tests: none required by SPEC. (Not covered: concurrent first-time bootstrap — see Code Quality finding 4, out of SPEC scope.)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `POST /api/admin/bootstrap` server endpoint exists | `AGENTS.md:57` | `src/pages/api/admin/bootstrap.ts:32` | OK |
| Verifies caller token via `admin.auth.verifyToken` | `AGENTS.md:57` | `src/pages/api/admin/bootstrap.ts:53` | OK |
| `500` when admin SDK unavailable | `AGENTS.md:57` | `src/pages/api/admin/bootstrap.ts:38-42` | OK |
| `401` on missing/invalid/expired token | `AGENTS.md:57` | `src/pages/api/admin/bootstrap.ts:56, 60` | OK |
| `200 { adminLevel: 'none' }` for verified-but-not-allowlisted, no writes | `AGENTS.md:57` | `src/pages/api/admin/bootstrap.ts:84` | OK |
| Atomic `admin.transact`: users update + `AdminBootstrapped` event under `IDENTITY_SCOPE` | `AGENTS.md:57` | `src/pages/api/admin/bootstrap.ts:90-102` | OK |
| Actor role `'system'`, payload `{ userId, adminLevel }`, no email | `AGENTS.md:57` | `src/pages/api/admin/bootstrap.ts:91-93` | OK |
| `AdminBootstrapped` intentionally NOT folded by `applyEvent` | `AGENTS.md:57` | `src/lib/db.ts:616-621` | OK |
| Shared pure `buildEventEnvelope(type, meta, now)` extracted from `writeEvent` | `AGENTS.md:57` | `src/lib/db.ts:708` | OK |
| Schema field `i.string<AdminLevel>()` | `AGENTS.md:57` | `src/lib/db.ts:52` | OK |
| `users` rule pins `create: data.adminLevel == 'none'`, `update: newData.adminLevel == 'none'` | `AGENTS.md:57` / `README.md:368` | `src/lib/perms.ts:57-58` | OK |
| `useAuth` POSTs `refresh_token` once per session via a ref latch | `AGENTS.md:57` | `src/lib/useAuth.ts:103-114` | OK |
| First-sign-in creation writes `ADMIN_LEVEL_NONE` | `AGENTS.md:57` | `src/lib/useAuth.ts:79` | OK |
| `authorizeAdmin` total helper, error beats loading, uber-only | `AGENTS.md:57` | `src/lib/routing.ts:64-71` | OK |
| Unauthenticated `/admin` bounces to `/login?next=%2Fadmin` | `AGENTS.md:57` | `src/lib/routing.ts:34` (+ `RouteGuard.tsx:39`) | OK |
| `/admin` page renders `data-testid="admin-root"` gated by `AdminRouteGuard` | `AGENTS.md:57` | `src/pages/admin.astro:18-19` | OK |
| `ADMIN_EMAILS` read only via `process.env` in the API route (never client) | `README.md:374` / `.env.example:8` / `AGENTS.md:69` | `src/pages/api/admin/bootstrap.ts:63` (sole non-comment use) | OK |
| `@instantdb/admin` moved to `dependencies` | `AGENTS.md:57` | `package.json:35` | OK |
| Dev probe adds `probe-self-elevate` raw self-write | `AGENTS.md:57` | `src/components/PermsProbe.tsx:234` | OK |
| Empty/unset `ADMIN_EMAILS` ⇒ no admins bootstrapped | `README.md:366` / `.env.example:12` | `src/lib/admin.ts:39` (`parseAdminEmails` → `[]`) → `decideBootstrap` no-elevate | OK |
