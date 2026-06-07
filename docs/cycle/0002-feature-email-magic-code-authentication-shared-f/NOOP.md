reason: already-satisfied

# No-op: Cycle 0002 email magic-code authentication is already fully implemented

The complete sign-in flow specified for this cycle already exists in the working
tree and was landed in commit `c6e2211` ("cycle 0002: Email magic-code
authentication"). Every SPEC requirement and acceptance criterion is satisfied by
code already present; no source change is warranted. The only dirty paths in the
tree are cycle-engine bookkeeping (`.cycle/*` logs, reflection issue files), not
product code.

## Evidence

- Shared `useAuth` hook wrapping `db.useAuth()` + magic-code namespace, exposing
  `{ user, isLoading, error, username, sendCode, verifyCode, signOut }`:
  `src/lib/useAuth.ts:32`
- `sendMagicCode` / `signInWithMagicCode` / `signOut` are the auth primitives used
  (no password / external IdP): `src/lib/useAuth.ts:93`
- Auth state is read through the single hook; `db.useAuth()` is called only inside
  it: `src/lib/useAuth.ts:33`
- Derived username = email local-part, shown in UI instead of the raw email
  (SPEC §40): `src/lib/auth.ts:35` and `src/components/AuthGate.tsx:111`
- First-sign-in `users` row keyed to the auth user id, `username` = local-part,
  `adminLevel: 0`, routed through `writeEvent()`: `src/lib/useAuth.ts:61`
- Idempotent create-only-if-absent guard across reloads / repeat sign-ins /
  re-renders: `src/lib/auth.ts:47` and `src/lib/useAuth.ts:45`
- Reserved `IDENTITY_SCOPE` sentinel + `UserSignedIn` event type for
  identity-scoped writes: `src/lib/auth.ts:14`
- Identity events intentionally excluded from the session fold in `applyEvent`:
  `src/lib/db.ts:221`
- `users` row creation failure surfaced (logged), never swallowed; retried on next
  resolution rather than crashing: `src/lib/useAuth.ts:77`
- Invalid/empty email surfaces a validation message and does not call
  `sendMagicCode` (failure path): `src/components/AuthGate.tsx:36`
- Wrong/expired code caught and surfaced as an inline error, user stays on the
  code step: `src/components/AuthGate.tsx:60`
- Email validation pure helper: `src/lib/auth.ts:24`
- Login UI island (email step → code step → signed-in view with sign-out) using
  Tailwind utilities: `src/components/AuthGate.tsx:18`
- Astro gate page rendering the island at `/login`: `src/pages/login.astro:11`
- Unit specs for the pure logic (validation, username derivation, create-guard):
  `src/lib/auth.test.ts:1`
- Playwright e2e covering happy path, persistence on reload, sign-out, invalid
  email, and wrong code: `e2e/auth.spec.ts:40`, `e2e/auth.spec.ts:47`,
  `e2e/auth.spec.ts:55`, `e2e/auth.spec.ts:63`, `e2e/auth.spec.ts:74`
- AGENTS.md documents the `useAuth` seam and `IDENTITY_SCOPE` convention:
  `AGENTS.md:19`
- README.md documents the working sign-in gate and how to exercise it:
  `README.md:64`
