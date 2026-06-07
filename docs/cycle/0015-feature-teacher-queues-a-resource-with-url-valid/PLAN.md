# Implementation Plan: Cycle 0015

## Overview
Deliver the first vertical slice of the Resource feature: a pure, total `validateResourceUrl` seam plus a `buildResourceQueue`/`queueResource` dual-write path that appends a `ResourceQueued` event and its `sessionResources` projection row in one `writeEvent` transaction, surfaced through a teacher-facing add-resource control + live queue list on `/dashboard/sessions/[id]`. Unsafe-scheme URLs are rejected before any write.

## Current State (from Research)
- The `sessionResources` entity (`src/lib/db.ts:60-80`), its `sessionResourceSession` link (`:141-144`), the `SessionResource` type (`:206`), and the owner-only-write permission rule keyed off `data.ref('session.teacherId')` (`src/lib/perms.ts:72-91`) **all already exist** (cycle 0003). No schema or perms push this cycle.
- `applyEvent` (`src/lib/db.ts:278-438`) has **no `ResourceQueued` case** — it would currently hit `default` and throw `UnknownEventTypeError`. `SessionProjection` (`:227-247`) and `emptyProjection` (`:257-259`) carry no `resources` map.
- The canonical create pattern is the pure-builder / thin-wrapper split: `buildSessionCreate`/`createSession` (`src/lib/sessions.ts:76-135`), with `Build…Plan = { record, meta }` where `meta.payload.id === record.id`, injectable `deps: { write?, buildTxn? }`, and injectable determinism (`sessionId?`/`now?`/`id?`). The teacher-role validation precedent is `buildQuestionAnswer` (`:694-726`). The `.update(...).link({ session })` forgery-proof txn precedent is `defaultParticipantTxn` (`:392-405`).
- `writeEvent` (`src/lib/db.ts:490-528`) commits the envelope + projection txns in one `db.transact()`, validates before acting, requires a non-empty txn array.
- `SessionLifecycle` (`src/components/SessionLifecycle.tsx:38-294`) is the host island: reads `useAuth` identity, a live `sessions` query, and a live `questions` query (`:49`); surfaces errors inline via `role="alert"` + `console.error` (`:71-139`); the Questions Card (`:234-291`) is the layout template for the queue/add-resource Card.
- Pure total-validation seam precedent: `isValidEmail` (`src/lib/auth.ts:24-29`); scheme-style rejection: `safeNextPath` (`src/lib/routing.ts:24`).

## Desired End State
- `src/lib/resources.ts` (new) exports `validateResourceUrl` — a pure, total, never-throws URL validator returning a tagged result.
- `src/lib/sessions.ts` exports `buildResourceQueue` (pure builder) + `queueResource` (thin dual-write wrapper) routing through `writeEvent('ResourceQueued', …)`.
- `applyEvent` folds `ResourceQueued` into a new `SessionProjection.resources` map; `rebuildSessionProjection` over a log with a `ResourceQueued` event reproduces the row; `UnknownEventTypeError` is never raised for it.
- `SessionLifecycle` renders an add-resource control (url + title + type + Add) and a realtime, read-only queue list ordered by `sortOrder` (tie-broken by id), with inline error/empty/loading/error-query states.
- Verify: `npm run test` (Vitest), `npm run test:e2e` (Playwright `e2e/queue-resource.spec.ts`), and `npm run astro check` all pass; the walkthrough captures a valid add and an unsafe-scheme rejection.

## What We're NOT Doing
- No reorder or remove of queued resources (`ResourceReordered`, `ResourceRemoved`) — sibling issue `txt-20260606-213634-reorder-remove-resources`.
- No activation (`ResourceActivated`, `activeResourceId`, broadcast current URL).
- No embed-mode/embeddability checking (`ResourceEmbedChecked`); `embedStatus` stays at the `unchecked` default and `embedMode` at its safe default.
- No title inference from the URL — the Teacher supplies the title.
- No schema change and no permission-rule change — **no `instant-cli push schema`, no `perms:push`** this cycle.
- No standalone `messages`/chat island added; no change to existing lifecycle/question controls beyond mounting the new Card.

## Implementation Approach
Mirror the established event-sourced create pattern exactly. Build bottom-up in vertical slices that each end with passing tests: (1) the pure validation seam; (2) the pure builder + projection fold + wrapper (dual-write core, unit-tested with injected deps — no network); (3) the realtime UI control wired to `queueResource`; (4) the e2e proof + walkthrough. Each slice is independently testable and builds on the prior. All validation is total and synchronous-before-write so a rejected add leaves zero partial state. Resolved open-question decisions are fixed below.

### Resolved Open Questions
- **`embedMode` safe default** = `'blocked'` (string literal). An unchecked resource must never be auto-embedded in an iframe until the deferred embed-checking cycle verifies it; `'blocked'` means "render as a link, not an embed". Pairs with `embedStatus: 'unchecked'`.
- **`type` closed set** (surfaced in the selector): `generic_url`, `google_slides`, `form`, `pdf`, `controlled_page`, `unknown`; default selection `generic_url`. The builder accepts these as opaque strings (no enum constraint in schema); the selector constrains the UI input.
- **`sortOrder` injection shape**: builder takes `currentMaxSortOrder?: number | null`; `sortOrder = currentMaxSortOrder == null ? 0 : currentMaxSortOrder + 1` (empty queue starts at `0`, else `max + 1`). The component computes the max from its live `sessionResources` query.
- **`SessionProjection` extension**: add a `resources: Record<string, { id, sessionId, url, title, type, sortOrder, createdAt }>` map; initialize `{}` in `emptyProjection`.
- **Queue ordering**: inline the comparator in `SessionLifecycle` (mirroring the existing inline question sort `:64-69`) rather than extracting a shared `compare…` helper — SPEC does not mandate extraction and the inline-question precedent is the closest match.

## Failure & Resilience Decisions

**Task 1 — `validateResourceUrl` (pure)**: N/A — pure. Total by construction: wraps `new URL()` in try/catch, never throws, returns a tagged `{ ok: false, reason }` for blank/unparseable/unsafe-scheme. No I/O.

**Task 2 — `buildResourceQueue` (pure)**: N/A — pure. Throws synchronously **before** producing any plan on invalid input (non-teacher actor, missing `actor.id`/`sessionId`, blank title, rejected URL), so nothing is ever written. No I/O surface. Re-running with the same input is referentially transparent except the minted `id`/`now` defaults (injectable for determinism).

**Task 2 — `queueResource` (dual-write wrapper)**:
- **Failure modes**: bad input → builder throws before any txn (no write). Permission denial / network rejection from `writeEvent` → the rejected `db.transact()` promise **propagates to the caller**; the wrapper does not catch.
- **Idempotency**: NOT idempotent by design — each call mints a fresh resource `id` and appends a fresh `ResourceQueued` event (consistent with all create paths). The engine does not retry product mutations; a UI retry creates a new row. The `sortOrder` race (two simultaneous adds resolving the same `max+1`) is accepted as non-blocking per SPEC — rows stay deterministically ordered by the id tie-break.
- **Observability**: every add appends a `sessionEvents` envelope through `writeEvent` — the event log IS the audit trail. UI-layer failures additionally `console.error('[SessionLifecycle] …')`.
- **No silent failure**: the wrapper has no `try/catch`; rejections surface to the caller. Atomicity (`writeEvent`'s single `db.transact`) guarantees no orphan event and no orphan row on rejection.

**Task 3 — `applyEvent` `ResourceQueued` fold (pure)**: N/A — pure. Reads `event.payload` defensively (typeof guards, fallbacks to `event.id`/`event.occurredAt`/projection defaults), returns a new projection (never mutates), re-folds idempotently. Never reaches `default`, so never raises `UnknownEventTypeError`.

**Task 4 — `SessionLifecycle` add-resource control + queue (UI I/O)**:
- **Failure modes**: (a) client-side `validateResourceUrl` rejection (unsafe/blank/unparseable) → inline `role="alert"` error, **no `queueResource` call, no write**, entered values retained. (b) `queueResource` rejection (permission/network) → caught in the handler, surfaced inline via `role="alert"` + `console.error`, entered values retained for retry, live query untouched. (c) live `sessionResources` query error → inline alert rendered **before** the empty state (an errored query never reads as falsely-empty).
- **Idempotency**: a per-submit `pending` latch disables the Add button during the in-flight write to suppress double-submit; otherwise each successful submit is a deliberate new resource.
- **Observability**: `console.error('[SessionLifecycle] add resource failed:', err)` on the write-failure path; validation rejections set the inline error string.
- **No silent failure**: no error is swallowed — validation rejections and write rejections both reach an inline `role="alert"` element; the write path also logs to console.

---

## Task 1: Pure URL-validation seam (`validateResourceUrl`)

### Overview
A single pure, total, never-throws function that is the SOLE place the scheme-acceptance decision lives, so a future allowlist/SSRF tightening touches only its body.

### Changes Required
**File**: `src/lib/resources.ts` (new)
**Changes**:
```ts
export type ResourceUrlRejection = 'blank' | 'unparseable' | 'unsafe_scheme'
export type ResourceUrlValidation =
  | { ok: true; url: string }
  | { ok: false; reason: ResourceUrlRejection }

/**
 * Total URL validator (SPEC §16.3/16.4). Accepts absolute http/https URLs;
 * rejects blank/whitespace, unparseable/relative/bare input, and any non-http(s)
 * scheme (javascript:, data:, vbscript:, file:, …). Never throws on any input.
 * The single seam — no other code parses a resource URL scheme.
 */
export function validateResourceUrl(input: string | null | undefined): ResourceUrlValidation {
  const raw = (input ?? '').trim()
  if (raw === '') return { ok: false, reason: 'blank' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'unparseable' } // relative/bare input lands here
  }
  const scheme = parsed.protocol.toLowerCase()
  if (scheme !== 'http:' && scheme !== 'https:') return { ok: false, reason: 'unsafe_scheme' }
  return { ok: true, url: parsed.href }
}
```

### Success Criteria
- [ ] Compiles/builds cleanly (`astro check` clean).
- [ ] Unit tests pass: accepts `http`/`https`; rejects `javascript:`, `data:`, `vbscript:`, `file:` as `unsafe_scheme`; rejects blank/whitespace as `blank`; rejects bare/relative/garbage as `unparseable`; never throws on any input (including `null`/`undefined`/non-string-ish).
- [ ] No URL/scheme parsing exists anywhere else in the new code (grep: only `resources.ts` calls `new URL` for resources).
- [ ] Failure paths behave as designed (returns tagged rejection, never throws).

---

## Task 2: Pure builder + dual-write wrapper (`buildResourceQueue` / `queueResource`)

### Overview
Mirror `buildSessionCreate`/`createSession`: a pure builder that totally validates input (teacher role, present `sessionId`/`actorId`, non-blank title, accepted URL) and computes end-of-queue `sortOrder`, plus a thin wrapper that dual-writes the `ResourceQueued` envelope + `sessionResources` row (with the `session` link) in one `writeEvent` transaction.

### Changes Required
**File**: `src/lib/sessions.ts`
**Changes**: import `validateResourceUrl` from `./resources`; add:
```ts
export type SessionResourceRecord = {
  id: string
  sessionId: string
  teacherId: string
  url: string
  title: string
  type: string
  sortOrder: number
  embedMode: 'blocked'
  embedStatus: 'unchecked'
  createdAt: number
}

export const RESOURCE_TYPES = [
  'generic_url', 'google_slides', 'form', 'pdf', 'controlled_page', 'unknown',
] as const

export type BuildResourceQueueInput = {
  sessionId: string | null | undefined
  url: string
  title: string
  type: string
  actor: { id: string | null | undefined; role: string }
  currentMaxSortOrder?: number | null // end-of-queue: null/undefined = empty queue
  id?: string                          // injectable determinism
  now?: number
}
export type ResourceQueuePlan = { record: SessionResourceRecord; meta: WriteEventMeta }

export function buildResourceQueue(input: BuildResourceQueueInput): ResourceQueuePlan {
  if (input.actor?.role !== 'teacher')
    throw new Error('queueResource: only a teacher may queue a resource')
  const teacherId = input.actor?.id
  if (!teacherId) throw new Error('queueResource: an actor userId is required')
  const sessionId = input.sessionId
  if (!sessionId) throw new Error('queueResource: a sessionId is required')
  const title = (input.title ?? '').trim()
  if (title === '') throw new Error('queueResource: a resource title is required')
  const valid = validateResourceUrl(input.url)
  if (!valid.ok) throw new Error(`queueResource: invalid url (${valid.reason})`)

  const resourceId = input.id ?? id()
  const sortOrder = input.currentMaxSortOrder == null ? 0 : input.currentMaxSortOrder + 1
  const record: SessionResourceRecord = {
    id: resourceId,
    sessionId,
    teacherId,
    url: valid.url,
    title,
    type: input.type || 'generic_url',
    sortOrder,
    embedMode: 'blocked',
    embedStatus: 'unchecked',
    createdAt: input.now ?? Date.now(),
  }
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: teacherId, role: 'teacher' },
    payload: {
      id: resourceId, sessionId, teacherId, url: record.url,
      title, type: record.type, sortOrder, createdAt: record.createdAt,
    },
  }
  return { record, meta }
}

const defaultResourceTxn = (r: SessionResourceRecord): ProjectionTxn =>
  db.tx.sessionResources[r.id]
    .update({
      sessionId: r.sessionId, teacherId: r.teacherId, url: r.url, title: r.title,
      type: r.type, sortOrder: r.sortOrder, embedMode: r.embedMode,
      embedStatus: r.embedStatus, createdAt: r.createdAt,
    })
    .link({ session: r.sessionId }) // forgery-proof ownership rule traverses this

export type QueueResourceDeps = {
  write?: typeof writeEvent
  buildTxn?: (record: SessionResourceRecord) => ProjectionTxn
}

export async function queueResource(
  input: BuildResourceQueueInput,
  deps: QueueResourceDeps = {}
): Promise<SessionResourceRecord> {
  const plan = buildResourceQueue(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultResourceTxn
  await write('ResourceQueued', plan.meta, [buildTxn(plan.record)])
  return plan.record
}
```

### Success Criteria
- [ ] Compiles/builds cleanly.
- [ ] Unit tests pass: non-teacher actor / missing `actor.id` / missing `sessionId` / blank title / unsafe-or-unparseable URL each **throw before any txn** (a spy `write` is never called); valid input sets the `session` link + `teacherId`; `sortOrder` = `0` for empty queue and `currentMaxSortOrder + 1` otherwise; deferred-field defaults (`embedMode: 'blocked'`, `embedStatus: 'unchecked'`, no `activatedAt`); `meta.payload.id === record.id`.
- [ ] `queueResource` routes `writeEvent('ResourceQueued', …)` with exactly one projection txn (verified via injected `write`/`buildTxn` deps — no network).
- [ ] Failure paths behave as designed (builder throws synchronously; wrapper does not catch — rejection propagates).

---

## Task 3: `applyEvent` `ResourceQueued` fold + `SessionProjection.resources`

### Overview
Extend the projection with a `resources` map and fold `ResourceQueued` into it, keyed by resource id, so the type never reaches `default` / `UnknownEventTypeError` and `rebuildSessionProjection` reproduces the queued row.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**:
1. Add to `SessionProjection` (`:227-247`):
```ts
  resources: Record<
    string,
    { id: string; sessionId: string; url: string; title: string; type: string; sortOrder: number; createdAt: number }
  >
```
2. Initialize in `emptyProjection` (`:257-259`): `resources: {}`.
3. Add a `case 'ResourceQueued'` in the `applyEvent` switch (before `default`), mirroring `QuestionCreated` (`:363-395`):
```ts
case 'ResourceQueued': {
  const p = event.payload as {
    id?: string; sessionId?: string; url?: string; title?: string
    type?: string; sortOrder?: number; createdAt?: number
  }
  const resourceId = p.id ?? event.id
  return {
    ...projection,
    resources: {
      ...projection.resources,
      [resourceId]: {
        id: resourceId,
        sessionId: typeof p.sessionId === 'string' ? p.sessionId : projection.sessionId,
        url: typeof p.url === 'string' ? p.url : '',
        title: typeof p.title === 'string' ? p.title : '',
        type: typeof p.type === 'string' ? p.type : 'generic_url',
        sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : 0,
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : event.occurredAt,
      },
    },
  }
}
```

### Success Criteria
- [ ] Compiles/builds cleanly.
- [ ] Unit tests pass: folding a `ResourceQueued` event adds the keyed row; re-folding the same event is convergent (idempotent); a partial payload falls back to defaults without throwing; `rebuildSessionProjection` over a log containing a `ResourceQueued` event reproduces the queued row.
- [ ] `ResourceQueued` never raises `UnknownEventTypeError` (the existing unknown-type guard test at `src/lib/db.test.ts:336-340` still passes for genuinely-unknown types).
- [ ] Failure paths behave as designed (defensive payload reads, no mutation, no throw on partial input).

---

## Task 4: Teacher add-resource control + live queue list in `SessionLifecycle`

### Overview
Mount an add-resource control (url + title + type selector + Add) and a realtime, read-only queue list (ordered by `sortOrder`, tie-broken by id) inside a new Card on `/dashboard/sessions/[id]`, wired to `queueResource`, with inline validation, error, empty, loading, and query-error states.

### Changes Required
**File**: `src/components/SessionLifecycle.tsx`
**Changes**:
- Import `queueResource`, `RESOURCE_TYPES`, and `validateResourceUrl` (from `@/lib/sessions` and `@/lib/resources`).
- Add a third live query (mirroring `:49`):
  ```ts
  const rq = db.useQuery(sessionId ? { sessionResources: { $: { where: { sessionId } } } } : null)
  if (rq.error) console.error('[SessionLifecycle] resources query error:', rq.error)
  ```
- Local state: `const [resUrl, setResUrl] = useState('')`, `resTitle`, `resType` (default `'generic_url'`), `resError: string | null`, `resPending: boolean`.
- Derive the ordered queue (inline comparator, mirroring `:64-69`):
  ```ts
  const resources = [...(rq.data?.sessionResources ?? [])].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const currentMax = resources.length ? Math.max(...resources.map((r) => r.sortOrder)) : null
  ```
- `addResource` handler:
  ```ts
  async function addResource() {
    setResError(null)
    if (!user?.id) { setResError('You must be signed in to queue a resource'); return }
    const valid = validateResourceUrl(resUrl)            // client-side gate BEFORE any write
    if (!valid.ok) {
      setResError(
        valid.reason === 'unsafe_scheme'
          ? 'That URL scheme is not allowed. Use an http(s) link.'
          : valid.reason === 'blank' ? 'Enter a URL.' : 'That URL could not be parsed.'
      )
      console.error('[SessionLifecycle] add resource rejected:', valid.reason)
      return
    }
    if ((resTitle ?? '').trim() === '') { setResError('Enter a title.'); return }
    setResPending(true)
    try {
      await queueResource({
        sessionId, url: resUrl, title: resTitle, type: resType,
        actor: { id: user.id, role: 'teacher' }, currentMaxSortOrder: currentMax,
      })
      setResUrl(''); setResTitle(''); setResType('generic_url')   // clear only on success
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setResError(message)                                         // retain inputs for retry
      console.error('[SessionLifecycle] add resource failed:', err)
    } finally {
      setResPending(false)
    }
  }
  ```
- Render a new Card after the Questions Card (`:291`), using the Questions Card layout as the template. Testids:
  - Add control: `add-resource-url` (input), `add-resource-title` (input), `add-resource-type` (`<select>` over `RESOURCE_TYPES`), `add-resource-submit` (Button, `disabled={resPending}`), `add-resource-error` (`role="alert"` inline error).
  - Queue: container `resource-queue`; query-error alert `resource-queue-error` (`role="alert"`, rendered **before** the empty check when `rq.error`); empty state `resource-queue-empty`; each row `resource-item` with `data-resource-id` and `data-sort-order`, showing `resource-url`, `resource-title`, `resource-type`.
  - Render order inside the queue container: if `rq.error` → error alert; else if `rq.isLoading` → `resource-queue-loading`; else if `resources.length === 0` → empty; else the rows. (Error checked before empty so an errored query never reads as falsely-empty.)

### Success Criteria
- [ ] Compiles/builds cleanly; `astro check` reports no new errors.
- [ ] A valid `https://` URL + title + type submits, clears the form, and the row appears in `resource-queue` ordered by `sortOrder` without reload.
- [ ] A `javascript:` (and `data:`) URL is rejected inline via `add-resource-error` with no `queueResource` call and inputs retained.
- [ ] A live-query error renders `resource-queue-error` (never a falsely-empty region); empty queue renders `resource-queue-empty`.
- [ ] Failure paths behave as designed (validation + write failures both surface inline + `console.error`; nothing swallowed; double-submit suppressed by `resPending`).

---

## Task 5: e2e proof (`e2e/queue-resource.spec.ts`) + docs

### Overview
Prove the slice end-to-end against the live app (happy path with admin observability, unsafe-scheme rejection with unchanged counts), and update the required docs.

### Changes Required
**File**: `e2e/queue-resource.spec.ts` (new) — mirror `e2e/teacher-question-queue.spec.ts` harness:
- `test.describe` opens with `test.skip(!adminAvailable(), '…')` (skips loudly without admin env).
- Helper signs a fresh teacher in (`signInViaUi(page, freshEmail())`), creates a session via the UI (`new-session-open`/`-title`/`-submit` → `created-session-link`), lands on the detail page.
- **(1) Happy path**: fill `add-resource-url` with a valid `https://…`, `add-resource-title`, select a `add-resource-type`, click `add-resource-submit`; assert a `resource-item` with the URL/title appears; via `queryAdmin` assert exactly one new `sessionResources` row (linked to the session, `embedStatus: 'unchecked'`) and one `ResourceQueued` `sessionEvents` envelope whose `sessionId`/payload match.
- **(2) End-of-queue ordering**: add a second valid resource; assert its `data-sort-order` is strictly greater and it renders last.
- **(3) Failure path**: fill `add-resource-url` with `javascript:alert(1)`, submit; assert `add-resource-error` is visible and that a `queryAdmin` read shows the `sessionResources` and `ResourceQueued` counts **unchanged**. Repeat for a `data:` URL.
- Explicit testid waits, never `networkidle`; rely on `retries: 3` for realtime flake.

**File**: `AGENTS.md` — add a "Teacher queues a resource (cycle 0015)" note under the Data Layer section: `validateResourceUrl` as the single URL-validation seam; `buildResourceQueue`/`queueResource` as the sole sanctioned resource-create path (dual-write via `writeEvent('ResourceQueued', …)`, sets the `session` link + `teacherId`, end-of-queue `sortOrder`, `embedMode: 'blocked'` / `embedStatus: 'unchecked'` defaults); the `applyEvent` `ResourceQueued` fold; the fixed testids; and that **no schema/perms push** is required (entity + rules predate it).

**File**: `README.md` — if it enumerates user-facing capabilities, surface that a Teacher can queue lesson resources (URL + title + type) on a session, with unsafe URLs rejected.

**File**: `release-notes.md` — note the new teacher add-resource capability and URL-scheme rejection.

### Success Criteria
- [ ] `npm run test:e2e` passes (or skips loudly when admin env is unset).
- [ ] Happy-path admin reads confirm one row + one event committed together; failure-path admin reads confirm counts unchanged.
- [ ] `AGENTS.md`, `README.md` (if applicable), and `release-notes.md` updated.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`); `npm run astro check` clean.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] On /dashboard/sessions/[id], the owning Teacher can enter a valid https:// URL + title + type, submit, and **see the resource appear in the session's queue ordered by sortOrder** without a reload. *(user-observable benefit)*` | Task 4 (impl), Task 5 (e2e §1) | Realtime live query, no reload. |
| `[ ] A second resource added to a non-empty queue receives a sortOrder strictly greater than the existing rows' and renders last.` | Task 2 (`sortOrder = max+1`), Task 4 (`currentMax`), Task 5 (e2e §2) | |
| `[ ] A successful add appends exactly one ResourceQueued event whose sessionId/payload match the new row, written in the same transaction as the sessionResources projection row (verified via an admin read in e2e).` | Task 2 (`queueResource` → `writeEvent`), Task 5 (e2e §1) | Single `db.transact`. |
| `[ ] **Failure path:** submitting a javascript: URL (and at least one other unsafe scheme, e.g. data:) is rejected with a clear inline error, and **no sessionResources row and no ResourceQueued event are written** (verified via an admin read showing the queue/event counts unchanged).` | Task 1, Task 4 (inline gate), Task 5 (e2e §3) | Rejected before any write. |
| `[ ] validateResourceUrl unit tests cover: accepted http/https; rejected javascript:, data:, vbscript:, file:; rejected blank/whitespace; rejected unparseable/relative input — and the function never throws on any input.` | Task 1 | Full accept/reject table. |
| `[ ] applyEvent folds ResourceQueued into the sessionResources projection and does **not** raise UnknownEventTypeError; rebuildSessionProjection over a log containing a ResourceQueued event reproduces the queued row.` | Task 3 | |
| `[ ] All existing tests still pass (npm run test, npm run test:e2e).` | Task 5 | Regression gate. |
| `[ ] npm run astro check reports no new errors; no compiler/linter warnings introduced.` | Tasks 1–5 | Verified each task. |

---

## Testing Strategy

### Unit Tests
- **`src/lib/resources.test.ts`** (new): `validateResourceUrl` full table — accepts `http://…`, `https://…` (returns `{ ok: true, url }`); rejects `javascript:alert(1)`, `data:text/html,…`, `vbscript:…`, `file:///etc/passwd` as `unsafe_scheme`; rejects `''`/`'   '` as `blank`; rejects `foo/bar`, `not a url`, `example.com` (bare), `null`/`undefined` as `unparseable` (or `blank`); asserts it never throws across the whole table.
- **`src/lib/sessions.test.ts`** (extend import list): `buildResourceQueue` — failure-path tests for non-teacher actor, missing `actor.id`, missing `sessionId`, blank/whitespace title, and `javascript:`/unparseable URL each throw and a spy `write` is never invoked (proves no write); success-path sets `session` link via injected `buildTxn`, `teacherId = actor.id`, `sortOrder = 0` (empty) and `max+1` (non-empty), defaults `embedMode: 'blocked'`/`embedStatus: 'unchecked'`, `meta.payload.id === record.id`. `queueResource` — with injected `write`/`buildTxn` deps, asserts `writeEvent('ResourceQueued', meta, [txn])` called once; wrapper does not catch (a rejecting `write` propagates).
- **`src/lib/db.test.ts`** (extend `applyEvent` describe at `:138`): `ResourceQueued` fold adds the keyed row; re-fold is convergent; partial payload falls back to defaults without throwing; `rebuildSessionProjection` round-trip reproduces the row; unknown-type guard (`:336-340`) still throws for genuinely-unknown types.
- **Mocking strategy**: prefer real implementations — builders/folds are pure and tested directly with real inputs; only the network seam (`writeEvent`) is replaced via the existing injectable `deps` shape (a spy function), never a heavy mock.

### Integration / E2E Tests
- `e2e/queue-resource.spec.ts` (Task 5): (1) happy-path add + admin observability (one row + one event, same session); (2) end-of-queue ordering of a second add; (3) unsafe-scheme rejection (`javascript:` and `data:`) with admin-verified unchanged counts. Skips loudly without admin env; explicit testid waits; `retries: 3` for realtime flake. Empty-queue and live-query-error states are covered structurally in the UI (rendered branches) and observed in the walkthrough.

## Walkthrough Plan
- **Flow**: Teacher signs in → navigates to `/dashboard/sessions/[id]` for a session they own → in the new add-resource Card, enters a valid `https://` URL + title, picks a type, clicks **Add** → the resource appears in the live `resource-queue` → then enters a `javascript:` URL and clicks **Add** → an inline `add-resource-error` appears and the queue is unchanged. (Real new route/Card — never the home page.)
- **Capture points** (ordered, named):
  - `01-session-detail` — the session facilitation page with the empty `resource-queue` (`resource-queue-empty` visible) and the add-resource control.
  - `02-resource-form-filled` — the add-resource form filled with a valid `https://` URL + title + selected type, before submit.
  - `03-resource-queued` — the resource visible as a `resource-item` in the queue after a successful add (form cleared).
  - `04-second-resource-ordered` — a second resource added, rendering last with a higher `data-sort-order` (proves end-of-queue ordering).
  - `05-unsafe-rejected` — a `javascript:` URL entered and submitted, showing the inline `add-resource-error` with the queue count unchanged.
- **Preconditions / test data**: deterministic magic-code auth (test code via `mintCode`/`signInViaUi`, never a real inbox); a session created through the UI by the signed-in teacher (queueing works on a `draft` session — no start required); realtime asserts wait on explicit testids (`resource-item`, `add-resource-error`), never `networkidle` (InstantDB keeps the socket busy).
- **If no observable UI this cycle**: N/A — this cycle ships observable UI in `src/components/SessionLifecycle.tsx`, so the walkthrough exercises the real new control and must not fall back to the home page.

## Risk Assessment
- **`sortOrder` race (two simultaneous adds resolve the same `max+1`)**: accepted as non-blocking per SPEC — rows stay deterministically ordered by the id tie-break; true reorder is the sibling cycle's concern. No mitigation needed beyond the tie-break comparator.
- **`new URL()` engine variance across Node/browser for odd inputs**: mitigated by the total try/catch wrapper (any parse failure → `unparseable`) and an exhaustive unit table; the function never throws regardless of runtime.
- **`embedMode: 'blocked'` literal choice could conflict with the deferred embed-checking cycle's expectations**: mitigated by it being a conservative default (link-not-embed) and the single-writer convention — the deferred cycle owns flipping it; documented in AGENTS.md.
- **e2e realtime flake on the live query**: mitigated by explicit testid waits (never `networkidle`) and `retries: 3`, consistent with existing suites.
- **Forgery-proof ownership depends on the `.link({ session })` being set**: mitigated by `defaultResourceTxn` always linking and a unit test asserting the link is produced; the existing perms rule (unchanged) admits the write only for the real owner.
