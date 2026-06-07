# SPEC — Cycle 0004: Route Guarding + Role-Aware Routing

## WHY
Cycle 0002 shipped magic-code authentication and cycle 0003 locked down the data layer, but the app has no front door. Every product surface still loads its content regardless of auth state, and there are no protected destinations at all — a logged-out visitor and a signed-in user see the same thing. The upcoming dashboard, session, and join screens (their own cycles) all assume "you are authenticated, and you are allowed to be here." Without a reusable guard that establishes that precondition — and preserves where the user was trying to go — every one of those later cycles would reinvent redirect logic, and deep links (a teacher pasting a session URL, a student opening a join link) would dump unauthenticated users onto a login page that forgets their destination.

## CONCRETE USER BENEFIT
A user who clicks a deep link to a protected page (e.g. a session URL) while signed out is sent to sign in and, **after signing in, lands on the exact page they originally requested** — not a generic home screen. A signed-in user opening the app with no specific destination arrives at their dashboard. And a user who opens a session they do not own sees a clear "you don't have access" message instead of someone else's session shell or a blank error.

## USABLE END-STATE
Protected routes are gated end-to-end:
- Logged out, hitting a protected route bounces to `/login` with the intended destination remembered; completing sign-in returns the user to that destination (including a join deep link).
- Logged in with no target, the user lands on `/dashboard`.
- Logged in but not authorized for an ownership-scoped route (another teacher's session), the user sees a graceful in-page denial rather than the protected content.

## Objective
Deliver a single reusable client-side route guard for the InstantDB-authenticated SPA islands and wire it into minimal protected destinations so the auth gate, intended-destination round-trip, and ownership-scoped denial are observable end-to-end. Because auth state lives in the browser (`useAuth` → `db.useAuth()`), guarding is a hydrated React concern: the guard reads identity from the one shared `useAuth` seam, redirects unauthenticated visitors to `/login` while preserving their destination, returns them after sign-in, routes bare authenticated visits to `/dashboard`, and denies ownership-scoped routes the signed-in user is not permitted to view. The dashboard and session screens themselves remain future cycles; this cycle stands up only the guard and the thin placeholder shells needed to prove it.

## Source Issue
`txt-20260606-213627-route-guarding-role-routing` — "Route guarding + role-aware routing"

## Scope

### In Scope
- A reusable `RouteGuard` React island (`src/components/RouteGuard.tsx`) consuming `useAuth`, exposing four states — loading, unauthenticated (redirect to `/login?next=<encoded path+search>`), authorized (render children), and graceful denial — with an optional `authorize` predicate for ownership-scoped routes; covered by pure unit tests over the next-target validation and landing helpers.
- Intended-destination round-trip + role-aware default landing: a `safeNextPath` helper (`src/lib/routing.ts`) that validates the `next` param (same-origin absolute path only) and a post-sign-in redirect in `AuthGate` that returns to a valid `next` or falls back to `/dashboard`; an already-authenticated visit to `/login` also lands on `/dashboard`.
- Minimal guarded placeholder routes as scaffolding for the guard: `/dashboard` (auth-only) and `/dashboard/sessions/[id]` (ownership-scoped via `sessions.teacherId == user.id`), each rendering only an identifying shell.

### Out of Scope
- The actual dashboard, session, and join screen contents and behavior (their own cycles) — placeholders here carry only a heading and a `data-testid`.
- Admin role gating and the `/admin` route (handled in `txt-...-admin-role-uber-admin-promotion`).
- Server-side / middleware route protection — guarding is client-side because auth state is client-held; SSR pages render a guard shell that hydrates and decides.
- Join-as-participant logic for `/join/:joinCode` — this cycle only preserves and returns to such a deep link, it does not create the participant.

## Requirements
- `RouteGuard` reads identity exclusively through `useAuth` (never `db.useAuth()` directly), honoring the single-auth-seam rule in `AGENTS.md`.
- While auth is loading, the guard renders a stable loading state (`data-testid="route-guard-loading"`) and does **not** redirect — avoiding a flash-redirect before auth resolves.
- When unauthenticated, the guard redirects to `/login?next=<URL-encoded pathname+search of the current location>`.
- `safeNextPath(raw)` returns a destination only when `raw` is a same-origin absolute path (starts with a single `/`, not `//` or a scheme/host); otherwise it returns the `/dashboard` default. This blocks open-redirect via a crafted `next`.
- After successful sign-in, `AuthGate` navigates to `safeNextPath(next)`. An already-signed-in load of `/login` navigates to `/dashboard`.
- The ownership-scoped guard for `/dashboard/sessions/[id]` queries the `sessions` projection by id (reads are open per cycle 0003 perms) and authorizes only when `session.teacherId === user.id`.
- Placeholder protected pages reuse `Layout.astro` and Tailwind/shadcn primitives consistent with existing pages; no new UI library is introduced.
- **Failure behavior**:
  - Invalid/hostile `next` (off-origin URL, protocol-relative `//evil`, missing/empty) → `safeNextPath` discards it and resolves to `/dashboard`; no off-origin navigation occurs.
  - Ownership query error or a session id that resolves to no row → the guard renders the denial state (`data-testid="route-guard-denied"`), never the protected children and never a crash or infinite spinner; the error is logged via `console.error`, not swallowed.
  - Auth-subsystem error from `useAuth` (non-null `error`) is surfaced (logged and reflected in the rendered state) rather than silently treated as authenticated.

## Acceptance Criteria
- [ ] Visiting `/dashboard` while signed out redirects to `/login?next=%2Fdashboard`, and after completing sign-in the browser lands back on `/dashboard` (user-observable benefit: deep-link destination is preserved across login).
- [ ] Visiting a join deep link (e.g. `/dashboard/sessions/<id>`) while signed out, then signing in, returns the user to that same path with its id intact.
- [ ] A signed-in user loading `/login` with no `next` param is routed to `/dashboard`.
- [ ] In a second browser context, a different signed-in user opening the first user's `/dashboard/sessions/<id>` sees the denial state (`route-guard-denied`) and not the session shell (`session-root`). *(failure-path / authorization criterion)*
- [ ] `safeNextPath('//evil.example.com')`, `safeNextPath('https://evil.example.com')`, and `safeNextPath('')` each return `/dashboard` (unit test) — a crafted `next` cannot drive an off-origin redirect. *(failure-path criterion)*
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`, `npm run astro check`).
- [ ] No compiler/linter warnings introduced; `npm run astro check` is clean.

## Testing Strategy
- **Vitest** for pure logic: `src/lib/routing.test.ts` covers `safeNextPath` (valid path passthrough, protocol-relative rejection, absolute-URL rejection, empty/missing → default) and any landing-default helper. No DOM/InstantDB dependency in unit tests.
- **Playwright** (`e2e/route-guarding.spec.ts`) drives the real flow against the port-4399 dev server, reusing `signInViaUi` / `freshEmail` / `adminAvailable` from `e2e/support/auth.ts`; **skips loudly** when `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are unset (mirrors `auth.spec.ts`). Scenarios:
  - Happy path: logged-out hit on `/dashboard` → redirected to `/login` with `next` preserved → sign in → back on `/dashboard`.
  - Deep-link round-trip to an ownership-scoped session path.
  - Bare authenticated `/login` load → `/dashboard`.
  - Ownership denial: teacher context signs in and creates an owned session (via the existing `/dev/perms-probe` write seam), captures the id; a second context with a different user opens `/dashboard/sessions/<id>` and asserts `route-guard-denied` is visible and `session-root` is absent.
- E2E is required because the guard's redirect/landing/denial behavior is only observable in a hydrated browser against live auth.

## Documentation Updates
- **AGENTS.md**: add a short "Route guarding" note under the data/auth section — `RouteGuard` is the single client-side gate for protected islands, it consumes `useAuth` (not `db.useAuth()`), and `safeNextPath` is the only sanctioned way to resolve a post-login destination (open-redirect-safe). Note the placeholder nature of `/dashboard` and `/dashboard/sessions/[id]`.
- **README.md**: surface that protected routes now require sign-in and that an unauthenticated deep link returns the user to their destination after login.
- **release-notes.md**: one line noting the auth gate + intended-destination redirect is live, and any reused testids for downstream cycles.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Magic-code authentication and the shared `useAuth` hook (cycle 0002) — the authenticated session the guard reads from.
- Cycle 0003 permission rules pushed live (open `sessions` reads) so the ownership query resolves; the `/dev/perms-probe` seam for seeding an owned session in the denial e2e.
- Astro `output: 'server'` with React islands; `@/components/ui/button` + `input` primitives and Tailwind already present.
- Env: `PUBLIC_INSTANTDB_APP_ID` (app); `INSTANT_ADMIN_TOKEN` (e2e-only deterministic sign-in, else the suite skips loudly).
