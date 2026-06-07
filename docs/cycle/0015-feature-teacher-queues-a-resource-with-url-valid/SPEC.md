# SPEC — Cycle 0015: Teacher Queues a Resource (with URL Validation)

## WHY

A Session today has a lifecycle, a roster, a chat stream, and a Question queue — but no lesson content. The `sessionResources` projection, its `session` ownership link, and its owner-only-write permission rules already exist in the schema (cycle 0003), yet **nothing in the product can create a resource row**. A Teacher running a live session has no way to put a URL in front of students. Without a queued Resource there is nothing to later activate, broadcast, or embed, so the entire Resource half of the platform is currently dead schema. This cycle lights the first end of it: a Teacher adds a lesson Resource (URL + title + type) to a Session's queue, with the URL validated so an unsafe scheme (`javascript:`, `data:`, etc.) can never be stored or later rendered (SPEC §16.3/16.4).

## CONCRETE USER BENEFIT

A Teacher, on their session facilitation page, can type a URL and title, pick a resource type, click **Add**, and **see that resource appear in the session's queue** — and if they paste a `javascript:` (or other unsafe-scheme) URL, they get a clear inline rejection and nothing is added. Before this cycle the queue did not exist as a product surface at all.

## USABLE END-STATE

On `/dashboard/sessions/[id]`, below the existing lifecycle/question controls, the Teacher sees an **add-resource control** (URL, title, type selector, Add button) and a **live queue list** of the resources already queued for that session, ordered by `sortOrder`. Adding a valid resource inserts it at the end of the queue and it appears in realtime (no reload). Adding an unsafe-scheme or malformed URL surfaces an inline error and writes nothing. Each successful add appends a `ResourceQueued` event in the same transaction as the projection row, so the queue is replayable evidence.

## Objective

Deliver the first vertical slice of the Resource feature: a pure, total URL-validation seam plus a `queueResource` dual-write path that appends a `ResourceQueued` event and its `sessionResources` projection row in one `writeEvent` transaction, surfaced through a teacher-facing add-resource control on the existing session detail page. New resources are appended to the end of the queue via a computed `sortOrder`. Reorder, remove, activation, and embed-checking are explicitly deferred to sibling cycles.

## Source Issue

`txt-20260606-213633-queue-a-resource` — "Teacher queues a resource (with URL validation)"

## Scope

### In Scope

- A pure, total URL-validation seam in `src/lib/` (e.g. `validateResourceUrl(url) -> { ok: true, url } | { ok: false, reason }`): accepts `http`/`https` absolute URLs, rejects unsafe schemes (`javascript:`, `data:`, `vbscript:`, `file:`, etc.), blank/whitespace, and unparseable input — never throws. Covered by unit tests.
- `buildResourceQueue` (pure builder) + `queueResource` (dual-write wrapper) in `src/lib/sessions.ts`, mirroring the existing `buildSessionCreate`/`createSession` split: routes through `writeEvent('ResourceQueued', …)` so the envelope (`actor.role: 'teacher'`) and the `sessionResources` projection row commit in one transaction, sets the `session` ownership link and denormalized `teacherId`, computes `sortOrder` to place the row at the end of the existing queue, and defaults the deferred-feature fields (`embedStatus: 'unchecked'`, a safe `embedMode` default, no `activatedAt`). `applyEvent` folds `ResourceQueued` so the type never raises `UnknownEventTypeError`.
- A teacher-facing add-resource control + live queue list mounted inside `SessionLifecycle` (`src/components/SessionLifecycle.tsx`) on `/dashboard/sessions/[id]`: a single owner-scoped `db.useQuery` over `sessionResources` by `sessionId`, ordered by `sortOrder` (tie-broken by id), an input form (url + title + type), and inline error/empty/loading states.

### Out of Scope

- Reorder and remove of queued resources (`ResourceReordered`, `ResourceRemoved`) — sibling issue `txt-20260606-213634-reorder-remove-resources`.
- Activating a resource (`ResourceActivated`, `activeResourceId`, broadcast current URL) — separate issue.
- Embed-mode/embeddability checking (`ResourceEmbedChecked`, `embedStatus` beyond the `unchecked` default) — separate issue.
- Title inference from the URL — Teacher supplies the title this cycle.
- Any schema change or permission-rule change: the `sessionResources` entity, its `session` link, and its owner-only-write rules already exist (cycle 0003), so there is **no `instant-cli push schema` and no `perms:push` this cycle**.

## Requirements

- **URL validation is a single pure seam.** No inline scheme/`URL` parsing exists in the builder, the wrapper, the component, or the fold — the validation decision lives in exactly one exported, total function, so a future allowlist/SSRF tightening touches only its body. It accepts `http`/`https` absolute URLs and rejects everything else (unsafe schemes, relative/bare input, blank/whitespace, unparseable strings) with a machine-distinguishable reason.
- **Dual-write atomicity.** `queueResource` is the sole sanctioned resource-create path; no projection-only `sessionResources` write exists in product code. The `ResourceQueued` envelope and the projection row commit in one `db.transact()` via `writeEvent` — a rejected create leaves no partial row and no orphan event.
- **Ownership in depth.** The created row sets both the denormalized `teacherId` (= the owning teacher's auth id) and the `session` link to the parent session, so the existing `data.ref('session.teacherId')` permission rule admits the write only for the real owner. The builder validates `actor.role: 'teacher'` and a present `sessionId`/`teacherId`/`actorId` before producing any txn.
- **End-of-queue ordering.** A new resource receives a `sortOrder` strictly greater than every existing queued resource's `sortOrder` for that session (computed from the live queue: `max(existing.sortOrder) + 1`, or a base value for an empty queue), so it renders last. The ordering is also stable under a tie (tie-broken by id), consistent with the chat/question stream ordering.
- **Realtime, read-only queue render.** The queue list is a live query (not polling); a resource added in another context appears with no reload. Rows show url/title/type/order only.
- **Failure behavior**: On an unsafe-scheme or unparseable URL, `queueResource` (and the form before it) rejects **before any write** and surfaces the reason inline (`role="alert"`) + `console.error('[SessionLifecycle] …')`; nothing is written. On a blank title or missing `sessionId`/`teacherId`, the pure builder throws before producing a txn (totally validated input, mirroring `buildSessionCreate`). On a rejected `writeEvent` transaction (permission denial, network), the rejection propagates to the caller and is surfaced inline — never swallowed; the form retains the entered values for retry. A live-query error renders an inline alert (checked before the empty state, so an errored query never reads as falsely-empty), never a blank region. The deferred `sortOrder` race (two simultaneous adds resolving the same `max+1`) is non-blocking: rows remain deterministically ordered by the id tie-break, and true reorder is the sibling cycle's concern.

## Acceptance Criteria

- [ ] On `/dashboard/sessions/[id]`, the owning Teacher can enter a valid `https://` URL + title + type, submit, and **see the resource appear in the session's queue ordered by `sortOrder`** without a reload. *(user-observable benefit)*
- [ ] A second resource added to a non-empty queue receives a `sortOrder` strictly greater than the existing rows' and renders last.
- [ ] A successful add appends exactly one `ResourceQueued` event whose `sessionId`/`payload` match the new row, written in the same transaction as the `sessionResources` projection row (verified via an admin read in e2e).
- [ ] **Failure path:** submitting a `javascript:` URL (and at least one other unsafe scheme, e.g. `data:`) is rejected with a clear inline error, and **no `sessionResources` row and no `ResourceQueued` event are written** (verified via an admin read showing the queue/event counts unchanged).
- [ ] `validateResourceUrl` unit tests cover: accepted `http`/`https`; rejected `javascript:`, `data:`, `vbscript:`, `file:`; rejected blank/whitespace; rejected unparseable/relative input — and the function never throws on any input.
- [ ] `applyEvent` folds `ResourceQueued` into the `sessionResources` projection and does **not** raise `UnknownEventTypeError`; `rebuildSessionProjection` over a log containing a `ResourceQueued` event reproduces the queued row.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).
- [ ] `npm run astro check` reports no new errors; no compiler/linter warnings introduced.

## Testing Strategy

- **Vitest** (pure logic): `validateResourceUrl` (the full accept/reject table above, total-on-all-input); `buildResourceQueue` (validates `actor.role: 'teacher'`, present `sessionId`/`teacherId`/`actorId`, non-blank title, rejected URL → throws before any txn; sets the `session` link + `teacherId`; `sortOrder` = end-of-queue from injected current-max; deferred-field defaults); the `applyEvent` `ResourceQueued` fold and a `rebuildSessionProjection` round-trip.
- **Playwright** (`e2e/queue-resource.spec.ts`, skips loudly without admin env, mirroring existing suites): (1) **happy path** — owning teacher adds a valid resource, asserts it appears in the queue list and an admin read finds one new `sessionResources` row + one `ResourceQueued` event linked to the session; (2) **failure path** — teacher submits a `javascript:` URL, asserts the inline rejection and that an admin read shows the resource/event counts unchanged; (3) **realtime** — a resource queued in a second context appears in the first without reload (optional if (1) already proves the live query).
- **E2E is required** because this cycle ships observable UI (`src/components/SessionLifecycle.tsx`); the walkthrough/degradation sidecar applies.
- Key scenarios: happy path, unsafe-scheme rejection (no write), malformed/blank input, live-query error render, empty-queue state, end-of-queue ordering.

## Documentation Updates

- **AGENTS.md**: add a "Teacher queues a resource (cycle 0015)" note under the Data Layer section, documenting `validateResourceUrl` as the single URL-validation seam, `buildResourceQueue`/`queueResource` as the sole sanctioned resource-create path (dual-write via `writeEvent('ResourceQueued', …)`, sets the `session` link + `teacherId`, end-of-queue `sortOrder`, `embedStatus: 'unchecked'` default), the `applyEvent` `ResourceQueued` fold, the fixed testids introduced, and that **no schema/perms push** is required this cycle (entity + rules predate it).
- **README.md**: surface that a Teacher can now queue lesson resources (URL + title + type) on a session, with unsafe URLs rejected — if README enumerates user-facing capabilities.
- **release-notes.md**: note the new teacher add-resource capability and URL-scheme rejection.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- `txt-20260606-213628-create-session-draft` (a Session must exist to own the queue) — satisfied: `createSession` and the session detail page exist (cycles 0005/0006).
- Existing schema/links/rules: the `sessionResources` entity and its fields (`url`, `title`, `type`, `sortOrder`, `embedMode`, `embedStatus`, `createdAt`, `teacherId`, `activatedAt`), the `sessionResourceSession` link, and the owner-only-write permission rule — all present (cycle 0003).
- `writeEvent` dual-write helper and `applyEvent` fold conventions (`src/lib/db.ts`); the `buildSessionCreate`/`createSession` pure-core split pattern (`src/lib/sessions.ts`); `SessionLifecycle` host island + `SessionRouteGuard` ownership gate (cycle 0006).
- `PUBLIC_INSTANTDB_APP_ID` (app); `INSTANT_ADMIN_TOKEN` (e2e admin reads only).
