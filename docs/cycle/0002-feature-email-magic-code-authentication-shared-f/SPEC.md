# SPEC — Cycle 0002: Email Magic-Code Authentication (Shared Sign-In Gate)

## WHY
Blended has a data spine (the InstantDB schema and the `writeEvent()` dual-write helper from cycle 0001) but no way for a human to become an authenticated identity. Nothing in the app can yet know *who* is acting. Every downstream feature — creating a session, joining via link, posting a message, being promoted to admin — presupposes a signed-in user with a stable id. Today there is no login surface, no session persistence, and no `users` row, so none of that work can begin.

## CONCRETE USER BENEFIT
A person can open the app, type their email, receive a magic code, enter it, and land in a signed-in state that survives a page reload — then sign out and return to the login gate. After this cycle a real human has a durable, app-wide identity they can establish and tear down themselves; before it, the app had no notion of an authenticated person at all.

## USABLE END-STATE
- Visiting the auth gate shows an email entry form.
- Submitting a valid email transitions the form to a code-entry step.
- Entering the emailed code signs the user in and renders a signed-in view that displays their identity (derived username) and a sign-out control.
- Reloading the page keeps the user signed in.
- Clicking sign out clears the session and returns to the email entry form.
- The user has exactly one `users` row keyed to their InstantDB auth user id, with `username` defaulted to the email local-part.

## Objective
This cycle delivers the single shared passwordless sign-in flow for Blended: one reusable login UI island, one shared `useAuth` hook exposing auth state app-wide, session persistence across reload, sign-out, and first-sign-in creation of a `users` projection row keyed to the InstantDB auth user id. It is the identity gate that every teacher, student, and admin passes through; role and authorization are layered separately in later cycles. It matters because no session, participation, or admin feature can be built until the app can answer "who is this user?" with a stable, persisted identity.

## Source Issue
`txt-20260606-213626-magic-code-auth` — "Email magic-code authentication (shared flow for teacher, student, admin)"

## Scope

### In Scope
- A shared `useAuth` hook (in `src/lib`) wrapping InstantDB's `db.useAuth()`, `db.auth.sendMagicCode`, `db.auth.signInWithMagicCode`, and `db.auth.signOut`, exposing `{ user, isLoading, error, sendCode, verifyCode, signOut }` and the derived username.
- A single reusable login UI React island (email step → code step → signed-in view with sign-out), plus an Astro gate page that renders it.
- First-sign-in `users` projection row creation, keyed to the InstantDB auth user id, with `username` = email local-part and `adminLevel: 0`, routed through `writeEvent()` (per the AGENTS.md / ADR-0001 invariant that no product code writes a projection row outside the helper).

### Out of Scope
- Route guarding and role-based routing (separate cycle `txt-20260606-213627`).
- Admin promotion / uber-admin (separate cycle `txt-20260606-213643`).
- Per-session `participants` row creation and the join-via-link flow (separate cycles).
- Email styling/branding of the magic-code email (InstantDB default is used).

## Requirements
- Authentication MUST use InstantDB's `auth.sendMagicCode({ email })` and `auth.signInWithMagicCode({ email, code })`; no password or external IdP.
- Auth state MUST be readable app-wide through one shared hook (`useAuth`) so later cycles consume identity from a single place; product code MUST NOT call `db.useAuth()` directly outside this hook.
- Session persistence is provided by InstantDB's client; the signed-in state MUST survive a full page reload without re-entering a code.
- The signed-in view MUST display the derived username (email local-part), never the raw email in primary view copy (SPEC §12.3 / §5 email privacy).
- On first sign-in, exactly one `users` row keyed to the auth user id MUST be created via `writeEvent()`. Because `writeEvent()` requires a `sessionId`, identity-scoped creation MUST use a reserved non-session scope sentinel id (constant `IDENTITY_SCOPE`, e.g. `"identity"`) with actor `{ id: <auth user id>, role: 'unknown' }` and a `UserSignedIn` (or `UserCreated`) event type. The write MUST be guarded so it runs only when no `users` row already exists for that auth id (idempotent across repeat sign-ins).
- UI MUST use Tailwind utility classes (per AGENTS.md), matching the existing `src/components/ui` / island conventions; interactive widgets are `.tsx` React islands, the gate page is `.astro`.
- **Failure behavior**:
  - Invalid/empty email submission: the form surfaces a validation message and does not call `sendMagicCode`; no state change.
  - Wrong or expired magic code: `signInWithMagicCode` rejection is caught and surfaced as an inline error on the code step; the user remains on the code step and MAY retry or request a new code (SPEC §15 — allow resend/typo correction). The error is shown, never swallowed.
  - InstantDB unavailable / `sendMagicCode` rejects: the error is surfaced to the user and logged; the form stays on the email step rather than advancing.
  - `users` row creation failure (rejected `writeEvent`): the rejection propagates and is logged; because `writeEvent` is atomic, no partial row is written. Sign-in auth state still reflects the InstantDB session, and the guarded creation is retried on next auth-state resolution rather than crashing the app.

## Acceptance Criteria
- [ ] **(User benefit)** A user can submit an email, receive a code, enter it, and the signed-in view renders showing their derived username — verified end-to-end by a Playwright test.
- [ ] After sign-in, reloading the page keeps the user signed in (no code re-entry), verified by Playwright.
- [ ] Clicking sign out clears the session and the login email-entry form returns, verified by Playwright.
- [ ] After first sign-in, exactly one `users` row exists keyed to the InstantDB auth user id with `username` equal to the email local-part and `adminLevel: 0`; a second sign-in by the same user creates no duplicate row.
- [ ] **(Failure path)** Submitting an invalid/empty email shows a validation error and issues no `sendMagicCode` call; entering a wrong code shows an inline error and leaves the user on the code step able to retry — verified by a Playwright assertion on the rendered error and unchanged step.
- [ ] The `users` row write goes through `writeEvent()` (a `sessionEvents` envelope is appended alongside it); no projection-only `db.tx.users[...]` write exists in product code.
- [ ] `npm run astro check` passes with no new type errors.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- **Unit (Vitest)**: pure logic only — email local-part derivation, email validation, and the "create users row only if absent" decision function. Specs live beside their module as `*.test.ts`.
- **E2E (Playwright)**: spec in `e2e/` named after the auth surface (e.g. `auth.spec.ts`), using the existing port-4399 dev-server harness and `retries: 3`.
  - Happy path: enter email → supply code → assert signed-in view + derived username.
  - Persistence: reload → assert still signed in.
  - Sign-out: click sign out → assert login gate returns.
  - Failure path: invalid email → assert validation error and no advance; wrong code → assert inline error and that the code step persists.
  - Deterministic code entry for tests is provided via InstantDB's dev/test magic-code mechanism or a seeded test user (see Dependencies); the test must not depend on a real inbox.
- Run `npm run astro check` as part of the gate.

## Documentation Updates
- **AGENTS.md**: add a short note under the Data Layer / project structure sections that all auth state flows through the shared `useAuth` hook (no direct `db.useAuth()` in product code) and that identity-scoped `users` creation uses the `IDENTITY_SCOPE` sentinel through `writeEvent()`.
- **README.md**: surface that the app now has a working email magic-code sign-in gate, and how to exercise it locally (env var, dev test-code path).
- **.env.example / release-notes.md**: note any new test/dev-auth configuration required for the deterministic Playwright code path, if one is introduced.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Cycle 0001 foundation: the `users` entity definition, the `db` client/schema (`src/lib/db.ts`), and the `writeEvent()` helper (`txt-20260606-213624-schema-write-event-foundation`).
- `@instantdb/react` auth API (`db.auth.sendMagicCode`, `db.auth.signInWithMagicCode`, `db.auth.signOut`, `db.useAuth`).
- `PUBLIC_INSTANTDB_APP_ID` set in `.env`; the Blended schema pushed to the live Instant app (`npx instant-cli push schema`) so `users` writes are accepted.
- A deterministic magic-code path for Playwright (InstantDB dev/test magic-code mechanism or a seeded test user) — this is a known risk; if InstantDB exposes no test code, a seeded user with a guest-auth or token-based test entry must be wired and documented before the e2e gate can be green.
