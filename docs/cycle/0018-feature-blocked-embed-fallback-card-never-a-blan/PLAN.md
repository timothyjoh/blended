# Implementation Plan: Cycle 0018

## Overview
Deliver SPEC §8.2's "never a blank pane" guarantee as one vertical slice: add best-effort client-side blocked/failed-embed detection to the shared `ResourcePane`, render a fallback card (title + URL + open-externally) in place of the blank/broken iframe for **both** teacher and student, and — from the teacher's authorized context only — persist the outcome via a single sanctioned `recordEmbedStatus` / `buildEmbedStatusCheck` path that dual-writes a `ResourceEmbedChecked` event transitioning `sessionResources[id].embedStatus` (`unchecked` → `blocked`/`failed`).

## Current State (from Research)
- `ResourcePane` (`src/components/ResourcePane.tsx:13-51`) is a pure prop-driven component with **no** internal state, **no** `onLoad`/`onError` handlers, and **no** `title` prop. The iframe is keyed on `currentUrlVersion ?? url`, sandbox omits `allow-same-origin`.
- `SessionLifecycle` (teacher) holds a live `sessionResources` query `rq` whose sorted `resources` array carries `title`/`url`/`embedMode`/`embedStatus` (`src/components/SessionLifecycle.tsx:125-128`), and mounts the pane at `:467-471`. Its `activate()` (`:182-207`) is the model for a teacher write callback: clear error → guard `user?.id` → set pending latch → `await` sanctioned wrapper → `try/catch` inline error + `console.error` → `finally` clear latch.
- `StudentSession` (`src/components/StudentSession.tsx:24-104`) issues **no** `sessionResources` query (by design) — title is not currently resolvable there. Mounts the pane at `:83-87`.
- Write pattern to mirror exactly: pure builder that throws synchronously on bad input (`buildResourceActivate` `src/lib/sessions.ts:1005-1029`), an exported `defaultResourceActivateTxn` (`:1031-1036`) doing a no-link `db.tx…update(...)` on an existing row, and a thin wrapper routing one dual-write through `writeEvent` with injectable `deps` (`:1053-1062`).
- `writeEvent` (`src/lib/db.ts:629-667`) is the sole sanctioned projection writer; it rejects empty `projectionTxns`. `applyEvent` (`:316-577`) folds each known type and throws `UnknownEventTypeError` at the `default` (`:570-575`). `SessionProjection.resources` entries currently **omit** `embedStatus` (`:270-284`).
- `embedStatus: i.string()` already exists in schema (`src/lib/db.ts:89`); queued rows default `embedStatus: 'unchecked'` (`src/lib/sessions.ts:841`). The `sessionResources` owner-only update rule (`src/lib/perms.ts:88`) admits a teacher `embedStatus` update on the existing (already-linked) row. **No schema push, no `perms:push`.**
- `validateResourceUrl` (`src/lib/resources.ts:26-43`) accepts any absolute http(s) URL including `localhost` — so localhost fixture URLs are queueable in e2e. That file is the restricted validation seam and is **not** modified this cycle.
- Inline-alert convention: `<p role="alert" data-testid="…-error" className="text-sm text-destructive">` + `console.error('[Component] …')`, never swallowed (e.g. `src/components/SessionLifecycle.tsx:455-463`).
- Tests: Vitest for pure logic (`src/lib/*.test.ts`), Playwright e2e under `e2e/` skipping loudly without admin env (`test.skip(!adminAvailable(), …)`), `retries: 3`, dev server on `http://localhost:4399` (`playwright.config.ts`). e2e helpers in `e2e/support/auth.ts`.

## Desired End State
- A teacher activates a non-embeddable URL; within a bounded delay the iframe is replaced — for the teacher and every joined student — by a card showing the resource title (or hostname fallback), the URL as text, and a working "Open externally" action (`target="_blank"` + `rel="noopener noreferrer"`).
- An embeddable URL renders inline with no card and no flicker; a successful `onLoad` cancels the pending timeout.
- The teacher's client records exactly one `ResourceEmbedChecked` event per settled outcome and flips `embedStatus` `unchecked` → `blocked`/`failed`; `applyEvent` folds it. Students render the card but write nothing.
- Verify: `npm test` (new unit tests pass), `npm run astro check` clean, `npm run test:e2e` (new `e2e/blocked-embed-fallback.spec.ts` green when admin env present, skips loudly otherwise), all existing tests still pass.

## What We're NOT Doing
- No server-side preflight/probe of URLs (best-effort client detection only).
- No `failed`→retry/recovery-instructions affordance beyond rendering the card.
- No auto-flip of `embedMode` and no auto-re-embed once a URL later becomes embeddable.
- No change to the activation (0016) or broadcast (0017) write paths, or to `validateResourceUrl`.
- No persistence of embed status from the student context (students lack `sessionResources` write permission by design).
- No schema push, no `perms:push`.

## Implementation Approach
Build bottom-up in vertical slices that each end with tests. (1) Extend the projection type and `applyEvent` with the `ResourceEmbedChecked` fold. (2) Add the pure `buildEmbedStatusCheck` builder + `defaultEmbedStatusTxn` + `recordEmbedStatus` wrapper mirroring the activation triplet. (3) Make `ResourcePane` stateful: a bounded load-timeout (named constant in a new `src/lib/embed.ts`) as the primary block signal, `onError` as secondary, `onLoad` cancels; render the prop-driven fallback card; expose an `onEmbedBlocked` callback. (4) Wire the teacher context (`SessionLifecycle`): supply the active resource's title, pass a callback that applies the convergence guard (skip if already at status) + a per-resource latch, routes through `recordEmbedStatus`, and surfaces failures inline. (5) Wire the student context (`StudentSession`): add a narrowly-scoped active-resource title query, pass the title, pass **no** callback. (6) e2e fixtures + spec. (7) Docs.

The visual guarantee is entirely prop-driven inside `ResourcePane`, so the card renders independently of whether the teacher write succeeds and even when no callback is provided (students).

## Failure & Resilience Decisions

**Task 1 — `applyEvent` fold (`ResourceEmbedChecked`)** — N/A for I/O (pure), but folding correctness is a resilience concern:
- **Failure modes**: an unknown/absent payload field. Handled by type-guarding each field to `undefined` and tolerating an absent prior `resources[id]` entry (build a minimal entry), exactly like the `ResourceQueued`/`QuestionAnswered` cases. The event type is added to the switch so it never reaches the throwing `default`.
- **Idempotency**: pure and convergent — re-folding the same event reproduces the identical entry; never mutates input.
- **Observability**: an unfolded event would raise `UnknownEventTypeError` loudly; adding the case prevents that for this known type.
- **No silent failure**: the `default` still throws for genuinely unknown types.

**Task 2 — `buildEmbedStatusCheck` / `recordEmbedStatus`** (build is pure; wrapper performs the dual-write):
- **Failure modes**: bad input (missing `sessionId`/`resourceId`, non-teacher actor, `embedStatus` outside `{blocked, failed}`) → builder throws synchronously, **nothing written**. A rejected `writeEvent` (permission/network) → the wrapper does **not** catch; rejection propagates to the component.
- **Idempotency**: not idempotent at the event layer (each accepted call appends a fresh event), but the projection update is convergent (re-setting the same `embedStatus`). Re-run safety against duplicate events is enforced upstream by the component's convergence guard + per-resource latch (Task 4); the failed-txn case writes nothing, so retry is safe.
- **Observability**: builder error messages are `'recordEmbedStatus: <reason>'`; the appended `ResourceEmbedChecked` envelope is the admin-observable evidence.
- **No silent failure**: builder throws; wrapper propagates; `writeEvent` is atomic (no partial state).

**Task 3 — `ResourcePane` detection** (browser timers; no network/FS writes by us):
- **Failure modes**: a slow-but-valid embed may transiently show the card (bounded timeout); a late `onLoad`, if it arrives, clears it — degraded-but-visible, accepted per SPEC §44. A blocked embed that never fires `onLoad`/`onError` is caught by the timeout. The fallback card renders from props the pane already holds, so it appears even with no callback and even if the teacher write later fails.
- **Idempotency**: detection state resets deterministically when `activeResourceId`/`currentUrlVersion` change (effect dependency); the timeout is always cleared on unmount/reset to avoid leaks or stale fires.
- **Observability**: when a callback is provided, the settled outcome is reported via `onEmbedBlocked(status)`; the card itself is the user-visible signal.
- **No silent failure**: `onEmbedBlocked` rejections are owned by the caller (Task 4), not swallowed in the pane.

**Task 4 — teacher callback wiring** (calls `recordEmbedStatus`):
- **Failure modes**: write rejected/unavailable → caught, surfaced inline (`role="alert"`, `data-testid="embed-status-error"`) + `console.error('[SessionLifecycle] …')`; the fallback card stays visible regardless.
- **Idempotency**: a convergence guard (skip the write if the live `embedStatus` already equals the detected status) plus a per-resource latch (a `useRef<Set<string>>` of resource ids written this mount) suppress repeated writes from repeated detections. The latch is cleared for a resource when its `activeResourceId`/`currentUrlVersion` changes so a re-broadcast re-checks.
- **Observability**: inline alert + `console.error`; the event is the timeline evidence on success.
- **No silent failure**: every catch sets the inline error and logs.

**Task 5 — student title query** (read-only live query):
- **Failure modes**: query error → `console.error('[StudentSession] …')`; the card falls back to the hostname heading (title simply absent). No crash, never blank.
- **Idempotency**: read-only; safe to re-run.
- **Observability**: query error logged.
- **No silent failure**: error logged; degraded heading is intentional, not a swallowed error.

**Task 6 — e2e fixture endpoint** (dev-only route):
- **Failure modes**: the hang fixture deliberately delays past the timeout; guarded to dev/test so it cannot affect production routing.
- **Idempotency**: stateless GET; safe to re-run.
- **Observability**: N/A (test infra).
- **No silent failure**: N/A (test infra).

**Task 7 — Docs**: N/A — pure.

---

## Task 1: Fold `ResourceEmbedChecked` in `applyEvent` + extend the projection type

### Overview
Teach the projection about embed status: add an optional `embedStatus` field to the `resources[]` entry type and a `ResourceEmbedChecked` fold case before the throwing `default`.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**:
- Extend the `resources` entry type (`:273-284`) with `embedStatus?: string`. Update the adjacent comment noting cycle 0018 now folds `embedStatus` (the other deferred fields `embedMode`/`activatedAt` remain unfolded).
- Add a case before `default:` (`:570`):
```ts
case 'ResourceEmbedChecked': {
  // Cycle 0018: a teacher's client recorded a settled embed outcome. Set the
  // resource's embedStatus on its `resources` map entry. Mirrors ResourceQueued:
  // tolerant of an absent prior entry (build a minimal one from the payload),
  // type-guards each field, never mutates input, re-folds convergently. Keeps
  // rebuildSessionProjection whole — never reaches the default.
  const p = event.payload as { sessionId?: string; resourceId?: string; embedStatus?: string }
  const resourceId = typeof p.resourceId === 'string' ? p.resourceId : event.id
  const prev = projection.resources[resourceId]
  const embedStatus = typeof p.embedStatus === 'string' ? p.embedStatus : undefined
  return {
    ...projection,
    resources: {
      ...projection.resources,
      [resourceId]: prev
        ? { ...prev, embedStatus }
        : {
            id: resourceId,
            sessionId: typeof p.sessionId === 'string' ? p.sessionId : projection.sessionId,
            url: '',
            title: '',
            type: 'generic_url',
            sortOrder: 0,
            createdAt: event.occurredAt,
            embedStatus,
          },
    },
  }
}
```

**File**: `src/lib/db.test.ts`
**Changes**: add fold tests mirroring `src/lib/db.test.ts:472-617`: sets `embedStatus` on an existing entry; tolerant of an absent prior entry (creates a keyed minimal entry); idempotent re-fold; does not mutate input; `expect(() => applyEvent(p, embedCheckedEvent)).not.toThrow()`; and an unknown type still `toThrow(UnknownEventTypeError)`.

### Success Criteria
- [ ] `npm run astro check` clean (projection type updated everywhere it is constructed — `emptyProjection` needs no change since `resources` starts `{}`).
- [ ] New fold unit tests pass; existing `db.test.ts` tests pass.
- [ ] `ResourceEmbedChecked` never raises `UnknownEventTypeError`.

---

## Task 2: `buildEmbedStatusCheck` / `defaultEmbedStatusTxn` / `recordEmbedStatus`

### Overview
Add the single sanctioned writer of `embedStatus`, mirroring the activation triplet, routing one dual-write through `writeEvent('ResourceEmbedChecked', …)`.

### Changes Required
**File**: `src/lib/sessions.ts` (after the broadcast block, ~`:1166`)
**Changes**:
```ts
export type EmbedStatus = 'blocked' | 'failed'

export type BuildEmbedStatusCheckInput = {
  sessionId: string | null | undefined
  resourceId: string | null | undefined
  actor: { id: string | null | undefined; role: string }
  embedStatus: string | null | undefined
}

export type EmbedStatusCheckPlan = {
  sessionId: string
  resourceId: string
  embedStatus: EmbedStatus
  meta: WriteEventMeta
}

/**
 * Pure builder: totally validates BEFORE producing any plan. A non-teacher actor,
 * a missing actor.id/sessionId/resourceId, or a status outside {blocked, failed}
 * is rejected by throwing synchronously — so nothing is written for an invalid
 * check. Envelope hard-sets actor.role:'teacher'; payload carries
 * sessionId/resourceId/embedStatus so it folds through applyEvent's
 * ResourceEmbedChecked case.
 */
export function buildEmbedStatusCheck(input: BuildEmbedStatusCheckInput): EmbedStatusCheckPlan {
  if (input.actor?.role !== 'teacher')
    throw new Error('recordEmbedStatus: only a teacher may record embed status')
  const teacherId = input.actor?.id
  if (!teacherId) throw new Error('recordEmbedStatus: an actor userId is required')
  const sessionId = input.sessionId
  if (!sessionId) throw new Error('recordEmbedStatus: a sessionId is required')
  const resourceId = input.resourceId
  if (!resourceId) throw new Error('recordEmbedStatus: a resourceId is required')
  const embedStatus = input.embedStatus
  if (embedStatus !== 'blocked' && embedStatus !== 'failed')
    throw new Error('recordEmbedStatus: embedStatus must be blocked or failed')
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: teacherId, role: 'teacher' },
    payload: { sessionId, resourceId, embedStatus },
  }
  return { sessionId, resourceId, embedStatus, meta }
}

// Updates the EXISTING sessionResources row (link already set at create), so no
// .link({ session }) — the owner-only update rule resolves via the stored link.
export const defaultEmbedStatusTxn = (plan: EmbedStatusCheckPlan): ProjectionTxn =>
  db.tx.sessionResources[plan.resourceId].update({ embedStatus: plan.embedStatus })

export type RecordEmbedStatusDeps = {
  write?: typeof writeEvent
  buildTxn?: (plan: EmbedStatusCheckPlan) => ProjectionTxn
}

/**
 * Thin wrapper: builds the plan (sync-throws on bad input, writing nothing), then
 * dual-writes the ResourceEmbedChecked envelope + the keyed sessionResources
 * update in ONE writeEvent transaction. Convergent (re-setting identical status);
 * the rejection propagates and is never swallowed. deps injectable for testing.
 */
export async function recordEmbedStatus(
  input: BuildEmbedStatusCheckInput,
  deps: RecordEmbedStatusDeps = {}
): Promise<EmbedStatusCheckPlan> {
  const plan = buildEmbedStatusCheck(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultEmbedStatusTxn
  await write('ResourceEmbedChecked', plan.meta, [buildTxn(plan)])
  return plan
}
```

**File**: `src/lib/sessions.test.ts`
**Changes**: mirror `src/lib/sessions.test.ts:1257-1443`:
- `buildEmbedStatusCheck` rejects: non-teacher actor; missing `actor.id`; missing `sessionId`; missing `resourceId`; status `'unchecked'`/`'embeddable'`/`undefined` — each asserts the thrown message and that no plan is produced.
- Accepts valid input → returns `meta.payload` `{ sessionId, resourceId, embedStatus }` and `actor.role === 'teacher'`.
- `recordEmbedStatus` with an injected `write` stub: asserts `type === 'ResourceEmbedChecked'`, one txn, and that a rejecting `write` propagates (wrapper does not swallow).
- `defaultEmbedStatusTxn` real-txn test: inspect the mock `__ops` for an `update` on `sessionResources[resourceId]` carrying `embedStatus` and **no** `link` op.

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] New builder/wrapper/txn unit tests pass; existing `sessions.test.ts` passes.
- [ ] Builder rejects all bad-input cases before any write; wrapper propagates rejection.

---

## Task 3: `ResourcePane` blocked/failed detection + fallback card

### Overview
Make `ResourcePane` detect a blocked/failed embed (bounded timeout primary, `onError` secondary, `onLoad` cancels), render the prop-driven fallback card, and report the settled outcome via an optional `onEmbedBlocked` callback. Detection resets when the active resource / URL version changes.

### Changes Required
**File**: `src/lib/embed.ts` (new — pure, unit-testable)
```ts
// Cycle 0018: bounded embed-detection constants + the pure card-heading helper.
// The timeout is the dependable block signal (browsers don't reliably surface
// X-Frame-Options/CSP refusals via onError/onLoad).
export const EMBED_LOAD_TIMEOUT_MS = 4000

/** Heading for the fallback card: the title, else the URL hostname, else the raw URL. */
export function resourceCardHeading(title: string | null | undefined, url: string): string {
  const t = (title ?? '').trim()
  if (t !== '') return t
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}
```

**File**: `src/components/ResourcePane.tsx`
**Changes**:
- Convert to a stateful component (import `useEffect`, `useRef`, `useState` from `react`; import `EMBED_LOAD_TIMEOUT_MS`, `resourceCardHeading` from `@/lib/embed`).
- New props: `title?: string | null`, `onEmbedBlocked?: (status: 'blocked' | 'failed') => void`.
- State: `status: 'pending' | 'loaded' | 'blocked' | 'failed'`. A reset key `const resetKey = currentUrlVersion ?? url`.
- `useEffect` keyed on `[activeResourceId, resetKey, url]`: if no active resource/blank url, do nothing; else set `status = 'pending'`, start `setTimeout(() => setStatus('blocked'), EMBED_LOAD_TIMEOUT_MS)` stored in a ref; cleanup clears the timeout (handles reset + unmount → no stale fires).
- iframe `onLoad`: clear the timeout, `setStatus('loaded')`. `onError`: clear the timeout, `setStatus('failed')`.
- A second `useEffect` keyed on `[status]`: when `status === 'blocked' || status === 'failed'`, call `onEmbedBlocked?.(status)` (the latch/guard live in the caller).
- Render: empty state unchanged. When `status` is `blocked`/`failed`, render the fallback card **in place of** the iframe; otherwise render the iframe (with the new `onLoad`/`onError`). Keep the iframe mounted while `pending`/`loaded`.
```tsx
const heading = resourceCardHeading(title, url)
// fallback card branch:
<div data-testid="resource-pane" className="rounded-md border">
  <div data-testid="resource-pane-fallback" className="flex flex-col gap-3 p-6">
    <p data-testid="resource-pane-fallback-title" className="font-medium">{heading}</p>
    <p data-testid="resource-pane-fallback-url" className="break-all text-sm text-muted-foreground">{url}</p>
    <a
      data-testid="resource-pane-open-external"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm underline"
    >
      Open externally
    </a>
  </div>
</div>
```
- Update the header comment to document detection + the fallback (cycle 0018), noting the card is prop-driven and renders even with no callback.

**File**: `src/lib/embed.test.ts` (new)
**Changes**: unit-test `resourceCardHeading` — returns trimmed title when present; hostname when title blank; raw url when unparseable; and assert `EMBED_LOAD_TIMEOUT_MS` is a positive number (guards against an accidental `0`/negative).

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] `embed.test.ts` passes.
- [ ] An embeddable URL (onLoad fires) shows no card and cancels the timeout; a non-loading URL shows the card after the timeout; detection resets on `activeResourceId`/`currentUrlVersion` change (verified via e2e Task 6).
- [ ] No timer leak: cleanup clears the pending timeout on reset/unmount.

---

## Task 4: Wire teacher context (`SessionLifecycle`) — title + guarded callback + inline alert

### Overview
Supply the active resource's title to the pane and pass an `onEmbedBlocked` callback that applies the convergence guard + per-resource latch, routes through `recordEmbedStatus`, and surfaces failures inline without hiding the card.

### Changes Required
**File**: `src/components/SessionLifecycle.tsx`
**Changes**:
- Import `recordEmbedStatus`.
- New state: `const [embedStatusError, setEmbedStatusError] = useState<string | null>(null)` and a latch `const embedWrittenRef = useRef<Set<string>>(new Set())` (key = `${activeResourceId}::${currentUrlVersion ?? currentUrl}` so a re-broadcast re-checks).
- Compute the active resource: `const activeResource = resources.find((r) => r.id === session?.activeResourceId) ?? null`.
- Callback:
```ts
async function onEmbedBlocked(detected: 'blocked' | 'failed') {
  setEmbedStatusError(null)
  const resourceId = session?.activeResourceId
  if (!user?.id || !resourceId) return
  const latchKey = `${resourceId}::${session?.currentUrlVersion ?? session?.currentUrl ?? ''}`
  if (embedWrittenRef.current.has(latchKey)) return        // per-detection latch
  if (activeResource?.embedStatus === detected) {           // convergence guard
    embedWrittenRef.current.add(latchKey)
    return
  }
  embedWrittenRef.current.add(latchKey)
  try {
    await recordEmbedStatus({
      sessionId,
      resourceId,
      embedStatus: detected,
      actor: { id: user.id, role: 'teacher' },
    })
  } catch (err) {
    embedWrittenRef.current.delete(latchKey)               // allow retry on failure
    const message = err instanceof Error ? err.message : String(err)
    setEmbedStatusError(message)
    console.error('[SessionLifecycle] record embed status failed:', err)
  }
}
```
- Pass `title={activeResource?.title}` and `onEmbedBlocked={onEmbedBlocked}` to the `<ResourcePane>` at `:467-471`.
- Render the inline alert near the pane, mirroring `broadcast-url-error` (`:455-463`):
```tsx
{embedStatusError ? (
  <p data-testid="embed-status-error" role="alert" className="text-sm text-destructive">
    {embedStatusError}
  </p>
) : null}
```

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] On a blocked embed, exactly one `ResourceEmbedChecked` write per settled outcome (latch + convergence guard verified via e2e Task 6).
- [ ] A rejected write surfaces `embed-status-error` (`role="alert"`) + `console.error` and the card stays visible (failure leg).
- [ ] Existing `SessionLifecycle` behavior unchanged.

---

## Task 5: Wire student context (`StudentSession`) — narrowly-scoped title, no callback

### Overview
Resolve the active resource's title via a narrowly-scoped open read and pass it to the pane; pass **no** callback (students cannot write `sessionResources`).

### Changes Required
**File**: `src/components/StudentSession.tsx`
**Changes**:
- Add a live query scoped to the single active resource (open reads permit this):
```ts
const resQ = db.useQuery(
  session?.activeResourceId
    ? { sessionResources: { $: { where: { id: session.activeResourceId } } } }
    : null
)
if (resQ.error) console.error('[StudentSession] active resource query error:', resQ.error)
const activeResourceTitle = resQ.data?.sessionResources?.[0]?.title ?? null
```
- Pass `title={activeResourceTitle}` to `<ResourcePane>` at `:83-87`; **do not** pass `onEmbedBlocked`.
- Update the cycle comment to note: a narrowly-scoped active-resource title read feeds the fallback heading (hostname fallback when absent); the student pane's fallback is local-only — no `ResourceEmbedChecked` write.

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Student renders the fallback card (title or hostname) for a blocked embed; no write occurs.
- [ ] A title-query error logs and degrades to the hostname heading (never blank, never crash).

---

## Task 6: e2e fixtures + `e2e/blocked-embed-fallback.spec.ts`

### Overview
Add deterministic embeddable and non-loading fixtures and an e2e spec covering blocked, embeddable, evidence, and the student-no-write failure leg.

### Changes Required
**File**: `public/e2e/embed-ok.html` (new) — minimal static HTML, no `X-Frame-Options`; frames cleanly and fires `onLoad` immediately → no card.

**File**: `src/pages/e2e/hang.ts` (new — dev/test-only Astro endpoint)
**Changes**: a `GET` that delays beyond `EMBED_LOAD_TIMEOUT_MS` (e.g. `await new Promise((r) => setTimeout(r, 30_000))` then returns 200), so the iframe never fires `onLoad` within the timeout → the card appears. Guard to non-production (`if (!import.meta.env.DEV) return new Response('not found', { status: 404 })`).

**File**: `e2e/blocked-embed-fallback.spec.ts` (new)
**Changes**: structure mirrors `e2e/activate-resource.spec.ts` / `e2e/broadcast-resource-url.spec.ts`; `test.skip(!adminAvailable(), …)` loudly; use `e2e/support/auth.ts` helpers; wait on explicit elements (not `networkidle`).
- *Blocked*: teacher signs in, creates + starts a session, queues `http://localhost:4399/e2e/hang`, activates it; assert `resource-pane-fallback` (with `resource-pane-fallback-title`, `resource-pane-fallback-url`, and an `resource-pane-open-external` whose `href` is the URL, `target="_blank"`, `rel="noopener noreferrer"`) appears, and `resource-pane-frame` is absent — in a teacher context **and** a joined student context.
- *Embeddable*: activate `http://localhost:4399/e2e/embed-ok.html`; assert `resource-pane-frame` is present and `resource-pane-fallback` is absent.
- *Evidence*: via `queryAdmin`, assert exactly one `ResourceEmbedChecked` event and a `blocked`/`failed` `sessionResources` projection row after the blocked activation; assert none after the embeddable one.
- *Failure leg*: a student renders `resource-pane-fallback` but adds no `ResourceEmbedChecked` event and no `sessionResources` embedStatus change (no write permission).

### Success Criteria
- [ ] Spec skips loudly without admin env; passes with it (allowing `retries: 3`).
- [ ] Fixtures resolve on `http://localhost:4399`; `hang.ts` 404s outside dev.
- [ ] Existing e2e specs unaffected.

---

## Task 7: Documentation

### Overview
Document the new data-layer path, event/fold, testids, and the no-push facts; note the user-facing change in the README.

### Changes Required
**File**: `AGENTS.md`
**Changes**: add a cycle-0018 paragraph in the data-layer section documenting `recordEmbedStatus` / `buildEmbedStatusCheck` / `defaultEmbedStatusTxn`, the `ResourceEmbedChecked` event + `applyEvent` fold, the `embedStatus` transition (`unchecked`→`blocked`/`failed`), the `ResourcePane` detection/fallback props (`title`, `onEmbedBlocked`) + teacher-only callback + `EMBED_LOAD_TIMEOUT_MS`, the new fixed testids (`resource-pane-fallback`, `resource-pane-fallback-title`, `resource-pane-fallback-url`, `resource-pane-open-external`, `embed-status-error`), and that there is **no schema push** and **no `perms:push`** this cycle.

**File**: `README.md`
**Changes**: note that non-embeddable resources now show a fallback "open externally" card instead of a blank pane.

### Success Criteria
- [ ] Both docs updated; testids and the no-push facts match the implementation.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] **User-observable benefit**: activating a non-embeddable URL shows a fallback card with the resource title, the URL as text, and an "Open externally" action that opens the URL in a new tab — visible in **both** a teacher context and a student context, with no blank/broken iframe.` | Tasks 3, 4, 5, 6 | Card in `ResourcePane`; wired in both contexts; e2e asserts both. |
| `[ ] An embeddable URL renders inline in the `ResourcePane` iframe and shows **no** fallback card (no false positive); the pending timeout is cancelled on successful load.` | Tasks 3, 6 | `onLoad` clears timeout → `loaded`; e2e embeddable leg. |
| `[ ] On detected block/failure in the teacher context, the resource's `embedStatus` transitions `unchecked` → `blocked`/`failed` and a `ResourceEmbedChecked` event is appended (admin-observable), exactly once per settled outcome.` | Tasks 2, 4, 6 | `recordEmbedStatus` + convergence guard + per-resource latch; e2e evidence leg. |
| `[ ] `applyEvent` folds a `ResourceEmbedChecked` event into the resources projection and does not raise `UnknownEventTypeError` (unit test).` | Task 1 | Fold case + `db.test.ts` `not.toThrow()`. |
| `[ ] **Failure-path**: when the teacher-side `recordEmbedStatus` write is rejected, the fallback card still renders for the teacher and the rejection surfaces inline (`role="alert"`) + `console.error`, leaving the pane non-blank rather than crashing or silently swallowing the error.` | Tasks 3, 4, 6 | Card is prop-driven (independent of write); `embed-status-error` alert + log; e2e failure leg. |
| `[ ] All existing tests still pass.` | Tasks 1–6 | `npm test` + `npm run test:e2e` regression. |
| `[ ] No compiler/linter warnings introduced (`npm run astro check` clean).` | Tasks 1–7 | `astro check` in each task's success criteria. |

---

## Testing Strategy

### Unit Tests
- **`buildEmbedStatusCheck`** (`src/lib/sessions.test.ts`): rejects non-teacher actor, missing `actor.id`/`sessionId`/`resourceId`, and `embedStatus` outside `{blocked, failed}` (assert thrown message, nothing produced); accepts valid input → envelope payload `{sessionId, resourceId, embedStatus}` + `actor.role:'teacher'`.
- **`recordEmbedStatus`**: injected `write` stub asserts `type === 'ResourceEmbedChecked'` and one txn; a rejecting `write` propagates (not swallowed). `defaultEmbedStatusTxn` real-txn: `update` on `sessionResources[id]` with `embedStatus`, **no** `link` op (inspect mock `__ops`).
- **`applyEvent` fold** (`src/lib/db.test.ts`): sets `embedStatus` on an existing entry; tolerant of absent prior entry (creates keyed minimal entry); idempotent re-fold; non-mutation; `not.toThrow()` for `ResourceEmbedChecked`; unknown type still `toThrow(UnknownEventTypeError)`.
- **`resourceCardHeading`** (`src/lib/embed.test.ts`): title present → trimmed title; title blank → hostname; unparseable url → raw url; `EMBED_LOAD_TIMEOUT_MS` positive.
- **Failure-path tests**: builder bad-input rejections (above) cover "rejected before any txn"; wrapper-propagation test covers "not swallowed".
- **Mocking strategy**: real builders/folds; only `writeEvent` is stubbed via injectable `deps` and the existing `db` txn mock (`__ops`) — no network. No component-render mocking; UI behavior is covered by e2e against a real browser.

### Integration / E2E Tests
- `e2e/blocked-embed-fallback.spec.ts` (Task 6): *blocked* (card in teacher + student, no frame), *embeddable* (frame, no card), *evidence* (exactly one `ResourceEmbedChecked` + `blocked`/`failed` row after blocked; none after embeddable), *failure leg* (student renders card, writes nothing). Real browser iframe load behavior is required — only Playwright exercises detection faithfully. Skips loudly without admin env; `retries: 3`.

## Walkthrough Plan
- **Flow**: Over the real teacher facilitation route (`/t/[sessionId]`) and the student route (`/s/[joinCode]`) — not the home page. A teacher signs in (deterministic magic code), creates and starts a session, queues and **activates a non-embeddable fixture URL** (`http://localhost:4399/e2e/hang`), and the fallback card replaces the blank pane; a second browser context joins as a student via the join link and shows the same card; the teacher then activates the **embeddable** fixture (`/e2e/embed-ok.html`) showing the inline iframe.
- **Capture points** (ordered, named):
  - `01-teacher-session-live` — teacher facilitation view with the session live and the resource queued.
  - `02-teacher-activate-blocked` — teacher activates the non-embeddable URL.
  - `03-teacher-fallback-card` — `resource-pane-fallback` card (title + URL + "Open externally") in the teacher view, no iframe.
  - `04-student-fallback-card` — the same fallback card in the joined student view.
  - `05-teacher-embeddable-inline` — teacher activates the embeddable fixture; `resource-pane-frame` renders inline with no card.
- **Preconditions / test data**: auth via the deterministic test magic code (`mintCode()` / `signInViaUi()` from `e2e/support/auth.ts`) — never a real inbox; a teacher-created, started session; the two dev-only fixtures from Task 6 served on `http://localhost:4399`; waits on explicit elements (`resource-pane-fallback`, `resource-pane-frame`, `resource-pane-open-external`), never `networkidle` (InstantDB keeps the socket busy). The blocked card's appearance is bounded by `EMBED_LOAD_TIMEOUT_MS`, so the wait for `03`/`04` allows for that delay.
- **If no observable UI this cycle**: not applicable — this cycle builds clearly observable UI (the fallback card and the inline embed), so the walkthrough exercises the real routes above and must not degrade to the home-page fallback.

## Risk Assessment
- **A blocked embed fires a spurious `onLoad` on the browser error page** → detection misses the block. Mitigation: the timeout is the primary, dependable signal (SPEC-acknowledged); `onLoad` only cancels. The `hang` fixture never fires `onLoad`, making the e2e/walkthrough deterministic.
- **Slow-but-valid embed transiently shows the card** → accepted per SPEC §44; a late `onLoad` clears it. The named timeout is tunable in one place (`EMBED_LOAD_TIMEOUT_MS`).
- **Repeated detections cause duplicate writes** → per-resource latch + convergence guard in the teacher callback; e2e evidence leg asserts exactly one event.
- **Teacher `embedStatus` update rejected by the owner-only rule** if the existing row's `session` link is missing → rows are linked at create (`src/lib/sessions.ts:933`); the update carries no `link` and relies on the stored link, exactly as the owner-only update rule expects. No `perms:push`.
- **`hang.ts` fixture leaking into production routing** → guarded to dev (`import.meta.env.DEV`), returns 404 otherwise.
- **Timer leak / stale fire on rapid re-broadcast** → the detection effect clears its timeout on cleanup keyed on `activeResourceId`/`currentUrlVersion`.
