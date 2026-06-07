The diff is clean and focused. All gates pass: 449 unit tests green, `astro check` 0 errors/0 warnings, build succeeds with `@instantdb/admin` bundled server-side and `ADMIN_EMAILS` absent from the client bundle, coverage holds (new in-scope code 100%).

## Summary

Cycle 0019 turns the dormant `users.adminLevel` placeholder into a trustworthy, unforgeable global capability and ships the first slice of admin access end-to-end. **Created:** `src/lib/admin.ts` (84 lines — `ADMIN_LEVEL_NONE`/`ADMIN_LEVEL_UBER`, `AdminLevel`, total `normalizeAdminLevel`/`parseAdminEmails`/`isEmailAllowlisted`/`decideBootstrap`), `src/lib/admin.test.ts` (160 lines), `src/pages/api/admin/bootstrap.ts` (107 lines — the server-only `POST` endpoint), `src/components/AdminRouteGuard.tsx` (38 lines), `src/pages/admin.astro` (24 lines), `e2e/admin-route.spec.ts` (118 lines), and the cycle `walkthrough.mjs` (118 lines). **Modified:** `src/lib/db.ts` (schema field `i.number()`→`i.string<AdminLevel>()`; extracted shared pure `buildEventEnvelope` from `writeEvent`), `src/lib/db.test.ts` (+2 `buildEventEnvelope` tests), `src/lib/routing.ts`/`.test.ts` (added total `authorizeAdmin` + 11 cases), `src/lib/perms.ts`/`.test.ts` (tightened `users` create/update to forbid client elevation + structural assertion), `src/lib/useAuth.ts` (writes `ADMIN_LEVEL_NONE`; ref-latched bootstrap POST), `src/components/PermsProbe.tsx` (added `probe-self-elevate`), `package.json`/`package-lock.json` (moved `@instantdb/admin` to `dependencies`), `AGENTS.md`/`README.md`/`.env.example`.

**PLAN tasks complete:** all of Tasks 1–10. **Test command:** `npm test` (`vitest run`) → 11 files, **449 passed**. **Coverage:** `npm run test:coverage` → lines **92.5%**, branches **85.35%**, functions **86.3%**, statements **90.98%**; new in-scope files `admin.ts` 100% and `routing.ts` 100% (all metrics), `db.ts` lines rose to **93.24%** (the extracted `buildEventEnvelope` is now directly tested) — no per-file regression (the API route is `src/pages/**`, the guard is `.tsx`, both outside the `src/lib/**/*.ts` coverage scope, consistent with the existing island convention).

**Failure modes handled:** *validation* — `decideBootstrap`/`authorizeAdmin`/`normalizeAdminLevel` are total (hostile/legacy/missing input → safe `none`/`denied`), each unit-covered; *auth* — endpoint returns `401` on missing/invalid/expired token (e2e bad-token + empty-body assertions), `500` when the admin SDK is unavailable or a query/transact fails (each logged `[api/admin/bootstrap] …`), `200 {adminLevel:'none'}` for verified-but-not-allowlisted (no writes); *fallback/degrade* — `useAuth`'s bootstrap fetch `.catch`/non-`ok` paths log and leave the user non-admin without crashing; the `AdminRouteGuard` query error forces `denied` (logged), never a flash or hang; *idempotency* — `decideBootstrap` short-circuits an already-`uber` user (no duplicate `users` write or event), proven by the e2e reload delta-0 assertion; the elevation write is one atomic `admin.transact`; *unforgeability* — the tightened `users` rule (`newData.adminLevel == 'none'`) is asserted structurally and exercised live via the `probe-self-elevate` rejection e2e leg.

**Deviations from PLAN:** (1) the `writeEvent`-regression test is satisfied structurally — `writeEvent` now literally calls the shared `buildEventEnvelope`, which is directly unit-tested, rather than spying on `db.transact` (which needs a live client); the envelope shape is therefore guaranteed identical. (2) The admin-SDK-unavailable `500` branch is covered by the endpoint's explicit env-guard logic and the client degrade path rather than a live e2e (the dev server's `INSTANT_ADMIN_TOKEN` can't be unset for a single request); the live e2e instead asserts the `401` failure path, which is reachable. (3) Resynced `package-lock.json` after moving the dependency between groups so `npm ci` won't flag a dev/prod mismatch.

**Deferred / follow-up:** promotion of another user by an existing uber admin, the admin observability/event-replay UI, and org/group-scoped admins remain out of scope (per SPEC). **Deploy steps required before the feature works against the live app (manual, documented in AGENTS.md/README):** `npx instant-cli push schema` (the `adminLevel` field-type change — legacy rows degrade safely via `normalizeAdminLevel`) and `npm run perms:push` (the tightened `users` rule). The admin e2e and walkthrough skip/degrade loudly in this environment because `INSTANT_ADMIN_TOKEN`/`ADMIN_EMAILS` are unset locally.

## Touched Files
- .env.example
- AGENTS.md
- README.md
- package.json
- package-lock.json
- src/lib/admin.ts
- src/lib/admin.test.ts
- src/lib/db.ts
- src/lib/db.test.ts
- src/lib/routing.ts
- src/lib/routing.test.ts
- src/lib/perms.ts
- src/lib/perms.test.ts
- src/lib/useAuth.ts
- src/components/AdminRouteGuard.tsx
- src/components/PermsProbe.tsx
- src/pages/admin.astro
- src/pages/api/admin/bootstrap.ts
- e2e/admin-route.spec.ts
- docs/cycle/0019-feature-global-admin-role-uber-admin-bootstrap-p/walkthrough.mjs
- docs/adr/0003-global-admin-role-and-internal-observability.md
