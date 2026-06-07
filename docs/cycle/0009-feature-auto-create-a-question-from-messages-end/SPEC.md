# SPEC — Cycle 0009: Auto-create a Question from messages ending in "?"

## WHY
Teachers do not see the raw chat stream — they work only from Questions (CONTEXT.md, SPEC §9.3). Today a student can send a chat message, but nothing ever becomes a Question, so the Teacher-facing half of the product has no input at all. Until messages can be promoted to Questions, the Question queue, endorsements, clustering, and every teacher facilitation surface have nothing to operate on. Full AI classification (Batch 2) is not built yet, so this cycle installs the interim, AI-free heuristic that produces real Questions now — placed behind a single seam so Batch 2 swaps in an AI call with no other change.

## CONCRETE USER BENEFIT
A student who types a message ending in `?` (e.g. "what is mitosis?") now produces a real `Question` in the session — a distinct, teacher-facing participation unit linked back to their message and their participant identity — whereas a casual message ("ok thanks") stays chat-only. For the first time, asking a question in chat creates the durable Question object the rest of the product is built around, and that promotion is observable in the session timeline as a `QuestionCreated` event.

## USABLE END-STATE
From the student session view (`/s/:joinCode`), sending a message whose trimmed text ends with `?` results in a `questions` projection row for that session, linked to the originating `messages` row and the author `participants` row, with a `QuestionCreated` event appended to the session timeline. Sending a message that does not end in `?` leaves the chat unchanged and creates no Question. The classification decision lives behind one function so a later cycle can replace the heuristic with an AI call without touching the submit path, the schema, or the fold.

## Objective
This cycle delivers the interim message-to-Question classification: a single, isolated decision seam (`classifyMessage(text) -> { isQuestion: boolean }`) implementing the trailing-`?` heuristic, wired into the existing student chat submit path so that a question-like message also dual-writes a linked `Question` projection row and a `QuestionCreated` event. It matters because it is the first cycle that produces the teacher-facing `Question` object — the spine on which every subsequent teacher facilitation feature depends — while deliberately confining the heuristic to one swappable point ahead of Batch 2 AI classification.

## Source Issue
`txt-20260606-213639-auto-create-question-from-question-mark` — "Auto-create a Question from messages ending in '?'"

## Scope

### In Scope
- A pure, total classification seam `classifyMessage(text) -> { isQuestion: boolean }` (`src/lib/classify.ts`) implementing the interim heuristic: `isQuestion` is `true` iff the trimmed text ends with `?`. This is the **single** decision point Batch 2 replaces.
- Question creation wired into the sole sanctioned chat submit path (`submitChatMessage`, `src/lib/sessions.ts`): when `classifyMessage` returns `isQuestion`, append a `QuestionCreated` event via the established `writeEvent()` dual-write helper alongside a `questions` projection row whose id is deterministically derived from the source `messageId` (idempotent keyed upsert), linked to the source message, the originating participant, and the session.
- Schema + fold support for the new Question links and event: add `questionMessage`, `questionParticipant`, and `questionSession` links in `src/lib/db.ts`, and fold `QuestionCreated` in `applyEvent` (so it never raises `UnknownEventTypeError` and `rebuildSessionProjection` stays whole).

### Out of Scope
- AI classification, clustering, ranking, endorsements, and the full SPEC §9.1 category set (Batch 2). This cycle classifies only a single boolean.
- Teacher-facing Question queue UI / surfacing screens (subsequent issue) — this cycle creates Questions but does not render them to the teacher.
- Mutating `message.classificationStatus` away from its cycle-0008 `'unclassified'` value, and populating `question.activeResourceIdAtSubmission` (no active-resource concept exists yet).
- Tightening the permissive `$default` permission rule on `messages`/`questions` (deferred Batch-2 follow-up noted in CONTEXT.md). No `perms:push` this cycle.

## Requirements
- `classifyMessage(text)` is pure and total: a `null`/`undefined`/empty/whitespace-only input returns `{ isQuestion: false }` without throwing; trimming is applied before the trailing-`?` check (matching the trimming `buildChatMessage` already applies to stored text).
- The classification decision MUST be reachable only through `classifyMessage` — no inline `endsWith('?')` check anywhere in the submit path, the component, or the fold. Swapping the heuristic for an AI call must require editing only `classifyMessage`'s body.
- A question-like message creates exactly one `questions` row with `status: 'submitted'`, `sessionId`, `createdAt`, and links to its source `messages` row (`message`), its author `participants` row (`participant`), and its `sessions` row (`session`). The row carries no email — privacy stays structural.
- The `questions` row id is deterministically derived from the source `messageId` so a repeated logical submit (same `clientActionId`) re-upserts the same Question row rather than creating a duplicate — mirroring the message idempotency guarantee.
- `QuestionCreated` is appended through the established `writeEvent()` helper with an envelope (`actor.role: 'student'`) whose payload references the source `messageId`, the `participantId`, and the new `questionId`. `applyEvent` folds `QuestionCreated` into a `questions` map (defensive defaults, tolerant of partial/out-of-order payloads, idempotent on re-fold) so the event log still rebuilds the projection.
- A non-question message follows the cycle-0008 path unchanged: one `ChatMessageSubmitted` event, one `messages` row, zero `questions` rows, zero `QuestionCreated` events.
- **Failure behavior**: `classifyMessage` never throws (total over any input). Because `QuestionCreated` is a distinct event, it is a second `writeEvent` transaction issued only after the `ChatMessageSubmitted` write succeeds; if the Question write fails (rejected transaction, network/dependency unavailable), the message persists chat-only, the error is logged (`console.error('[StudentChat] …')`) and propagated to the caller — never swallowed — and no partial Question row is left (event + projection share that second transaction). The chat input remains usable. Because both the message id and the derived question id are deterministic, retrying the same logical submit re-runs classification and re-upserts the same message and Question rows, recovering the missing Question without creating duplicates. Blank/whitespace-only text is still rejected upstream by `buildChatMessage` before any classification or write occurs.

## Acceptance Criteria
- [ ] A student message whose trimmed text ends with `?` (e.g. "what is mitosis?") creates exactly one `questions` row linked back to its source `messages` row and the originating `participants` row, with a `QuestionCreated` event appended — observable end-to-end in the student session view.
- [ ] A student message that does not end in `?` (e.g. "ok thanks") creates no `questions` row and no `QuestionCreated` event; the message remains chat-only.
- [ ] `classifyMessage('  what?  ')` returns `{ isQuestion: true }` and `classifyMessage('ok')`, `classifyMessage('')`, `classifyMessage(null)` each return `{ isQuestion: false }` without throwing (single isolated seam, unit-proven).
- [ ] Submitting the same logical question twice (same `clientActionId`) results in exactly one `questions` row and one `QuestionCreated` event (deterministic, idempotent keyed upsert).
- [ ] **Failure path**: when the `QuestionCreated` dual-write is forced to fail (injected rejecting `write` dep), the message-create still succeeded, the error is surfaced (thrown to the caller / logged) rather than swallowed, no orphan `questions` row exists, and re-issuing the same submit recovers the Question with no duplicate.
- [ ] `applyEvent` folds a `QuestionCreated` event into the projection's `questions` map without raising `UnknownEventTypeError`, and `rebuildSessionProjection` reproduces the same Question rows from the event log.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).
- [ ] No compiler/linter warnings introduced (`npm run astro check`).

## Testing Strategy
- **Unit (Vitest, beside the modules as `*.test.ts`)**: exhaustively cover `classifyMessage` (trailing `?`, internal `?`, trimming, empty/null/undefined, whitespace-only). Cover `submitChatMessage` with injected `write`/`buildTxn` deps for: question-like message emits both `ChatMessageSubmitted` and `QuestionCreated` with correct linked records; non-question emits only `ChatMessageSubmitted`; idempotent re-submit collapses to one Question; injected failing Question write surfaces the error and leaves no partial Question. Cover `applyEvent` folding `QuestionCreated` (happy, partial payload, re-fold idempotency) and a `rebuildSessionProjection` round-trip.
- **E2E (Playwright, `e2e/auto-create-question.spec.ts`; skips loudly without admin env, follows the cycle-0008 multi-context pattern)**: a student submits "what is mitosis?" → assert via the admin read helper (`queryAdmin`) that a `questions` row exists, links to the source message and participant, and that a `QuestionCreated` event referencing the source `messageId` exists in `sessionEvents` (observability). A student submits "ok thanks" → assert no `questions` row and no `QuestionCreated` event are created. Assert dual-write event counts for both legs.
- No new UI is added this cycle, so no new component-render e2e is required beyond the existing `student-chat-*` testids; the chat input/stream behavior must remain unchanged for non-question messages.

## Documentation Updates
- **AGENTS.md**: add a cycle-0009 note in the Data Layer section documenting `classifyMessage` as the single classification seam (interim trailing-`?` heuristic, AI-swap point for Batch 2), the `QuestionCreated` second-event dual-write in `submitChatMessage`, the deterministic `questions` row id derived from `messageId`, the new `questionMessage`/`questionParticipant`/`questionSession` links, the `applyEvent` `QuestionCreated` fold, and the additive schema-push requirement (`npx instant-cli push schema` before the feature works against a schema-enforced live app). Note that `messages`/`questions` remain under the permissive `$default` rule (no `perms:push` this cycle).
- **CONTEXT.md**: confirm the `Question` glossary entry already describes the trailing-`?` interim heuristic; update only if the wording drifts from the implemented seam (e.g. cross-link the seam name). No new terms introduced.
- **README.md / release-notes.md**: surface the user-facing change — messages ending in `?` now become Questions — and list the additive schema push as a verification/migration step.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Cycle 0008 student chat submit path: `submitChatMessage` / `buildChatMessage`, the `messages` entity, `messageSession` link, and the `ChatMessageSubmitted` fold (`src/lib/sessions.ts`, `src/lib/db.ts`) — the Question hook attaches to this submit path.
- The `questions` entity already declared in the `i.schema` (`src/lib/db.ts`); this cycle adds its links and the `QuestionCreated` fold.
- `writeEvent()` dual-write helper and the `id()` UUID re-export (`src/lib/db.ts`).
- `PUBLIC_INSTANTDB_APP_ID` for the app; `INSTANT_ADMIN_TOKEN` (e2e-only) for the Playwright observability assertions — the e2e suite skips loudly when unset.
- Additive InstantDB schema push (`npx instant-cli push schema`) for the new `questions` links before the feature works against a schema-enforced live app.
