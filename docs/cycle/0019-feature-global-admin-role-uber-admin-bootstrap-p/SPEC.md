# SPEC — Cycle 0019: Global Uber-Admin Role — Allowlist Bootstrap & Route Authorization

## WHY
Blended has session-scoped Teacher/Student roles only. There is no operator who can authorize against the system as a whole. ADR-0003 calls for a **global** `User.adminLevel` (distinct from `Participant.role`) so an operator can later observe every session's event stream to verify the platform produces correct data. The schema already carries an `adminLevel` placeholder (`i.number()`, defaulted to `0`), but nothing reads it, nothing sets it to an elevated value, and — critically — the `users` permission rule lets a client update its own row freely, so a client could simply write its own elevated `adminLevel`. Admin authorization built on a client-writable field would be forgeable and therefore meaningless. There is no admin surface and no way to become an admin.

## CONCRETE USER BENEFIT
An operator whose email is in the server-side `ADMIN_EMAILS` allowlist signs in with the ordinary magic-code flow and can **reach `/admin`** — a route that every non-allowlisted user (signed in or not) is **denied**. A non-admin cannot reach `/admin` and cannot grant themselves admin by writing their own `users` row. This is the first cross-session, account-level capability in the product: who you are (not which session you own) decides what you can reach.

## USABLE END-STATE
- I add my email to `ADMIN_EMAILS`, sign in normally, and navigating to `/admin` shows the admin landing instead of an access-denied message.
- A teammate who is not on the allowlist signs in and navigating to `/admin` shows "You don't have access."
- Neither user can flip their own status by editing their `users` row from the client — the elevation only ever happens server-side against the allowlist.
- The elevation is recorded as an event in the append-only log, so the act of becoming an admin is itself observable evidence (ADR-0003).

## Objective
Make `adminLevel` a trustworthy, unforgeable global capability and deliver the first slice of admin access end-to-end: an `ADMIN_EMAILS` allowlist that elevates a matching user to `uber` **server-side on sign-in** (via the admin SDK, which bypasses client permission rules), recorded through an event-log append; a tightened `users` permission rule that forbids a client from elevating its own `adminLevel`; and an admin-only `/admin` route that an uber admin can reach and everyone else is denied. This is the smallest vertical slice that turns the dormant `adminLevel` placeholder into a real, secure capability a user can observe.

## Source Issue
`txt-20260606-213643-admin-role-uber-admin-promotion` — "Global admin role + uber-admin bootstrap & promotion"

## Scope

### In Scope
- **Trustworthy `adminLevel` + allowlist bootstrap.** Model the admin level as the named domain values `'none' | 'uber'` (CONTEXT.md "Uber Admin"); store it as a string-union field and expose pure helpers in a new `src/lib/admin.ts` (`ADMIN_LEVEL_NONE`/`ADMIN_LEVEL_UBER`, `AdminLevel` type, `normalizeAdminLevel(raw)` mapping anything not exactly `'uber'` → `'none'`, `parseAdminEmails(raw)` parsing the comma/whitespace-separated env list case-insensitively, `isEmailAllowlisted(email, allowlist)`). Add a server-only endpoint `POST /api/admin/bootstrap` that verifies the caller's InstantDB token via the admin SDK, and — only when the verified email is in `ADMIN_EMAILS` and the user is not already `uber` — sets `adminLevel: 'uber'` and appends an `AdminBootstrapped` event under `IDENTITY_SCOPE`, atomically, via the admin SDK. `useAuth` calls this endpoint once per authenticated session (ref-latched, idempotent). Tighten the `users` permission rule so a client may create/update its own row only with a non-elevated `adminLevel` (it can never write `'uber'`).
- **Admin route authorization.** A pure `authorizeAdmin({ adminLevel, loading, error })` helper (in `src/lib/routing.ts`, returning the existing `AuthzDecision`) plus an `AdminRouteGuard` island that reads the signed-in user's own `users` row, folds its `adminLevel` through `normalizeAdminLevel` + `authorizeAdmin`, and hands `RouteGuard` a precomputed decision (mirroring `SessionRouteGuard`). A new `/admin` Astro page gated by `AdminRouteGuard` rendering a minimal admin landing (`data-testid="admin-root"`); non-admins get `RouteGuard`'s existing denial.
- **Tests.** Unit tests for the new pure helpers and the structural perms guard; an e2e spec proving an allowlisted email reaches `/admin` and a non-allowlisted user is denied, plus the failure paths below.

### Out of Scope
- **Promotion of another user by an existing uber admin** (issue AC #3 + its Playwright check) — a cleanly separable deliverable; defer to a sibling cycle that builds on this cycle's `/api/admin/*` server pattern and `AdminBootstrapped` envelope.
- Admin console / observability screens (event-stream replay UI) — deferred per the issue and ADR-0003.
- Organization/group-scoped admins — future, noted in ADR-0003.
- Any additional admin level beyond `uber`.

## Requirements
- `users.adminLevel` is the named domain value, default `'none'`, elevated `'uber'`. Code treats `adminLevel` exclusively through `src/lib/admin.ts` constants/types; no string literals `'uber'`/`'none'` scattered across call sites.
- The elevated write to `adminLevel` happens **only** server-side via `@instantdb/admin` (which bypasses permission rules). The client can never produce an `uber` value: first-sign-in row creation in `useAuth` writes `adminLevel: ADMIN_LEVEL_NONE`, and the `users` permission rule rejects any client create/update whose `adminLevel` is not `'none'`.
- The bootstrap write is event-logged: it appends a `sessionEvents` row using the same §7.2 envelope shape as `writeEvent` (extract a shared pure `buildEventEnvelope(type, meta)` from `writeEvent` so the client choke point and the server endpoint emit identical envelopes), under `IDENTITY_SCOPE` with event type `AdminBootstrapped`, transacted atomically with the `users` update. `AdminBootstrapped` is an identity-scope event and is intentionally not folded by `applyEvent` (it belongs to no real session, like `UserSignedIn`).
- `ADMIN_EMAILS` is a **server-only** env var (no `PUBLIC_` prefix — must never reach the client bundle). `parseAdminEmails` tolerates empty/unset (→ empty allowlist) and trims/lowercases entries for case-insensitive matching.
- `authorizeAdmin` is total: `error` → `denied`; `loading` → `loading`; otherwise `authorized` only when `normalizeAdminLevel(adminLevel) === ADMIN_LEVEL_UBER`, else `denied`. Error wins over loading (matches `authorizeOwnership`).
- The `/admin` route must not flash its protected content before authorization resolves (reuse `RouteGuard`'s loading/denied shells).
- Identity is read exclusively through `useAuth` (never `db.useAuth()` directly), per the single-auth-seam rule.
- **Failure behavior**:
  - `ADMIN_EMAILS` unset/empty → allowlist is empty; the bootstrap endpoint mutates nothing and returns a non-elevated result; the user remains `none` and is denied `/admin`. Logged, not fatal.
  - `INSTANT_ADMIN_TOKEN` unset (admin SDK unavailable) on the server → `/api/admin/bootstrap` returns a clear error status (500) and writes nothing; the client logs it and the user remains non-admin. Sign-in and the rest of the app stay fully usable — the failure is surfaced, never swallowed, and never crashes the app.
  - Caller token missing/invalid/expired → endpoint returns `401`, mutates nothing.
  - Verified email not in the allowlist → endpoint returns `200` with `adminLevel: 'none'`, writes no `users` update and **no** `AdminBootstrapped` event.
  - Already-`uber` user re-bootstraps → endpoint is idempotent: no duplicate `users` write and no duplicate event.
  - Bootstrap endpoint unreachable / network error from the client → logged via `console.error`; the user degrades to non-admin (denied `/admin`) rather than the app hanging or throwing.
  - A client attempt to set its own `users.adminLevel` to `'uber'` is rejected by the permission rule (the transaction fails); state is unchanged.

## Acceptance Criteria
- [ ] **User benefit:** signing in with an email present in `ADMIN_EMAILS` makes `/admin` reachable — `data-testid="admin-root"` renders; signing in with a non-allowlisted email (or visiting unauthenticated) shows `route-guard-denied` / bounces to `/login`. (e2e)
- [ ] `users.adminLevel` exists as the named value with `'none'` the default and `'uber'` the elevated value; `normalizeAdminLevel` maps any non-`'uber'` input (including legacy numeric/absent values) to `'none'`. (unit)
- [ ] `authorizeAdmin` returns `authorized` only for `uber`, `denied` for `none`/unknown, `loading` while unresolved, and `denied` on error (error beats loading). (unit)
- [ ] `POST /api/admin/bootstrap` elevates an allowlisted, verified caller to `uber` and appends exactly one `AdminBootstrapped` event under `IDENTITY_SCOPE`, atomically; a second call for the same already-`uber` user writes neither a `users` update nor a new event. (e2e against the live app via the admin query seam, or unit on the pure handler logic)
- [ ] **Failure-path:** a client transaction setting its own `users.adminLevel` to `'uber'` is rejected by the permission rule and the row's `adminLevel` is unchanged; AND when `ADMIN_EMAILS` is empty/unset, an otherwise-valid signed-in user is left `none` and denied `/admin` with no `AdminBootstrapped` event written. (e2e/unit + perms structural test)
- [ ] **Failure-path:** with `INSTANT_ADMIN_TOKEN` unset on the server, `/api/admin/bootstrap` returns `500`, writes nothing, the client logs the error, and the rest of the app (sign-in, dashboard) remains usable. (unit/e2e)
- [ ] `ADMIN_EMAILS` does not appear in the client bundle (no `PUBLIC_` prefix; not imported by any client island). (code review + grep assertion)
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`astro check` clean).

## Testing Strategy
- **Unit (Vitest):** co-located tests for `src/lib/admin.ts` (`normalizeAdminLevel` over `'uber'`/`'none'`/legacy number/`undefined`/garbage; `parseAdminEmails` over empty/whitespace/mixed-case/comma lists; `isEmailAllowlisted` case-insensitivity) and `authorizeAdmin` (all four verdicts incl. error-over-loading). Extend `perms.test.ts` to assert the tightened `users` rule forbids a non-`'none'` `adminLevel` on client create/update. Test `buildEventEnvelope` produces a §7.2-shaped envelope and that `writeEvent` still composes it identically (regression).
- **E2E (Playwright, existing harness):** new `e2e/admin-route.spec.ts`, gated by `adminAvailable()` (skips loudly without `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID`). The dev server inherits `ADMIN_EMAILS` from `.env`; the spec signs in via `signInViaUi` with a deterministic allowlisted email (e.g. `admin@blended.test`, added to `ADMIN_EMAILS`) and asserts `admin-root` is reachable, then with a `freshEmail()` (non-allowlisted) asserts `route-guard-denied` at `/admin`. Use `queryAdmin` to assert the `AdminBootstrapped` event and the `uber` `users` row after the allowlisted sign-in. Covers happy path + failure paths (non-allowlisted denied; self-elevation rejected).
- **Key scenarios:** allowlisted → reachable; non-allowlisted → denied; unauthenticated → bounced to `/login`; client self-elevation rejected; empty allowlist → no elevation; idempotent re-bootstrap; admin SDK unavailable → 500 without crashing the app.

## Documentation Updates
- **AGENTS.md**: document that the elevated `adminLevel` write is server-only (admin SDK, bypasses rules); the `users` rule forbids client `adminLevel` elevation; `adminLevel` is the `'none' | 'uber'` domain value accessed via `src/lib/admin.ts`; `AdminBootstrapped` is an identity-scope event written through the shared `buildEventEnvelope`; and the new `/api/admin/bootstrap` server endpoint + `AdminRouteGuard`/`authorizeAdmin` pattern.
- **README.md**: surface the `/admin` route and the `ADMIN_EMAILS` allowlist (how the first uber admin is bootstrapped); note it is server-only and never exposed to the client.
- **.env.example**: add `ADMIN_EMAILS=` with a comment that it is a server-only comma-separated allowlist of uber-admin emails (no `PUBLIC_` prefix) and that an empty value means no admins are bootstrapped.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Builds on the schema + `writeEvent()` dual-write foundation (`src/lib/db.ts`), the magic-code auth seam (`src/lib/useAuth.ts`, `src/lib/auth.ts` `IDENTITY_SCOPE`), and the route-guard pattern (`src/components/RouteGuard.tsx`, `SessionRouteGuard.tsx`, `src/lib/routing.ts`).
- `@instantdb/admin` (already a dependency) for server-side token verification + rule-bypassing writes; Astro `output: 'server'` with the Vercel adapter (already configured) provides the API route surface (cf. `src/pages/e2e/hang.ts`).
- Server env: `INSTANT_ADMIN_TOKEN` (already used by the e2e auth seam) and the new `ADMIN_EMAILS`, both server-only.
- The `adminLevel` field type change (number placeholder → `'none' | 'uber'` string union) requires `instant-cli push schema`; the tightened `users` rule requires `npm run perms:push`. `normalizeAdminLevel` tolerates any legacy stored value at read time, so existing dev rows degrade safely to `'none'` (denied) rather than throwing.
