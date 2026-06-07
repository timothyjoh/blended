# Implementation Plan: Cycle 0009

## Overview
This cycle promotes student chat messages ending in `?` to teacher-facing `Question` objects: a single pure classification seam (`classifyMessage`) wired into the existing `submitChatMessage` path so a question-like message dual-writes a deterministic, linked `questions` projection row plus a `QuestionCreated` event, while non-question messages stay chat-only.

## Current State (from Research)
- The chat submit path is `buildChatMessage` (pure builder) + `submitChatMessage` (thin wrapper) in `src/lib/sessions.ts:480` / `:569`. The wrapper issues exactly one `writeEvent('ChatMessageSubmitted', …)` with one projection txn built by `defaultChatTxn` (`src/lib/sessions.ts:542`). Deps (`write`/`buildTxn`) are injectable (`SubmitChatMessageDeps`, `src/lib/sessions.ts:537`).
- The `messages` row id IS the `clientActionId` (deterministic keyed upsert, `src/lib/sessions.ts:494`), and `record.id === clientActionId === meta.payload.messageId`.
- `writeEvent` (`src/lib/db.ts:377`) is the dual-write choke point: it validates input, stamps envelope fields, and commits the event + projection txn(s) in ONE `db.transact`. It is NOT idempotent (each call appends a fresh event); idempotency comes from deterministic projection ids + caller pre-checks (`shouldSubmitChatMessage`).
- `applyEvent` (`src/lib/db.ts:233`) folds known event types into a `SessionProjection` (`src/lib/db.ts:197`) and throws `UnknownEventTypeError` on unknown types. The `ChatMessageSubmitted` case (`src/lib/db.ts:292`) is the keyed-map template: tolerant of partial payloads, no mutation, idempotent on re-fold. `emptyProjection` is at `src/lib/db.ts:212`.
- The `questions` entity is already declared (`src/lib/db.ts:120`) with `sessionId`, `status`, `createdAt` (+ optional `activeResourceIdAtSubmission`/`addressedBy`/`answerSummary`) but has NO links and NO fold. Link template to mirror: `messageSession` (`src/lib/db.ts:160`) — forward `one` / reverse `many`.
- `StudentChat` (`src/components/StudentChat.tsx`) calls `submitChatMessage`, surfaces failures via `console.error('[StudentChat] …')` + a `student-chat-error` alert, and retains the action id for idempotent retry. It contains no classification logic and requires NO change this cycle.
- Unit tests live beside modules (`src/lib/*.test.ts`); the dep-injection assertion pattern is at `src/lib/sessions.test.ts:589`; fold/rebuild tests at `src/lib/db.test.ts:84`/`:222`. E2E uses multi-context Playwright + `queryAdmin` observability + loud `test.skip(!adminAvailable())` (`e2e/student-chat.spec.ts`, `e2e/support/auth.ts`).
- No `uuid` library is installed; `id()` (re-exported from `@instantdb/react`, `src/lib/db.ts:171`) is the only id generator and returns a v4 UUID. `classifyMessage`/`QuestionCreated`/`question*` links exist nowhere yet (greenfield).

## Desired End State
- `src/lib/classify.ts` exports a pure, total `classifyMessage(text) -> { isQuestion: boolean }` (true iff trimmed text ends with `?`), with `src/lib/classify.test.ts` exhaustively covering it.
- `submitChatMessage` issues a SECOND `writeEvent('QuestionCreated', …)` (with one `questions` projection txn) only after the `ChatMessageSubmitted` write succeeds, iff `classifyMessage` returns `isQuestion`. The `questions` row id is deterministically derived from `messageId`; the row links to its source message, author participant, and session, carries `status: 'submitted'`, and no email.
- `src/lib/db.ts` declares `questionMessage`, `questionParticipant`, `questionSession` links; `SessionProjection` gains a `questions` map; `emptyProjection` defaults it; `applyEvent` folds `QuestionCreated` (so `rebuildSessionProjection` stays whole and no `UnknownEventTypeError` is raised).
- All unit + e2e tests pass; `npm run astro check` is clean. A new `e2e/auto-create-question.spec.ts` proves the slice end-to-end against the live app. Docs (AGENTS.md, CONTEXT.md, README.md, release-notes.md) are updated, including the additive schema-push step.
- Verify: `npm run test`, `npm run test:e2e`, `npm run build` (includes `astro check`) all green; `npx instant-cli push schema` applies the three additive links.

## What We're NOT Doing
- No AI classification, clustering, ranking, endorsements, or the SPEC §9.1 category set (Batch 2). Classification is a single boolean.
- No teacher-facing Question queue / rendering UI — this cycle creates Questions but does not surface them to the teacher.
- No mutation of `message.classificationStatus` (stays `'unclassified'`), and no population of `question.activeResourceIdAtSubmission`/`addressedBy`/`answerSummary`.
- No change to permissions — `messages`/`questions` stay under the permissive `$default` rule; NO `perms:push` this cycle.
- No change to `StudentChat.tsx` or any other component — the Question hook lives entirely inside `submitChatMessage`.
- No new UI testids; the existing `student-chat-*` behavior for non-question messages is unchanged.

## Implementation Approach
Follow the established pure-core / thin-wrapper and pure-seam-isolation patterns. The classification decision is confined to one module (`classify.ts`) so Batch 2 swaps only its body. Question creation reuses the exact `writeEvent` dual-write + injectable-deps machinery already proven for chat. The `QuestionCreated` event is a SECOND `writeEvent` transaction (event + projection share that transaction, so it is atomic) issued only after the message write succeeds — keeping the message chat-only if the Question write fails, with no orphan Question row. Determinism (message id from `clientActionId`, question id derived from message id) makes the whole operation re-runnable as a keyed upsert. The fold mirrors the `ChatMessageSubmitted` case so the event log remains the source of truth.

**Deterministic question-id derivation (resolved open question).** No `uuid` library is available and `classifyMessage`/the builder must be pure and synchronous (no async `crypto.subtle`), so we derive the id by a pure, bijective byte transform of the source message UUID rather than hashing. `deriveQuestionId(messageId)` strips the dashes, parses the 16 bytes, XORs them with a fixed 16-byte namespace constant `QUESTION_ID_NAMESPACE`, and re-formats with dashes. The constant is chosen with `byte[6] & 0xf0 === 0` and `byte[8] & 0xc0 === 0` so the source UUID's version nibble (`4`) and variant bits pass through unchanged — the result is a structurally valid v4-shaped UUID InstantDB accepts. XOR-with-a-constant is injective, so distinct message ids yield distinct (and collision-free) question ids, and a re-run of the same logical submit re-derives the SAME question id (keyed-upsert idempotency). The constant is non-zero in pass-through positions so `questionId !== messageId`.

**Projection/payload shapes (resolved open questions).** `SessionProjection.questions` is `Record<string, { id: string; messageId: string; participantId: string; sessionId: string; status: string; createdAt: number }>`. The `QuestionCreated` payload is `{ questionId, messageId, participantId, sessionId, status, createdAt }` — every field the fold needs to reproduce the row, mirroring the `ChatMessageSubmitted` payload convention.

## Failure & Resilience Decisions

**Task 1 — `classifyMessage` / `deriveQuestionId` (`src/lib/classify.ts`)**: N/A — pure. `classifyMessage` is total over any input (`null`/`undefined`/empty/whitespace → `{ isQuestion: false }`, never throws). `deriveQuestionId` is pure; it assumes a valid UUID-shaped input (always supplied by `buildChatMessage`'s `id()`-minted `clientActionId`) and is deterministic.

**Task 2 — schema links + `QuestionCreated` fold (`src/lib/db.ts`)**: N/A — pure (the fold) for `applyEvent`/`rebuildSessionProjection`. Failure modes are limited to an unknown/partial payload: the fold tolerates a missing `questionId` (falls back to `event.id` as the map key) and missing scalar fields (typeof-guarded defaults), never mutates input, and is idempotent on re-fold — exactly mirroring `ChatMessageSubmitted`. No I/O. Schema link declarations are static. The additive schema push (`npx instant-cli push schema`) is operational, idempotent (re-applying the same additive links is a no-op), and surfaces CLI errors non-zero.

**Task 3 — Question dual-write in `submitChatMessage` (`src/lib/sessions.ts`)**:
- **Failure modes**: the second `writeEvent('QuestionCreated', …)` can reject (rejected transaction, network/dependency unavailable). The wrapper `await`s it without catching, so the rejection PROPAGATES to the caller. The first (`ChatMessageSubmitted`) write has already committed, so the message persists chat-only; because the `QuestionCreated` event and the `questions` projection share that one (second) transaction, a rejection is atomic — no orphan `questions` row and no orphan event. `buildQuestion` is pure and throws synchronously only on a structurally impossible plan (defensive; the message write already validated the same inputs), before any second write.
- **Idempotency**: re-running the same logical submit re-derives the same `messageId` (= `clientActionId`) and the same `deriveQuestionId(messageId)`, so both projection rows are keyed upserts — a retry recovers the missing Question without creating a duplicate row. `writeEvent` itself is not idempotent (a retry appends a second `ChatMessageSubmitted` and/or `QuestionCreated` event); the deterministic keyed-upsert fold collapses those to a single message + single question row, matching the cycle-0008 idempotency model.
- **Observability**: the `QuestionCreated` `sessionEvents` envelope IS the observability signal (referencing `messageId`/`participantId`/`questionId`). At the component layer (unchanged), a propagated rejection is logged via `console.error('[StudentChat] submit failed:', err)` and rendered in the `student-chat-error` alert.
- **No silent failure**: the wrapper never catches; the rejection surfaces to the caller and the component log/alert. Nothing is swallowed.

**Task 4 — e2e spec + docs**: E2E `queryAdmin`/`mintCode` throw on failure (surface in the test, never swallowed); the suite `test.skip`s loudly when admin env is unset (never a false green). Read-only admin queries are re-run safe. The walkthrough script degrades loudly (captures `/login`, logs to stderr) when admin env is absent — it never falls back to the home page. Docs are static writes.

---

## Task 1: Classification seam + deterministic question-id derivation

### Overview
Create the single, pure, total decision seam and the pure id-derivation helper. This is the only point Batch 2 edits to swap the heuristic for an AI call.

### Changes Required
**File**: `src/lib/classify.ts` (new)
**Changes**:
```ts
/** The interim, AI-free message→Question decision seam (cycle 0009).
 *  Pure and total: the SINGLE point Batch 2 replaces with an AI call.
 *  `isQuestion` is true iff the trimmed text ends with '?'. */
export function classifyMessage(text: string | null | undefined): { isQuestion: boolean } {
  const trimmed = (text ?? '').trim()
  return { isQuestion: trimmed.length > 0 && trimmed.endsWith('?') }
}

/** Fixed 16-byte namespace for deriving a deterministic question id from a
 *  message UUID. byte[6] high nibble and byte[8] top two bits are 0 so the
 *  source UUID's version (4) and variant bits pass through unchanged. */
const QUESTION_ID_NAMESPACE = Uint8Array.from([
  0x71, 0x75, 0x65, 0x73, 0x74, 0x69, 0x0e, 0x6e,
  0x31, 0x64, 0x6e, 0x73, 0x30, 0x30, 0x30, 0x39,
])

/** Pure, deterministic, bijective derivation of a question row id from the
 *  source message id. XOR with a fixed namespace → a distinct, collision-free,
 *  valid v4-shaped UUID; a re-run yields the SAME id (keyed-upsert idempotency). */
export function deriveQuestionId(messageId: string): string {
  const hex = messageId.replace(/-/g, '')
  // parse 16 bytes, XOR with namespace, reformat 8-4-4-4-12
  // (full implementation in build)
}
```
- `deriveQuestionId` parses the 32-hex-char UUID into 16 bytes, XORs byte-wise with `QUESTION_ID_NAMESPACE`, and re-emits the `8-4-4-4-12` dashed form.

**File**: `src/lib/classify.test.ts` (new) — unit coverage (see Testing Strategy).

### Success Criteria
- [ ] `npm run astro check` clean; module has no `db`/network import (pure).
- [ ] `classifyMessage('  what?  ') === { isQuestion: true }`; `'ok'`, `''`, `null`, `undefined`, `'   '` all return `{ isQuestion: false }` without throwing.
- [ ] `classifyMessage('why? then more text')` (internal `?`, no trailing) returns `{ isQuestion: false }`.
- [ ] `deriveQuestionId(mId)` is deterministic (equal across calls), bijective (distinct inputs → distinct outputs), returns a valid v4-shaped UUID, and `!== mId`.
- [ ] Failure paths behave as designed (pure/total — no throw on any classify input).

---

## Task 2: Schema links, projection map, and `QuestionCreated` fold

### Overview
Add the three `questions` links, extend the projection with a `questions` map, and fold `QuestionCreated` so the event log rebuilds the projection without raising `UnknownEventTypeError`.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**:
- Add to `links` (mirroring `messageSession`):
```ts
questionMessage: {
  forward: { on: 'questions', has: 'one', label: 'message' },
  reverse: { on: 'messages', has: 'many', label: 'questions' },
},
questionParticipant: {
  forward: { on: 'questions', has: 'one', label: 'participant' },
  reverse: { on: 'participants', has: 'many', label: 'questions' },
},
questionSession: {
  forward: { on: 'questions', has: 'one', label: 'session' },
  reverse: { on: 'sessions', has: 'many', label: 'questions' },
},
```
- Extend `SessionProjection` with:
```ts
questions: Record<string, { id: string; messageId: string; participantId: string; sessionId: string; status: string; createdAt: number }>
```
- `emptyProjection`: add `questions: {}`.
- Add a `case 'QuestionCreated':` to `applyEvent` (template = `ChatMessageSubmitted`): read `payload as { questionId?, messageId?, participantId?, sessionId?, status?, createdAt? }`, key by `payload.questionId ?? event.id`, apply typeof-guarded defaults (`status` default `'submitted'`, `createdAt` falls back to `event.occurredAt`, `sessionId` falls back to `projection.sessionId`), return a NEW projection (spread `projection.questions`), never mutate.

**File**: `src/lib/db.test.ts` — add `QuestionCreated` fold + rebuild tests (see Testing Strategy).

### Success Criteria
- [ ] `npm run astro check` clean; `Question` entity type + new links compile.
- [ ] `applyEvent(emptyProjection('s1'), questionCreated)` folds into `result.questions[<questionId>]` without throwing.
- [ ] Partial-payload fold keys by `event.id` and fills defensive defaults (no throw).
- [ ] Re-folding the same `QuestionCreated` reproduces the identical entry (idempotent); input projection is not mutated.
- [ ] `rebuildSessionProjection` reproduces the same `questions` rows in-order and out-of-order.
- [ ] Failure paths behave as designed (unknown type still throws `UnknownEventTypeError`; `QuestionCreated` no longer does).

---

## Task 3: Wire Question creation into `submitChatMessage`

### Overview
After the `ChatMessageSubmitted` write succeeds, classify the stored text; if question-like, dual-write a `QuestionCreated` event + linked `questions` row via a second `writeEvent`.

### Changes Required
**File**: `src/lib/sessions.ts`
**Changes**:
- Import `classifyMessage`, `deriveQuestionId` from `./classify`.
- Add a `QuestionRecord` type + pure `buildQuestion(plan: ChatMessagePlan): { record: QuestionRecord; meta: WriteEventMeta }`:
```ts
export type QuestionRecord = {
  id: string; sessionId: string; messageId: string; participantId: string
  status: 'submitted'; createdAt: number
}
```
  derived from `plan.record` (`messageId = plan.record.id`, `participantId`, `sessionId`, `createdAt`) and `plan.meta.actor.id` (the `userId` for the envelope actor). `id = deriveQuestionId(plan.record.id)`. `meta.payload = { questionId, messageId, participantId, sessionId, status: 'submitted', createdAt }`, `actor: { id: userId, role: 'student' }`.
- Add `defaultQuestionTxn(r: QuestionRecord)`:
```ts
db.tx.questions[r.id]
  .update({ sessionId: r.sessionId, status: r.status, createdAt: r.createdAt })
  .link({ message: r.messageId, participant: r.participantId, session: r.sessionId })
```
  (scalar fields only on `update`; `messageId`/`participantId` are LINKS, not scalar columns — the row carries no email.)
- Extend `SubmitChatMessageDeps` with `buildQuestionTxn?: (r: QuestionRecord) => ProjectionTxn` (default `defaultQuestionTxn`). Reuse the existing `write` dep for both events.
- In `submitChatMessage`, after the existing `await write('ChatMessageSubmitted', …)`:
```ts
if (classifyMessage(plan.record.text).isQuestion) {
  const q = buildQuestion(plan)
  await write('QuestionCreated', q.meta, [buildQuestionTxn(q.record)])
}
return plan.record
```

**File**: `src/lib/sessions.test.ts` — add Question-leg coverage (see Testing Strategy).

`StudentChat.tsx` is unchanged — it already routes through `submitChatMessage` and surfaces/logs any propagated rejection.

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Question-like text → `write` called twice (`ChatMessageSubmitted` then `QuestionCreated`), the `QuestionCreated` meta carrying `sessionId`, `actor.role === 'student'`, and a payload referencing `messageId`/`participantId`/`questionId`, with exactly one question projection txn.
- [ ] Non-question text → `write` called once (`ChatMessageSubmitted` only); zero `QuestionCreated`.
- [ ] Same `clientActionId` re-submit → same derived question id (one row on re-fold).
- [ ] Failure path: injected `write` that rejects only on `QuestionCreated` → the message write already succeeded, the rejection propagates (not swallowed), no question txn is committed.

---

## Task 4: Schema push, e2e spec, walkthrough, and docs

### Overview
Apply the additive schema push, prove the slice end-to-end against the live app, and complete the documentation that is part of "done."

### Changes Required
**Schema push**: `npx instant-cli push schema` to apply the three additive `question*` links before the feature works against a schema-enforced live app.

**File**: `e2e/auto-create-question.spec.ts` (new) — mirror `e2e/student-chat.spec.ts` (multi-context, `queryAdmin`, `test.skip(!adminAvailable(), …)`, explicit testid waits, no `networkidle`):
- A student submits `"what is mitosis?"` → assert via `queryAdmin` that exactly one `questions` row exists for the session, that it links to the source `messages` row and the author `participants` row, and that a `QuestionCreated` event referencing the source `messageId` exists in `sessionEvents`. Assert the dual-write event counts (one `ChatMessageSubmitted` + one `QuestionCreated`).
- A student submits `"ok thanks"` → assert zero `questions` rows and zero `QuestionCreated` events; the message remains chat-only (one `ChatMessageSubmitted`).

**File**: `AGENTS.md` — add a cycle-0009 Data Layer note: `classifyMessage` as the single classification seam (interim trailing-`?` heuristic, Batch-2 AI-swap point), the `QuestionCreated` second-event dual-write in `submitChatMessage`, the deterministic `questions` id via `deriveQuestionId(messageId)`, the new `questionMessage`/`questionParticipant`/`questionSession` links, the `applyEvent` `QuestionCreated` fold, the additive `npx instant-cli push schema` requirement, and that `messages`/`questions` stay under `$default` (no `perms:push`).

**File**: `CONTEXT.md` — confirm the `Question` glossary entry already describes the trailing-`?` interim heuristic; cross-link the `classifyMessage` seam name only if wording drifts. No new terms.

**Files**: `README.md` / `release-notes.md` — surface the user-facing change (messages ending in `?` now become Questions) and list the additive schema push as a verification/migration step.

### Success Criteria
- [ ] `npm run test:e2e` passes (or skips loudly without admin env).
- [ ] Schema push applies the three links with no destructive change.
- [ ] AGENTS.md / CONTEXT.md / README.md / release-notes.md updated.
- [ ] Failure paths behave as designed (e2e helpers surface admin failures; suite skips loudly when env unset).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A student message whose trimmed text ends with `?` (e.g. "what is mitosis?") creates exactly one `questions` row linked back to its source `messages` row and the originating `participants` row, with a `QuestionCreated` event appended — observable end-to-end in the student session view. | Task 1, Task 3, Task 4 | classify seam + dual-write + e2e observability |
| [ ] A student message that does not end in `?` (e.g. "ok thanks") creates no `questions` row and no `QuestionCreated` event; the message remains chat-only. | Task 3, Task 4 | guarded by `classifyMessage`; e2e asserts zero rows/events |
| [ ] `classifyMessage('  what?  ')` returns `{ isQuestion: true }` and `classifyMessage('ok')`, `classifyMessage('')`, `classifyMessage(null)` each return `{ isQuestion: false }` without throwing (single isolated seam, unit-proven). | Task 1 | exhaustive unit tests in `classify.test.ts` |
| [ ] Submitting the same logical question twice (same `clientActionId`) results in exactly one `questions` row and one `QuestionCreated` event (deterministic, idempotent keyed upsert). | Task 1, Task 3 | `deriveQuestionId` bijective + keyed-upsert fold; unit-proven (one projection row) |
| [ ] **Failure path**: when the `QuestionCreated` dual-write is forced to fail (injected rejecting `write` dep), the message-create still succeeded, the error is surfaced (thrown to the caller / logged) rather than swallowed, no orphan `questions` row exists, and re-issuing the same submit recovers the Question with no duplicate. | Task 3 | second `writeEvent` is atomic; wrapper re-throws; deterministic re-run recovers |
| [ ] `applyEvent` folds a `QuestionCreated` event into the projection's `questions` map without raising `UnknownEventTypeError`, and `rebuildSessionProjection` reproduces the same Question rows from the event log. | Task 2 | fold case + rebuild round-trip tests |
| [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`). | Task 1–4 | full suite run is a gate on every task |
| [ ] No compiler/linter warnings introduced (`npm run astro check`). | Task 1–4 | `astro check` is a per-task success criterion |

---

## Testing Strategy

### Unit Tests
- **`classify.test.ts`**: `classifyMessage` over trailing `?`, internal-only `?` (false), leading/trailing whitespace + `?` (true after trim), empty `''`, whitespace-only `'   '`, `null`, `undefined` (all `{ isQuestion: false }`, no throw). `deriveQuestionId`: determinism (same input → same output across calls), injectivity (two distinct `id()`-shaped inputs → distinct outputs), valid UUID shape (regex `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`), and `!== messageId`.
- **`sessions.test.ts`** (extend `submitChatMessage` block, reuse the call-capturing fake-`write` pattern at `:589`): question-like text emits both events in order with the correct `QuestionCreated` meta (sessionId, `actor.role: 'student'`, payload `questionId`/`messageId`/`participantId`) and one question txn; non-question emits only `ChatMessageSubmitted`; same `clientActionId` derives a stable question id; a `write` mock that resolves on `ChatMessageSubmitted` and rejects on `QuestionCreated` → the wrapper rejects (propagation), the first write is observed, no question txn committed. Also a `buildQuestion` pure test (record shape, no `email`, derived id).
- **`db.test.ts`** (extend, mirroring the `chatMessageSubmitted` fixtures at `:68`): `QuestionCreated` happy fold (keyed by `questionId`), partial-payload fold (keys by `event.id`, defensive defaults, no throw), re-fold idempotency, no-mutation, and a `rebuildSessionProjection` round-trip producing identical `questions` for in-order vs out-of-order input.
- **Failure-path tests**: injected rejecting-on-`QuestionCreated` `write` (above); unknown-type still throws `UnknownEventTypeError` (existing test stays green); partial-payload defensive fold.
- **Mocking strategy**: no network mocking — inject `write`/`buildQuestionTxn` deps and assert call args (the proven cycle-0008 approach). `classifyMessage`/`deriveQuestionId`/`buildQuestion` are tested as real pure functions.

### Integration / E2E Tests
- **`e2e/auto-create-question.spec.ts`** (multi-context, `queryAdmin` observability, loud skip): teacher creates + starts a session; a student joins `/s/<code>` and sends `"what is mitosis?"` → assert one `questions` row linked to the source message + participant and one `QuestionCreated` event referencing the `messageId`, plus dual-write counts; a student sends `"ok thanks"` → assert zero `questions` rows and zero `QuestionCreated` events. Realtime waits on explicit testids, never `networkidle`; `retries: 3` absorbs flake.

## Walkthrough Plan
The build step authors `$CYCLE_ARTIFACT_DIR/walkthrough.mjs` from this section, reusing the cycle-0008 bare-node + `@instantdb/admin` magic-code pattern (imports nothing from project source).
- **Flow**: A teacher signs in, creates a session, opens `/dashboard/sessions/[id]`, Starts it (→ `live`) and reads the join code. A student (own context) opens `/join/<code>`, lands on the real `/s/<code>` chat surface, sends `"what is mitosis?"` (the message that becomes a Question), then sends `"ok thanks"` (stays chat-only). Never the home page.
- **Capture points** (ordered, named):
  - `01-session-live` — teacher's `/dashboard/sessions/[id]` showing `status: live` and the join code (precondition + the route that opens chat).
  - `02-student-chat-open` — student at `/s/<code>` with the single empty chat input (no message-type selector).
  - `03-question-message` — `"what is mitosis?"` rendered in the student's stream (the trigger that creates a Question).
  - `04-casual-message` — `"ok thanks"` rendered in the stream (remains chat-only).
- **Preconditions / test data**: admin-minted magic code (`generateMagicCode`, no real inbox); a freshly created + started session (no pre-seeding); one teacher context + one student context; explicit testid waits (`student-chat-root`, `student-chat-message-item`), never `networkidle`.
- **Observable-UI caveat (degrade honestly, not to home page)**: this cycle adds NO teacher-facing Question UI, so the `Question` object itself is not screenshot-able. The walkthrough captures the student flow that triggers Question creation over the real `/s/<code>` route; the `questions` row + `QuestionCreated` event are verified by an `@instantdb/admin` query logged to stderr (the observability signal), not a screenshot. When `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are unset the script degrades LOUDLY to capturing `/login` and a stderr notice — never the home-page fallback.

## Risk Assessment
- **InstantDB rejecting a non-`id()` UUID for the `questions` row**: mitigated by `deriveQuestionId` preserving the source UUID's version/variant bits (valid v4 shape); a `db.test`/`classify.test` regex assertion locks the shape, and the e2e write exercises it against the live app.
- **Component-level auto-recovery of a failed Question write is blocked by `shouldSubmitChatMessage`** (once the `messages` row exists, `existingForActionId !== 0`, so the UI will not re-submit): this is intentional and consistent with cycle-0008. Recovery of the missing Question is at the logical/function level (a re-run of `submitChatMessage` with the same `clientActionId` re-upserts the same rows); the message is never lost. Documented as a Batch-2 reconciliation follow-up, not silently ignored.
- **Duplicate `ChatMessageSubmitted`/`QuestionCreated` events on a logical re-run**: `writeEvent` is intentionally non-idempotent; the deterministic keyed-upsert fold collapses duplicates to one message + one question row. Locked by the idempotency unit test and the e2e double-submit assertion model.
- **Forgetting the additive schema push** leaves the feature broken against a schema-enforced live app: called out as an explicit Task 4 step and in AGENTS.md / release-notes.md verification steps.
