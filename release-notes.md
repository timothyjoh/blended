# Release Notes

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
