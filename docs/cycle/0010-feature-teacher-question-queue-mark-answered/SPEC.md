# SPEC — Cycle 0010: Teacher Question Queue + Mark Answered

## WHY
Students' question-like messages already become `Question` objects (cycle 0009 `QuestionCreated`), but no one can see them. The teacher facilitation view (`SessionLifecycle` on `/dashboard/sessions/[id]`) deliberately mounts no chat island (SPEC §9.3 teacher exclusion), so today a teacher running a live session has **zero visibility** into what students are asking and **no way to resolve a question**. The Question object exists purely as data with no human consumer — the core teacher value loop ("see what's being asked, resolve it, move on") is missing its only surface.

## CONCRETE USER BENEFIT
A teacher running a live session can, for the first time, **watch student questions arrive in a live queue without reloading, and click to mark one answered** (optionally typing a short answer summary), which makes it disappear from their active queue. They could previously see nothing a student asked; now they triage questions in real time.

## USABLE END-STATE
On `/dashboard/sessions/[id]`, below the existing lifecycle controls, the teacher sees a realtime list of **open Questions only** for that session — never raw chat messages. Each open Question shows its text and an affordance to mark it answered with an optional summary field. Marking answered appends a `QuestionAnswered` event via the dual-write helper and the Question immediately leaves the queue. New `?`-derived Questions from students appear in the queue live, with no reload. When the queue is empty the teacher sees an explicit empty state, not a blank region.

## Objective
This cycle delivers the teacher-facing consumer of the `Question` object: a realtime, session-scoped queue of open Questions on the teacher facilitation view, plus the sole sanctioned path for resolving a Question (`answerQuestion` → `writeEvent('QuestionAnswered', …)`) that dual-writes an `answered` status (with optional `answerSummary` and `addressedBy`) into the `questions` projection and removes it from the active queue. It closes the core teacher loop — see questions, answer them, move on — building directly on cycle 0009's auto-created Questions and reusing the existing `questions` schema (`status`, `answerSummary`, `addressedBy` already defined; no schema push required).

## Source Issue
`txt-20260606-213640-teacher-question-queue-mark-answered` — "Teacher question queue + mark answered"

## Scope

### In Scope
- **Answer path + event fold**: a sanctioned `answerQuestion` / pure `buildQuestionAnswer` in `src/lib/sessions.ts` that routes the dual-write through a new `writeEvent('QuestionAnswered', …)` (updating the `questions` projection row to `status: 'answered'`, `answerSummary` when provided, `addressedBy: <teacher userId>`), plus the matching `QuestionAnswered` fold in `applyEvent` (`src/lib/db.ts`) so `rebuildSessionProjection` stays whole and the type never raises `UnknownEventTypeError`.
- **Teacher queue UI**: a realtime, session-scoped open-Question list rendered inside the existing `SessionLifecycle` island (`/dashboard/sessions/[id]`), querying `questions` by `sessionId`, showing only Questions whose `status !== 'answered'`, with a per-Question mark-answered control offering an optional answer-summary input. No chat island is added (teacher exclusion preserved).
- **Tests**: Vitest unit coverage for `buildQuestionAnswer` and the `QuestionAnswered` fold; a Playwright e2e for the realtime student-asks → teacher-sees → mark-answered loop and the Questions-only assertion.

### Out of Scope
- Student-facing answered section / showing answers back to students (separate work item).
- Endorsements / upvotes (separate).
- Question clustering and AI summarization (Batch 2).
- Tightening the permissive `$default` permission rule on `questions`/`messages` (the deferred Batch-2 owner-scoping follow-up) — **no `perms:push` this cycle**.
- Editing or un-answering a Question, and answer-summary length/format validation beyond non-empty trimming.

## Requirements
- The teacher queue reads Questions via `db.useQuery` over `questions` filtered by the current `sessionId` and renders only open Questions (`status !== 'answered'`), sorted client-side by `createdAt` then `id` for stable ordering, updating in realtime as students ask.
- The queue renders Question text/identity only and **never** renders rows from the `messages` entity — the teacher sees Questions, not chat (SPEC §9.3, CONTEXT "Message"/"Question").
- Marking a Question answered MUST route through the sole sanctioned `answerQuestion` path, which dual-writes via `writeEvent('QuestionAnswered', …)` — no projection-only `questions` write may exist in product code. The pure `buildQuestionAnswer` totally validates input (present `questionId`, present `sessionId`, present actor `userId`, `actor.role: 'teacher'`; trims an optional `answerSummary` and omits it when blank) BEFORE producing any txn/envelope.
- The envelope and the `questions` projection update commit in one `db.transact()` so a rejected answer leaves no partial state; an answered Question disappears from the active queue immediately on the next live-query tick.
- The mark-answered control supports both answering **with** and **without** a summary.
- **Failure behavior**: a query error or a rejected/failed `QuestionAnswered` write MUST surface inline (`role="alert"`) and via `console.error('[SessionLifecycle] …')` — never swallowed; the Question remains in the queue so the teacher can retry. `buildQuestionAnswer` throws on missing/blank required input before any write (no partial event). Answering a Question that is already `answered` is rejected/no-ops rather than appending a duplicate resolution (guard on current status). An empty queue shows an explicit empty-state element rather than a blank region.

## Acceptance Criteria
- [ ] **User-observable benefit**: with a session `live`, when a student (context B) sends a message ending in `?`, the teacher (context A) on `/dashboard/sessions/[id]` sees that Question appear in the queue **without reloading**, and clicking mark-answered removes it from the queue immediately.
- [ ] The teacher queue renders only `?`-derived Questions for the active session and contains **no** ordinary chat messages (assert a non-`?` chat message never appears in the queue).
- [ ] Marking a Question answered (both with a summary and without one) appends exactly one `QuestionAnswered` event via the dual-write helper and sets the `questions` projection row to `status: 'answered'` (with `answerSummary` present only when supplied, and `addressedBy` = the teacher's userId), verifiable in the event log / projection via the admin read helper.
- [ ] An answered Question is absent from the teacher's active queue after resolution (open-only filter holds).
- [ ] **Failure-path**: `buildQuestionAnswer` throws on missing `questionId`/`sessionId`/actor identity and produces no event/txn; and a forced answer-write rejection surfaces inline (`role="alert"`) + `console.error`, leaving the Question in the queue (state unchanged) rather than crashing or silently dropping it.
- [ ] `applyEvent` folds `QuestionAnswered` (status → `answered`, applies `answerSummary`/`addressedBy`) so `rebuildSessionProjection` over a log containing the event reproduces the answered row and the type does not raise `UnknownEventTypeError`.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).
- [ ] `npm run astro check` reports no new errors/warnings.

## Testing Strategy
- **Vitest** (pure logic, beside the module): `buildQuestionAnswer` happy path (with and without summary, `addressedBy` set, `actor.role: 'teacher'`), validation rejections (missing `questionId`/`sessionId`/`userId`, blank summary omitted), and the `QuestionAnswered` fold in `applyEvent` / `rebuildSessionProjection` (status flips to `answered`, summary applied, unknown-type not raised).
- **Playwright** (`e2e/teacher-question-queue.spec.ts`, multi-context, skips loudly without `INSTANT_ADMIN_TOKEN`): teacher A creates+starts a session; student B joins and asks a `?` question → assert it appears in A's queue with no reload; B also sends a non-`?` message → assert it never enters the queue (Questions-only); A marks the Question answered (one leg with summary, one without) → assert it leaves the queue and a `QuestionAnswered` event + `answered` projection row exist via `queryAdmin`; assert the answer write failure leg surfaces the inline alert.
- E2E is required because this cycle adds teacher-facing UI and realtime behavior; reuse the existing dev-server-on-4399 harness and `retries: 3` realtime-flake absorption.

## Documentation Updates
- **AGENTS.md**: add a "Teacher question queue + mark answered (cycle 0010)" note to the Data Layer section — document `answerQuestion`/`buildQuestionAnswer` as the sole sanctioned resolution path, the `QuestionAnswered` event + `applyEvent` fold, the teacher queue mounted in `SessionLifecycle` (open-Questions-only, no chat island — teacher exclusion preserved), the reused `questions` fields (`status`/`answerSummary`/`addressedBy`, no schema push), the unchanged permissive `$default` rule (no `perms:push`), and the new fixed testids.
- **README.md / release-notes.md**: surface the user-facing change — teachers can now see a live queue of student questions and mark them answered during a session.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Cycle 0009 auto-created Questions: `classifyMessage`, `buildQuestion`, the `QuestionCreated` event/fold, and the `questions` entity with `status`/`answerSummary`/`addressedBy`/`question*` links (all already in `src/lib/db.ts`).
- The dual-write spine `writeEvent` and `applyEvent`/`rebuildSessionProjection` (`src/lib/db.ts`, ADR-0001/0003).
- The teacher facilitation surface: `SessionLifecycle` (`src/components/SessionLifecycle.tsx`) mounted inside `SessionRouteGuard` on `/dashboard/sessions/[id]`; identity via `useAuth`.
- `INSTANT_ADMIN_TOKEN` (e2e-only) and `e2e/support/auth.ts` `queryAdmin` for observability assertions.
- `PUBLIC_INSTANTDB_APP_ID` for the running app. **No schema or permission push required this cycle** (the `questions` fields already exist; rules stay at `$default`).
