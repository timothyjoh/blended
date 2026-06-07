# Implementation Plan: Cycle 0019

## Overview
Turn the dormant `users.adminLevel` placeholder into a trustworthy, unforgeable global capability: an `ADMIN_EMAILS` server-side allowlist that elevates a matching, token-verified user to `uber` on sign-in via the admin SDK (recorded as an append-only `AdminBootstrapped` event), a tightened `users` permission rule that forbids client self-elevation, and an `/admin` route reachable only by an uber admin.

## Current State (from Research)
- `adminLevel` is a dormant `i.number()` on `users` (`src/lib/db.ts:46`); only `useAuth` writes a literal `0` (`src/lib/useAuth.ts:72`).
- `writeEvent` builds the §7.2 envelope inline (`src/lib/db.ts:691-702`); SPEC wants a pure `buildEventEnvelope` extracted from it.
- `IDENTITY_SCOPE`/`USER_SIGNED_IN` constants live in `src/lib/auth.ts:14,17`; identity events are intentionally not folded by `applyEvent` (`src/lib/db.ts:609-614`).
- Pure-helper + co-located-test pattern: `authorizeOwnership` (`src/lib/routing.ts:43-53`), `shouldCreateUserRow` (`src/lib/auth.ts:47-55`) — all total, never throw.
- Guard pattern: `SessionRouteGuard` runs a `db.useQuery`, folds through a pure helper, hands `RouteGuard` a precomputed `AuthzDecision` (`src/components/SessionRouteGuard.tsx`).
- `users` perms rule is own-row-only with no value constraint (`src/lib/perms.ts:42-54`); the structural guard pins its exact strings (`src/lib/perms.test.ts:12-17`).
- Existing server endpoint pattern: `src/pages/e2e/hang.ts` (`APIRoute`, env-guarded, returns `Response` with status). No `src/pages/api/` directory yet.
- E2E admin seam: `adminAvailable()`, `mintCode`, `freshEmail()`, `queryAdmin`, `signInViaUi` (`e2e/support/auth.ts`); skip-loud gate model in `e2e/route-guarding.spec.ts`.
- Client-write-rejection probe surface: `/dev/perms-probe` (`src/pages/dev/perms-probe.astro` → `PermsProbe`), prod-guarded.

### Resolved Open Questions
1. **`@instantdb/admin` runtime availability** — it is currently a **devDependency** only. **Resolution:** move `@instantdb/admin` to `dependencies` in `package.json` so the Vercel server build bundles it for the runtime API route. Confirmed via `package.json` (admin under `devDependencies`, react under `dependencies`).
2. **Token-verification API** — `db.auth.verifyToken(token: AuthToken): Promise<User>` exists on the admin SDK and returns `{ id, email, ... }`; it **rejects** on an invalid/expired/missing token (map rejection → `401`). Confirmed in `node_modules/@instantdb/admin/dist/commonjs/index.d.ts:215`.
3. **Server env access** — read secrets via `process.env.ADMIN_EMAILS` / `process.env.INSTANT_ADMIN_TOKEN` inside the `APIRoute` (the accessor the existing Node/e2e seam already uses, `e2e/support/auth.ts:25-26`). No `PUBLIC_` prefix ⇒ never bundled to the client. The DEV-only `hang.ts` uses `import.meta.env.DEV` for a build-time flag, but runtime secrets must use `process.env` under the Vercel adapter.
4. **Caller token from the client** — the InstantDB React `User` carries `refresh_token` (confirmed `node_modules/@instantdb/core/dist/commonjs/clientTypes.d.ts:3`); `useAuth` reads `user.refresh_token` and POSTs it to the endpoint, which verifies it with `db.auth.verifyToken`.
5. **`AdminBootstrapped` envelope** — `sessionId: IDENTITY_SCOPE`, actor `{ id: verifiedUserId, role: 'system' }` (`'system'` ∈ `ACTOR_ROLES`), `payload: { userId: verifiedUserId, adminLevel: ADMIN_LEVEL_UBER }` (no email — privacy). Not folded by `applyEvent`, like `UserSignedIn`.
6. **E2E idempotency under a shared live app** — measure a **delta**, not an absolute: the spec calls the endpoint twice in one test and asserts the `AdminBootstrapped` count for that user is unchanged by the second call. This tolerates pre-existing `uber` state from prior runs of the deterministic `admin@blended.test` row.

## Desired End State
- `src/lib/admin.ts` exists with total pure helpers; `adminLevel` is `i.string<AdminLevel>()` defaulting to `'none'`.
- `POST /api/admin/bootstrap` elevates an allowlisted, verified caller to `uber` and appends exactly one `AdminBootstrapped` event atomically; non-allowlisted → `200` `{ adminLevel: 'none' }` with no writes; bad token → `401`; admin SDK unavailable → `500`.
- `useAuth` calls the endpoint once per authenticated session (ref-latched), writes `adminLevel: 'none'` on first sign-in.
- The `users` perms rule rejects any client create/update with a non-`'none'` `adminLevel`.
- `/admin` renders `data-testid="admin-root"` for an uber admin; everyone else gets `route-guard-denied` (or bounces to `/login` unauthenticated).
- **Verify:** `npm run test` green, `npm run test:e2e` green (admin specs run when `adminAvailable()`), `astro check` clean, `grep -r ADMIN_EMAILS dist/client` empty after a build.

## What We're NOT Doing
- Promotion of *another* user by an existing uber admin (issue AC #3) — deferred to a sibling cycle.
- Admin console / event-stream replay / observability UI.
- Organization/group-scoped admins.
- Any admin level beyond `uber`.
- Folding `AdminBootstrapped` into `applyEvent` (it is identity-scope, intentionally unfolded).

## Implementation Approach
Build pure-core first (`src/lib/admin.ts`, `authorizeAdmin`, `buildEventEnvelope`, the pure `decideBootstrap` decision), each with co-located unit tests, then wire the impure shells (schema push, perms push, API route, `useAuth` call, guard island, `/admin` page) around them. The bootstrap endpoint's authorization/idempotency *decision* is a pure function (`decideBootstrap`) so it is unit-testable without the SDK; the endpoint is the thin I/O wrapper (verify token → decide → atomic transact). Tests prefer real implementations: pure helpers tested directly, perms tested structurally + live e2e, the endpoint exercised end-to-end via the existing admin seam.

## Failure & Resilience Decisions

**Task 1 (`src/lib/admin.ts` pure helpers + `decideBootstrap`)** — N/A — pure. All helpers are total (hostile/empty/missing input → safe default `'none'`/empty allowlist/`{ elevate: false }`), never throw.

**Task 2 (schema field change + `useAuth` create writes `'none'`)** — *Failure modes:* `instant-cli push schema` can fail (network/auth) — surfaces as a non-zero CLI exit to the operator; it is a manual deploy step, not app runtime. At read time, legacy numeric/absent stored values are tolerated by `normalizeAdminLevel` (→ `'none'`), never throwing. *Idempotency:* schema push is declarative/convergent (re-run is a no-op once applied); the `useAuth` create is a keyed upsert on the auth id (already ref-latched via `shouldCreateUserRow`). *Observability:* push failure prints to the CLI; the existing `console.error('[useAuth] …')` covers the create path. *No silent failure:* push exits non-zero; create rejection already logged.

**Task 3 (tighten `users` perms rule + push)** — *Failure modes:* `npm run perms:push` can fail (network/auth) → non-zero CLI exit, manual step. A live client self-elevation attempt is rejected by InstantDB and the transaction promise rejects (propagates to the probe/caller). *Idempotency:* perms push is declarative/convergent. *Observability:* push failure → CLI exit; rejected client writes surface as a rejected transaction the caller logs. *No silent failure:* the structural unit test fails loudly if the rule strings drift; push exits non-zero on failure.

**Task 4 (`buildEventEnvelope` extraction)** — N/A — pure. Returns a plain envelope object; all runtime validation stays in `writeEvent` before any transaction.

**Task 5 (`POST /api/admin/bootstrap`)** — *Failure modes:* (a) `INSTANT_ADMIN_TOKEN` unset → `init`/admin SDK unavailable → return `500`, write nothing; (b) caller token missing/invalid/expired → `verifyToken` rejects → return `401`, write nothing; (c) verified email not in allowlist → `200 { adminLevel: 'none' }`, no writes; (d) `ADMIN_EMAILS` empty/unset → empty allowlist ⇒ same as (c); (e) already-`uber` → `decideBootstrap` returns `{ elevate: false }` ⇒ no `users` write, no event; (f) the atomic `transact` rejects → return `500`, propagate. *Idempotency:* the explicit "only when not already `uber`" guard (`decideBootstrap`) makes re-bootstrap a no-op; the `users` row id IS the auth id, so even a racing elevate converges to one row; the event append is gated behind the same guard so no duplicate event. The endpoint is safe to re-run (the engine/client may retry). *Observability:* every failure branch returns a distinct status with a JSON `{ error }` body; server-side branches `console.error('[api/admin/bootstrap] …')` before returning `500`. *No silent failure:* no `catch` swallows — each caught error maps to an explicit status and a log line; the success path returns the resulting `adminLevel`.

**Task 6 (`useAuth` → bootstrap call, ref-latched)** — *Failure modes:* endpoint unreachable / network error / non-2xx → `console.error('[useAuth] admin bootstrap failed: …')`; the user degrades to non-admin (denied `/admin`); sign-in and the rest of the app stay usable. *Idempotency:* a `bootstrapInFlight`/`bootstrapDone` ref latches the call to once per authenticated session (mirrors `inFlight`); the endpoint itself is idempotent server-side regardless. *Observability:* the `console.error` prefix `[useAuth]`. *No silent failure:* the `.catch` logs and degrades — it never throws into render and never silently marks the user admin.

**Task 7 (`authorizeAdmin`)** — N/A — pure. Total: `error → denied`, `loading → loading`, else `authorized` iff `normalizeAdminLevel(adminLevel) === ADMIN_LEVEL_UBER`.

**Task 8 (`AdminRouteGuard` island + `/admin.astro`)** — *Failure modes:* own-`users`-row `db.useQuery` error → `console.error('[AdminRouteGuard] …')` and `authorizeAdmin` is fed `error: true` ⇒ `denied` (never hangs, never flashes protected content). Loading → `route-guard-loading` shell. *Idempotency:* read-only render, no mutation. *Observability:* `console.error('[AdminRouteGuard] …')`. *No silent failure:* query error forces `denied` via the pure helper, surfaced through `RouteGuard`'s denial shell.

**Task 9 (e2e + perms-probe self-elevation)** — *Failure modes:* `mintCode`/`queryAdmin`/assertions throw → surface in the test (never swallowed), per the existing seam. Specs skip loudly when `!adminAvailable()`. *Idempotency:* `freshEmail()` for non-allowlisted cases avoids collisions; idempotency assertion uses a delta. *Observability:* Playwright trace/`retries: 3`. *No silent failure:* skip-loud gate prevents false green.

**Task 10 (docs)** — N/A — pure docs.

---

## Task 1: Pure admin helpers (`src/lib/admin.ts`)

### Overview
The unit-testable pure core: admin-level domain values/types, normalization, allowlist parsing/matching, and the pure bootstrap decision.

### Changes Required
**File**: `src/lib/admin.ts` (new)
**Changes**:
```ts
export const ADMIN_LEVEL_NONE = 'none' as const
export const ADMIN_LEVEL_UBER = 'uber' as const
export type AdminLevel = typeof ADMIN_LEVEL_NONE | typeof ADMIN_LEVEL_UBER

/** Total: anything not exactly 'uber' → 'none' (legacy number/absent/garbage safe). */
export function normalizeAdminLevel(raw: unknown): AdminLevel {
  return raw === ADMIN_LEVEL_UBER ? ADMIN_LEVEL_UBER : ADMIN_LEVEL_NONE
}

/** Parse comma/whitespace-separated env list → trimmed, lowercased, de-duped, non-empty. */
export function parseAdminEmails(raw: string | null | undefined): string[] {
  if (!raw) return []
  return Array.from(new Set(
    raw.split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e !== '')
  ))
}

/** Case-insensitive membership. Total. */
export function isEmailAllowlisted(email: string | null | undefined, allowlist: string[]): boolean {
  if (!email) return false
  return allowlist.includes(email.trim().toLowerCase())
}

/** Pure bootstrap decision — the endpoint's authorization + idempotency core. */
export function decideBootstrap(input: {
  verifiedEmail: string | null | undefined
  allowlist: string[]
  currentLevel: unknown
}): { elevate: boolean; adminLevel: AdminLevel } {
  const current = normalizeAdminLevel(input.currentLevel)
  if (current === ADMIN_LEVEL_UBER) return { elevate: false, adminLevel: ADMIN_LEVEL_UBER } // idempotent
  if (!isEmailAllowlisted(input.verifiedEmail, input.allowlist)) {
    return { elevate: false, adminLevel: ADMIN_LEVEL_NONE }
  }
  return { elevate: true, adminLevel: ADMIN_LEVEL_UBER }
}
```

**File**: `src/lib/admin.test.ts` (new) — table-style coverage per helper.

### Success Criteria
- [ ] `astro check` / build clean
- [ ] Unit tests pass: `normalizeAdminLevel` over `'uber'`/`'none'`/`0`/`1`/`undefined`/`null`/`'UBER'`/garbage; `parseAdminEmails` over empty/whitespace/mixed-case/comma/dupes; `isEmailAllowlisted` case-insensitivity + missing email; `decideBootstrap` over already-uber (no elevate), allowlisted-non-uber (elevate), not-allowlisted (no elevate), empty allowlist (no elevate)
- [ ] All helpers total — no input throws

---

## Task 2: `adminLevel` schema field + `useAuth` writes `'none'`

### Overview
Change the storage type to the string union and switch the first-sign-in write off the numeric literal.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**: at `:46`, `adminLevel: i.number()` → `adminLevel: i.string<import('@/lib/admin').AdminLevel>()` (or a local re-import of `AdminLevel`). Keep the comment noting normalization tolerates legacy values at read time.

**File**: `src/lib/useAuth.ts`
**Changes**: import `ADMIN_LEVEL_NONE`; at `:72` replace `adminLevel: 0,` with `adminLevel: ADMIN_LEVEL_NONE,`.

**Deploy step (manual, documented in PLAN + AGENTS.md)**: `npx instant-cli push schema` to apply the field type change to the live dev app. `normalizeAdminLevel` makes existing numeric rows degrade safely to `'none'` at read time.

### Success Criteria
- [ ] `astro check` clean (types flow through the union)
- [ ] `useAuth` writes `'none'` (no numeric literal remains)
- [ ] Existing `useAuth`/db tests still pass
- [ ] Schema push applied (verified by an admin query returning string `adminLevel`, or tolerated via normalization)

---

## Task 3: Tighten the `users` permission rule

### Overview
Forbid any client create/update from writing a non-`'none'` `adminLevel`; elevation only ever happens server-side via the admin SDK (which bypasses rules).

### Changes Required
**File**: `src/lib/perms.ts`
**Changes**: the `users` block (`:48-53`):
```ts
allow: {
  view: 'auth.id == data.id',
  create: "auth.id == data.id && data.adminLevel == 'none'",
  update: "auth.id == data.id && newData.adminLevel == 'none'",
  delete: 'false',
},
```
(InstantDB evaluates rules server-side; `data` is the object on create, `newData` the post-merge object on update — so an uber row can never be re-written from the client, and no client write can set `'uber'`.) Update the block comment to record the new invariant.

**File**: `src/lib/perms.test.ts`
**Changes**: update the `users` structural assertions (`:12-17`) to the new strings; add an assertion that both `create` and `update` contain `adminLevel == 'none'` and that `update` references `newData`.

**Deploy step (manual)**: `npm run perms:push`.

### Success Criteria
- [ ] `astro check` clean
- [ ] `perms.test.ts` passes with the tightened strings; the entity-coverage and root-adapter-reexport guards still pass
- [ ] Perms pushed; live client self-elevation rejected (proven in Task 9)
- [ ] First-sign-in create (`adminLevel: 'none'`) still admitted

---

## Task 4: Extract `buildEventEnvelope` from `writeEvent`

### Overview
Factor the inline §7.2 envelope construction into a pure helper so the client choke point and the server endpoint emit identical envelopes.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**: add an exported pure `buildEventEnvelope(type, meta, now)` returning the envelope fields object built at `:692-702`; have `writeEvent` call it to build `eventTx`’s update payload. Keep all input validation in `writeEvent` (envelope helper stays pure, assumes validated input). Signature mirrors the existing fields: `id` (passed in or stamped by caller), `sessionId`, `type`, `schemaVersion`, `actorId`, `actorRole`, `occurredAt`, `receivedAt`, optional `correlationId`, `payload`.
```ts
export function buildEventEnvelope(
  type: string,
  meta: WriteEventMeta,
  now: number
): Record<string, unknown> { /* the object currently at :693-702 */ }
```

**File**: `src/lib/db.test.ts`
**Changes**: add a unit test that `buildEventEnvelope` produces a §7.2-shaped envelope (all stamped fields, `schemaVersion` default `1`, `correlationId` omitted when absent, `payload` default `{}`) and a regression test that `writeEvent` still composes the identical shape (spy on `db.transact` / compare the produced object).

### Success Criteria
- [ ] `astro check` clean
- [ ] `buildEventEnvelope` unit + `writeEvent` regression tests pass
- [ ] Existing `writeEvent` validation/failure-path tests (`db.test.ts:955-1010`) still pass unchanged

---

## Task 5: `POST /api/admin/bootstrap` server endpoint

### Overview
The server-only endpoint: verify the caller's InstantDB token, decide via `decideBootstrap`, and — only when elevating — atomically update the `users` row and append `AdminBootstrapped`, all via the admin SDK.

### Changes Required
**File**: `package.json`
**Changes**: move `@instantdb/admin` from `devDependencies` into `dependencies` (runtime availability under the Vercel server build).

**File**: `src/pages/api/admin/bootstrap.ts` (new)
**Changes**:
```ts
import type { APIRoute } from 'astro'
import { init, tx, id } from '@instantdb/admin'
import { IDENTITY_SCOPE } from '@/lib/auth'
import { ADMIN_LEVEL_UBER, parseAdminEmails, decideBootstrap } from '@/lib/admin'
import { buildEventEnvelope } from '@/lib/db'

const ADMIN_BOOTSTRAPPED = 'AdminBootstrapped'

export const POST: APIRoute = async ({ request }) => {
  const appId = process.env.PUBLIC_INSTANTDB_APP_ID
  const adminToken = process.env.INSTANT_ADMIN_TOKEN
  if (!appId || !adminToken) {
    console.error('[api/admin/bootstrap] admin SDK unavailable: INSTANT_ADMIN_TOKEN/app id unset')
    return json(500, { error: 'admin-unavailable' })
  }
  const admin = init({ appId, adminToken })

  const { token } = await request.json().catch(() => ({}))
  let user
  try {
    user = await admin.auth.verifyToken(token)   // rejects on missing/invalid/expired
  } catch (err) {
    console.error('[api/admin/bootstrap] token verify failed:', err)
    return json(401, { error: 'unauthorized' })
  }
  if (!user?.id) return json(401, { error: 'unauthorized' })

  const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS)
  // Read the caller's current level via the admin query seam (bypasses rules).
  const { users } = await admin.query({ users: { $: { where: { id: user.id } } } })
  const current = users?.[0]?.adminLevel
  const decision = decideBootstrap({ verifiedEmail: user.email, allowlist, currentLevel: current })

  if (!decision.elevate) return json(200, { adminLevel: decision.adminLevel })

  try {
    const envelope = buildEventEnvelope(
      ADMIN_BOOTSTRAPPED,
      {
        sessionId: IDENTITY_SCOPE,
        actor: { id: user.id, role: 'system' },
        payload: { userId: user.id, adminLevel: ADMIN_LEVEL_UBER },
      },
      Date.now()
    )
    await admin.transact([
      tx.sessionEvents[id()].update(envelope),
      tx.users[user.id].update({ adminLevel: ADMIN_LEVEL_UBER }),
    ])
  } catch (err) {
    console.error('[api/admin/bootstrap] elevation transact failed:', err)
    return json(500, { error: 'elevation-failed' })
  }
  return json(200, { adminLevel: ADMIN_LEVEL_UBER })
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
```
(`buildEventEnvelope` is rule-agnostic; the admin SDK's `tx`/`id` build the same envelope shape `writeEvent` does. The `users` update + event append share one `admin.transact` ⇒ atomic.)

**File**: `src/pages/api/admin/bootstrap.test.ts` (new) — unit the pure decision wiring is already covered in Task 1; here add a focused test of the env-guard branch only if it can be isolated, otherwise rely on Task 1 (`decideBootstrap`) + Task 9 (e2e) for the I/O paths. (No heavy SDK mock — prefer the live e2e for the transact path.)

### Success Criteria
- [ ] `astro check` clean; `@instantdb/admin` resolves at runtime (in `dependencies`)
- [ ] Endpoint returns `500` when `INSTANT_ADMIN_TOKEN`/app id unset (writes nothing), `401` on bad token, `200 {adminLevel:'none'}` when verified-but-not-allowlisted (no writes), `200 {adminLevel:'uber'}` on elevate
- [ ] Already-`uber` caller → no `users` write, no event (idempotent via `decideBootstrap`)
- [ ] `ADMIN_EMAILS` not referenced by any client island (grep) — server-only via `process.env`
- [ ] Every failure branch logs `[api/admin/bootstrap] …` and returns a distinct status — no swallowed error

---

## Task 6: `useAuth` calls bootstrap once per session (ref-latched)

### Overview
After authentication, POST the caller's refresh token to `/api/admin/bootstrap` exactly once per session; degrade to non-admin on any failure.

### Changes Required
**File**: `src/lib/useAuth.ts`
**Changes**: add a `bootstrapDone` ref (mirrors `inFlight`). In an effect keyed on `authUserId`, when `user?.refresh_token` is present and not yet done, latch and `fetch('/api/admin/bootstrap', { method: 'POST', body: JSON.stringify({ token: user.refresh_token }) })`:
```ts
const bootstrapped = useRef(false)
useEffect(() => {
  if (!authUserId || !user?.refresh_token || bootstrapped.current) return
  bootstrapped.current = true
  fetch('/api/admin/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: user.refresh_token }),
  })
    .then((r) => { if (!r.ok) console.error('[useAuth] admin bootstrap failed:', r.status) })
    .catch((err) => console.error('[useAuth] admin bootstrap request failed:', err))
}, [authUserId, user?.refresh_token])
```
The guard reads the *result* from the live `users` row query (already present), not the fetch response — so the route guard reflects the persisted `adminLevel` regardless of fetch timing.

### Success Criteria
- [ ] `astro check` clean
- [ ] Bootstrap fires once per authenticated session (ref-latched); a failed/unreachable endpoint logs `[useAuth] …` and the app stays usable (sign-in, dashboard) — proven in Task 9
- [ ] No `db.useAuth()` introduced outside the seam; identity still read only through `useAuth`

---

## Task 7: `authorizeAdmin` pure helper

### Overview
Total verdict mirroring `authorizeOwnership`: `authorized` only for `uber`.

### Changes Required
**File**: `src/lib/routing.ts`
**Changes**:
```ts
import { ADMIN_LEVEL_UBER, normalizeAdminLevel } from '@/lib/admin'

export function authorizeAdmin(input: {
  adminLevel: unknown
  loading: boolean
  error: boolean
}): AuthzDecision {
  if (input.error) return 'denied'      // error beats loading
  if (input.loading) return 'loading'
  return normalizeAdminLevel(input.adminLevel) === ADMIN_LEVEL_UBER ? 'authorized' : 'denied'
}
```
**File**: `src/lib/routing.test.ts`
**Changes**: add table tests for all four verdicts incl. error-over-loading, and `denied` for `'none'`/legacy number/`undefined`/garbage; `authorized` only for `'uber'`.

### Success Criteria
- [ ] `astro check` clean
- [ ] Unit tests pass for all four verdicts + error-over-loading
- [ ] Total — never throws

---

## Task 8: `AdminRouteGuard` island + `/admin` page

### Overview
A guard island reading the signed-in user's own `users` row, folding `adminLevel` through `normalizeAdminLevel` + `authorizeAdmin`, plus the gated `/admin` Astro page.

### Changes Required
**File**: `src/components/AdminRouteGuard.tsx` (new) — mirror `SessionRouteGuard`:
```tsx
export default function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const authUserId = user?.id ?? null
  const q = db.useQuery(authUserId ? { users: { $: { where: { id: authUserId } } } } : null)
  if (q.error) console.error('[AdminRouteGuard] users query error:', q.error)
  const adminLevel = q.data?.users?.[0]?.adminLevel
  const decision = authorizeAdmin({ adminLevel, loading: q.isLoading, error: !!q.error })
  return <RouteGuard authorize={decision}>{children}</RouteGuard>
}
```
**File**: `src/pages/admin.astro` (new) — mirror `dashboard/index.astro`: wrap a minimal landing in `<AdminRouteGuard client:only="react">` with a `data-testid="admin-root"` child (e.g. an "Admin" heading).

### Success Criteria
- [ ] `astro check` clean
- [ ] Uber user sees `admin-root`; `none`/error/unauth never flash protected content (loading → `route-guard-loading`, denied → `route-guard-denied`, unauth → bounce to `/login`)
- [ ] Query error forces `denied` (logged `[AdminRouteGuard] …`), never hangs

---

## Task 9: E2E spec + perms-probe self-elevation

### Overview
Prove the end-to-end benefit and the failure paths against the live app via the admin seam.

### Changes Required
**File**: `e2e/admin-route.spec.ts` (new), gated `test.skip(!adminAvailable(), …)`:
- **Allowlisted reachable:** `signInViaUi(page, 'admin@blended.test')` (email present in the dev server's `ADMIN_EMAILS`), `goto('/admin')`, assert `admin-root` visible; via `queryAdmin` assert the `users` row is `adminLevel: 'uber'` and ≥1 `AdminBootstrapped` event under `IDENTITY_SCOPE` exists for that user.
- **Idempotent re-bootstrap (delta):** capture the `AdminBootstrapped` count for that user, POST `/api/admin/bootstrap` a second time with the caller token, assert the count is unchanged and no second `users` write.
- **Non-allowlisted denied:** `signInViaUi(page, freshEmail())`, `goto('/admin')`, assert `route-guard-denied` and `admin-root` never renders; via `queryAdmin` assert no `AdminBootstrapped` event for that user and `adminLevel` resolves to `none`.
- **Unauthenticated:** `goto('/admin')` signed out → bounce to `/login` (model `route-guarding.spec.ts:32-60`).

**File**: `src/components/PermsProbe.tsx` (extend) + `e2e/admin-route.spec.ts`
**Changes**: add a probe action that issues a raw client `db.transact(db.tx.users[authId].update({ adminLevel: 'uber' }))` and surfaces the rejection; the spec asserts the transaction is rejected and `queryAdmin` shows `adminLevel` unchanged (proves the tightened perms rule). Follows the existing `/dev/perms-probe` rejection-observation pattern.

**File** (optional helper): if needed, a tiny `e2e/support` helper to POST the bootstrap endpoint with a minted token for the idempotency delta.

### Success Criteria
- [ ] Specs skip loudly without `INSTANT_ADMIN_TOKEN`/app id (never false green)
- [ ] Allowlisted → `admin-root`; non-allowlisted → `route-guard-denied`; unauth → `/login`
- [ ] `queryAdmin` confirms exactly-one-event elevation and the idempotent no-op on re-call
- [ ] Client self-elevation rejected; `adminLevel` unchanged
- [ ] Empty-allowlist case (or non-allowlisted) leaves user `none`, no event

---

## Task 10: Documentation

### Overview
Docs are part of "done."

### Changes Required
**File**: `AGENTS.md` — document: elevated `adminLevel` write is server-only (admin SDK, bypasses rules); the `users` rule forbids client `adminLevel` elevation; `adminLevel` is the `'none' | 'uber'` domain value accessed only via `src/lib/admin.ts`; `AdminBootstrapped` is an identity-scope event written through the shared `buildEventEnvelope`; the `/api/admin/bootstrap` endpoint + `AdminRouteGuard`/`authorizeAdmin` pattern; the `instant-cli push schema` (field type) + `perms:push` deploy steps.

**File**: `README.md` — surface the `/admin` route and the `ADMIN_EMAILS` allowlist (how the first uber admin is bootstrapped); note it is server-only, never in the client bundle.

**File**: `.env.example` — add `ADMIN_EMAILS=` with a comment: server-only comma-separated allowlist of uber-admin emails (no `PUBLIC_` prefix); empty ⇒ no admins bootstrapped.

### Success Criteria
- [ ] All three files updated and internally consistent with the implementation
- [ ] `.env.example` documents server-only semantics

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **User benefit:** signing in with an email present in `ADMIN_EMAILS` makes `/admin` reachable — `data-testid="admin-root"` renders; signing in with a non-allowlisted email (or visiting unauthenticated) shows `route-guard-denied` / bounces to `/login`. (e2e) | Task 9 (+ 5, 6, 8) | Live e2e over `/admin` |
| [ ] `users.adminLevel` exists as the named value with `'none'` the default and `'uber'` the elevated value; `normalizeAdminLevel` maps any non-`'uber'` input (including legacy numeric/absent values) to `'none'`. (unit) | Task 1 (+ 2) | helper unit + schema union |
| [ ] `authorizeAdmin` returns `authorized` only for `uber`, `denied` for `none`/unknown, `loading` while unresolved, and `denied` on error (error beats loading). (unit) | Task 7 | |
| [ ] `POST /api/admin/bootstrap` elevates an allowlisted, verified caller to `uber` and appends exactly one `AdminBootstrapped` event under `IDENTITY_SCOPE`, atomically; a second call for the same already-`uber` user writes neither a `users` update nor a new event. (e2e against the live app via the admin query seam, or unit on the pure handler logic) | Task 5 (decision: Task 1) + Task 9 | atomic transact + delta idempotency assertion |
| [ ] **Failure-path:** a client transaction setting its own `users.adminLevel` to `'uber'` is rejected by the permission rule and the row's `adminLevel` is unchanged; AND when `ADMIN_EMAILS` is empty/unset, an otherwise-valid signed-in user is left `none` and denied `/admin` with no `AdminBootstrapped` event written. (e2e/unit + perms structural test) | Task 3 + Task 9 (+ Task 1 `decideBootstrap` empty allowlist) | perms structural + live probe + e2e |
| [ ] **Failure-path:** with `INSTANT_ADMIN_TOKEN` unset on the server, `/api/admin/bootstrap` returns `500`, writes nothing, the client logs the error, and the rest of the app (sign-in, dashboard) remains usable. (unit/e2e) | Task 5 + Task 6 | env-guard branch + client degrade |
| [ ] `ADMIN_EMAILS` does not appear in the client bundle (no `PUBLIC_` prefix; not imported by any client island). (code review + grep assertion) | Task 5 + Task 10 | read only via `process.env` in the server route |
| [ ] All existing tests still pass. | Tasks 2,3,4 | regression-guarded |
| [ ] No compiler/linter warnings introduced (`astro check` clean). | All tasks | gate on each task |

---

## Testing Strategy

### Unit Tests
- **`src/lib/admin.test.ts`**: `normalizeAdminLevel` (`'uber'`/`'none'`/`0`/`1`/`undefined`/`null`/`'UBER'`/object → correct, never throws); `parseAdminEmails` (empty/`undefined`/whitespace-only/mixed-case/comma+space mixed/duplicates → trimmed-lowercased-deduped); `isEmailAllowlisted` (case-insensitive hit, miss, empty email); `decideBootstrap` (already-uber → no elevate; allowlisted non-uber → elevate; not allowlisted → no elevate; empty allowlist → no elevate).
- **`src/lib/routing.test.ts`**: `authorizeAdmin` four verdicts + error-over-loading + `denied` for non-uber/legacy/garbage.
- **`src/lib/db.test.ts`**: `buildEventEnvelope` shape (stamped fields, `schemaVersion` default, `correlationId` omitted when absent, `payload` default `{}`); `writeEvent` regression composes the identical envelope; existing validation-throws-before-transaction tests unchanged.
- **`src/lib/perms.test.ts`**: tightened `users` `create`/`update` strings; `update` references `newData`; both contain `adminLevel == 'none'`; entity-coverage + root-adapter-reexport guards still pass.
- **Failure-path unit coverage**: `decideBootstrap` empty-allowlist and already-uber branches (no elevation); `authorizeAdmin` error path; perms structural rejection of non-`'none'` elevation.
- **Mocking strategy**: none for pure helpers (real calls). The endpoint's I/O paths are exercised live in e2e rather than with a heavy admin-SDK mock; only `decideBootstrap` (its pure core) is unit-tested.

### Integration / E2E Tests
- `e2e/admin-route.spec.ts` (skip-loud via `adminAvailable()`): allowlisted `admin@blended.test` → `admin-root` reachable + `queryAdmin` confirms `uber` row and one `AdminBootstrapped` event; idempotent second bootstrap → count delta 0; non-allowlisted `freshEmail()` → `route-guard-denied`, no event, `adminLevel` `none`; unauthenticated `/admin` → bounce to `/login`; client self-elevation via `/dev/perms-probe` → rejected, row unchanged.
- Admin-SDK-unavailable (`INSTANT_ADMIN_TOKEN` unset): endpoint `500` + app remains usable — covered by an e2e assertion (or a targeted request test) plus the client degrade in `useAuth`.

## Walkthrough Plan
- **Flow**: Sign in via the real `/login` island as an allowlisted operator, land on `/admin` (the new route) and see the admin landing; then sign in as a non-allowlisted user and hit `/admin` to see the denial — exercising exactly what this cycle built (allowlist bootstrap + `/admin` authorization). Not the home page.
- **Capture points** (ordered, named):
  - `01-login` — the `/login` island ready (`auth-email-input` visible).
  - `02-admin-root` — `/admin` rendered for the allowlisted operator (`data-testid="admin-root"` visible).
  - `03-admin-denied` — `/admin` for a non-allowlisted signed-in user showing `route-guard-denied`.
  - `04-self-elevation-rejected` — `/dev/perms-probe` showing the client `adminLevel: 'uber'` write rejected (the data-layer guard in action).
- **Preconditions / test data**: dev server `.env` includes `ADMIN_EMAILS=admin@blended.test`; auth via `signInViaUi` using an **admin-minted** magic code (`mintCode`, never a real inbox); non-allowlisted case uses `freshEmail()`; realtime/hydration waits on explicit testids (`admin-root`, `route-guard-denied`) with generous timeouts — never `networkidle` (InstantDB keeps the socket busy). Requires `adminAvailable()`; the scenario skips loudly otherwise.
- **If no observable UI this cycle**: N/A — this cycle ships an observable `/admin` route and denial states; the walkthrough is a real new-route flow, not the home-page fallback.

## Risk Assessment
- **`@instantdb/admin` not bundled at runtime** (it was a devDependency): mitigated by moving it to `dependencies` (Task 5); verify with a Vercel/`astro build` of the server route.
- **`newData` perms semantics**: InstantDB evaluates rules server-side; `newData` is the documented post-update reference. Mitigation: the live e2e self-elevation rejection (Task 9) proves the rule end-to-end, and the structural test pins the strings.
- **Schema field type change (number → string union)**: existing dev rows carry numeric `adminLevel`. Mitigation: `normalizeAdminLevel` tolerates any legacy value at read time (→ `'none'`, denied), so no row throws; push is a one-time manual step.
- **Token transport**: relies on `user.refresh_token` from the React SDK. Mitigation: confirmed present on the `User` type; the endpoint verifies via `admin.auth.verifyToken` and returns `401` on any invalid/missing token.
- **E2E idempotency under a shared live app** (`admin@blended.test` persists by auth id): mitigated by asserting a count *delta* across two endpoint calls rather than an absolute count, tolerating prior-run state.
