# Research: Cycle 0015

## Cycle Context

SPEC.md asks for the first vertical slice of the Resource feature: a Teacher, on the existing session facilitation page (`/dashboard/sessions/[id]`), can enter a URL + title + type and click **Add** to append a lesson resource to a Session's queue, with the URL validated so unsafe schemes (`javascript:`, `data:`, `vbscript:`, `file:`, etc.) are rejected and nothing is written. Three deliverables: (1) a pure, total `validateResourceUrl` seam in `src/lib/`; (2) `buildResourceQueue` (pure builder) + `queueResource` (dual-write wrapper) in `src/lib/sessions.ts` that route through `writeEvent('ResourceQueued', …)` so a `ResourceQueued` envelope and a `sessionResources` projection row commit in one transaction, sets the `session` ownership link + denormalized `teacherId`, computes an end-of-queue `sortOrder`, and defaults deferred fields (`embedStatus: 'unchecked'`, a safe `embedMode`, no `activatedAt`); plus an `applyEvent` fold for `ResourceQueued`. (3) A teacher-facing add-resource control + live queue list mounted inside `SessionLifecycle`. **No schema or permission-rule change** — the `sessionResources` entity, its `session` link, and its owner-only-write rule already exist (cycle 0003).

## Current Codebase State

### Relevant Components

- **`sessionResources` entity (schema, already present)** — fields `sessionId` (indexed), `teacherId` (indexed, denormalized owner), `url`, `title`, `type`, `sortOrder`, `embedMode`, `embedStatus`, `createdAt`, `activatedAt` (optional) — `src/lib/db.ts:60-80`. The comment block (`src/lib/db.ts:60-79`) states resource creators MUST set both the `teacherId` field AND the `session` link.
- **`sessionResourceSession` link (already present)** — forward `session` (`sessionResources` has one) / reverse `resources` (`sessions` has many) — `src/lib/db.ts:141-144`. This is the link the permission rule traverses and the queue UI can use to enumerate a session's resources.
- **`SessionResource` exported type** — `InstaQLEntity<typeof schema, 'sessionResources'>` — `src/lib/db.ts:206`.
- **`sessionResources` permission rule (already present, owner-only write)** — `bind: ['isSessionOwner', "auth.id in data.ref('session.teacherId')", 'isAdmin', 'false']`; `allow: { view: 'true', create: 'isSessionOwner || isAdmin', update/delete same }` — `src/lib/perms.ts:72-91`. Ownership is checked against the LINKED parent session, not the client-supplied `teacherId` scalar.
- **`writeEvent` dual-write choke point** — `src/lib/db.ts:490-528`. Appends a `sessionEvents` envelope + caller projection txns in one `db.transact()`; validates before acting; requires a non-empty `projectionTxns` array.
- **`applyEvent` fold** — `src/lib/db.ts:278-438`. A `switch (event.type)` with cases for `SessionCreated`, `SessionStarted`, `SessionEnded`, `ParticipantJoined`, `ChatMessageSubmitted`, `QuestionCreated`, `QuestionAnswered`; `default` throws `UnknownEventTypeError` (`src/lib/db.ts:431-436`). **There is no `ResourceQueued` case today — it would currently throw.**
- **`SessionProjection` type** — `src/lib/db.ts:227-247`. Has `session`, `participants`, `messages`, `questions` maps. **No `resources` map exists**; `emptyProjection` (`src/lib/db.ts:257-259`) initializes only those four.
- **`SessionLifecycle` island** — `src/components/SessionLifecycle.tsx:38-294`. The teacher facilitation island mounted on `/dashboard/sessions/[id]` inside `SessionRouteGuard`. Reads identity via `useAuth` (`src/components/SessionLifecycle.tsx:39`), the live session via `db.useQuery` (`:40`), and a second live query over `questions` (`:49`). This is where the add-resource control + live queue list must mount.
- **Detail page** — `src/pages/dashboard/sessions/[id].astro:1-23`. Passes `id` to `SessionRouteGuard` → `SessionLifecycle` as `client:only="react"` islands.

### Existing Patterns to Follow

- **Pure-core / thin-wrapper split (the canonical create pattern):** `buildSessionCreate` (pure builder, throws before producing any plan on bad input) + `createSession` (thin async wrapper routing `writeEvent('SessionCreated', …)`) — `src/lib/sessions.ts:76-135`. The same shape repeats for join (`buildParticipantJoin`/`joinSession`, `:342-427`), chat (`buildChatMessage`/`submitChatMessage`, `:481-660`), and answer (`buildQuestionAnswer`/`answerQuestion`, `:694-749`). `buildResourceQueue`/`queueResource` must mirror this.
- **`Build…Plan` return shape:** `{ record, meta: WriteEventMeta }` where `record` is the projection row and `meta.payload.id === record.id` so the event folds cleanly — `src/lib/sessions.ts:65, 97, 332, 367`.
- **`defaultBuildTxn` with `.update(...).link(...)`:** the participant create txn sets scalar columns then `.link({ session: r.sessionId })` to satisfy the forgery-proof ownership rule — `src/lib/sessions.ts:392-405`. The message txn does `.link({ session, participant })` — `:607-622`. A resource txn must `.update({...scalars}).link({ session: sessionId })`.
- **Injectable deps for unit-testing the wrapper without a network:** `deps: { write?, buildTxn? }` defaulting to `writeEvent` / a module-level `defaultBuildTxn` — `src/lib/sessions.ts:101-104, 126-135, 387-426`.
- **Injectable determinism in builders:** `sessionId?`, `now?`, `id?` params default to `id()` / `Date.now()` so unit tests pass fixed values — `src/lib/sessions.ts:56-63, 82, 89`.
- **`actor.role: 'teacher'` envelope for teacher actions** — `src/lib/sessions.ts:93-96` (create), `:210-216` (start), `:714-724` (answer). `buildQuestionAnswer` explicitly validates `input.actor.role !== 'teacher'` and throws — `src/lib/sessions.ts:699-700`.
- **Pure total validation seam precedent:** `isValidEmail` (`src/lib/auth.ts:24-29`) and `classifyMessage` (`src/lib/classify.ts`) are dependency-free, total, never-throw single-purpose functions, each the SOLE place its decision lives. `validateResourceUrl` follows this exact convention (return a tagged result, never throw). `routing.ts` already does scheme-style rejection (`safeNextPath` rejects protocol-relative input, `src/lib/routing.ts:24`).
- **Stable client-side ordering without a server index:** comparator is `createdAt` asc tie-broken by `id` — extracted as `compareSessionsForList` (`src/lib/sessions.ts:783-788`) and inlined in `SessionLifecycle`'s question sort (`src/components/SessionLifecycle.tsx:64-69`) and `StudentChat`. The queue list orders by `sortOrder` tie-broken by `id` (SPEC).
- **Failure handling:** builders throw synchronously BEFORE any write on invalid input, so nothing is written (`src/lib/sessions.ts:77-80, 202-205, 483-491, 696-704`); wrappers do not catch — the rejection propagates (`src/lib/sessions.ts:130-134`). Because append + projection share one `writeEvent` transaction, a rejected write leaves no partial state (`src/lib/db.ts:526-527`). In the UI, errors are caught in the island handler, surfaced inline via a `role="alert"` element + `console.error`, never swallowed, and the live query is left untouched on failure — `src/components/SessionLifecycle.tsx:71-139` (`surface`/`surfaceQuestion` + `run`/`markAnswered`).
- **Observability:** every product mutation appends a `sessionEvents` envelope through `writeEvent` (`src/lib/db.ts:514-524`) — the event log IS the audit trail; there is no separate metrics/logging system. UI errors go to `console.error('[SessionLifecycle] …')` (`src/components/SessionLifecycle.tsx:57-58, 74, 111`). (The repo's `.cycle/log.jsonl` is engine/cycle telemetry, not product runtime logging.)
- **Idempotency / retry-safety:** create-style paths are NOT idempotent by design — each call appends a fresh event (`src/lib/sessions.ts:116-124`). Idempotency, where needed, comes from a deterministic row id (chat: `record.id === clientActionId`, `src/lib/sessions.ts:494-499`; question: `deriveQuestionId`, `src/lib/classify.ts`) or a caller pre-check (`shouldCreateParticipant`, `:377-385`). SPEC explicitly accepts the `sortOrder` race (two simultaneous adds resolving the same `max+1`) as non-blocking — rows stay deterministically ordered by the id tie-break; true reorder is a sibling cycle.
- **Fold conventions for a new event type:** each `applyEvent` case reads `event.payload` defensively (typeof guards, fallbacks to `event.id` / `event.occurredAt` / projection defaults), returns a new projection (never mutates), and re-folds idempotently — `src/lib/db.ts:316-430` (see `QuestionCreated` at `:363-395` as the closest template for adding a keyed row to a map).

### Dependencies & Integration Points

- **`writeEvent`, `applyEvent`, `db`, `id`, `SessionProjection`, `emptyProjection`, types** — all from `src/lib/db.ts` (imported by `sessions.ts` at `src/lib/sessions.ts:1`).
- **`SessionLifecycle` ↔ `useAuth`** — identity for `actor.id`/owner check — `src/components/SessionLifecycle.tsx:3,39`.
- **`SessionLifecycle` ↔ `db.useQuery`** — live `sessionResources` read (a new third query, owner-scoped by `sessionId`, ordered by `sortOrder`) mirrors the existing `questions` query at `src/components/SessionLifecycle.tsx:49`.
- **`SessionRouteGuard`** — ownership gate wrapping the island so it hydrates only for the owning teacher — `src/pages/dashboard/sessions/[id].astro:18-19`.
- **UI primitives** — `Button`, `Card`/`CardContent`/`CardHeader`/`CardTitle` from `@/components/ui/*` — `src/components/SessionLifecycle.tsx:5-6`.
- **e2e admin seam** — `queryAdmin`, `signInViaUi`, `freshEmail`, `adminAvailable`, `mintCode` from `e2e/support/auth.ts:13-60+` (for observability assertions over `sessionResources` / `sessionEvents`).

### Test Infrastructure

- **Frameworks:** Vitest for pure logic (`npm run test` → `vitest run`, `package.json:11`); Playwright for e2e (`npm run test:e2e`, `package.json:14`); `astro check` runs as part of `build` (`package.json:7`).
- **Unit test conventions:** co-located `src/lib/*.test.ts`, `describe`/`it`/`expect` from `vitest`, importing the functions under test from the sibling module — `src/lib/sessions.test.ts:1-29`. New `validateResourceUrl`, `buildResourceQueue`, `queueResource` exports get added to this import list and tested here; the `ResourceQueued` fold + `rebuildSessionProjection` round-trip go in `src/lib/db.test.ts` (fold tests live in the `applyEvent` describe block, `src/lib/db.test.ts:138` onward; the unknown-event-throws guard is at `:336-340`).
- **e2e conventions:** specs in `e2e/`, named `<feature>.spec.ts` (SPEC names `e2e/queue-resource.spec.ts`). Each `test.describe` opens with `test.skip(!adminAvailable(), '…')` so it skips loudly without admin env — `e2e/teacher-question-queue.spec.ts:23-26`. Helpers sign in via `signInViaUi` + `freshEmail`, create a session through the UI (`new-session-open`/`-title`/`-submit` → `created-session-link`), start it, read the join code, and use multi-context teacher/student pages — `e2e/teacher-question-queue.spec.ts:31-71`. Observability assertions use `queryAdmin` over the live app. Explicit testid waits, never `networkidle`; `retries: 3` absorbs realtime flake.
- **Current coverage of the change area:** `sessionResources` has no product create path and **no test exercises queuing a resource today** — it exists only as schema + permission rule. The permission rule's forgery-proof ownership is proven structurally in `src/lib/perms.test.ts` and (referenced) end-to-end in `e2e/permissions.spec.ts`.
- **Failure-path test coverage (existing precedent to mirror):** builder rejection paths are unit-tested (blank title, missing teacherId, illegal transition, blank text, non-teacher actor) throughout `src/lib/sessions.test.ts`; `applyEvent` unknown-type throw is tested at `src/lib/db.test.ts:336-340`; e2e failure legs (blank submit, teacher exclusion, non-`?` never enqueued) appear in `e2e/teacher-question-queue.spec.ts` and `e2e/student-chat.spec.ts`. The SPEC's required failure tests (`javascript:`/`data:` rejection → no row + no event via admin read; the full accept/reject table for `validateResourceUrl`) have no existing equivalents and are new.

## Code References

- `src/lib/db.ts:60-80` — `sessionResources` entity definition (all fields already present, incl. `embedMode`, `embedStatus`, `activatedAt?`).
- `src/lib/db.ts:141-144` — `sessionResourceSession` link (forward `session` / reverse `resources`).
- `src/lib/db.ts:206` — `SessionResource` exported type.
- `src/lib/db.ts:227-259` — `SessionProjection` type + `emptyProjection` (no `resources` map today).
- `src/lib/db.ts:278-438` — `applyEvent` switch; `default` throws `UnknownEventTypeError` at `:431-436` (no `ResourceQueued` case).
- `src/lib/db.ts:363-395` — `QuestionCreated` fold case (closest template for a new keyed-row fold).
- `src/lib/db.ts:490-528` — `writeEvent` dual-write choke point.
- `src/lib/sessions.ts:76-135` — `buildSessionCreate` / `createSession` (the build/wrapper template to mirror).
- `src/lib/sessions.ts:392-426` — `defaultParticipantTxn` (`.update().link({ session })`) + `joinSession` (injectable deps).
- `src/lib/sessions.ts:694-749` — `buildQuestionAnswer` / `answerQuestion` (teacher-role validation + dual-write).
- `src/lib/perms.ts:72-91` — `sessionResources` owner-only-write rule (no change this cycle).
- `src/lib/auth.ts:24-29` — `isValidEmail` (pure total validation seam precedent for `validateResourceUrl`).
- `src/lib/classify.ts` — `classifyMessage` (single pure seam precedent).
- `src/components/SessionLifecycle.tsx:38-294` — host island; `:49` live `questions` query (template for the new `sessionResources` query); `:64-69` stable sort; `:108-139` error-surfacing handler; `:234-291` Questions Card (layout template for the queue/add-resource Card).
- `src/pages/dashboard/sessions/[id].astro:13-21` — detail page island mount.
- `e2e/support/auth.ts:13-60` — `adminAvailable`, `mintCode`, `freshEmail`, `queryAdmin`, `signInViaUi`.
- `e2e/teacher-question-queue.spec.ts:23-71` — e2e harness pattern (skip-loud, create/start session, multi-context).
- `AGENTS.md:12-47` — Data Layer conventions; cycle notes 0003–0012 documenting every prior dual-write feature (SPEC requires adding a cycle-0015 note here).

## Open Questions

- **`embedMode` safe default value:** the SPEC says set "a safe `embedMode` default" but does not name the literal string. The `embedMode` field is a free `i.string()` (`src/lib/db.ts:77`) with no enum constraint and no existing writer to copy. The exact default value (and the closed set of `type` values to surface in the selector — the issue lists `generic_url`, `google_slides`, `form`, `pdf`, `controlled_page`, `unknown`) need to be fixed at plan time.
- **`sortOrder` source for end-of-queue computation:** SPEC describes `sortOrder` computed from an "injected current-max" in the builder, with the component supplying the current max from its live `sessionResources` query. The precise injection shape (e.g. `currentMaxSortOrder?: number` defaulting such that an empty queue starts at 0) is a plan-time decision.
- **`SessionProjection` extension:** folding `ResourceQueued` requires a new `resources` map on `SessionProjection` + `emptyProjection` (no such map exists today, `src/lib/db.ts:227-259`); the exact stored shape for the projection fold (which resource fields the in-memory projection carries) is a plan-time decision.
- **Whether to extract the queue list ordering into a shared pure comparator** (like `compareSessionsForList`) or inline it in the component (like the existing question sort) — both precedents exist; SPEC does not mandate one.
