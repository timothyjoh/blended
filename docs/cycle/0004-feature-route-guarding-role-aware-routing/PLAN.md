# Implementation Plan: Cycle 0004

## Overview
Deliver a single reusable client-side `RouteGuard` React island plus an open-redirect-safe `safeNextPath` routing helper, wire a post-sign-in / already-signed-in redirect into `AuthGate`, and stand up two thin protected placeholder pages (`/dashboard`, `/dashboard/sessions/[id]`) so the auth gate, intended-destination round-trip, and ownership-scoped denial are observable end-to-end.

## Current State (from Research)
- **Single auth seam**: `useAuth()` (`src/lib/useAuth.ts:32-98`) exposes `{ user, isLoading, error, username, … }`. Product code reads identity only through it — never `db.useAuth()` directly (`AGENTS.md` rule). No routing/redirect code exists anywhere in `src/` or `e2e/`.
- **Sign-in island**: `AuthGate` (`src/components/AuthGate.tsx:17-178`) is prop-free, does loading-before-decide (`:98-104`), and surfaces+logs errors via `surface()` (`:25-29`). It has no `next`/redirect logic; `login.astro` (`src/pages/login.astro`) mounts it with `client:only="react"`.
- **Pure-helper + co-located test pattern**: `src/lib/auth.ts` (total, db-free helpers) tested in `src/lib/auth.test.ts` with table-driven `it.each` failure cases. This is the structural model for `src/lib/routing.ts`.
- **URL reading precedent**: `PermsProbe.tsx:14-17` reads query params via `new URLSearchParams(window.location.search)`; that is the only existing URL-reading idiom.
- **Query-by-id projection read**: `db.useQuery(id ? { sessions: { $: { where: { id } } } } : null)` with skip-when-null (`PermsProbe.tsx:30-33`, `useAuth.ts:40`). `Session.teacherId` (`src/lib/db.ts:51`) is the ownership field; `sessions` reads are open per cycle 0003 perms (`src/lib/perms.ts:42-56`).
- **Page shell**: `Layout.astro` accepts `title` + renders `<slot/>`; protected pages reuse it with `@/components/ui/*` primitives. Astro serializes props to `client:only` islands (used for `targetSessionId`-style data today via URL, prop-passing is available for dynamic params).
- **Test infra**: Vitest `environment: 'node'`, `include: ['src/**/*.test.ts']`, coverage over `src/lib/**/*.ts` (so `routing.ts` is in scope). Playwright `baseURL: http://localhost:4399`, `retries: 3`; specs `test.skip(!adminAvailable(), …)` and sign in via `signInViaUi` (`e2e/support/auth.ts:44-57`), multi-user via `browser.newContext()` (`e2e/permissions.spec.ts:33-57`).

## Desired End State
- `src/lib/routing.ts` exists with pure, total `safeNextPath`, `loginRedirectTarget`, and `authorizeOwnership` helpers, fully unit-tested in `src/lib/routing.test.ts`.
- `src/components/RouteGuard.tsx` (auth-only guard) and `src/components/SessionRouteGuard.tsx` (ownership-scoped wrapper) exist and consume `useAuth` only.
- `src/pages/dashboard/index.astro` renders a `dashboard-root` shell behind the guard; `src/pages/dashboard/sessions/[id].astro` renders a `session-root` shell behind the ownership guard.
- `AuthGate` redirects to `safeNextPath(next)` after sign-in and routes an already-signed-in `/login` load to `/dashboard`.
- `e2e/route-guarding.spec.ts` covers redirect+round-trip, bare-login landing, and ownership denial.
- Verify: `npm run test`, `npm run test:e2e`, and `npm run astro check` all pass clean; the four observable behaviors hold in a browser.

## What We're NOT Doing
- Real dashboard / session / join screen content or behavior — placeholders carry only a heading + `data-testid`.
- Admin role gating and the `/admin` route (separate cycle).
- Server-side / Astro-middleware route protection — guarding is client-side because auth state is client-held.
- Join-as-participant logic for `/join/:joinCode` — this cycle only preserves and returns to such deep links; it does not create a participant.
- Any router library or new UI library — redirects use `window.location`; UI uses existing Tailwind/shadcn primitives.
- Refactoring `useAuth` or the existing auth/permissions tests.

## Implementation Approach
Build bottom-up in vertical slices: (1) pure routing logic with exhaustive unit tests; (2) the auth-only `RouteGuard` wired into the simplest protected page (`/dashboard`); (3) the `AuthGate` redirect round-trip that makes the gate's destination preservation real; (4) the ownership-scoped guard + session placeholder; (5) the Playwright suite that proves all of it in a hydrated browser; (6) docs.

Key resolved design decisions (closing RESEARCH open questions):
- **Redirect mechanism**: `window.location.replace(...)` for both the login bounce and the post-sign-in return — replace (not assign) so the bounce URL is not left in history. Current location read via `window.location.pathname + window.location.search`, mirroring the `PermsProbe` `URLSearchParams(window.location.search)` idiom.
- **Reading `next` in `AuthGate`**: read inside the island from `window.location.search` (a local `readNext()` helper), keeping `AuthGate` prop-free and consistent with `PermsProbe`.
- **`authorize` shape**: because ownership authorization needs a React `db.useQuery` that cannot run inside a predicate closure, `RouteGuard` accepts an optional **precomputed** `authorize: AuthzDecision` (`'loading' | 'authorized' | 'denied'`) rather than a callback. The query runs in the `SessionRouteGuard` wrapper, which feeds query results to the pure `authorizeOwnership(...)` helper and passes the resulting decision to `RouteGuard`. This honors the SPEC's "optional authorize predicate" intent while staying hook-safe and unit-testable.
- **Passing the session id**: `[id].astro` passes `Astro.params.id` as a prop to `SessionRouteGuard` (`client:only="react"`), avoiding a client-side URL parse for a value Astro already has.
- **testid set (fixed for downstream cycles)**: `route-guard-loading`, `route-guard-denied`, `dashboard-root`, `session-root`.

## Failure & Resilience Decisions

**Task 1 — `src/lib/routing.ts` (pure helpers):** N/A — pure. Total functions over all inputs; never throw, never do I/O. Hostile/empty `next` and missing/erroring ownership inputs resolve to safe defaults (`/dashboard`, `denied`) by construction, covered by unit tests.

**Task 2 — `RouteGuard.tsx` (redirect side effect):**
- *Failure modes*: `useAuth().error` non-null → the guard does **not** treat the user as authenticated; it logs via `console.error('[RouteGuard]', …)` and renders `route-guard-denied`. During `isLoading` it renders the stable `route-guard-loading` state and performs **no** redirect (prevents flash-redirect before auth resolves). When unauthenticated, it redirects to `loginRedirectTarget(...)`.
- *Idempotency*: the redirect is fired once via a `useRef` in-flight latch (the `inFlight` ref pattern from `useAuth.ts:36`), guarded on `!isLoading && !user && !error`; re-renders and React StrictMode double-invokes do not double-navigate. `window.location.replace` is itself idempotent (navigating to the same URL is a no-op).
- *Observability*: auth-subsystem errors are `console.error`-logged with a `[RouteGuard]` tag (project convention, `useAuth.ts:81`).
- *No silent failure*: the auth `error` path is never swallowed — it is both logged and reflected in the rendered denied state; it is never collapsed into "authenticated".

**Task 3 — `AuthGate` redirect:**
- *Failure modes*: a hostile/empty/off-origin `next` is neutralized by `safeNextPath` → falls back to `/dashboard`; no off-origin navigation can occur. If `window`/`location` is unavailable (SSR path), the island is `client:only` so this code only runs client-side; a defensive `typeof window === 'undefined'` guard returns without navigating.
- *Idempotency*: the post-sign-in redirect fires from a `useEffect` keyed on `user` becoming truthy, latched with a `useRef` so a re-render does not re-navigate; `replace` to the same target is a no-op.
- *Observability*: navigation target derives from `safeNextPath`; no new error surface is introduced beyond the existing `surface()` (`AuthGate.tsx:25-29`).
- *No silent failure*: existing `surface()` error handling for `sendCode`/`verifyCode` is unchanged and still logs+renders; the redirect adds no swallowed catch.

**Task 4 — `SessionRouteGuard.tsx` (ownership query):**
- *Failure modes*: `db.useQuery` error OR an id resolving to zero rows → `authorizeOwnership` returns `'denied'`; the guard renders `route-guard-denied`, never the children, never an infinite spinner. While the query is loading (and auth is resolved), it returns `'loading'` → `route-guard-loading`. A query `error` is `console.error('[SessionRouteGuard]', …)`-logged.
- *Idempotency*: read-only; re-running the query is inherently safe and produces the same decision for the same id+identity.
- *Observability*: query errors logged with the `[SessionRouteGuard]` tag.
- *No silent failure*: query error is logged and forces `denied` (never silently treated as authorized); the denial is rendered, not hidden.

---

## Task 1: Pure routing helpers + unit tests

### Overview
Add `src/lib/routing.ts` with three pure, total helpers and exhaustive co-located unit tests. This is the foundation every later task consumes and directly satisfies the open-redirect acceptance bullet.

### Changes Required
**File**: `src/lib/routing.ts` (new)
**Changes**:
```ts
/** Role-aware default landing for an authenticated visit with no valid target. */
export const DEFAULT_LANDING = '/dashboard'

/**
 * Open-redirect-safe resolution of a `next` param. Returns `raw` ONLY when it is
 * a same-origin absolute path (starts with a single '/', not '//' or '/\', no
 * scheme/host, no control chars); otherwise returns DEFAULT_LANDING. Total — never throws.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '') return DEFAULT_LANDING
  if (!raw.startsWith('/')) return DEFAULT_LANDING            // 'https://…', 'evil', '' handled
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_LANDING // protocol-relative
  if (/[\u0000-\u001f]/.test(raw)) return DEFAULT_LANDING     // CR/LF/tab smuggling
  return raw
}

/** Build the login bounce URL preserving the current destination, URL-encoded. */
export function loginRedirectTarget(loc: { pathname: string; search: string }): string {
  const dest = `${loc.pathname}${loc.search}`
  return `/login?next=${encodeURIComponent(dest)}`
}

export type AuthzDecision = 'loading' | 'authorized' | 'denied'

/**
 * Pure ownership verdict for the session guard. `denied` on error or missing row;
 * `loading` while the query is unresolved; `authorized` only when the row's
 * teacherId matches the signed-in user. Total — never throws.
 */
export function authorizeOwnership(input: {
  userId: string | null | undefined
  ownerId: string | null | undefined
  loading: boolean
  error: boolean
}): AuthzDecision {
  if (input.error) return 'denied'
  if (input.loading) return 'loading'
  if (!input.userId || !input.ownerId) return 'denied'
  return input.userId === input.ownerId ? 'authorized' : 'denied'
}
```

**File**: `src/lib/routing.test.ts` (new) — `describe`/`it`/`it.each` per `auth.test.ts` style.

### Success Criteria
- [ ] `npm run astro check` clean
- [ ] `npm run test` passes; `safeNextPath('//evil.example.com')`, `safeNextPath('https://evil.example.com')`, `safeNextPath('')` each return `/dashboard`
- [ ] Valid path passthrough (`/dashboard/sessions/abc?x=1`) preserved; `loginRedirectTarget` encodes `pathname+search`; `authorizeOwnership` covers loading/error/no-row/match/mismatch
- [ ] Failure paths behave as designed (no throw on null/undefined/control-char input)

---

## Task 2: `RouteGuard` island + `/dashboard` placeholder

### Overview
Add the auth-only `RouteGuard` and the simplest protected page so "signed out → bounce to `/login?next=…`" and "signed in → render shell" are observable.

### Changes Required
**File**: `src/components/RouteGuard.tsx` (new)
**Changes**: default-export React component consuming `useAuth` only.
```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { useAuth } from '@/lib/useAuth'
import { loginRedirectTarget, type AuthzDecision } from '@/lib/routing'

export default function RouteGuard({
  children,
  authorize,
}: { children: ReactNode; authorize?: AuthzDecision }) {
  const { user, isLoading, error } = useAuth()
  const redirected = useRef(false)

  useEffect(() => {
    if (isLoading || error || user || redirected.current) return
    if (typeof window === 'undefined') return
    redirected.current = true
    window.location.replace(
      loginRedirectTarget({ pathname: window.location.pathname, search: window.location.search })
    )
  }, [isLoading, error, user])

  if (error) {
    console.error('[RouteGuard] auth error:', error)
    return <p data-testid="route-guard-denied" role="alert">You don’t have access.</p>
  }
  if (isLoading || !user) {
    return <p data-testid="route-guard-loading" className="text-sm text-muted-foreground">Loading…</p>
  }
  if (authorize === 'loading') {
    return <p data-testid="route-guard-loading" className="text-sm text-muted-foreground">Loading…</p>
  }
  if (authorize === 'denied') {
    return <p data-testid="route-guard-denied" role="alert">You don’t have access.</p>
  }
  return <>{children}</>
}
```

**File**: `src/pages/dashboard/index.astro` (new)
**Changes**: reuse `Layout.astro`; mount `RouteGuard` with `client:only="react"` wrapping a `dashboard-root` shell.
```astro
---
import Layout from '@/layouts/Layout.astro'
import RouteGuard from '@/components/RouteGuard'
---
<Layout title="Dashboard — Blended">
  <div class="mx-auto mt-12 w-full max-w-2xl px-4">
    <RouteGuard client:only="react">
      <h1 data-testid="dashboard-root" class="text-2xl font-semibold">Dashboard</h1>
    </RouteGuard>
  </div>
</Layout>
```

### Success Criteria
- [ ] `npm run astro check` clean; builds
- [ ] Signed-out visit to `/dashboard` redirects to `/login?next=%2Fdashboard` (verified in Task 5 e2e)
- [ ] Signed-in visit renders `dashboard-root`; loading shows `route-guard-loading` with no premature redirect
- [ ] Failure paths: auth `error` renders `route-guard-denied` + `console.error`; redirect fires at most once (ref latch)

---

## Task 3: `AuthGate` post-sign-in + already-signed-in redirect

### Overview
Make the destination round-trip real: after sign-in, navigate to `safeNextPath(next)`; an already-signed-in `/login` load goes to `/dashboard`.

### Changes Required
**File**: `src/components/AuthGate.tsx`
**Changes**: add `useEffect`/`useRef` imports; a local `readNext()` reading `window.location.search`; and a redirect effect keyed on `user`.
```tsx
import { useEffect, useRef, useState } from 'react'
import { safeNextPath } from '@/lib/routing'
// …
function readNext(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('next')
}
// inside component:
const redirected = useRef(false)
useEffect(() => {
  if (!user || redirected.current || typeof window === 'undefined') return
  redirected.current = true
  window.location.replace(safeNextPath(readNext())) // valid next, else /dashboard
}, [user])
```
The existing signed-in `<section data-testid="auth-signed-in">` branch is retained (renders briefly before `replace` lands; preserves the testid that `signInViaUi` waits on).

### Success Criteria
- [ ] `npm run astro check` clean
- [ ] Signed-in `/login` (no `next`) lands on `/dashboard`
- [ ] After sign-in with `?next=%2Fdashboard%2Fsessions%2F<id>`, browser lands on that exact path
- [ ] Failure path: `next=//evil…` / `https://evil…` / empty → lands on `/dashboard`, no off-origin nav; redirect fires once

---

## Task 4: Ownership-scoped `SessionRouteGuard` + `/dashboard/sessions/[id]` placeholder

### Overview
Add the ownership wrapper that runs the `sessions` query, computes the verdict via `authorizeOwnership`, and gates a `session-root` shell.

### Changes Required
**File**: `src/components/SessionRouteGuard.tsx` (new)
```tsx
import { type ReactNode } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { authorizeOwnership } from '@/lib/routing'
import RouteGuard from '@/components/RouteGuard'

export default function SessionRouteGuard({
  sessionId,
  children,
}: { sessionId: string; children: ReactNode }) {
  const { user } = useAuth()
  const q = db.useQuery(sessionId ? { sessions: { $: { where: { id: sessionId } } } } : null)
  if (q.error) console.error('[SessionRouteGuard] session query error:', q.error)
  const ownerId = q.data?.sessions?.[0]?.teacherId ?? null
  const decision = authorizeOwnership({
    userId: user?.id,
    ownerId,
    loading: q.isLoading,
    error: !!q.error,
  })
  return <RouteGuard authorize={decision}>{children}</RouteGuard>
}
```
Note: `RouteGuard` handles the unauthenticated/loading/auth-error states first; `authorize` only refines the authenticated state.

**File**: `src/pages/dashboard/sessions/[id].astro` (new)
```astro
---
import Layout from '@/layouts/Layout.astro'
import SessionRouteGuard from '@/components/SessionRouteGuard'
const { id } = Astro.params
---
<Layout title="Session — Blended">
  <div class="mx-auto mt-12 w-full max-w-2xl px-4">
    <SessionRouteGuard client:only="react" sessionId={id}>
      <h1 data-testid="session-root" class="text-2xl font-semibold">Session {id}</h1>
    </SessionRouteGuard>
  </div>
</Layout>
```

### Success Criteria
- [ ] `npm run astro check` clean; builds (dynamic `[id]` route emitted)
- [ ] Owner sees `session-root`; a different signed-in user sees `route-guard-denied`, never `session-root`
- [ ] Failure paths: query error or unknown id → `route-guard-denied` + `console.error`, no crash, no infinite spinner
- [ ] Signed-out visit still bounces to `/login?next=%2Fdashboard%2Fsessions%2F<id>` (RouteGuard's auth branch runs first)

---

## Task 5: Playwright e2e — `e2e/route-guarding.spec.ts`

### Overview
Prove redirect+round-trip, bare-login landing, and ownership denial in a hydrated browser against live auth; skip loudly without the admin token.

### Changes Required
**File**: `e2e/route-guarding.spec.ts` (new)
**Changes**: reuse `adminAvailable`/`freshEmail`/`signInViaUi` from `e2e/support/auth.ts`; seed an owned session via the `/dev/perms-probe` `probe-create-owned-session` seam (capturing the id from `probe-self-id` / the chosen `targetSessionId`), mirroring `permissions.spec.ts`.
```ts
import { test, expect } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi } from './support/auth'

test.describe('route guarding + role-aware routing', () => {
  test.skip(!adminAvailable(), 'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — route-guard e2e requires admin code minting')

  test('signed-out /dashboard bounces to /login with next, returns after sign-in', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/, { timeout: 15_000 })
    await signInViaUi(page, freshEmail())           // signs in on /login (next preserved in URL)
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
  })

  test('deep-link round-trip to an ownership-scoped session path', async ({ browser }) => {
    // owner creates a session, capture id; sign-out new context, deep-link bounce + return
    // (uses /dev/perms-probe probe-create-owned-session with a known targetSessionId)
  })

  test('bare authenticated /login lands on /dashboard', async ({ page }) => {
    await signInViaUi(page, freshEmail())
    await page.goto('/login')
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
  })

  test('ownership denial: a different user sees route-guard-denied, not session-root', async ({ browser }) => {
    // teacherCtx: sign in, create owned session via probe, capture sessionId
    // otherCtx: sign in as different user, goto /dashboard/sessions/<id>
    // assert getByTestId('route-guard-denied') visible AND getByTestId('session-root') count 0
  })
})
```
Use `browser.newContext()` per user; `getByTestId` with 15–20s timeouts for cold-start hydration; `signInViaUi` navigates to `/login` itself, so for the deep-link round-trip drive the email/code steps inline (or sign in first then navigate) to keep the preserved `next` — assert the final landed URL retains the session id.

### Success Criteria
- [ ] `npm run test:e2e` passes locally with the admin token; skips loudly without it
- [ ] All four acceptance scenarios assert observable URL + testid outcomes
- [ ] Denial test asserts both `route-guard-denied` visible and `session-root` absent

---

## Task 6: Documentation updates

### Overview
Docs are part of "done." Add the route-guarding note and surface the behavior to users.

### Changes Required
**File**: `AGENTS.md` — under the Data Layer / Auth section, add a short "Route guarding" note: `RouteGuard` is the single client-side gate for protected islands; it consumes `useAuth` (not `db.useAuth()`); `safeNextPath` is the only sanctioned way to resolve a post-login destination (open-redirect-safe); `/dashboard` and `/dashboard/sessions/[id]` are placeholder shells; fixed testids `route-guard-loading`/`route-guard-denied`/`dashboard-root`/`session-root`.
**File**: `README.md` — note that protected routes now require sign-in and an unauthenticated deep link returns the user to its destination after login.
**File**: `release-notes.md` — one line: auth gate + intended-destination redirect is live; list reused testids for downstream cycles. (If `release-notes.md` does not exist, create it following the existing notes format.)

### Success Criteria
- [ ] `AGENTS.md`, `README.md`, `release-notes.md` updated and internally consistent with the shipped testids/paths
- [ ] N/A — pure (docs only; no failure surface)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Visiting /dashboard while signed out redirects to /login?next=%2Fdashboard, and after completing sign-in the browser lands back on /dashboard (user-observable benefit: deep-link destination is preserved across login).` | Task 2, Task 3, Task 5 | Guard bounce (T2) + AuthGate return (T3); asserted in T5 |
| `[ ] Visiting a join deep link (e.g. /dashboard/sessions/<id>) while signed out, then signing in, returns the user to that same path with its id intact.` | Task 3, Task 4, Task 5 | `safeNextPath` round-trip to ownership route; asserted in T5 |
| `[ ] A signed-in user loading /login with no next param is routed to /dashboard.` | Task 3, Task 5 | AuthGate already-signed-in redirect; asserted in T5 |
| `[ ] In a second browser context, a different signed-in user opening the first user's /dashboard/sessions/<id> sees the denial state (route-guard-denied) and not the session shell (session-root). *(failure-path / authorization criterion)*` | Task 4, Task 5 | `authorizeOwnership` + `SessionRouteGuard`; two-context e2e in T5 |
| `[ ] safeNextPath('//evil.example.com'), safeNextPath('https://evil.example.com'), and safeNextPath('') each return /dashboard (unit test) — a crafted next cannot drive an off-origin redirect. *(failure-path criterion)*` | Task 1 | Unit-tested in `routing.test.ts` |
| `[ ] All existing tests still pass (npm run test, npm run test:e2e, npm run astro check).` | Task 1, Task 2, Task 3, Task 4, Task 5 | No edits to existing tests; cross-cutting verification each task |
| `[ ] No compiler/linter warnings introduced; npm run astro check is clean.` | Task 1, Task 2, Task 3, Task 4, Task 6 | `astro check` in every code task's success criteria |

---

## Testing Strategy

### Unit Tests
- `src/lib/routing.test.ts` (Vitest, `environment: 'node'`, in coverage scope):
  - `safeNextPath`: valid absolute path passthrough (incl. `pathname+search`); **failure paths** — `''`, `null`, `undefined`, `'//evil.example.com'`, `'https://evil.example.com'`, `'/\\evil'`, control-char (`'/foo\r\n'`), and bare `'evil'` → all `/dashboard` (table-driven `it.each`).
  - `loginRedirectTarget`: encodes `pathname+search` into `next`; verifies double-encoding/round-trip with `decodeURIComponent`.
  - `authorizeOwnership`: `authorized` on id match; **failure paths** — `error: true` → `denied`, `loading: true` → `loading`, missing `userId`/`ownerId` → `denied`, mismatch → `denied`.
- Mocking strategy: none — all three helpers are pure and db-free, so they test against real implementations (anti-mock bias honored). React islands and `db`-bound code are intentionally excluded from unit scope (matches `vitest.config.ts` exclusion of `useAuth.ts`) and verified by e2e.

### Integration / E2E Tests
- `e2e/route-guarding.spec.ts` (Playwright, port-4399 dev server, `retries: 3`, skips loudly without admin token):
  - Happy path: signed-out `/dashboard` → `/login?next=%2Fdashboard` → sign in → `/dashboard` + `dashboard-root`.
  - Deep-link round-trip: signed-out `/dashboard/sessions/<id>` bounce → sign in → returns to the same id-bearing path.
  - Bare authenticated `/login` → `/dashboard`.
  - Ownership denial (two `browser.newContext()` users): owner seeds a session via `/dev/perms-probe` `probe-create-owned-session`; a different signed-in user opening that session path sees `route-guard-denied` and not `session-root`.
- E2E is required because redirect/landing/denial behavior is only observable in a hydrated browser against live auth + live cycle-0003 perms.

## Risk Assessment
- **`client:only` island sees `next` only client-side**: mitigated — `next` is read from `window.location.search` inside the island after hydration; e2e asserts the final landed URL, not server output.
- **Flash-redirect before auth resolves**: mitigated — the guard renders `route-guard-loading` and the redirect effect early-returns while `isLoading`, firing only once via the `useRef` latch.
- **Realtime/hydration flake in the denial e2e** (session row must propagate before the second user reads it): mitigated by the existing `retries: 3` and 15–20s `getByTestId` timeouts, mirroring `permissions.spec.ts`.
- **`signInViaUi` always navigates to `/login`** (could drop a preserved `next`): mitigated — for the deep-link round-trip, drive the email/code steps so the visit stays on the `?next=…` URL (or assert the post-login landed path), rather than calling the helper which re-`goto`s `/login`.
- **Cycle-0003 perms not live against the Instant app**: mitigated — denial e2e depends on open `sessions` reads; if perms are unpushed the suite's session read fails visibly (not a false green), flagging the dependency.
