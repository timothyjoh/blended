# Implementation Plan: Cycle 0016

## Overview
Deliver the activation vertical slice: a sanctioned teacher-only `activateResource`/`buildResourceActivate` path that dual-writes a `ResourceActivated` event and sets `sessions[id].activeResourceId` + a new derived `currentUrl` in one transaction, an **Activate** control on each queued-resource row in `SessionLifecycle`, and a single shared `ResourcePane` (sandboxed iframe) mounted in both the teacher and student views that renders the active resource and switches live.

## Current State (from Research)
- **Action layer** (`src/lib/sessions.ts`): the pure-core/thin-wrapper split is the house pattern — `buildResourceQueue`→`queueResource` (`:860`,`:940`) and `buildQuestionAnswer`→`answerQuestion` (`:695`,`:741`). Builders throw synchronously on bad input before producing any plan; wrappers route the dual-write through `writeEvent` with injectable `{ write?, buildTxn? }` deps and a `defaultXxxTxn` exported helper. The keyed-`sessions`-update template is `defaultTransitionTxn` = `db.tx.sessions[id].update(plan.update)` (`:250`).
- **Data spine** (`src/lib/db.ts`): `sessions` entity at `:48` already carries `activeResourceId: i.string().optional()` (`:57`); no `currentUrl` yet. `applyEvent` switch at `:293` with the `ResourceQueued` case at `:446` and lifecycle cases (`SessionStarted`/`SessionEnded` at `:311`/`:321`) that mutate the existing session row — the template for a fold that sets fields on the session. The `default` throws `UnknownEventTypeError` (`:486`). `SessionProjection.session` is `{ id; title; status; teacherId } | null` (`:229`) and must gain `activeResourceId?`/`currentUrl?`. `writeEvent` single-transaction dual-write at `:540`.
- **Teacher view** (`src/components/SessionLifecycle.tsx`): live `sessionResources` query at `:80`, ordered list at `:100`, `resource-item` row at `:464` (carries `data-resource-id`, `data-sort-order`). `addResource` (`:108`) is the inline-`role="alert"` + `console.error('[SessionLifecycle] …')` + pending-latch failure template.
- **Student view** (`src/components/StudentSession.tsx`): read-only island resolving the session by `joinCode` (`:16`); render body at `:66`. No `sessionResources` query — its access to the active resource is via the session row.
- **Perms** (`src/lib/perms.ts:56`): `sessions` `update: 'isOwner || isAdmin'`, `isOwner = auth.id == data.teacherId`; comments confirm `currentUrl` inherits the owner-only rule — no `perms:push`.
- **URL seam** (`src/lib/resources.ts:26`): `validateResourceUrl` normalizes on queue, so a queued resource's `url` is already normalized.

## Desired End State
- `npm run astro check` is clean; `npx vitest run` and the Playwright suite pass.
- A teacher clicks **Activate** on a queued row; `sessions[id].activeResourceId` + `currentUrl` update and exactly one `ResourceActivated` event is appended in one transaction. The active row is visibly marked; its Activate control reads as active/disabled.
- Both the teacher view and every connected student view render the active resource in a sandboxed iframe via `ResourcePane`, switching live on re-activation with no reload. A late-joiner immediately shows the current active resource. With nothing active, both panes render an explicit "no active resource" element.
- `rebuildSessionProjection` over a log containing `ResourceActivated` reproduces the active-resource state without raising `UnknownEventTypeError`.

## What We're NOT Doing
- No teacher-driven URL stepping / "next" within an active resource.
- No blocked-embed fallback / `embedMode`/`embedStatus` consultation — the pane renders `currentUrl` directly; `embedMode` stays `'blocked'` and is not read.
- No resource reordering, de-activation, or clearing the active resource.
- No permission-rule change and no `perms:push` — `activeResourceId`/`currentUrl` inherit the existing `sessions` owner-only-write rule.
- No re-activation dedup guard — re-activating the same resource appends a new convergent `ResourceActivated` event (consistent with `writeEvent` "not idempotent by design"); the builder's role/belonging checks are the admission gate.
- No email reads/renders anywhere.

## Implementation Approach
Mirror the cycle-0015 queue path exactly, one layer at a time, in vertical slices each carrying its own tests:

1. **Schema + projection type** — additive `sessions.currentUrl` field and `SessionProjection.session` gaining `activeResourceId?`/`currentUrl?`. No behavior yet, but unblocks the fold and the pane.
2. **Fold** — `applyEvent('ResourceActivated', …)` setting `activeResourceId`/`currentUrl` on the (possibly-absent) session row, keyed defensively; `rebuildSessionProjection` stays whole.
3. **Action path** — `buildResourceActivate` (pure, total, throws-before-plan) + `activateResource` (thin wrapper) + `defaultResourceActivateTxn` (keyed `sessions[id].update`), routed through `writeEvent('ResourceActivated', …)`.
4. **Shared pane** — `ResourcePane` reading `activeResourceId`/`currentUrl` off a single session row, rendering a sandboxed iframe or an explicit empty state.
5. **Teacher control + mount** — Activate button per row in `SessionLifecycle` with the active row indicated, plus `ResourcePane` mounted in the teacher view.
6. **Student mount** — `ResourcePane` mounted in `StudentSession`, reading `currentUrl`/`activeResourceId` from the existing session-by-`joinCode` query (no new resources query).
7. **E2E** — multi-context Playwright spec asserting cross-context live render, switching, late-join, and the failure leg.

**Resolved open questions:**
- **Testids (fixed):** pane root `resource-pane`; empty state `resource-pane-empty`; iframe `resource-pane-frame`; per-row Activate button `activate-resource`; the active row is marked with `data-active="true"` on the existing `resource-item` div AND its Activate button is `disabled` and shows the label "Active". The student pane reuses the same `ResourcePane` testids.
- **Student pane data source (fixed):** `StudentSession` reads `currentUrl` (and `activeResourceId` for the empty-state decision) from its **existing** session-by-`joinCode` query. No `sessionResources` query is added to `StudentSession` — this is exactly why `currentUrl` is stored on the session row.
- **iframe sandbox (fixed):** `sandbox="allow-scripts allow-popups allow-forms"` with `referrerPolicy="no-referrer"`. `allow-same-origin` is deliberately omitted so it is never combined with `allow-scripts` (no sandbox-escape escalation); embeds that require same-origin are the deferred blocked-embed concern.
- **Re-activation (fixed):** no dedup guard — convergent re-write per above.

## Failure & Resilience Decisions

**Task 1 — schema + projection type (`src/lib/db.ts`)**: N/A — additive declarative schema field + a TypeScript type widening; no runtime failure surface. (The schema push to the live app is an operational step, not product code.)

**Task 2 — `applyEvent('ResourceActivated', …)` fold (`src/lib/db.ts`)**:
- **Failure modes**: a partial/foreign payload (missing `sessionId`/`resourceId`/`currentUrl`) or an absent prior session. Response: degrade gracefully via defensive defaults (build a minimal session from the payload when `projection.session` is absent, mirroring `SessionStarted`/`SessionEnded`), never throw a spurious `UnknownEventTypeError`.
- **Idempotency**: pure and fully idempotent — the keyed convergent update means re-folding the same event reproduces the same `activeResourceId`/`currentUrl`.
- **Observability**: pure function; divergence surfaces structurally (a genuinely unknown type still reaches the `default` and throws `UnknownEventTypeError`, which is the intended loud signal).
- **No silent failure**: the new case never swallows — unknown types still throw at `default`; this case only handles `ResourceActivated`.

**Task 3 — `buildResourceActivate` (pure builder, `src/lib/sessions.ts`)**:
- **Failure modes**: non-teacher actor, missing `actor.id`/`sessionId`/`resourceId`, a resource not belonging to the session, or a blank/missing resource URL → throws synchronously before producing any plan, so nothing is ever written.
- **Idempotency**: pure — same input yields the same plan; no state mutation.
- **Observability**: throws `Error` with a `activateResource: …` message identifying the rejected leg.
- **No silent failure**: every invalid leg throws; there is no path that returns a plan for invalid input.

**Task 3 — `activateResource` thin wrapper + `defaultResourceActivateTxn` (`src/lib/sessions.ts`)**:
- **Failure modes**: builder throw (propagates before any write); rejected `db.transact()` (permission denial / network) propagates from `writeEvent` — atomic single transaction means no orphan event and an unchanged projection (no partial `activeResourceId`/`currentUrl`).
- **Idempotency**: not idempotent by design (each call appends a fresh `ResourceActivated` event), but the projection write is convergent — re-activating the same resource re-sets identical values, and a retry of a *failed* write leaves no partial state because the dual-write is one transaction.
- **Observability**: rejection propagates to the caller (the component handler logs + surfaces it); no catch in the wrapper.
- **No silent failure**: no try/catch in the wrapper — the rejection reaches the caller.

**Task 5 — teacher Activate handler (`SessionLifecycle.tsx`)**:
- **Failure modes**: not signed in (guard with inline message, no write), builder throw, or rejected transact → caught, surfaced inline via `role="alert"`, `console.error('[SessionLifecycle] activate failed:', err)`, inputs/state retained, per-action pending latch cleared in `finally`.
- **Idempotency**: a pending latch (`activatingId`) suppresses double-submit while in flight; on failure the live query is unchanged so the row stays activatable.
- **Observability**: inline alert + `console.error` with the `[SessionLifecycle]` prefix.
- **No silent failure**: the `catch` sets the inline error and logs — never swallowed.

**Task 4/6 — `ResourcePane` + `StudentSession` mount**:
- **Failure modes**: query error on the host view (already handled by each host's existing error branch — `StudentSession` errors render before the pane; `SessionLifecycle` logs query errors); no active resource → explicit empty state; an iframe whose URL fails to load is a deferred concern — the pane still renders the iframe pointed at `currentUrl` and does not crash.
- **Idempotency**: pure render from props/live query; safe to re-render.
- **Observability**: the host views already `console.error` query errors; the pane renders deterministically from the passed session row.
- **No silent failure**: the empty state is an explicit testable element, never a blank region; host query errors surface in the existing host error branches.

---

## Task 1: Add `sessions.currentUrl` schema field + widen `SessionProjection.session`

### Overview
Add the additive optional `currentUrl` field to the `sessions` entity and widen the projection's `session` shape so the fold and the pane can read both fields.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**:
- In the `sessions` entity (`:48`), after `activeResourceId: i.string().optional()` (`:57`) add:
  ```ts
  currentUrl: i.string().optional(),
  ```
- Widen `SessionProjection.session` (`:229`) from `{ id; title; status; teacherId } | null` to:
  ```ts
  session: {
    id: string
    title: string
    status: string
    teacherId: string
    activeResourceId?: string
    currentUrl?: string
  } | null
  ```

**Operational note (documented, not code)**: `npx instant-cli push schema` is required against the live app for the additive `currentUrl` field. No `perms:push` (inherits the `sessions` owner-only rule).

### Success Criteria
- [ ] `npm run astro check` clean (no type errors from the widened shape).
- [ ] Existing `db.test.ts` fold tests still pass (the optional fields are additive).
- [ ] Failure paths behave as designed — N/A (declarative).

---

## Task 2: Fold `ResourceActivated` in `applyEvent`

### Overview
Teach `applyEvent` the `ResourceActivated` type so it sets `activeResourceId`/`currentUrl` on the session row, tolerant of an absent prior session, keyed defensively — keeping `rebuildSessionProjection` whole.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**: Add a case before `default` (after the `ResourceQueued` case at `:480`), modeled on `SessionStarted`/`SessionEnded` (mutate the existing session row, build a minimal one when absent):
```ts
case 'ResourceActivated': {
  // Cycle 0016: a teacher activates a queued resource. Set the session's
  // `activeResourceId` + derived `currentUrl`. Mirrors the lifecycle cases:
  // mutate the existing session row, tolerate an absent prior session by
  // building a minimal one from the payload, never mutate input, and re-fold
  // convergently (the keyed update reproduces the same values).
  const p = event.payload as {
    sessionId?: string
    resourceId?: string
    currentUrl?: string
  }
  const prev = projection.session
  const activeResourceId = typeof p.resourceId === 'string' ? p.resourceId : undefined
  const currentUrl = typeof p.currentUrl === 'string' ? p.currentUrl : undefined
  return {
    ...projection,
    session: prev
      ? { ...prev, activeResourceId, currentUrl }
      : {
          id: p.sessionId ?? projection.sessionId,
          title: '',
          status: '',
          teacherId: '',
          activeResourceId,
          currentUrl,
        },
  }
}
```

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] New fold tests pass: sets `activeResourceId`/`currentUrl`; tolerates absent prior session; idempotent re-fold; `rebuildSessionProjection` over an ordered log (e.g. `SessionCreated` → `ResourceQueued` → `ResourceActivated`) reproduces the active-resource state.
- [ ] `ResourceActivated` never reaches `default` / never raises `UnknownEventTypeError`.
- [ ] Failure paths behave as designed — partial payload folds via defaults; unknown types still throw at `default`.

---

## Task 3: `buildResourceActivate` + `activateResource` + `defaultResourceActivateTxn`

### Overview
Add the sole sanctioned activation path: a pure total builder that validates before any plan, a thin wrapper that dual-writes `ResourceActivated` + the keyed `sessions` projection update in one `writeEvent` transaction, and the exported default txn helper.

### Changes Required
**File**: `src/lib/sessions.ts` (after the cycle-0015 queue block, ~`:949`)
**Changes**:
```ts
export type BuildResourceActivateInput = {
  sessionId: string | null | undefined
  resourceId: string | null | undefined
  actor: { id: string | null | undefined; role: string }
  // The session's queued resources from the component's live query, used to
  // confirm the target belongs to the session and to derive `currentUrl`.
  resources: ReadonlyArray<{ id: string; sessionId: string; url: string }>
  now?: number
}

export type ResourceActivatePlan = {
  sessionId: string
  resourceId: string
  currentUrl: string
  meta: WriteEventMeta
}

/**
 * Pure builder: totally validates BEFORE producing any plan. A non-teacher actor,
 * a missing `actor.id`/`sessionId`/`resourceId`, a resource that does not belong
 * to the session, or a resource with a blank/missing URL is rejected by throwing
 * synchronously — so nothing is ever written for an invalid activation. Derives
 * `currentUrl` from the (already-normalized) resource URL. The envelope hard-sets
 * `actor.role: 'teacher'`. The payload carries `sessionId`/`resourceId`/`currentUrl`
 * so it folds cleanly through `applyEvent`'s `ResourceActivated` case.
 */
export function buildResourceActivate(input: BuildResourceActivateInput): ResourceActivatePlan {
  if (input.actor?.role !== 'teacher')
    throw new Error('activateResource: only a teacher may activate a resource')
  const teacherId = input.actor?.id
  if (!teacherId) throw new Error('activateResource: an actor userId is required')
  const sessionId = input.sessionId
  if (!sessionId) throw new Error('activateResource: a sessionId is required')
  const resourceId = input.resourceId
  if (!resourceId) throw new Error('activateResource: a resourceId is required')
  const resource = (input.resources ?? []).find((r) => r.id === resourceId)
  if (!resource || resource.sessionId !== sessionId)
    throw new Error('activateResource: resource does not belong to this session')
  const currentUrl = (resource.url ?? '').trim()
  if (currentUrl === '') throw new Error('activateResource: resource has no url')

  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: teacherId, role: 'teacher' },
    payload: { sessionId, resourceId, currentUrl },
  }
  return { sessionId, resourceId, currentUrl, meta }
}

export const defaultResourceActivateTxn = (plan: ResourceActivatePlan): ProjectionTxn =>
  db.tx.sessions[plan.sessionId].update({
    activeResourceId: plan.resourceId,
    currentUrl: plan.currentUrl,
  })

export type ActivateResourceDeps = {
  write?: typeof writeEvent
  buildTxn?: (plan: ResourceActivatePlan) => ProjectionTxn
}

/**
 * Thin wrapper: builds the plan (sync-throws on bad input, writing nothing), then
 * dual-writes the `ResourceActivated` envelope + the keyed `sessions` projection
 * update (activeResourceId + currentUrl) in ONE `writeEvent` transaction. A rejected
 * write leaves no partial state (no orphan event, unchanged active resource). NOT
 * idempotent by design — each call appends a fresh event; the projection write is
 * convergent (re-activating the same resource re-sets identical values). The
 * rejection propagates and is never swallowed.
 */
export async function activateResource(
  input: BuildResourceActivateInput,
  deps: ActivateResourceDeps = {}
): Promise<ResourceActivatePlan> {
  const plan = buildResourceActivate(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultResourceActivateTxn
  await write('ResourceActivated', plan.meta, [buildTxn(plan)])
  return plan
}
```

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Builder happy-path test: teacher activating an in-session resource produces the expected plan + envelope with derived `currentUrl` and `actor.role: 'teacher'`.
- [ ] Builder rejection legs each `.toThrow(/…/)`: non-teacher role, missing `actor.id`, missing `sessionId`, missing `resourceId`, foreign resource (wrong `sessionId` / not found), blank URL — each before any plan.
- [ ] Wrapper tests with injected `write`/`buildTxn`: dual-write type is `ResourceActivated`, exactly one projection txn; no-write-on-rejected-builder leg; rejection-propagates leg.
- [ ] `defaultResourceActivateTxn` test: inspect `__ops` for the keyed `sessions[id].update({ activeResourceId, currentUrl })` (no `link` op — the session row already exists).
- [ ] Failure paths behave as designed (throws before write; rejection propagates).

---

## Task 4: `ResourcePane` shared component

### Overview
A single component rendering the session's active resource in a sandboxed iframe, or an explicit empty state when nothing is active. Mounted by both views.

### Changes Required
**File**: `src/components/ResourcePane.tsx` (new)
**Changes**:
```tsx
// ---------------------------------------------------------------------------
// Cycle 0016: the shared realtime resource pane. ONE component, mounted in both
// the teacher facilitation view (SessionLifecycle) and the student view
// (StudentSession). It renders from the live session row's `currentUrl` /
// `activeResourceId` — no resources query of its own — so activation propagates
// for free when the host's `db.useQuery` re-renders. The iframe is sandboxed
// WITHOUT `allow-same-origin` (so it is never combined with `allow-scripts`);
// embeds requiring same-origin are the deferred blocked-embed concern. When no
// resource is active, it renders an explicit empty element, never a blank region.
// It renders resource/session URL fields only — never email.
// ---------------------------------------------------------------------------

export default function ResourcePane({
  activeResourceId,
  currentUrl,
}: {
  activeResourceId?: string | null
  currentUrl?: string | null
}) {
  const url = (currentUrl ?? '').trim()
  if (!activeResourceId || url === '') {
    return (
      <div data-testid="resource-pane" className="rounded-md border">
        <p
          data-testid="resource-pane-empty"
          className="p-6 text-sm text-muted-foreground"
        >
          No active resource yet. When the teacher activates a resource it appears here.
        </p>
      </div>
    )
  }
  return (
    <div data-testid="resource-pane" className="rounded-md border">
      <iframe
        data-testid="resource-pane-frame"
        data-resource-id={activeResourceId}
        src={url}
        title="Active resource"
        className="h-[60vh] w-full"
        sandbox="allow-scripts allow-popups allow-forms"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
```

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Renders `resource-pane-empty` when `activeResourceId`/`currentUrl` absent or blank.
- [ ] Renders `resource-pane-frame` with `src === currentUrl`, the chosen `sandbox` set, and `data-resource-id` when active.
- [ ] Failure paths behave as designed — empty state is explicit; pane never crashes on a non-loading URL.

---

## Task 5: Teacher Activate control + mount `ResourcePane` in `SessionLifecycle`

### Overview
Add a per-row **Activate** button wired to `activateResource`, mark the active row, and mount `ResourcePane` driven by the live session row.

### Changes Required
**File**: `src/components/SessionLifecycle.tsx`
**Changes**:
- Import `activateResource` from `@/lib/sessions` and `ResourcePane` from `./ResourcePane`.
- Add state: `const [activatingId, setActivatingId] = useState<string | null>(null)` and `const [activateError, setActivateError] = useState<string | null>(null)`.
- Add handler (mirrors `addResource`'s failure shape):
  ```tsx
  async function activate(resourceId: string) {
    setActivateError(null)
    if (!user?.id) {
      setActivateError('You must be signed in to activate a resource')
      return
    }
    setActivatingId(resourceId)
    try {
      await activateResource({
        sessionId,
        resourceId,
        actor: { id: user.id, role: 'teacher' },
        resources,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActivateError(message)
      console.error('[SessionLifecycle] activate failed:', err)
    } finally {
      setActivatingId(null)
    }
  }
  ```
- Mount the pane near the top of the rendered session body (above or beside the resource queue), reading the live session row:
  ```tsx
  <ResourcePane
    activeResourceId={session?.activeResourceId}
    currentUrl={session?.currentUrl}
  />
  ```
- In the `resource-item` map (`:464`), add `data-active={session?.activeResourceId === r.id ? 'true' : undefined}` to the row div and an Activate button:
  ```tsx
  <button
    type="button"
    data-testid="activate-resource"
    disabled={resPending || activatingId === r.id || session?.activeResourceId === r.id}
    onClick={() => activate(r.id)}
  >
    {session?.activeResourceId === r.id ? 'Active' : 'Activate'}
  </button>
  ```
- Add an inline alert for `activateError` near the queue (mirroring `add-resource-error`):
  ```tsx
  {activateError ? (
    <p data-testid="activate-resource-error" role="alert" className="text-sm text-destructive">
      {activateError}
    </p>
  ) : null}
  ```

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Each queued row renders an `activate-resource` button; the active row carries `data-active="true"` and its button is disabled and labeled "Active".
- [ ] `ResourcePane` renders the active resource and switches live when `session.activeResourceId`/`currentUrl` change.
- [ ] Failure paths behave as designed — failed activation surfaces `activate-resource-error` (`role="alert"`) + `console.error`, leaves the live query/row unchanged, clears the pending latch.

---

## Task 6: Mount `ResourcePane` in `StudentSession`

### Overview
Render the shared pane for students from the existing session-by-`joinCode` query — no new resources query.

### Changes Required
**File**: `src/components/StudentSession.tsx`
**Changes**:
- Import `ResourcePane` from `./ResourcePane`.
- In the render body (`:66`), mount the pane reading from the already-resolved `session` row:
  ```tsx
  <ResourcePane
    activeResourceId={session.activeResourceId}
    currentUrl={session.currentUrl}
  />
  ```
  Placed within `student-session-root` (e.g. above the presence list).

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Student view renders `resource-pane` driven by the live session row; switches live on re-activation; a late-loading context immediately shows the current active resource (the session query returns the current `currentUrl`).
- [ ] When nothing is active, `resource-pane-empty` renders.
- [ ] No `sessionResources` query added to `StudentSession`.
- [ ] Failure paths behave as designed — existing session/participants error branches still gate before the pane.

---

## Task 7: E2E spec `e2e/activate-resource.spec.ts`

### Overview
Multi-context Playwright spec exercising cross-context live render, switching, late-join, and the failure leg, with admin observability.

### Changes Required
**File**: `e2e/activate-resource.spec.ts` (new)
**Changes** (modeled on `e2e/queue-resource.spec.ts` + multi-context `e2e/join-via-link.spec.ts`/`e2e/student-chat.spec.ts`; `test.skip(!adminAvailable(), …)`):
- Teacher (context A) signs in via `signInViaUi`/`mintCode`, creates a session, starts it, queues R1 and R2.
- Students (contexts B, C) open `/s/[joinCode]` and join.
- Teacher clicks the `activate-resource` button on R1's row.
- Assert B and C show `resource-pane-frame` with `src`/`data-resource-id` matching R1, with no reload (wait on the explicit frame element, never `networkidle`).
- Teacher activates R2; assert B and C's `resource-pane-frame` switch to R2's `data-resource-id`.
- Late-joiner (context D) opens `/s/[joinCode]` after activation; assert it immediately shows R2 in `resource-pane-frame`.
- Admin observability via `queryAdmin`: exactly one `ResourceActivated` event per activation with matching `sessionId`/`resourceId`/`currentUrl`; `sessions` projection row shows the updated `activeResourceId`/`currentUrl`.
- Failure leg: a non-teacher / unchanged-state assertion — confirm a student context has no Activate control, and admin counts (`ResourceActivated` events, `sessions.activeResourceId`) are unchanged by a student attempt.

### Success Criteria
- [ ] Spec skips loudly without `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID`.
- [ ] All scenarios pass with admin token present (subject to `retries: 3`).
- [ ] Realtime waits target explicit elements, not `networkidle`.
- [ ] Failure leg asserts no event written and `activeResourceId` unchanged.

---

## Task 8: Documentation updates

### Overview
Docs are part of "done."

### Changes Required
- **`AGENTS.md`**: cycle-0016 entry under Data Layer / cycle notes — the new `ResourceActivated` event, the sanctioned `activateResource`/`buildResourceActivate` path, the additive `sessions.currentUrl` field, the `applyEvent` fold, the shared `ResourcePane`, the fixed testids (`resource-pane`, `resource-pane-empty`, `resource-pane-frame`, `activate-resource`, `activate-resource-error`, row `data-active`), and that `npx instant-cli push schema` is required (additive `currentUrl`) while **no** `perms:push` is needed.
- **`README.md`**: teachers can now activate a queued resource; students see the active resource render live.
- **`release-notes.md`**: surface the user-facing change and the new `currentUrl` schema field requiring a schema push.

### Success Criteria
- [ ] All three docs updated; the schema-push / no-perms-push note is explicit.
- [ ] Failure paths — N/A (docs).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A teacher activates a queued resource and both the teacher view and every connected student view render that resource in an iframe pane within the same session, with no reload (user-observable benefit). | Tasks 3, 4, 5, 6, 7 | |
| [ ] Activating a resource appends exactly one `ResourceActivated` event and sets `sessions[id].activeResourceId` + `currentUrl` (admin-observable: one event with a matching payload, projection row updated) in one transaction. | Tasks 1, 3, 7 | One `writeEvent` dual-write transaction; admin-asserted in e2e |
| [ ] Switching the active resource (activate R1, then R2) switches every connected student pane from R1 to R2 in realtime. | Tasks 5, 6, 7 | Live `db.useQuery` re-render |
| [ ] A context that joins/loads after activation immediately shows the current active resource (no prior activation event observed by that client needed). | Tasks 6, 7 | `currentUrl` on the session row read by the late-joiner's session query |
| [ ] **Failure path**: attempting activation as a non-teacher actor (or with a missing/foreign resource id) throws in `buildResourceActivate`, writes no event, and leaves `activeResourceId`/`currentUrl` unchanged; the teacher UI shows an inline alert and logs to console rather than crashing. | Tasks 3, 5, 7 | Builder rejection legs + handler `role="alert"`+`console.error` + e2e unchanged-counts leg |
| [ ] **Failure path**: when no resource has been activated, both teacher and student panes render an explicit "no active resource" element (testable), not a blank region. | Tasks 4, 5, 6 | `resource-pane-empty` |
| [ ] `applyEvent` folds `ResourceActivated` without raising `UnknownEventTypeError`, and `rebuildSessionProjection` over a log containing it reproduces the active-resource state. | Task 2 | |
| [ ] All existing tests still pass. | Tasks 1–8 | Verified via `npx vitest run` + Playwright |
| [ ] No compiler/linter warnings introduced (`npm run astro check` clean). | Tasks 1–8 | Gate on every task |

---

## Testing Strategy

### Unit Tests
- **`src/lib/sessions.test.ts`** (beside the module): `buildResourceActivate` happy path (expected plan + envelope + derived `currentUrl` + `actor.role: 'teacher'`). Rejection legs via `.toThrow(/…/)`: non-teacher role, missing `actor.id`, missing `sessionId`, missing `resourceId`, foreign resource (wrong session / not found), blank URL — each asserting it throws before producing a plan. `activateResource` wrapper with injected `write`/`buildTxn`: dual-write type `ResourceActivated` + exactly one projection txn; no-write-on-rejected-builder leg; rejection-propagates leg. `defaultResourceActivateTxn`: inspect `__ops` for the keyed `sessions[id].update({ activeResourceId, currentUrl })`, no `link` op.
- **`src/lib/db.test.ts`**: `ResourceActivated` fold (template: `ResourceQueued`/lifecycle cases) — sets `activeResourceId`/`currentUrl`; tolerates absent prior session (minimal-session build); idempotent re-fold; `rebuildSessionProjection` over an ordered log (`SessionCreated` → `ResourceQueued` → `ResourceActivated`, and a switch `…→ ResourceActivated(R1) → ResourceActivated(R2)`) reproduces the final active state; no `UnknownEventTypeError`.
- **Failure-path tests** (map to the named failure modes): each builder rejection leg (above); the wrapper rejection-propagates leg (injected `write` that rejects → `activateResource` rejects, no swallow); the fold partial-payload/absent-session legs.
- **Mocking strategy**: prefer real implementations — builders/folds tested directly; wrappers use the existing injectable `write`/`buildTxn` deps (no network), matching the cycle-0015 convention. No component-level mocking; UI failure surfacing is asserted via e2e.

### Integration / E2E Tests
- `e2e/activate-resource.spec.ts` (Task 7): teacher activates R1 → students B/C render R1 with no reload; activate R2 → B/C switch to R2; late-joiner D immediately shows R2; admin asserts one `ResourceActivated` event + updated `sessions` projection per activation; failure leg asserts no event written / `activeResourceId` unchanged for a non-teacher attempt. Skips loudly without admin env.

## Walkthrough Plan
- **Flow**: Teacher signs in → opens an existing live session at `/dashboard/sessions/[id]` → queues two resources → clicks **Activate** on the first, then the second; in parallel a student at `/s/[joinCode]` shows the active resource render live and switching. The subject is the facilitation and student session routes — never the home page.
- **Capture points** (ordered, named):
  - `01-teacher-session` — teacher facilitation view at `/dashboard/sessions/[id]` with the queued resource list and the `resource-pane-empty` state (nothing active yet).
  - `02-resource-activated` — after clicking Activate on R1: the `resource-item` row marked `data-active="true"`, its button reading "Active", and the teacher's `resource-pane-frame` showing R1.
  - `03-student-active` — the student view at `/s/[joinCode]` showing `resource-pane-frame` with R1, demonstrating cross-context live render.
  - `04-switched-resource` — after activating R2: the student `resource-pane-frame` switched to R2 (live switch, no reload).
- **Preconditions / test data**: magic-code auth via the deterministic test code (`mintCode`, never a real inbox) for the teacher; a created+started session with two queued resources (seeded via the UI or admin); a student context joined via the join code. Realtime assertions wait on the explicit `resource-pane-frame` / `data-active` elements, not `networkidle` (InstantDB keeps the socket busy).
- **If no observable UI this cycle**: N/A — this cycle ships observable UI (the activate control and the shared iframe pane across two routes), so the walkthrough must exercise those routes, not the home-page fallback.

## Risk Assessment
- **Schema push lag**: `currentUrl` requires `npx instant-cli push schema` before the feature works against the schema-enforced live app; e2e against an unpushed schema would fail writes. Mitigation: document the push in AGENTS.md/release-notes (Task 8) as a precondition; unit tests don't need the live schema.
- **iframe embed refusal**: many real URLs send `X-Frame-Options`/CSP `frame-ancestors` and won't render in the iframe. Mitigation: out of scope (blocked-embed fallback is a sibling cycle); the pane still renders the iframe at `currentUrl` and does not crash; the walkthrough/e2e use an embeddable test URL.
- **Realtime flake in e2e**: cross-context propagation can race. Mitigation: `playwright.config.ts` `retries: 3`; wait on explicit `resource-pane-frame`/`data-resource-id` elements rather than `networkidle`.
- **Active-row indication divergence from e2e**: testids/markers must agree between component and spec. Mitigation: testids fixed in this plan (`activate-resource`, row `data-active`, `resource-pane-frame`) and used verbatim by both Task 5/6 and Task 7.
