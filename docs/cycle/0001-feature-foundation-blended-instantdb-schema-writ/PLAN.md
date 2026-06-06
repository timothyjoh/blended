All open questions are resolved. Writing the plan.

# Implementation Plan: Cycle 0001

## Overview
Establish the Blended event spine: a single shared db module (`src/lib/db.ts`) exporting the typed InstantDB schema for the eight MVP entities and an initialized client, a `writeEvent()` dual-write choke point that atomically appends a §7.2 `sessionEvents` envelope plus caller projection updates in one `transact()`, a deterministic `applyEvent`/fold, and a dev-only scratch harness proving dual-write and realtime cross-client sync.

## Current State (from Research)
- The only InstantDB usage is the `todos` demo in `src/components/TodoApp.tsx:1-21`, which is the proven `init({ appId, schema })` + `i.schema({ entities })` pattern to reuse. It reads `import.meta.env.PUBLIC_INSTANTDB_APP_ID` (`TodoApp.tsx:6`) and writes projections directly via `db.transact(db.tx.todos[id()].update(...))` (`TodoApp.tsx:44-60`).
- `src/lib/` holds only `theme.ts` and `utils.ts`; there is no `db.ts` yet. Path alias `@/*` → `./src/*` (`tsconfig.json`).
- React islands mount on `.astro` pages via `client:only` (`src/pages/todo.astro:12`).
- `PUBLIC_INSTANTDB_APP_ID` is a typed client/public env field (`astro.config.mjs:16-23`), present in `.env`. **`.env.example` is wrong**: it has `INSTANTDB_APP_ID=instantdb.com` (`.env.example:1`).
- **No test tooling at all** — no Vitest, no Playwright, no `test` script. `npm run build` runs `astro check && astro build`.
- Style: TypeScript, no semicolons, two-space indent (`AGENTS.md`).
- **Resolved — InstantDB `^1.0.43` schema builder capabilities** (verified in `node_modules/.pnpm/@instantdb+core@1.0.43/.../dist/commonjs/schema.d.ts:33-38` and `schemaTypes.d.ts:21-24`):
  - `i.string<Union>()` accepts a string-literal generic → `i.string<'teacher' | 'student' | 'ai' | 'system' | 'unknown'>()` gives a typed `actorRole` enum at the type level.
  - `i.number()`, `i.boolean()`, `i.date()`, `i.json<T>()`, `i.any()` exist.
  - Modifiers `.optional()`, `.indexed()`, `.unique()`, `.clientRequired()` exist on every attr.
  - Conclusion: enums = `i.string<Union>()` + runtime validation where the SPEC demands a hard constraint; integer `schemaVersion` = `i.number()` + `Number.isInteger` runtime check; structured `payload` = `i.json<Record<string, unknown>>()`.

## Desired End State
- `src/lib/db.ts` exports: the typed `schema` (eight entities), the initialized `db` client, schema-derived entity types via `InstaQLEntity`, `writeEvent()`, `applyEvent()`, `rebuildSessionProjection()`, and a pure `requireAppId()` validator. Importing the module with an empty app id throws.
- `src/pages/dev/event-spine.astro` mounts `src/components/EventSpineHarness.tsx` (`client:only`), dev-gated, exercising two event types (`SessionCreated`, `ParticipantJoined`) and rendering live `sessionEvents` + projection rows.
- Vitest unit tests cover `applyEvent` determinism/unknown-type surfacing and `requireAppId`. Playwright e2e covers happy path ×2, realtime two-context sync, and the invalid-input failure path.
- `astro check` passes; existing `todos` demo untouched and still working.
- Docs updated: `AGENTS.md`, `README.md`, `.env.example`.
- Verify: `npm run astro check` clean; `npm run test` (Vitest) green; `npm run test:e2e` (Playwright) green against `astro dev`.

## What We're NOT Doing
- No teacher/student product flows (create-session UI, dashboard, join, chat, questions, cursor voting, replay, AI/moderation) — sibling cycles.
- No server-side projection enforcement, no InstantDB permission rules, no admin SDK trust boundary (deferred per ADR-0001).
- No concrete payload handling for §7.3 event types beyond the two the harness exercises; the schema/helper merely must not preclude the rest.
- No entities outside the listed eight (`questionClusters`, `cursorVote*`, `moderationDecisions`, `transcriptSegments`).
- No `client_action_id` dedup / idempotency layer, rate limiting, or retry logic (SPEC §17.2 / §15 — out of scope).
- Not migrating the `todos` demo onto the shared module or removing it; it stays as-is (the no-direct-projection-write rule applies only to Blended projection entities).

## Implementation Approach
Build bottom-up in vertical slices, each independently verifiable. Slice 1 lands the schema + client + env guard (the type/`astro check` gate). Slice 2 adds `applyEvent`/fold with unit tests (pure, fully testable without a browser). Slice 3 adds `writeEvent()` with its input-validation and atomicity guarantees. Slice 4 adds the dev harness (the observable surface). Slice 5 wires Playwright e2e (dual-write, realtime, failure path). Slice 6 updates docs. Validation logic that the SPEC requires to be testable without a live browser (env guard, fold determinism) is factored into pure functions so Vitest can exercise the failure paths directly.

Key design decisions:
- **`writeEvent` signature**: `writeEvent(type, { sessionId, actor, payload, correlationId?, schemaVersion?, occurredAt?, receivedAt? }, projectionTxns)` where `actor: { id: string | null, role: ActorRole }` and `projectionTxns` is a non-empty array of `db.tx....` transaction chunks. Internally it builds the event tx chunk and calls `db.transact([eventTx, ...projectionTxns])` — one transaction, atomic.
- **Stamping**: `id` ← `id()`, `occurredAt`/`receivedAt` ← `Date.now()` when not supplied, `schemaVersion` ← `1` default.
- **Unknown-type policy in `applyEvent`**: throw a typed `UnknownEventTypeError` (surfaces divergence loudly); `rebuildSessionProjection` propagates it.
- **Harness gating**: the `.astro` page checks `import.meta.env.PROD` and renders a "dev-only, disabled in production" notice instead of mounting the interactive harness in prod builds.

## Failure & Resilience Decisions

**Task 1 — `src/lib/db.ts` schema + client + `requireAppId`**
- **Failure modes**: missing/empty `PUBLIC_INSTANTDB_APP_ID`. `requireAppId(value)` throws `Error("PUBLIC_INSTANTDB_APP_ID is missing or empty — set it in .env (see .env.example)")` at module init, before `init()` is called, so no silently-broken client is produced.
- **Idempotency**: pure validation + a single module-level `init()`; importing repeatedly returns the same client (ES module singleton). Re-run safe.
- **Observability**: the thrown error message names the env var and the fix; it surfaces at import time (build/dev startup), not swallowed.
- **No silent failure**: validation throws; there is no catch.

**Task 2 — `applyEvent` / `rebuildSessionProjection`**
- N/A — pure (in-memory fold). Exception: unknown event `type` is a *designed* failure — `applyEvent` throws `UnknownEventTypeError` rather than dropping the event, so log/projection divergence is detectable. No I/O.

**Task 3 — `writeEvent`**
- **Failure modes**: (a) invalid input (missing `type`, missing `sessionId`, missing `actor`, invalid `actor.role`, non-integer `schemaVersion`, empty/non-array `projectionTxns`) → throw a descriptive `Error` **before** `db.transact()` so nothing is written; (b) transaction rejection (network/permission) → the single `db.transact([...])` rejects atomically (neither `sessionEvents` nor projection row lands), and the rejection propagates to the caller (function returns the awaited transact promise; rejection is not caught).
- **Idempotency**: not idempotent by design (each call appends a new event with a fresh `id()`); the SPEC defers dedup. Safe because a rejected transaction is all-or-nothing — a retry by the caller cannot leave a half-applied dual-write. Documented in the helper's JSDoc.
- **Observability**: validation errors carry the specific missing/invalid field; transaction rejections carry InstantDB's error. The `sessionEvents` append is itself the observability record on success (ADR-0003).
- **No silent failure**: no try/catch swallows; invalid input throws synchronously, transaction errors reject the returned promise.

**Task 4 — Dev harness `EventSpineHarness.tsx`**
- **Failure modes**: reactive query error → render the existing guard pattern (`if (error) return <div>Error querying data: {error.message}</div>`). `writeEvent()` rejection from a button handler → caught at the handler boundary and surfaced into a visible on-page error region (so the failure-path e2e can assert it), then re-logged via `console.error`. The invalid-input button intentionally calls `writeEvent` with bad input to exercise the throw.
- **Idempotency**: each button click appends a new event (intended). Uses a fresh disposable `sessionId` per harness mount so test runs don't pollute each other.
- **Observability**: errors rendered to a `data-testid="harness-error"` element and `console.error`.
- **No silent failure**: handler catch surfaces to UI + console; it does not silently ignore.

**Task 5 — Playwright config / tests**
- **Failure modes**: dev server not up → `webServer` block in `playwright.config.ts` starts `astro dev` and waits on the URL; `reuseExistingServer` locally. Test assertion failures surface as non-zero exit.
- **Idempotency**: each test generates a unique `sessionId` (timestamp + random suffix) so re-runs are independent; no shared mutable fixture state.
- **Observability**: Playwright trace/`html` reporter on failure.
- **No silent failure**: failed expectations fail the run (non-zero exit).

**Task 6 — Docs**
- N/A — pure documentation edits, no runtime failure surface.

---

## Task 1: Shared db module — schema, client, env guard

### Overview
Create `src/lib/db.ts` as the single source of the Blended schema and InstantDB client, with an init-time env guard and exported schema-derived types.

### Changes Required
**File**: `src/lib/db.ts` (new)

**Changes**:
- Imports mirror the demo: `import { id, i, init, type InstaQLEntity } from '@instantdb/react'`.
- Pure env validator:
  ```ts
  export function requireAppId(value: string | undefined): string {
    if (!value || value.trim() === '') {
      throw new Error('PUBLIC_INSTANTDB_APP_ID is missing or empty — set it in .env (see .env.example)')
    }
    return value
  }
  ```
- `const APP_ID = requireAppId(import.meta.env.PUBLIC_INSTANTDB_APP_ID)`.
- `export const ACTOR_ROLES = ['teacher', 'student', 'ai', 'system', 'unknown'] as const` and `export type ActorRole = (typeof ACTOR_ROLES)[number]`.
- `export const schema = i.schema({ entities: { ... } })` defining the eight entities per SPEC §5 / §7.2, using domain language from `CONTEXT.md`:
  - `users`: `email` (`i.string().optional()` — private), `username` (`i.string()`), `adminLevel` (`i.number()` — global admin per ADR-0003), `createdAt` (`i.number()`).
  - `sessions`: `title`, `status` (`i.string<'draft'|'live'|'ended'|'archived'>()`), `teacherId`, `joinCode` (`.unique()`), `joinSlug` (`.optional()`), `createdAt`, `startedAt` (`.optional()`), `endedAt` (`.optional()`), `activeResourceId` (`i.string().optional()`), `interactionMode` (`i.string<'none'|'cursor_vote'>()`).
  - `sessionResources`: `sessionId` (`.indexed()`), `url`, `title`, `type` (string enum), `sortOrder` (`i.number()`), `embedMode` (string enum), `embedStatus` (string enum), `createdAt`, `activatedAt` (`.optional()`).
  - `participants`: `sessionId` (`.indexed()`), `userId`, `role` (`i.string<'teacher'|'student'|'assistant'|'ai'>()`), `username`, `email` (`.optional()` — private), `joinedAt`, `lastSeenAt`, `chatStatus` (string enum).
  - `sessionEvents` (§7.2 envelope): `sessionId` (`.indexed()`), `type` (`i.string()`), `schemaVersion` (`i.number()`), `actorId` (`i.string().optional()` — string/null), `actorRole` (`i.string<ActorRole>()`), `occurredAt` (`i.number().indexed()`), `receivedAt` (`i.number()`), `correlationId` (`.optional()`), `payload` (`i.json<Record<string, unknown>>()`).
  - `messages`: `sessionId` (`.indexed()`), `participantId`, `text`, `visibility` (enum), `classificationStatus` (enum), `createdAt`.
  - `questions`: `sessionId` (`.indexed()`), `status` (enum), `activeResourceIdAtSubmission` (`.optional()`), `addressedBy` (`.optional()`), `answerSummary` (`.optional()`), `createdAt`.
  - `endorsements`: `sessionId` (`.indexed()`), `questionId` (`.indexed()`), `createdAt` (anonymous — no actor stored on the projection row per CONTEXT.md).
- `export const db = init({ appId: APP_ID, schema })`.
- Exported types: `export type SessionEvent = InstaQLEntity<typeof schema, 'sessionEvents'>` and the same for `Session`, `Participant`, etc.

### Success Criteria
- [ ] `astro check` passes with no new errors/warnings; exported schema types resolve.
- [ ] `import { db, schema } from '@/lib/db'` works from a component.
- [ ] `actorRole` is type-constrained to the five-member union; `schemaVersion`/timestamps are numbers; `payload` is `json`.
- [ ] Failure path: `requireAppId('')` and `requireAppId(undefined)` throw the descriptive error (covered by Task 2 unit test).

---

## Task 2: `applyEvent` fold + `rebuildSessionProjection` + unit tests

### Overview
Add a deterministic, order-stable fold so a session projection is reconstructable from the event log (SPEC §17.1), with unknown-type surfacing. Add Vitest and the first unit tests (fold determinism, unknown-type, `requireAppId`).

### Changes Required
**File**: `src/lib/db.ts` (extend)
- Define a plain projection type and pure functions (no InstantDB calls):
  ```ts
  export type SessionProjection = {
    sessionId: string
    session: { id: string; title: string; status: string; teacherId: string } | null
    participants: Record<string, { id: string; userId: string; role: string; username: string }>
  }
  export class UnknownEventTypeError extends Error {}
  export function emptyProjection(sessionId: string): SessionProjection { ... }
  export function eventSortKey(e): comparator // sort by occurredAt, then receivedAt, then id
  export function applyEvent(p: SessionProjection, e: EventLike): SessionProjection {
    switch (e.type) {
      case 'SessionCreated': return { ...p, session: { ... from e.payload } }
      case 'ParticipantJoined': return { ...p, participants: { ...p.participants, [e.payload.participantId]: {...} } }
      default: throw new UnknownEventTypeError(`Unknown event type: ${e.type}`)
    }
  }
  export function rebuildSessionProjection(sessionId, events): SessionProjection {
    const ordered = [...events].sort(eventSortKey)
    return ordered.reduce(applyEvent, emptyProjection(sessionId))
  }
  ```
- `applyEvent` operates on a minimal `EventLike` structural type (`{ type, occurredAt, receivedAt, id, payload }`) so it is usable both with stored `sessionEvents` rows and plain test fixtures.

**File**: `package.json`
- Add devDependency `vitest`; add scripts `"test": "vitest run"` and `"test:watch": "vitest"`.

**File**: `vitest.config.ts` (new) — minimal config (`environment: 'node'`, include `src/**/*.test.ts`).

**File**: `src/lib/db.test.ts` (new)
- `requireAppId('valid')` returns it; `requireAppId('')` and `requireAppId(undefined)` throw.
- Determinism: build an out-of-order event list (e.g. `ParticipantJoined` with earlier `occurredAt` placed after `SessionCreated` in the array), assert `rebuildSessionProjection` equals the in-order fold result.
- Unknown type: `applyEvent(emptyProjection('s'), { type: 'NopeEvent', ... })` throws `UnknownEventTypeError`.

> Note: `src/lib/db.test.ts` imports the pure helpers only. Because importing `db.ts` triggers the module-level `requireAppId(import.meta.env.PUBLIC_INSTANTDB_APP_ID)`, the Vitest config must define `PUBLIC_INSTANTDB_APP_ID` (via `test.env` or a `define`) so the import succeeds; the env-guard *negative* case is tested through the directly-imported `requireAppId('')`, not by unsetting the global.

### Success Criteria
- [ ] `npm run test` runs and all unit tests pass.
- [ ] Out-of-order and in-order folds produce identical projections.
- [ ] Unknown event type throws `UnknownEventTypeError` (not silently dropped).
- [ ] `astro check` still clean.
- [ ] Failure paths (`requireAppId('')`, unknown type) are asserted, not swallowed.

---

## Task 3: `writeEvent()` dual-write choke point

### Overview
Implement the single helper through which all product mutations append a §7.2 envelope and apply projection update(s) atomically in one `transact()`.

### Changes Required
**File**: `src/lib/db.ts` (extend)
```ts
export type WriteEventMeta = {
  sessionId: string
  actor: { id: string | null; role: ActorRole }
  payload: Record<string, unknown>
  correlationId?: string
  schemaVersion?: number
  occurredAt?: number
  receivedAt?: number
}
export function writeEvent(type: string, meta: WriteEventMeta, projectionTxns: TxChunk[]) {
  if (!type) throw new Error('writeEvent: `type` is required')
  if (!meta?.sessionId) throw new Error('writeEvent: `sessionId` is required')
  if (!meta?.actor || meta.actor.role === undefined) throw new Error('writeEvent: `actor` with a role is required')
  if (!ACTOR_ROLES.includes(meta.actor.role)) throw new Error(`writeEvent: invalid actor.role "${meta.actor.role}"`)
  const schemaVersion = meta.schemaVersion ?? 1
  if (!Number.isInteger(schemaVersion)) throw new Error('writeEvent: `schemaVersion` must be an integer')
  if (!Array.isArray(projectionTxns) || projectionTxns.length === 0) {
    throw new Error('writeEvent: `projectionTxns` must be a non-empty array — projection-only writes are not allowed')
  }
  const now = Date.now()
  const eventTx = db.tx.sessionEvents[id()].update({
    sessionId: meta.sessionId,
    type,
    schemaVersion,
    actorId: meta.actor.id ?? undefined,
    actorRole: meta.actor.role,
    occurredAt: meta.occurredAt ?? now,
    receivedAt: meta.receivedAt ?? now,
    ...(meta.correlationId ? { correlationId: meta.correlationId } : {}),
    payload: meta.payload ?? {},
  })
  return db.transact([eventTx, ...projectionTxns])
}
```
- All validation runs **before** `db.transact()`. The function returns the transact promise so rejection propagates (atomic — single `transact` array).
- JSDoc states: choke point per ADR-0001; not idempotent by design; rejection is all-or-nothing.

### Success Criteria
- [ ] `astro check` clean; `writeEvent` type-checks with the schema.
- [ ] Invalid inputs (missing `type`/`sessionId`/`actor`, bad role, non-integer `schemaVersion`, empty `projectionTxns`) throw before any transact.
- [ ] Event tx and projection txns are submitted in one `db.transact([...])`.
- [ ] Failure paths surface (thrown synchronously / rejected promise), never swallowed.

---

## Task 4: Dev scratch harness route

### Overview
A dev-gated React island that calls `writeEvent()` for `SessionCreated` and `ParticipantJoined`, renders live `sessionEvents` + projection rows, and exposes an invalid-input button — the Playwright verification surface.

### Changes Required
**File**: `src/components/EventSpineHarness.tsx` (new)
- `import { db, writeEvent, id } from '@/lib/db'` (re-export `id` from db, or import from `@instantdb/react`).
- On mount, generate a disposable `sessionId` (`` `dev-${Date.now()}-${Math.random().toString(36).slice(2)}` ``); accept an optional `?sessionId=` query param so a second browser context can target the same session for the realtime test.
- `db.useQuery({ sessionEvents: { $: { where: { sessionId } } }, sessions: { $: { where: { id: sessionId } } }, participants: { $: { where: { sessionId } } } })`; render the existing `isLoading`/`error` guards.
- Buttons:
  - **"Create session"** → `writeEvent('SessionCreated', { sessionId, actor: { id: 'dev-teacher', role: 'teacher' }, payload: { title: 'Dev Session' } }, [db.tx.sessions[sessionId].update({ title: 'Dev Session', status: 'draft', teacherId: 'dev-teacher', joinCode: sessionId, createdAt: Date.now(), interactionMode: 'none' })])`.
  - **"Join participant"** → `writeEvent('ParticipantJoined', { sessionId, actor: { id: 'dev-student', role: 'student' }, payload: { participantId } }, [db.tx.participants[participantId].update({ sessionId, userId: 'dev-student', role: 'student', username: 'student', joinedAt: Date.now(), lastSeenAt: Date.now(), chatStatus: 'allowed' })])`.
  - **"Invalid write (no projection)"** → calls `writeEvent('SessionCreated', {...}, [])` inside try/catch; on throw, sets a visible error in `data-testid="harness-error"`.
- Render tables with `data-testid` hooks: `data-testid="event-row"` per `sessionEvents` row, `data-testid="session-row"` / `data-testid="participant-row"` per projection row, and `data-testid="event-count"` / `data-testid="participant-count"`.

**File**: `src/pages/dev/event-spine.astro` (new)
- Frontmatter: `const isProd = import.meta.env.PROD`.
- If `isProd`, render a `<p data-testid="dev-disabled">Dev harness disabled in production.</p>`; else `<EventSpineHarness client:only />` inside `Layout`, passing through the `sessionId` query param via a small inline script or `Astro.url.searchParams`.

### Success Criteria
- [ ] `npm run dev` → `/dev/event-spine` renders; clicking "Create session" then "Join participant" shows one event row each and the matching session + participant projection rows.
- [ ] The invalid-write button surfaces a visible error and adds no rows.
- [ ] In a production build the route renders the disabled notice (no harness mount).
- [ ] `astro check` clean.
- [ ] Errors from `writeEvent` in handlers are caught at the boundary and shown in `harness-error` + `console.error` (no silent swallow of the live-query error path either).

---

## Task 5: Playwright e2e (dual-write, realtime, failure path)

### Overview
Introduce Playwright and the e2e suite that proves the dual-write spine and InstantDB realtime cross-context sync, plus the failure path.

### Changes Required
**File**: `package.json`
- Add devDependency `@playwright/test`; add scripts `"test:e2e": "playwright test"` and `"test:e2e:install": "playwright install --with-deps chromium"`.

**File**: `playwright.config.ts` (new)
- `testDir: 'e2e'`, `webServer: { command: 'npm run dev', url: 'http://localhost:4321', reuseExistingServer: !process.env.CI, timeout: 120_000 }`, `use: { baseURL: 'http://localhost:4321' }`, `reporter: 'html'`.

**File**: `e2e/event-spine.spec.ts` (new)
- Helper: build a unique `sessionId` per test (`` `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}` ``) and navigate to `/dev/event-spine?sessionId=...`.
- **Happy path ×2**: click "Create session" → assert one `event-row` and one `session-row`; click "Join participant" → assert two `event-row`s total and one `participant-row` (exactly two `sessionEvents` rows + two projection rows).
- **Realtime sync**: open a second `browser.newContext()` on the same `?sessionId=`; trigger an action in context A; assert context B observes the new `event-row` and projection row appear (via `expect(...).toBeVisible()` with auto-wait) **without reload**.
- **Failure path**: capture current `event-count`, click "Invalid write (no projection)", assert `harness-error` is visible and `event-count`/`participant-count` are unchanged.

### Success Criteria
- [ ] `npx playwright install chromium` + `npm run test:e2e` passes locally against `astro dev`.
- [ ] Two-context test observes realtime propagation with no reload.
- [ ] Failure-path test confirms row counts unchanged after rejected call.
- [ ] No silent failure: failed expectations exit non-zero.

---

## Task 6: Documentation updates

### Overview
Record the shared-module + `writeEvent()` conventions and fix the env example, per SPEC §Documentation Updates (docs are part of "done").

### Changes Required
**File**: `.env.example`
- Replace `INSTANTDB_APP_ID=instantdb.com` with `PUBLIC_INSTANTDB_APP_ID=your-instantdb-app-id`.

**File**: `AGENTS.md`
- Update **Testing Guidelines**: Vitest is now configured (`npm run test`) and Playwright e2e (`npm run test:e2e`, requires `npm run test:e2e:install` once); document the `/dev/event-spine` harness and how to run its e2e check.
- Add a **Data Layer** subsection: `src/lib/db.ts` is the only place to initialize the InstantDB client and define schema; **all** product mutations MUST route through `writeEvent()` — no direct `db.tx.<entity>...update/delete` for Blended projection entities outside the helper (the `todos` demo is exempt). Reference ADR-0001 and ADR-0003.

**File**: `README.md`
- Note the shared `src/lib/db.ts` module and the `writeEvent()` dual-write convention as the foundation for session features; confirm `PUBLIC_INSTANTDB_APP_ID` is the required env var.

### Success Criteria
- [ ] `.env.example` uses `PUBLIC_INSTANTDB_APP_ID`.
- [ ] `AGENTS.md` documents the db module rule, `writeEvent()` mandate, harness route, and test commands.
- [ ] `README.md` mentions the module and convention.
- [ ] Grep check supports the "no direct projection writes" criterion: `db.tx.<blended-entity>` update/delete appears only in `src/lib/db.ts` and the dev harness's caller-supplied `projectionTxns` (which are passed *into* `writeEvent`).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] Opening the scratch harness in two browser contexts against the same app: an action triggered in context A causes the new `sessionEvents` row **and** its matching projection row to appear in context B in realtime with no reload (user-observable benefit — proves the dual-write spine and InstantDB live sync end-to-end). | Task 4, Task 5 | Harness `?sessionId=` sharing + Playwright two-context realtime test |
| [ ] `src/lib/db.ts` (or equivalent shared module) exports a typed `i.schema` containing `users`, `sessions`, `sessionResources`, `participants`, `sessionEvents`, `messages`, `questions`, `endorsements`, and an initialized client using `PUBLIC_INSTANTDB_APP_ID`. | Task 1 | Eight entities + `db` client |
| [ ] A `sessionEvents` row written by `writeEvent()` contains every §7.2 envelope field (`id`, `sessionId`, `type`, `schemaVersion`, `actorId`, `actorRole`, `occurredAt`, `receivedAt`, optional `correlationId`, `payload`). | Task 1, Task 3 | Schema defines fields; `writeEvent` stamps/persists them |
| [ ] Calling `writeEvent()` twice in the harness yields exactly two `sessionEvents` rows and the two corresponding projection rows (verified via Playwright assertions). | Task 4, Task 5 | Happy-path ×2 e2e |
| [ ] A documented `applyEvent`/fold function exists and, given an ordered list of events, reduces them to a projection consistent with the dual-written rows. | Task 2 | `applyEvent` + `rebuildSessionProjection`, JSDoc'd |
| [ ] **Failure path:** calling `writeEvent()` with invalid input (e.g. omitted `sessionId` or empty `projectionTxns`) throws a descriptive error and writes neither a `sessionEvents` row nor a projection row — verified by asserting row counts are unchanged after the rejected call. | Task 3, Task 5 | Pre-transact validation + e2e count-unchanged assertion |
| [ ] **Failure path:** with `PUBLIC_INSTANTDB_APP_ID` unset, importing/initializing the db module throws a clear error rather than producing a silently broken client. | Task 1, Task 2 | `requireAppId` throws at init; asserted via Vitest `requireAppId('')` |
| [ ] No product code path writes a projection row except through `writeEvent()` (verified by code review / grep that `db.tx.<entity>...update/delete` for projection entities appears only inside the helper). | Task 3, Task 6 | Helper-only signature + grep documented in docs task |
| [ ] `astro check` passes with no new errors or warnings. | Task 1, Task 2, Task 3, Task 4 | Static gate enforced each slice |
| [ ] All existing tests still pass. | Task 2, Task 5 | No prior tests exist; new Vitest + Playwright suites must pass; `todos` demo left intact |

---

## Testing Strategy

### Unit Tests
- **`applyEvent` determinism** (`src/lib/db.test.ts`): feed an out-of-order event array; assert the folded projection equals the in-order fold (sort by `occurredAt`, `receivedAt`, `id`).
- **Unknown-type surfacing**: `applyEvent` with an unrecognized `type` throws `UnknownEventTypeError` — asserts no silent drop.
- **Env guard failure path**: `requireAppId('')` and `requireAppId(undefined)` throw the descriptive error; `requireAppId('abc')` returns the value.
- **Mocking strategy**: none for the pure functions — they take plain objects, no InstantDB needed. Vitest config injects `PUBLIC_INSTANTDB_APP_ID` so importing `db.ts` (which constructs the real client) succeeds; the *negative* env case is tested via the directly-called pure `requireAppId`, avoiding any need to mock `init`.

### Integration / E2E Tests (Playwright, required — dev UI surface)
- **Happy path ×2** (`e2e/event-spine.spec.ts`): trigger `writeEvent()` twice; after each, assert the matching `sessionEvents` row and projection row exist; total exactly two events + two projection rows.
- **Realtime two-context sync**: second `browser.newContext()` on the same `?sessionId=`; action in A becomes visible in B with no reload (auto-waiting `expect`).
- **Failure path**: invalid `writeEvent()` from the harness button; assert `harness-error` visible and `event-count`/`participant-count` unchanged.
- Each test uses a unique disposable `sessionId` so runs don't pollute one another.

## Risk Assessment
- **InstantDB optional/nullable field semantics for `actorId` (string/null)**: SPEC requires the field to allow null. Mitigation: model as `i.string().optional()` and omit the key when `actor.id` is null (`actorId: meta.actor.id ?? undefined`); verify via `astro check` and the e2e row inspection.
- **Realtime test flakiness** (sync timing): mitigated by Playwright auto-waiting `expect(locator).toBeVisible()` with a generous default timeout rather than fixed sleeps.
- **Unset-env case is build-time/public**, hard to exercise in a running browser: mitigated by factoring validation into the pure `requireAppId` and unit-testing it directly (acceptance criterion satisfied without trying to unset a baked-in client var at runtime).
- **InstantDB requires schema to be pushed for typed writes**: the app id in `.env` points at a real Instant app; if entities aren't pushed, writes may be rejected. Mitigation: rely on Instant's schema-on-write / dev mode; if rejection occurs, document `npx instant-cli push schema` as a prerequisite in `AGENTS.md`. Transaction rejection surfaces to the caller (Task 3 design), so this failure is visible, not silent.
- **Polluting the shared Instant app with dev/e2e rows**: mitigated by unique disposable `sessionId` per run and querying scoped by `sessionId`.
