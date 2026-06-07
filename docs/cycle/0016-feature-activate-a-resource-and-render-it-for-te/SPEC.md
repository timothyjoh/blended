# SPEC — Cycle 0016: Activate a Resource and Render It for Teacher + Students

## WHY
A teacher can already queue lesson resources (cycle 0015), but a queued resource is inert — it sits in a list and nobody can be directed to look at it. There is no way for a teacher to say "everyone, look at this now," and no surface where students see the artifact the teacher chose. The session's `activeResourceId` field exists on the schema but is never written and never rendered. Today the core promise of Blended — "students see what the teacher controls" — does not function: the resource and the audience are disconnected.

## CONCRETE USER BENEFIT
A teacher, mid-session, clicks **Activate** on a queued resource and every student's screen immediately shows that resource in an embedded pane — no reload, no shared link to paste. When the teacher activates a different resource, every student's pane switches in realtime. A student who joins after activation lands directly on the currently-active resource. This is the first time a teacher action visibly drives what students see.

## USABLE END-STATE
On the teacher facilitation view (`/dashboard/sessions/[id]`), each queued resource row has an **Activate** control. Clicking it marks that resource active for the session. Both the teacher's own view and every student session view (`/s/[joinCode]`) render the active resource's URL inside a controlled iframe pane. Switching the active resource updates all connected views live. Before any resource is activated, the pane shows an explicit "no active resource yet" state rather than a blank region. A late-joining student immediately sees the current active resource.

## Objective
This cycle delivers the activation vertical slice: a sanctioned teacher-only write path that appends a `ResourceActivated` event and sets the session's `activeResourceId` and derived `currentUrl` in one transaction, plus a shared realtime iframe pane — mounted in both the teacher facilitation view and the student session view — that renders the active resource and switches live as activation changes. It connects the queued-resource list (cycle 0015) to the student audience (cycle 0007), making teacher control observable end-to-end for the first time.

## Source Issue
`txt-20260606-213635-activate-resource-render-embed` — "Activate a resource and render it for teacher + students"

## Scope

### In Scope
- **Activation write path**: `activateResource` / `buildResourceActivate` in `src/lib/sessions.ts` (the sole sanctioned activation path) routing a dual-write through `writeEvent('ResourceActivated', …)` that sets `sessions[id].activeResourceId` + `currentUrl` (derived from the resource's URL) in one transaction; the additive `sessions.currentUrl` schema field; and the `applyEvent('ResourceActivated', …)` fold so replay stays whole.
- **Teacher activate control**: an Activate button on each queued resource row in `SessionLifecycle` (`src/components/SessionLifecycle.tsx`), with the currently-active resource visibly indicated.
- **Shared realtime resource pane**: a single `ResourcePane` component rendering the session's active resource in a controlled iframe, mounted in both `SessionLifecycle` (teacher) and `StudentSession` (student), updating live via `db.useQuery` over the session row.

### Out of Scope
- Teacher-driven URL stepping / "next" navigation within an active resource (next issue).
- Blocked-embed fallback for resources that refuse to render in an iframe (`embedMode`/`embedStatus` checking — separate issue). This cycle renders the URL directly; `embedMode` stays `'blocked'` as queued and is not consulted yet.
- Resource reordering / de-activation / clearing the active resource.
- Any permission-rule change — `activeResourceId`/`currentUrl` inherit the existing `sessions` owner-only-write rule (cycle 0003).

## Requirements
- **Single sanctioned path**: activation MUST route through `activateResource` → `writeEvent('ResourceActivated', …)`. No product code path writes `sessions[id].update({ activeResourceId | currentUrl })` outside this helper (ADR-0001/ADR-0003 dual-write invariant).
- **Pure, total builder**: `buildResourceActivate` validates input before producing any txn/envelope — requires `actor.role: 'teacher'`, present actor `userId`, present `sessionId`, present `resourceId`, and a resource that belongs to the session and carries a non-blank URL. It derives `currentUrl` from the resource URL and sets the envelope `actor.role: 'teacher'`. It produces no plan on invalid input (throws before any write).
- **Atomic dual-write**: the `ResourceActivated` envelope and the `sessions` projection update commit in one `db.transact()`; a rejected write leaves no partial state (no orphan event, unchanged `activeResourceId`).
- **Ownership in depth**: the write is admitted only for the owning teacher — enforced by the builder's role/actor check AND the existing data-layer `sessions` owner-only-write rule (`auth.id == data.teacherId`). No perms change.
- **Replay-safe fold**: `applyEvent` folds `ResourceActivated` (sets the projection session's `activeResourceId`/`currentUrl`, tolerant of an absent prior session, keyed defensively) so the type never raises `UnknownEventTypeError` and `rebuildSessionProjection` stays whole. `SessionProjection.session` gains `activeResourceId?`/`currentUrl?`.
- **Shared render surface**: `ResourcePane` is the single component both views use; the active resource is resolved from the live session row (`activeResourceId` → matching `sessionResources` row, or `currentUrl`). The iframe is controlled (no `allow-same-origin`+`allow-scripts` escalation beyond what embedding requires; render the URL in a sandboxed iframe).
- **Realtime, not polling**: activation changes propagate to all connected teacher/student views via existing `db.useQuery` subscriptions with no reload.
- **No email rendering**: the pane and activation surfaces render resource/session fields only — never email (privacy stays structural).
- **Failure behavior**: On invalid input (non-teacher actor, missing session/resource id, resource not in the session, blank/missing URL), `buildResourceActivate` throws before any write and the session's `activeResourceId`/`currentUrl` stay unchanged; the teacher UI surfaces the failure inline (`role="alert"`) + `console.error('[SessionLifecycle] …')`, never swallowed. On a rejected `db.transact()` (permission denial / network), the rejection propagates to the caller and is surfaced inline; no projection row is partially updated. When no resource is active, both panes render an explicit empty state, never a blank region. A resource whose URL fails to load in the iframe is a deferred concern (blocked-embed fallback is out of scope) — the pane still renders the iframe pointed at `currentUrl` and does not crash.

## Acceptance Criteria
- [ ] A teacher activates a queued resource and both the teacher view and every connected student view render that resource in an iframe pane within the same session, with no reload (user-observable benefit).
- [ ] Activating a resource appends exactly one `ResourceActivated` event and sets `sessions[id].activeResourceId` + `currentUrl` (admin-observable: one event with a matching payload, projection row updated) in one transaction.
- [ ] Switching the active resource (activate R1, then R2) switches every connected student pane from R1 to R2 in realtime.
- [ ] A context that joins/loads after activation immediately shows the current active resource (no prior activation event observed by that client needed).
- [ ] **Failure path**: attempting activation as a non-teacher actor (or with a missing/foreign resource id) throws in `buildResourceActivate`, writes no event, and leaves `activeResourceId`/`currentUrl` unchanged; the teacher UI shows an inline alert and logs to console rather than crashing.
- [ ] **Failure path**: when no resource has been activated, both teacher and student panes render an explicit "no active resource" element (testable), not a blank region.
- [ ] `applyEvent` folds `ResourceActivated` without raising `UnknownEventTypeError`, and `rebuildSessionProjection` over a log containing it reproduces the active-resource state.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run astro check` clean).

## Testing Strategy
- **Vitest** (pure logic, beside the module as `*.test.ts`): `buildResourceActivate` happy path (teacher activating an in-session resource produces the expected record/envelope + derived `currentUrl`), and each rejection leg (non-teacher role, missing `sessionId`, missing `resourceId`, foreign/blank URL) throwing before any plan. `applyEvent('ResourceActivated', …)` fold: sets `activeResourceId`/`currentUrl`, tolerates an absent prior session, and `rebuildSessionProjection` reproduces state from an ordered log.
- **Playwright** (`e2e/activate-resource.spec.ts`, skips loudly without `INSTANT_ADMIN_TOKEN`): Teacher (context A) activates R1; Students (contexts B, C) show R1 with no reload; Teacher activates R2 and asserts B and C both switch to R2; a late-joining context D immediately shows the current active resource; admin observability asserts one `ResourceActivated` event + the updated `sessions` projection per activation; the non-teacher / unchanged-state failure leg asserts no event written and `activeResourceId` unchanged.
- E2E coverage is required because this cycle ships observable UI (`src/components/`) — the iframe pane and activate control must be exercised in-browser across contexts.

## Documentation Updates
- **AGENTS.md**: add a cycle-0016 entry under the Data Layer / cycle notes — the new `ResourceActivated` event, the sanctioned `activateResource`/`buildResourceActivate` path, the additive `sessions.currentUrl` field, the `applyEvent` fold, the shared `ResourcePane`, the fixed testids, and that a `npx instant-cli push schema` is required (additive `currentUrl`) while **no** `perms:push` is needed (inherits the `sessions` owner-only rule).
- **README.md**: note that teachers can now activate a queued resource and that students see the active resource render live.
- **release-notes.md**: surface the user-facing change and the new `currentUrl` schema field requiring a schema push.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- The started-session lifecycle (`startSession`/`endSession`, cycle 0006), the queued-resource list + `sessionResources` projection (`queueResource`, cycle 0015), and participant join (`joinSession`, cycle 0007) — all prerequisites; activation operates on a queued resource within a live session that participants have joined.
- The `writeEvent` dual-write helper and `applyEvent`/`rebuildSessionProjection` fold (`src/lib/db.ts`), and the existing `sessions` owner-only-write permission rule (cycle 0003).
- `PUBLIC_INSTANTDB_APP_ID` (app), `INSTANT_ADMIN_TOKEN` (e2e observability only). Requires `npx instant-cli push schema` for the additive `sessions.currentUrl` field before the feature works against the schema-enforced live app.
