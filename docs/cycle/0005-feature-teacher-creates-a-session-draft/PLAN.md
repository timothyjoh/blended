# Implementation Plan: Cycle 0005

## Overview
Deliver the "New session" vertical slice on the protected `/dashboard`: a `src/lib/sessions.ts` action module (pure `generateJoinCode` + pure `buildSessionCreate` cores plus a thin `createSession` wrapper that routes the dual-write through `writeEvent('SessionCreated', …)`), and a `src/components/NewSession.tsx` island mounted inside the existing `RouteGuard` that collects a title, creates a `draft` `Session` the signed-in user owns, and renders it back (title, status, join code) on screen.

## Current State (from Research)
- `writeEvent(type, meta, projectionTxns)` (`src/lib/db.ts:302`) is the single dual-write choke point: it validates synchronously, throws before any transaction on bad input, and commits the `sessionEvents` envelope + caller projection txn(s) in one `db.transact()` (`src/lib/db.ts:339`). It is explicitly non-idempotent but atomic, so a rejected call leaves no partial state.
- The `sessions` entity (`src/lib/db.ts:48`) carries `title`, `status<'draft'|…>`, `teacherId`, unique `joinCode`, `createdAt`, `interactionMode<'none'|…>`. The `applyEvent` `SessionCreated` case (`src/lib/db.ts:210`) folds `{ id, title, teacherId }` and forces `status: 'draft'`.
- `id()` is re-exported from `@/lib/db` (`src/lib/db.ts:147`). `EventSpineHarness.tsx:45-62` is the canonical (dev-only) `SessionCreated` dual-write, including the `if (!actorId)` missing-auth guard and the `try/catch` + `.catch()` + `console.error` surface pattern.
- Pure, db-free, totally-validating cores live in `src/lib/auth.ts` (`isValidEmail` trims and never throws); their tests (`src/lib/auth.test.ts`) use `describe`/`it`/`it.each` + `toThrow(/regex/)`. Vitest is node-env, `include: ['src/**/*.test.ts']`, and injects `PUBLIC_INSTANTDB_APP_ID: 'test-app-id'` so importing `db.ts` succeeds in unit tests (`vitest.config.ts`, `src/lib/db.test.ts:1-16`).
- Identity is read only through `useAuth` (`src/lib/useAuth.ts:32`), which returns `user?.id`. The product error pattern (`AuthGate.tsx:113-117`) is an inline `role="alert"` `text-destructive` element + disabled-while-pending submit. UI primitives `Button` (`ui/button.tsx`), `Input` (`ui/input.tsx`), `Card`/`CardHeader`/`CardTitle`/`CardContent` (`ui/card.tsx`) and Tailwind are present.
- `RouteGuard` (`src/components/RouteGuard.tsx:83`) renders `{children}` ONLY when authenticated/authorized; the dashboard (`src/pages/dashboard/index.astro:12-18`) slots a single `h1[data-testid="dashboard-root"]` inside `<RouteGuard client:only="react">`. The route-guard e2e (`e2e/route-guarding.spec.ts:41,66`) asserts `dashboard-root` visibility, so that testid must be preserved.
- e2e seam: `adminAvailable`/`freshEmail`/`mintCode`/`signInViaUi` in `e2e/support/auth.ts` (uses `@instantdb/admin`'s `init`); specs `test.skip(!adminAvailable(), …)` to skip loudly. `playwright.config.ts` runs its own dev server on port 4399 with `retries: 3`.

## Desired End State
- `src/lib/sessions.ts` exports `JOIN_CODE_LENGTH`, `JOIN_CODE_ALPHABET`, `generateJoinCode`, `buildSessionCreate`, `createSession`, and supporting types.
- `src/lib/sessions.test.ts` unit-covers the join-code core, the builder, and the `createSession` failure path; `npm run test` passes.
- `/dashboard` renders, behind the existing guard, a "New session" control that creates a real `draft` session owned by the signed-in user and reflects it on screen; `dashboard-root` still present.
- `e2e/create-session.spec.ts` proves the happy path, the observability (admin-queried `sessions` row + exactly one `SessionCreated` `sessionEvents` row), and the blank-title failure path; it skips loudly when admin env is unset.
- `npm run astro check`, `npm run test`, `npm run test:e2e` are clean. AGENTS.md / README.md / release-notes.md updated.
- Verify: `npm run test && npm run astro check`, then `npm run test:e2e` with `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID` set.

## What We're NOT Doing
- No listing/enumeration of existing sessions or persisting into a dashboard list (deferred to `txt-…-dashboard-session-list`).
- No starting/ending/archiving/status transitions (`txt-…-start-end-session`).
- No resources, join-as-participant, `joinSlug` generation, or teacher-vs-student role UI beyond "creating makes you the teacher."
- No editing/deleting a created session; no navigation into a session detail page after creation.
- No new UI library; no changes to `writeEvent`, the schema, or the permission rules (assumed already pushed per SPEC Dependencies).

## Implementation Approach
Mirror the established pure-core pattern: keep all deterministic logic (`generateJoinCode`, `buildSessionCreate`) free of side effects and dependency-injectable so it unit-tests without a network, and confine the only impure step to a thin `createSession` wrapper that constructs the `db.tx.sessions[id].update(...)` projection chunk and calls `writeEvent`. `buildSessionCreate` accepts injectable `sessionId`/`joinCode`/`now` (defaulting to `id()`, `generateJoinCode()`, `Date.now()`) so its output is reproducible under test while production uses real generators. `createSession` accepts an optional `deps` object (`write`, `buildTxn`) so the rejected-write failure path is unit-testable by injecting a rejecting stub — no real `db.transact` in unit tests. The `SessionCreated` envelope shape exactly matches the working `EventSpineHarness` reference (`actor.role: 'teacher'`, `payload: { id, title, teacherId }`, `sessionId === payload.id`) so it folds cleanly through the existing `applyEvent`.

The UI follows `AuthGate`: `useState` for the created-session record + error + pending, a `try/catch` around `createSession`'s synchronous-throw path with `.catch()` on the promise, inline `role="alert"` error, and identity read via `useAuth` with an `if (!user?.id)` guard before any write. `NewSession` mounts as a nested `client:only="react"` island inside the existing `RouteGuard` slot, beside the preserved `dashboard-root` heading — so it only hydrates when the guard renders its children (authenticated). e2e observability uses a new Node-side admin query helper (`@instantdb/admin` is already a dependency in `e2e/support`), avoiding a new dev probe.

`generateJoinCode` is pinned to length **10** over the 31-char unambiguous alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (digits 2–9 and A–Z excluding `0,1,I,L,O`), ≈49 bits of entropy — sufficient for an MVP bearer token (SPEC §16.2).

## Failure & Resilience Decisions

**`generateJoinCode` / `buildSessionCreate` (`src/lib/sessions.ts` pure cores)** — N/A beyond input validation; no I/O. `buildSessionCreate` totally validates: empty/whitespace title and missing `teacherId` throw synchronously **before** any plan/txn is produced (mirrors `writeEvent`'s validate-before-act and `isValidEmail`'s totality). No state mutated, nothing to re-run unsafely. Errors are thrown (not swallowed) and propagate to the caller. `generateJoinCode`'s only external touch is `crypto.getRandomValues` via the default `randomBytes`; if `crypto` were unavailable it throws (loud), never returns a weak/empty code.

**`createSession` wrapper (`src/lib/sessions.ts`)**:
- **Failure modes**: (a) validation throw from `buildSessionCreate` — propagates synchronously, nothing written; (b) `writeEvent` rejection (permission denial, unique-`joinCode` collision, network/dependency failure) — the returned promise rejects and the rejection propagates to the UI caller. No `catch` that swallows.
- **Idempotency**: NOT idempotent by design — each call mints a fresh `sessionId`/`joinCode` and appends a new event (a distinct new session is the intent; matches `writeEvent`'s documented contract at `src/lib/db.ts:296-299`). Re-run safety: because the event append and the `sessions` projection share one `db.transact`, a rejected call commits nothing (no orphan event, no orphan session), so a retry simply creates a new session rather than corrupting state.
- **Observability**: on rejection the error object propagates unchanged; the UI logs it via `console.error('[NewSession] createSession failed:', err)` and the durable success record is the `SessionCreated` `sessionEvents` row itself.
- **No silent failure**: confirmed — no `try/catch` in `createSession` discards the error; both the synchronous throw and the async rejection reach the caller.

**`NewSession.tsx` (`src/components/NewSession.tsx`)**:
- **Failure modes**: missing auth id → guard refuses to write and surfaces an inline error (defense in depth behind `RouteGuard`); validation throw → caught and shown in `new-session-error`; `createSession` promise rejection → `.catch()` sets the inline error and `console.error`s.
- **Idempotency**: submit is disabled while pending to prevent double-submit; each successful submit replaces the on-screen created-session state. UI holds no durable state, so re-render is safe.
- **Observability**: `console.error('[NewSession] …', err)` on every failure path, plus the inline `role="alert"` message.
- **No silent failure**: every branch (sync throw, async reject, missing auth) sets visible error state AND logs; none is swallowed.

**`createSession` (default `buildTxn` path) — I/O**: the single `db.transact` is atomic; partial dual-write is impossible (see `writeEvent` contract). Covered above.

**`e2e/support/auth.ts` `queryAdmin` helper — network I/O**: a rejected admin query throws and the failure surfaces in the test (never swallowed), matching `mintCode`'s "throws if the admin call fails" convention. Read-only, so re-run safe.

---

## Task 1: `createSession` action module with pure cores

### Overview
Create `src/lib/sessions.ts` exporting the pinned join-code constants, the pure `generateJoinCode` and `buildSessionCreate` cores, and the thin `createSession` wrapper that routes the dual-write through `writeEvent`.

### Changes Required
**File**: `src/lib/sessions.ts` (new)
**Changes**:
```ts
import { db, id, writeEvent, type ProjectionTxn, type WriteEventMeta } from '@/lib/db'

/** Unambiguous charset (digits 2-9 + A-Z minus 0,1,I,L,O) and length pinned for
 *  MVP-unguessable bearer join codes (SPEC §16.2 — ~49 bits over 31^10). */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const JOIN_CODE_LENGTH = 10

/** Injectable CSPRNG source; production defaults to the platform CSPRNG so the
 *  core is pure (deterministic) under an injected source for unit tests. */
export type RandomBytes = (length: number) => Uint8Array
const defaultRandomBytes: RandomBytes = (length) => {
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  return buf
}

export function generateJoinCode(randomBytes: RandomBytes = defaultRandomBytes): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH)
  let code = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[bytes[i] % JOIN_CODE_ALPHABET.length]
  }
  return code
}

export type SessionRecord = {
  id: string
  title: string
  status: 'draft'
  teacherId: string
  joinCode: string
  createdAt: number
  interactionMode: 'none'
}

export type BuildSessionCreateInput = {
  title: string
  teacherId: string | null | undefined
  // Injectable for deterministic tests; production uses the defaults.
  sessionId?: string
  joinCode?: string
  now?: number
}

export type SessionCreatePlan = { record: SessionRecord; meta: WriteEventMeta }

/** Pure builder: validates input and produces the projection record + the
 *  SessionCreated envelope meta. Throws BEFORE producing any plan on bad input. */
export function buildSessionCreate(input: BuildSessionCreateInput): SessionCreatePlan {
  const title = (input.title ?? '').trim()
  if (title === '') throw new Error('createSession: a session title is required')
  const teacherId = input.teacherId
  if (!teacherId) throw new Error('createSession: must be signed in to create a session')

  const sessionId = input.sessionId ?? id()
  const record: SessionRecord = {
    id: sessionId,
    title,
    status: 'draft',
    teacherId,
    joinCode: input.joinCode ?? generateJoinCode(),
    createdAt: input.now ?? Date.now(),
    interactionMode: 'none',
  }
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: teacherId, role: 'teacher' },
    payload: { id: sessionId, title, teacherId },
  }
  return { record, meta }
}

export type CreateSessionInput = { title: string; teacherId: string | null | undefined }
export type CreateSessionDeps = {
  write?: typeof writeEvent
  buildTxn?: (record: SessionRecord) => ProjectionTxn
}

const defaultBuildTxn = (r: SessionRecord): ProjectionTxn =>
  db.tx.sessions[r.id].update({
    title: r.title,
    status: r.status,
    teacherId: r.teacherId,
    joinCode: r.joinCode,
    createdAt: r.createdAt,
    interactionMode: r.interactionMode,
  })

/** Thin wrapper: builds the plan (sync-throws on bad input), then dual-writes the
 *  SessionCreated envelope + sessions projection in ONE transaction via writeEvent.
 *  deps are injectable so the rejection path is unit-testable. */
export async function createSession(
  input: CreateSessionInput,
  deps: CreateSessionDeps = {}
): Promise<SessionRecord> {
  const plan = buildSessionCreate(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultBuildTxn
  await write('SessionCreated', plan.meta, [buildTxn(plan.record)])
  return plan.record
}
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run astro check`)
- [ ] `buildSessionCreate` throws on empty/whitespace title and missing `teacherId` before producing a plan; trims title; sets `status:'draft'`, `interactionMode:'none'`, `sessionId === payload.id`
- [ ] `createSession` rejects when its injected `write` rejects (error propagated)
- [ ] Failure paths behave as designed (errors thrown/propagated, no silent catch)

---

## Task 2: Unit tests for the pure cores and failure path

### Overview
Create `src/lib/sessions.test.ts` covering `generateJoinCode`, `buildSessionCreate`, and the `createSession` rejection path, mirroring `src/lib/auth.test.ts` conventions.

### Changes Required
**File**: `src/lib/sessions.test.ts` (new)
**Changes**:
```ts
import { describe, it, expect } from 'vitest'
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  generateJoinCode,
  buildSessionCreate,
  createSession,
} from './sessions'

describe('generateJoinCode', () => {
  it('returns a code of the pinned length', () => {
    expect(generateJoinCode().length).toBe(JOIN_CODE_LENGTH)
  })
  it('draws only from the allowed charset', () => {
    const code = generateJoinCode()
    for (const ch of code) expect(JOIN_CODE_ALPHABET).toContain(ch)
  })
  it('is reproducible under an injected deterministic RNG', () => {
    const rng = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i))
    expect(generateJoinCode(rng)).toBe(generateJoinCode(rng))
  })
  it('two successive real-CSPRNG calls differ', () => {
    expect(generateJoinCode()).not.toBe(generateJoinCode())
  })
})

describe('buildSessionCreate', () => {
  const ok = { title: '  Algebra  ', teacherId: 'u1', sessionId: 's1', joinCode: 'CODE', now: 100 }
  it('builds a draft projection record with trimmed title and pinned defaults', () => {
    const { record } = buildSessionCreate(ok)
    expect(record).toEqual({
      id: 's1', title: 'Algebra', status: 'draft', teacherId: 'u1',
      joinCode: 'CODE', createdAt: 100, interactionMode: 'none',
    })
  })
  it('builds meta with teacher actor and sessionId === payload.id', () => {
    const { meta } = buildSessionCreate(ok)
    expect(meta.actor).toEqual({ id: 'u1', role: 'teacher' })
    expect(meta.sessionId).toBe('s1')
    expect(meta.payload).toEqual({ id: 's1', title: 'Algebra', teacherId: 'u1' })
  })
  it.each(['', '   ', '\t\n'])('rejects blank/whitespace title %p before any plan', (bad) => {
    expect(() => buildSessionCreate({ ...ok, title: bad })).toThrow(/title is required/)
  })
  it.each([null, undefined, ''])('rejects a missing teacherId %p', (bad) => {
    expect(() => buildSessionCreate({ ...ok, teacherId: bad as any })).toThrow(/signed in/)
  })
})

describe('createSession', () => {
  it('returns the created record on a successful write', async () => {
    const calls: unknown[] = []
    const write = (...args: unknown[]) => { calls.push(args); return Promise.resolve('ok') }
    const rec = await createSession(
      { title: 'Bio', teacherId: 'u9' },
      { write: write as any, buildTxn: () => ({} as any) }
    )
    expect(rec.status).toBe('draft')
    expect(rec.teacherId).toBe('u9')
    expect(calls).toHaveLength(1)
  })
  it('propagates (does not swallow) a rejected write', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      createSession({ title: 'Bio', teacherId: 'u9' }, { write: write as any, buildTxn: () => ({} as any) })
    ).rejects.toThrow(/permission denied/)
  })
  it('throws synchronously on invalid input without calling write', async () => {
    let called = false
    const write = () => { called = true; return Promise.resolve() }
    await expect(
      createSession({ title: '  ', teacherId: 'u9' }, { write: write as any, buildTxn: () => ({} as any) })
    ).rejects.toThrow(/title is required/)
    expect(called).toBe(false)
  })
})
```

### Failure & Resilience Decisions
N/A — pure test code; injected stubs avoid all real I/O.

### Success Criteria
- [ ] `npm run test` passes including the new file
- [ ] Length, charset, determinism, and distinctness assertions all pass
- [ ] Validation and rejection failure-path tests pass (covers SPEC criteria 4, 5-unit, 6)

---

## Task 3: `NewSession` dashboard control

### Overview
Create `src/components/NewSession.tsx` and mount it inside the existing `RouteGuard` on `/dashboard`, preserving `dashboard-root`. The control reveals a title input + submit, calls `createSession` with the signed-in user's id, and renders the created session or an inline error.

### Changes Required
**File**: `src/components/NewSession.tsx` (new)
**Changes**: A React island following the `AuthGate` pattern:
```tsx
import { useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { createSession, type SessionRecord } from '@/lib/sessions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewSession() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [created, setCreated] = useState<SessionRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function surface(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setError(message)
    console.error('[NewSession] createSession failed:', err)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!user?.id) {                        // defense-in-depth behind RouteGuard
      setError('You must be signed in to create a session')
      return
    }
    setPending(true)
    try {
      const record = await createSession({ title, teacherId: user.id })
      setCreated(record)
      setTitle('')
    } catch (err) {
      surface(err)
    } finally {
      setPending(false)
    }
  }

  // ...render:
  //  - a Button data-testid="new-session-open" that sets open=true (when !open)
  //  - a <form> with Input data-testid="new-session-title" + Button
  //    type="submit" data-testid="new-session-submit" disabled={pending}
  //  - inline error: <p data-testid="new-session-error" role="alert"
  //    className="text-sm text-destructive">{error}</p>
  //  - on success a Card:
  //      data-testid="created-session" containing
  //      data-testid="created-session-title"   -> created.title
  //      data-testid="created-session-status"  -> created.status  (= 'draft')
  //      data-testid="created-session-joincode"-> created.joinCode
}
```
Reuse `Layout`/Tailwind classes consistent with `AuthGate`. Show `username`/title only — never raw email.

**File**: `src/pages/dashboard/index.astro`
**Changes**: import and mount `NewSession` as a nested island inside the existing guard, keeping `dashboard-root`:
```astro
---
import Layout from '@/layouts/Layout.astro'
import RouteGuard from '@/components/RouteGuard'
import NewSession from '@/components/NewSession'
---
<Layout title="Dashboard — Blended">
  <div class="mx-auto mt-12 w-full max-w-2xl px-4">
    <RouteGuard client:only="react">
      <h1 data-testid="dashboard-root" class="text-2xl font-semibold">Dashboard</h1>
      <NewSession client:only="react" />
    </RouteGuard>
  </div>
</Layout>
```
(`NewSession` only hydrates when `RouteGuard` renders its children — i.e. authenticated — matching how `dashboard-root` is already gated.)

### Success Criteria
- [ ] `npm run astro check` clean (no type/lint warnings)
- [ ] `dashboard-root` testid still present and visible when authenticated
- [ ] Created session renders `created-session`, `created-session-status` (`draft`), `created-session-joincode` (non-empty)
- [ ] Blank-title submit shows `new-session-error` and writes nothing (delegated to `createSession`/`buildSessionCreate` validation)
- [ ] Failure paths behave as designed: every error branch sets inline state AND `console.error`s; none swallowed

---

## Task 4: e2e coverage (`create-session.spec.ts`) + admin query helper

### Overview
Add a Node-side admin read helper to `e2e/support/auth.ts` and a Playwright spec proving the happy path, the dual-write observability, and the blank-title failure path. Skip loudly when admin env is unset.

### Changes Required
**File**: `e2e/support/auth.ts`
**Changes**: add an admin query helper (reuses the already-imported `@instantdb/admin` `init`):
```ts
/** e2e-only Node-side admin read for observability assertions. Throws (surfaces
 *  in the test) if the admin query fails — never swallowed. */
export async function queryAdmin(query: Record<string, unknown>): Promise<any> {
  const admin = init({
    appId: process.env.PUBLIC_INSTANTDB_APP_ID as string,
    adminToken: process.env.INSTANT_ADMIN_TOKEN as string,
  })
  return admin.query(query as any)
}
```

**File**: `e2e/create-session.spec.ts` (new)
**Changes**:
```ts
import { test, expect } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

test.describe('teacher creates a session (draft)', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — create-session e2e requires admin code minting against the live app'
  )

  test('signed-in user creates a draft session, sees it, and it is recorded', async ({ page }) => {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })

    const title = `Lesson ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()

    // On-screen confirmation (acceptance #1)
    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('created-session-status')).toHaveText('draft')
    const joinCode = await page.getByTestId('created-session-joincode').textContent()
    expect(joinCode?.trim()).toBeTruthy()

    // Observability (acceptance #2, #3): admin-query the live app by joinCode.
    await expect.poll(async () => {
      const res = await queryAdmin({ sessions: { $: { where: { joinCode: joinCode!.trim() } } } })
      return res.sessions?.length ?? 0
    }, { timeout: 20_000 }).toBe(1)

    const res = await queryAdmin({ sessions: { $: { where: { joinCode: joinCode!.trim() } } } })
    const session = res.sessions[0]
    expect(session.status).toBe('draft')
    expect(session.title).toBe(title)

    const events = await queryAdmin({
      sessionEvents: { $: { where: { sessionId: session.id, type: 'SessionCreated' } } },
    })
    expect(events.sessionEvents).toHaveLength(1)
    // teacherId === creating user's auth id: the event's actorId is that id and
    // matches the projection's teacherId (acceptance #2).
    expect(session.teacherId).toBe(events.sessionEvents[0].actorId)
  })

  test('blank title shows an inline error and creates no session', async ({ page }) => {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill('   ')
    await page.getByTestId('new-session-submit').click()
    await expect(page.getByTestId('new-session-error')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('created-session')).toHaveCount(0)
  })
})
```

### Failure & Resilience Decisions
- **`queryAdmin`** — network read; rejection throws and surfaces in the test (no swallow), matching `mintCode`. Read-only → re-run safe. Polling absorbs InstantDB realtime/commit latency.
- **Spec** — skips loudly via `test.skip(!adminAvailable(), …)` so a missing admin token never produces a false green (mirrors `auth.spec.ts`/`route-guarding.spec.ts`).

### Success Criteria
- [ ] `npm run test:e2e` passes with admin env set; skips loudly without it
- [ ] Happy path asserts on-screen `draft` + non-empty join code (acceptance #1)
- [ ] Admin query confirms one `sessions` row (`status:'draft'`, `teacherId === actorId`) and exactly one `SessionCreated` `sessionEvents` row (acceptance #2, #3)
- [ ] Blank-title path asserts inline error and zero `created-session` (acceptance #5-e2e)

---

## Task 5: Documentation updates

### Overview
Record the new session-creation surface in the three docs SPEC names. Documentation is part of "done."

### Changes Required
**File**: `AGENTS.md`
**Changes**: under the Data Layer / route-guarding notes add a "Session creation" line: sessions are created via `createSession` (`src/lib/sessions.ts`), which routes through `writeEvent('SessionCreated', …)`; `generateJoinCode` is the sanctioned unguessable join-code source (length `JOIN_CODE_LENGTH`, charset `JOIN_CODE_ALPHABET`); creating a session is what makes a user its teacher (session-scoped role, no account type). List the dashboard testids downstream cycles reuse: `new-session-open`, `new-session-title`, `new-session-submit`, `new-session-error`, `created-session`, `created-session-title`, `created-session-status`, `created-session-joincode`.

**File**: `README.md`
**Changes**: note that signed-in users can now create a draft session from the dashboard and receive a shareable join code.

**File**: `release-notes.md`
**Changes**: one line — session creation (draft + join code) is live; no new env/config beyond existing keys.

### Failure & Resilience Decisions
N/A — documentation only.

### Success Criteria
- [ ] AGENTS.md documents `createSession`, `generateJoinCode`, the teacher-by-creation rule, and the new testids
- [ ] README.md and release-notes.md updated as specified

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A signed-in user on `/dashboard` enters a title, submits, and sees the created session rendered with `status` `draft` and a non-empty join code (`data-testid` for the created session, its status, and its join code) — the user-observable benefit: they can now create a session they own. | Task 3, Task 4 | UI renders `created-session*`; e2e happy path asserts |
| [ ] The created `sessions` row has `teacherId` equal to the creating user's auth id and `status === 'draft'` (asserted via query in the e2e check). | Task 4 | admin `queryAdmin` asserts `teacherId === actorId`, `status:'draft'` |
| [ ] Exactly one `sessionEvents` row of `type: 'SessionCreated'` exists for the created session id, written in the same transaction as the projection (observability check). | Task 4 | admin query asserts `sessionEvents` length 1; atomicity from `writeEvent` (Task 1) |
| [ ] `generateJoinCode()` returns codes of the specified length drawn only from the allowed charset, and two successive calls with the real CSPRNG differ; with an injected deterministic RNG the output is reproducible (unit test). *(unguessability / determinism criterion)* | Task 1, Task 2 | unit tests for length/charset/determinism/distinctness |
| [ ] Submitting a blank or whitespace-only title produces an inline error (`new-session-error`), and **no** `sessions` row and **no** `SessionCreated` event are written (unit test on the validation path; e2e asserts no new row appears). *(failure-path criterion)* | Task 2, Task 3, Task 4 | `buildSessionCreate` throws pre-txn; UI shows error; e2e asserts no `created-session` |
| [ ] A rejected `createSession` write (simulated/asserted at the unit level via a forced `writeEvent` rejection) surfaces the error to the caller and leaves no created-session UI state — the error is propagated, not swallowed. *(failure-path criterion)* | Task 1, Task 2, Task 3 | unit test injects rejecting `write`; UI `.catch` keeps `created` null |
| [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`, `npm run astro check`). | Task 1–5 | no changes to existing modules' contracts; `dashboard-root` preserved |
| [ ] No compiler/linter warnings introduced; `npm run astro check` is clean. | Task 1–4 | typed exports; island follows existing patterns |

---

## Testing Strategy

### Unit Tests
- `generateJoinCode`: length equals `JOIN_CODE_LENGTH`; every char ∈ `JOIN_CODE_ALPHABET`; reproducible under an injected deterministic `RandomBytes`; two real-CSPRNG calls differ.
- `buildSessionCreate`: trimmed title; `status:'draft'`, `interactionMode:'none'`, `createdAt` from injected `now`, `sessionId === payload.id`, `actor.role === 'teacher'`; **failure paths** — `it.each` over `''`/`'   '`/`'\t\n'` titles `toThrow(/title is required/)` and `null`/`undefined`/`''` teacherId `toThrow(/signed in/)`, asserting the throw happens before any plan/txn.
- `createSession`: returns the record on a resolving injected `write`; **failure paths** — rejecting injected `write` → `rejects.toThrow(/permission denied/)` (propagation, no swallow); invalid input → `rejects.toThrow(/title is required/)` AND the injected `write` is never called (validate-before-act).
- Mocking strategy: prefer real implementations — only the `write`/`buildTxn` dependencies of `createSession` are injected as plain stubs to exercise the rejection/propagation path without a network; the pure cores use no mocks at all.

### Integration / E2E Tests
- Happy path: sign in (`signInViaUi`) → `/dashboard` → open control → fill title → submit → assert on-screen `draft` status + non-empty join code.
- Observability: `queryAdmin` by `joinCode` → exactly one `sessions` row (`status:'draft'`, `title` match, `teacherId === actorId`) and exactly one `SessionCreated` `sessionEvents` row for that session id.
- Failure path: blank/whitespace title → `new-session-error` visible, zero `created-session`.
- Skips loudly when `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are unset.

## Risk Assessment
- **Nested `client:only` island not hydrating inside `RouteGuard`'s slot**: Astro passes slotted islands to the parent React component as children; `RouteGuard` renders `{children}` only when authorized, so `NewSession` mounts/hydrates exactly when `dashboard-root` does (already-proven gating). Mitigation: if hydration misbehaves, fold `NewSession` into the page as a sibling guarded by the same auth state; e2e catches a regression because `created-session` would never appear.
- **`crypto.getRandomValues` in the Vitest node env**: available on Node 18+ global `crypto`. Mitigation: the distinctness/length tests run it directly; if the runtime lacked it the test fails loudly rather than shipping a weak code.
- **`joinCode` unique-constraint collision**: ~49 bits of entropy makes collision negligible for MVP; a collision surfaces as a `writeEvent` rejection (propagated + logged + inline error), and the atomic transaction leaves no partial state — the user simply retries (a fresh code is minted). Out of scope: automatic retry-on-collision.
- **Admin query latency in e2e**: realtime commit may lag the on-screen render. Mitigation: `expect.poll` with a 20s budget before the final assertions, matching the existing 20s realtime budgets in `permissions.spec.ts`.
- **`@instantdb/admin` query API shape** (`admin.query` vs alternative): mirror the existing `init(...)` usage already in `e2e/support/auth.ts`; if `query` differs, the helper is the single place to adjust and the spec is unaffected.
