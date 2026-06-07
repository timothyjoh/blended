# Implementation Plan: Cycle 0017

## Overview
Deliver the teacher-driven URL-broadcast vertical slice on top of cycle 0016's activation pane: a sanctioned `broadcastResourceUrl` / `buildResourceUrlChange` write path that appends a `ResourceUrlChanged` event and updates `sessions[id].currentUrl` plus a fresh per-broadcast `currentUrlVersion` token in one transaction, a teacher broadcast control in `SessionLifecycle`, and a version-keyed `ResourcePane` iframe that re-snaps every connected student on each broadcast.

## Current State (from Research)
- The activation slice is the exact model to mirror: `buildResourceActivate` / `activateResource` / `defaultResourceActivateTxn` — pure total builder that throws before any plan, thin wrapper routing the dual-write through `writeEvent('ResourceActivated', …)`, exported default txn (`src/lib/sessions.ts:962-1041`).
- `sessions` entity carries `activeResourceId?` and `currentUrl?` but **no** `currentUrlVersion?` (`src/lib/db.ts:48-64`). `SessionProjection.session` likewise lacks `currentUrlVersion?` (`src/lib/db.ts:232-242`).
- `applyEvent`'s `ResourceActivated` case sets `activeResourceId`/`currentUrl`, tolerant of an absent prior session; `default` throws `UnknownEventTypeError` (`src/lib/db.ts:494-529`).
- `validateResourceUrl(input) -> { ok:true, url } | { ok:false, reason }` is the single total URL seam (`src/lib/resources.ts:11-43`); rejections are `'blank' | 'unparseable' | 'unsafe_scheme'`.
- `ResourcePane` takes `{ activeResourceId?, currentUrl? }`, renders an empty state when no active resource / blank url, else a single sandboxed iframe with **no React `key`** (`src/components/ResourcePane.tsx:13-43`).
- `id` from `@instantdb/react` is already imported in both `sessions.ts` and `db.ts`; the `generateJoinCode(randomBytes = default)` injectable pattern (`src/lib/sessions.ts:29-44`) is the determinism model.
- `SessionLifecycle` has the `activate()` handler + per-row control and mounts `ResourcePane` in the "Active resource" card (`src/components/SessionLifecycle.tsx:174-199`, `373-384`); `StudentSession` mounts the pane from the session row (`src/components/StudentSession.tsx:83-86`).
- Component pattern: validate through `validateResourceUrl` before any write, `try/catch` around the wrapper, inline `role="alert"` error + `console.error('[SessionLifecycle] …')`, per-action pending latch, inputs retained on failure (`src/components/SessionLifecycle.tsx:125-199`).

### Resolved Open Questions
- **Version-token source**: a dedicated pure `generateUrlVersion(mint: Mint = id)` in `src/lib/sessions.ts`, where `type Mint = () => string` and the default is `id` from `@instantdb/react` (already imported, yields an unguessable unique token). `buildResourceUrlChange` and `buildResourceActivate` accept an injectable `version?: string` (mirroring `sessionId?`) so tests pin a deterministic token; production omits it and the builder calls `generateUrlVersion()`. This avoids any read-before-write and guarantees two broadcasts never collide.
- **`ResourceActivated` payload/fold change**: stamp `currentUrlVersion` **additively** onto the existing activation payload and fold. The `ResourceActivated` payload gains `currentUrlVersion`; the fold sets it; existing activation unit/fold fixtures are updated **in place** (not duplicated) to include the new field, so activation and broadcast share one re-sync key.
- **Broadcast control placement & testids**: the control sits inside the existing "Active resource" `Card` (`src/components/SessionLifecycle.tsx:373-384`), directly above the `ResourcePane`. It is always rendered (stable testids) but its input and button are `disabled` when `session.activeResourceId` is absent. Fixed testids: `broadcast-url-control` (wrapper), `broadcast-url-input` (URL field), `broadcast-url-submit` (Broadcast button), `broadcast-url-error` (`role="alert"` inline error).
- **`ResourcePane` key derivation**: the iframe's React `key` is `currentUrlVersion ?? url` — the fresh per-broadcast token forces a remount on every broadcast (including an identical URL); the `?? url` fallback keeps pre-0017 session rows (no `currentUrlVersion`) rendering correctly.

## Desired End State
- A new sanctioned write path `broadcastResourceUrl` / `buildResourceUrlChange` / `defaultResourceUrlChangeTxn` in `src/lib/sessions.ts`, with `generateUrlVersion`.
- `ResourceUrlChanged` is a known event type folded by `applyEvent`; `sessions.currentUrlVersion?` exists in the schema and `SessionProjection.session` shape; activation also stamps `currentUrlVersion`.
- A teacher broadcast control in `SessionLifecycle`, enabled only with an active resource, validating through `validateResourceUrl` before any write, surfacing rejections inline.
- `ResourcePane` keys its iframe on `currentUrlVersion`; both call sites pass the prop.
- Verification: `npm test` (Vitest, incl. new builder/wrapper/txn/fold specs) green; `npm run test:e2e` (`e2e/broadcast-resource-url.spec.ts`) green where `INSTANT_ADMIN_TOKEN` is set, skips loudly otherwise; `npm run astro check` clean; docs updated.

## What We're NOT Doing
- No postMessage / provider embed-API capture (teacher syncing by clicking *inside* the deck) — ADR-0002 Batch-2 spike.
- No prev/next stepping over a stored slide-URL list — sibling cycle.
- No same-origin / "URL belongs to the active resource" restriction — scheme-safety only via `validateResourceUrl`.
- No blocked-embed fallback for URLs that refuse to render in an iframe.
- No permission-rule change — `currentUrl`/`currentUrlVersion` inherit the cycle-0003 `sessions` owner-only-write rule (`auth.id == data.teacherId`); no `perms:push`.
- No new query for late-joiner hydration — inherited from the session row.

## Implementation Approach
Mirror the cycle-0016 activation slice exactly: a pure total builder that throws before producing any plan, a thin wrapper routing the dual-write through `writeEvent`, and an exported default txn. The only new mechanic is a per-broadcast version token (`generateUrlVersion`, injectable for tests) shared between activation and broadcast so the iframe remount is keyed off one field. Slices are vertical: (1) schema + projection + version mint, (2) builder/wrapper/txn + activation stamping, (3) fold, (4) version-keyed pane + both call sites, (5) teacher control, (6) e2e + docs. Each slice ships with its tests.

## Failure & Resilience Decisions

**`generateUrlVersion` (Task 1)** — N/A — pure. Deterministic given the injected `mint`; the default `id()` from `@instantdb/react` is the same source already used for session/participant/resource ids.

**`buildResourceUrlChange` (Task 2)** — pure builder.
- **Failure modes**: invalid input (non-teacher actor, missing `actor.id`, missing `sessionId`, absent `activeResourceId` on the live session, `validateResourceUrl`-rejected URL) → throws `Error('broadcastResourceUrl: <reason>')` synchronously **before** producing any plan/envelope. No write occurs.
- **Idempotency**: not idempotent by design — each call mints a fresh `currentUrlVersion` and appends a fresh event; the projection `sessions[id].update` is convergent for `currentUrl` but `currentUrlVersion` is intentionally new each call (that is the re-sync mechanism). Re-runs are safe (no read-before-write, no collision) and intended.
- **Observability**: the thrown `Error` message names the function and reason; tested via `.toThrow(/regex/)`.
- **No silent failure**: throws to the caller; nothing swallowed.

**`broadcastResourceUrl` wrapper (Task 2)** — async I/O via `writeEvent` → `db.transact()`.
- **Failure modes**: builder throw propagates (no write); a rejected `db.transact()` (permission denial / network) rejects the returned promise. Atomic dual-write — event + projection commit together; a rejection leaves no orphan event and unchanged `currentUrl`/`currentUrlVersion`.
- **Idempotency**: see builder — each call appends a fresh event; safe to retry after a rejection (the failed txn wrote nothing).
- **Observability**: rejection propagates to the component handler which logs `console.error('[SessionLifecycle] broadcast failed:', err)`.
- **No silent failure**: the wrapper does NOT catch the rejecting `writeEvent`; rejection propagates.

**`applyEvent('ResourceUrlChanged', …)` fold (Task 3)** — N/A — pure. Tolerant of an absent prior session (builds a minimal one from the payload, keyed `payload.sessionId ?? projection.sessionId`); never mutates input; re-folds convergently. Adding the case removes the `UnknownEventTypeError` surface for this type.

**`ResourcePane` version-keyed iframe (Task 4)** — N/A — pure render. No I/O; a remount points the iframe at `currentUrl` and does not crash on a blocked embed (deferred concern).

**`broadcast()` handler in `SessionLifecycle` (Task 5)** — UI I/O.
- **Failure modes**: not signed in → inline error, no write. `validateResourceUrl` rejection → mapped inline copy + `console.error`, no write. Wrapper rejection → caught, inline `role="alert"` error + `console.error('[SessionLifecycle] broadcast failed:', err)`, entered URL retained for retry. No active resource → control disabled, broadcast impossible.
- **Idempotency**: a per-action pending latch (`broadcastPending`) suppresses double-submit; each successful broadcast is a fresh event (intended).
- **Observability**: inline `role="alert"` + `console.error('[SessionLifecycle] …')`.
- **No silent failure**: every path either surfaces inline + logs or is structurally prevented (disabled control).

---

## Task 1: Schema, projection shape, and version mint

### Overview
Add the additive `sessions.currentUrlVersion` field, extend `SessionProjection.session`, and add the deterministic `generateUrlVersion` mint.

### Changes Required
**File**: `src/lib/db.ts`
- Add `currentUrlVersion: i.string().optional()` to the `sessions` entity (`src/lib/db.ts:48-64`) with a cycle-0017 comment mirroring the `currentUrl` note (additive — requires `instant-cli push schema`).
- Add `currentUrlVersion?: string` to `SessionProjection.session` (`src/lib/db.ts:232-242`).

**File**: `src/lib/sessions.ts`
- Add `export type Mint = () => string` and `export function generateUrlVersion(mint: Mint = id): string { return mint() }` near the `generateJoinCode` block (`src/lib/sessions.ts:29-44`), documented as the injectable per-broadcast token source (default `id` from `@instantdb/react`, already imported).

### Success Criteria
- [ ] `npm run astro check` clean (schema + types compile).
- [ ] `generateUrlVersion()` returns the injected mint's value (unit test pins a stub).
- [ ] N/A — pure; no failure surface introduced.

---

## Task 2: `broadcastResourceUrl` / `buildResourceUrlChange` / `defaultResourceUrlChangeTxn`, and version-stamping activation

### Overview
Add the sole sanctioned broadcast write path mirroring the activation slice, and stamp `currentUrlVersion` onto the existing `ResourceActivated` write so activation and broadcast share one re-sync key.

### Changes Required
**File**: `src/lib/sessions.ts`
- New `BuildResourceUrlChangeInput = { sessionId, actor: { id, role }, url, activeResourceId, version?: string }` — `activeResourceId` is the live session's active resource id (from the component's live query), present iff a resource is active.
- New `ResourceUrlChangePlan = { sessionId, currentUrl, currentUrlVersion, meta: WriteEventMeta }`.
- `buildResourceUrlChange(input)` — validation order mirroring `buildResourceActivate` (`src/lib/sessions.ts:988-1009`):
  1. `actor?.role !== 'teacher'` → `throw new Error('broadcastResourceUrl: only a teacher may broadcast a url')`
  2. missing `actor.id` → `throw new Error('broadcastResourceUrl: an actor userId is required')`
  3. missing `sessionId` → `throw new Error('broadcastResourceUrl: a sessionId is required')`
  4. missing/blank `activeResourceId` → `throw new Error('broadcastResourceUrl: no active resource to broadcast to')`
  5. `const valid = validateResourceUrl(input.url); if (!valid.ok) throw new Error('broadcastResourceUrl: ' + valid.reason)` — reuse the seam, no inline parsing.
  - `const currentUrl = valid.url`; `const currentUrlVersion = input.version ?? generateUrlVersion()`.
  - `meta = { sessionId, actor: { id: teacherId, role: 'teacher' }, payload: { sessionId, currentUrl, currentUrlVersion } }`.
- `defaultResourceUrlChangeTxn(plan) = db.tx.sessions[plan.sessionId].update({ currentUrl: plan.currentUrl, currentUrlVersion: plan.currentUrlVersion })` (no link op — row exists).
- `broadcastResourceUrl(input, deps = {})` — thin wrapper: `const plan = buildResourceUrlChange(input); const write = deps.write ?? writeEvent; const buildTxn = deps.buildTxn ?? defaultResourceUrlChangeTxn; await write('ResourceUrlChanged', plan.meta, [buildTxn(plan)]); return plan`.
- **Activation stamping**: in `buildResourceActivate`, mint `const currentUrlVersion = input.version ?? generateUrlVersion()`, add `version?: string` to `BuildResourceActivateInput`, add `currentUrlVersion` to `ResourceActivatePlan`, the envelope `payload`, and `defaultResourceActivateTxn`'s `update` (`src/lib/sessions.ts:962-1015`).

### Success Criteria
- [ ] `npm test` green: builder happy path (full `toEqual` on plan + envelope, payload `{ sessionId, currentUrl, currentUrlVersion }`, version from injected mint distinct from a second call); each rejection leg throws before any plan (non-teacher, missing `actor.id`, missing `sessionId`, absent `activeResourceId`, and each `validateResourceUrl` rejection: `blank`/`unsafe_scheme`/`unparseable`).
- [ ] Wrapper tested with injected `write`/`buildTxn` stubs: asserts `type === 'ResourceUrlChanged'`, exactly one txn, "no write on builder rejection", and rejection propagates.
- [ ] `defaultResourceUrlChangeTxn` `__ops` asserts the keyed `update` of `currentUrl`+`currentUrlVersion` and absence of a `link` op.
- [ ] Updated activation tests still green with the new `currentUrlVersion` field.
- [ ] Failure paths behave as designed (throws before write; rejection propagates, never swallowed).

---

## Task 3: `applyEvent('ResourceUrlChanged', …)` fold + activation fold stamping

### Overview
Fold the new event type so `rebuildSessionProjection` stays whole and reproduces the latest `currentUrl`/`currentUrlVersion`; stamp `currentUrlVersion` in the `ResourceActivated` fold.

### Changes Required
**File**: `src/lib/db.ts`
- New `case 'ResourceUrlChanged':` modeled on `ResourceActivated` (`src/lib/db.ts:494-523`): read `p = event.payload as { sessionId?, currentUrl?, currentUrlVersion? }`; type-guard each (`typeof … === 'string' ? … : undefined`); `prev ? { ...prev, currentUrl, currentUrlVersion } : { id: p.sessionId ?? projection.sessionId, title: '', status: '', teacherId: '', currentUrl, currentUrlVersion }`. Tolerant of an absent prior session; never mutates input.
- Extend the `ResourceActivated` case payload type and both branches to also set `currentUrlVersion` from the payload.

### Success Criteria
- [ ] `npm test` green: `applyEvent('ResourceUrlChanged', …)` sets `currentUrl`/`currentUrlVersion`; tolerates an absent prior session; re-fold idempotent; no input mutation; known-type (no `UnknownEventTypeError`).
- [ ] `rebuildSessionProjection` over `[ResourceActivated, ResourceUrlChanged, ResourceUrlChanged]` (ordered and shuffled) reproduces the latest `currentUrl`/`currentUrlVersion`.
- [ ] Existing `ResourceActivated` fold tests updated in place for `currentUrlVersion` and still green.
- [ ] N/A — pure; failure surface is the removed `UnknownEventTypeError` for this type.

---

## Task 4: Version-keyed `ResourcePane` + thread the prop through both call sites

### Overview
Key the iframe on `currentUrlVersion` so every broadcast remounts the frame and re-snaps locally-navigated students; pass the new prop from both hosts.

### Changes Required
**File**: `src/components/ResourcePane.tsx`
- Add `currentUrlVersion?: string | null` to the props (`src/components/ResourcePane.tsx:13-19`).
- On the iframe (`src/components/ResourcePane.tsx:32-40`) add `key={currentUrlVersion ?? url}` so a fresh token forces a remount (identical URL re-broadcast still remounts; pre-0017 rows fall back to `url`).

**File**: `src/components/SessionLifecycle.tsx`
- Pass `currentUrlVersion={session.currentUrlVersion}` to the pane mount (`src/components/SessionLifecycle.tsx:379-382`).

**File**: `src/components/StudentSession.tsx`
- Pass `currentUrlVersion={session.currentUrlVersion}` to the pane mount (`src/components/StudentSession.tsx:83-86`).

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] e2e (Task 6) confirms the iframe remounts on each broadcast.
- [ ] N/A — pure render; no failure surface (blocked embed deferred, does not crash).

---

## Task 5: Teacher broadcast control in `SessionLifecycle`

### Overview
Add a current-URL field + Broadcast action inside the "Active resource" card, enabled only with an active resource, validating through `validateResourceUrl` before any write, surfacing rejections inline.

### Changes Required
**File**: `src/components/SessionLifecycle.tsx`
- State: `const [broadcastUrl, setBroadcastUrl] = useState('')`, `const [broadcastError, setBroadcastError] = useState<string | null>(null)`, `const [broadcastPending, setBroadcastPending] = useState(false)`.
- Handler `broadcast()` mirroring `addResource`/`activate` (`src/components/SessionLifecycle.tsx:125-199`): clear error; require `user?.id`; gate `validateResourceUrl(broadcastUrl)` BEFORE any write, mapping `unsafe_scheme`/`blank`/`unparseable` to the same inline copy used by `addResource` and `console.error('[SessionLifecycle] broadcast rejected:', valid.reason)`; set pending latch; `try` call `broadcastResourceUrl({ sessionId, url: broadcastUrl, actor: { id: user.id, role: 'teacher' }, activeResourceId: session.activeResourceId })`; on success clear `broadcastUrl`; `catch` → `setBroadcastError(message)` + `console.error('[SessionLifecycle] broadcast failed:', err)`, retain input; `finally` clear pending.
- Render a `broadcast-url-control` block inside the "Active resource" `Card`, above `ResourcePane` (`src/components/SessionLifecycle.tsx:377-383`): `broadcast-url-input` (URL field), `broadcast-url-submit` button (label "Broadcast", `disabled={!session.activeResourceId || broadcastPending}`), and a conditional `broadcast-url-error` `<p role="alert">`. Input is `disabled={!session.activeResourceId}` so the control is non-actionable with no active resource.

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Control renders disabled when `session.activeResourceId` is absent and enabled when present.
- [ ] e2e (Task 6) exercises a successful broadcast and the failure leg.
- [ ] Failure paths: not-signed-in / invalid-URL / wrapper-rejection each surface inline (`role="alert"`) + `console.error`, retain input, no crash; double-submit suppressed by `broadcastPending`.

---

## Task 6: E2E spec + documentation

### Overview
Add `e2e/broadcast-resource-url.spec.ts` (the cross-context teacher/student/late-joiner/observability/failure scenario) and the required doc updates.

### Changes Required
**File**: `e2e/broadcast-resource-url.spec.ts` — modeled on `e2e/activate-resource.spec.ts:1-40`; `test.skip(!adminAvailable(), …)` skips loudly without `INSTANT_ADMIN_TOKEN`; helpers `signInViaUi`/`freshEmail`/`queryAdmin`/`adminAvailable` from `e2e/support/auth.ts`; waits target explicit testids (never `networkidle`). Teacher (A) activates a resource then broadcasts a slide-3 route via `broadcast-url-input`/`broadcast-url-submit`; students (B, C) iframes (`resource-pane-frame`) show slide-3; B navigates its iframe locally to slide-5; teacher broadcasts slide-4; assert B and C iframes both on slide-4 (version-keyed remount); late context D joins mid-session and lands on the current broadcast URL; admin observability asserts one `ResourceUrlChanged` event + updated `sessions` projection (`currentUrl`/`currentUrlVersion`) per broadcast; failure leg (non-teacher lacks the control / blank-URL) asserts no event written and `currentUrl`/`currentUrlVersion` unchanged.

**Files**: `AGENTS.md` (cycle-0017 Data Layer entry alongside `AGENTS.md:51`: the `ResourceUrlChanged` event, the `broadcastResourceUrl`/`buildResourceUrlChange` path reusing `validateResourceUrl`, the additive `sessions.currentUrlVersion`, the fold, the version-keyed `ResourcePane` re-sync, activation now also stamping `currentUrlVersion`, the new testids, and that `npx instant-cli push schema` is required while **no** `perms:push` is needed), `README.md` (teachers advance the broadcast URL; students follow live and re-sync), `release-notes.md` (user-facing change + the `currentUrlVersion` schema field requiring a schema push).

### Success Criteria
- [ ] `npm run test:e2e` green where `INSTANT_ADMIN_TOKEN` is set; skips loudly otherwise.
- [ ] Re-sync, late-joiner, observability, and failure legs all asserted in-browser.
- [ ] Docs updated; cycle is "done" only with them.
- [ ] Failure-path coverage: failure leg asserts no event + unchanged projection.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] A teacher with an active resource broadcasts a new URL and both the teacher view and every connected student view reload the ResourcePane iframe to that URL within the same session, with no reload of the page (user-observable benefit).` | Task 2, 4, 5, 6 | Write path + version-keyed pane + control; verified in e2e. |
| `[ ] Broadcasting appends exactly one ResourceUrlChanged event and sets sessions[id].currentUrl + a new currentUrlVersion (admin-observable: one event with a matching payload, projection row updated) in one transaction.` | Task 2, 6 | Atomic dual-write; admin observability asserted in e2e. |
| `[ ] **Re-sync**: after a student navigates locally inside their iframe, the next teacher broadcast re-syncs that student to the teacher's URL — including when the broadcast URL equals the student's locally-navigated URL (the version-keyed iframe remounts).` | Task 1, 2, 4, 6 | Fresh `currentUrlVersion` per broadcast keys the iframe; e2e B-navigates-then-rebroadcast leg. |
| `[ ] A context that joins/loads after one or more broadcasts immediately shows the current broadcast URL, not the resource's original URL.` | Task 4, 6 | Late-joiner hydrates from the session row; e2e context D. |
| `[ ] **Failure path**: attempting a broadcast as a non-teacher actor, with no active resource, or with a blank/unsafe/unparseable URL throws in buildResourceUrlChange (or is gated by validateResourceUrl/a disabled control), writes no event, and leaves currentUrl/currentUrlVersion unchanged; the teacher UI shows an inline alert and logs to console rather than crashing.` | Task 2, 5, 6 | Builder rejection legs + disabled control + inline alert; e2e failure leg. |
| `[ ] applyEvent folds ResourceUrlChanged without raising UnknownEventTypeError, and rebuildSessionProjection over a log containing activation followed by broadcasts reproduces the latest currentUrl/currentUrlVersion.` | Task 3 | New fold case + rebuild test over `[ResourceActivated, ResourceUrlChanged, ResourceUrlChanged]`. |
| `[ ] All existing tests still pass.` | Task 2, 3 | Activation unit/fold fixtures updated in place for the additive `currentUrlVersion`; full suite green. |
| `[ ] No compiler/linter warnings introduced (npm run astro check clean).` | Task 1, 4, 5 | `astro check` is a success gate on every typed task. |

---

## Testing Strategy

### Unit Tests
- **`buildResourceUrlChange`** (`src/lib/sessions.test.ts`, mirroring `1252-1411`): happy path full `toEqual` on plan + envelope, payload `{ sessionId, currentUrl, currentUrlVersion }`; injected `version` deterministic and a second build with the default mint yields a distinct token; rejection legs (`.toThrow(/regex/)`): non-teacher role, missing `actor.id`, missing `sessionId`, absent `activeResourceId`, and each `validateResourceUrl` rejection (`blank`, `unsafe_scheme`, `unparseable`) — each before any plan.
- **`generateUrlVersion`**: returns the injected mint's value (deterministic stub).
- **Wrapper `broadcastResourceUrl`**: injected `write`/`buildTxn` stubs assert `type === 'ResourceUrlChanged'`, one txn; "no write on builder rejection"; rejection propagates (not swallowed).
- **`defaultResourceUrlChangeTxn`**: `__ops` asserts keyed `sessions[id].update` of `currentUrl`+`currentUrlVersion`, no `link` op.
- **Fold** (`src/lib/db.test.ts`, mirroring `174-193`, `445-503`): new `resourceUrlChanged` fixtures; `applyEvent` sets fields, tolerates absent session, re-fold idempotent, no input mutation, known-type; `rebuildSessionProjection` over `[ResourceActivated, ResourceUrlChanged, ResourceUrlChanged]` ordered + shuffled reproduces latest URL+version.
- **Failure-path tests**: every rejection leg above is an explicit "throws before any write" assertion; the wrapper's rejection-propagation test exercises a rejecting `writeEvent`.
- **Updated-in-place**: activation builder/fold fixtures gain `currentUrlVersion` and stay green.
- **Mocking strategy**: real `validateResourceUrl`, real builders/folds; only `write`/`buildTxn`/`mint`/`version` are injected (the existing seam pattern) — no network, no heavy mocking.

### Integration / E2E Tests
- `e2e/broadcast-resource-url.spec.ts` (Task 6): multi-context teacher A + students B/C, B local-nav then re-broadcast re-sync, late-joiner D, admin observability of one `ResourceUrlChanged` + updated projection per broadcast, and the failure leg (non-teacher lacks the control / blank-URL writes nothing, projection unchanged). Skips loudly without `INSTANT_ADMIN_TOKEN`; explicit testid waits, never `networkidle`.

## Walkthrough Plan
- **Flow**: drive the teacher facilitation view `/dashboard/sessions/[id]` and the student view: sign in as a teacher, open a live session with a queued resource, **activate** it, then **broadcast** a new slide URL via `broadcast-url-input` + `broadcast-url-submit`; a second (student) browser context joined to the same session shows its `resource-pane-frame` snapping to the broadcast URL. The subject is the session facilitation + student session routes — never the home page.
- **Capture points** (ordered, named):
  - `01-teacher-session-live` — the teacher facilitation view with the active resource pane rendered.
  - `02-broadcast-control` — the `broadcast-url-control` with a slide URL typed into `broadcast-url-input`.
  - `03-teacher-after-broadcast` — the teacher's `resource-pane-frame` pointed at the broadcast URL after submit.
  - `04-student-followed` — the student context's `resource-pane-frame` snapped to the same broadcast URL (re-sync, no page reload).
  - `05-late-joiner` — a freshly joined student context landing directly on the current broadcast URL.
- **Preconditions / test data**: magic-code auth via the deterministic/test sign-in helper (`signInViaUi`/`freshEmail`, never a real inbox); a seeded live session owned by the teacher with at least one queued resource; an activated resource before broadcasting; two slide-route URLs (e.g. `…/3`, `…/4`) that render in an iframe; realtime assertions wait on explicit testid elements (`resource-pane-frame`, `broadcast-url-submit`), not `networkidle` (InstantDB keeps the socket busy).
- **If no observable UI this cycle**: N/A — this cycle ships observable UI (the broadcast control and the version-keyed re-sync), so the walkthrough exercises real routes and must not degrade to the home-page fallback.

## Risk Assessment
- **Activation payload/fold change breaks existing fixtures**: update activation unit + fold fixtures in place for the additive `currentUrlVersion`; run the full Vitest suite before e2e.
- **Iframe `key` churn unmounts on unrelated re-renders**: key is `currentUrlVersion ?? url` — derived only from persisted session fields, so it changes only on activation/broadcast, not on incidental host re-renders.
- **Pre-0017 session rows lack `currentUrlVersion`**: the `?? url` fallback keeps them rendering; the fold tolerates absent fields (type-guarded `undefined`).
- **Schema not pushed before feature use**: additive `sessions.currentUrlVersion` requires `npx instant-cli push schema`; called out in `AGENTS.md`/`release-notes.md`; no `perms:push` (inherits the owner-only rule).
- **E2E cross-origin iframe URL assertions are flaky**: assert on the iframe's `src`/`data-*` attribute (Blended-owned state) and remount, not on cross-origin internal DOM, with explicit testid waits.
