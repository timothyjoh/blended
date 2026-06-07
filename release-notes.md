# Release Notes

## Cycle 0004 — Route guarding + role-aware routing

- **New: client-side route guard.** Protected routes now require sign-in. A
  logged-out visit to a protected route bounces to `/login` with the intended
  destination remembered (`?next=…`), and after sign-in returns the user to that
  exact page — including a deep link like `/dashboard/sessions/<id>` (id
  preserved). A signed-in `/login` load with no target lands on `/dashboard`.
  (`src/components/RouteGuard.tsx`, `src/lib/routing.ts`, redirect added to
  `src/components/AuthGate.tsx`)
- **New: ownership-scoped denial.** Opening a session you don't own renders a
  graceful "you don't have access" state instead of the protected shell
  (`src/components/SessionRouteGuard.tsx`, authorized via
  `sessions.teacherId == user.id`).
- **Open-redirect safe.** `safeNextPath` honors only same-origin absolute paths;
  a crafted `?next=//evil` / `https://evil` / empty falls back to `/dashboard`.
- **New placeholder routes** (thin shells only; real screens are later cycles):
  `/dashboard` and `/dashboard/sessions/[id]`.
- **Reused testids for downstream cycles:** `route-guard-loading`,
  `route-guard-denied`, `dashboard-root`, `session-root`.
- New e2e suite `e2e/route-guarding.spec.ts` (reuses `INSTANT_ADMIN_TOKEN`;
  skips loudly when unset). No new env vars.

## Cycle 0002 — Email magic-code authentication

- **New: email magic-code sign-in gate** at `/login`. Email → code → signed-in
  view (shows the derived username, never the raw email) → sign-out. Session
  persists across reload. (`src/components/AuthGate.tsx`, `src/pages/login.astro`)
- **New: shared `useAuth` hook** (`src/lib/useAuth.ts`) — the single app-wide
  auth seam. Product code must not call `db.useAuth()` directly.
- First sign-in creates exactly one `users` row keyed to the InstantDB auth user
  id (`username` = email local-part, `adminLevel: 0`), routed through
  `writeEvent()` under the reserved `IDENTITY_SCOPE` sentinel — idempotent across
  repeat sign-ins.
- **New env var (e2e-only): `INSTANT_ADMIN_TOKEN`.** Used by the Playwright auth
  suite to mint deterministic magic codes via `@instantdb/admin` (no email
  sent). Never used by client/product code. When unset, `e2e/auth.spec.ts` skips
  loudly. Added `@instantdb/admin` as a devDependency. See `.env.example`.
