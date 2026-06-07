# Implementation Plan: Cycle 0010

## Overview
Deliver the teacher-facing consumer of the `Question` object: a realtime, session-scoped queue of open Questions rendered inside the existing `SessionLifecycle` island on `/dashboard/sessions/[id]`, plus the sole sanctioned resolution path (`answerQuestion` → `writeEvent('QuestionAnswered', …)`) with a matching `applyEvent` fold. This closes the core teacher loop — see questions, answer them, move on — reusing cycle 0009's `questions` schema (no schema/permission push).

## Current State (from Research)
- **Dual-write spine**: `writeEvent` (`src/lib/db.ts:441-479`) appends one `sessionEvents` envelope + projection txns in a single `db.transact()`, validating synchronously (type, `meta.sessionId`, `meta.actor.role ∈ ACTOR_ROLES`, non-empty txns) and throwing before any write.
- **Fold**: `applyEvent` (`src/lib/db.ts:264-389`) is a defensive `switch (event.type)`; `QuestionCreated` (`:349-381`) is the closest template; `default` throws `UnknownEventTypeError`. `SessionProjection.questions` (`src/lib/db.ts:222-232`) currently carries `{ id, messageId, participantId, sessionId, status, createdAt }` — **no** `answerSummary`/`addressedBy`.
- **`questions` entity** (`src/lib/db.ts:120-127`) already defines `status`, `answerSummary`, `addressedBy` (optional) + `sessionId` (indexed) and `questionMessage`/`questionParticipant`/`questionSession` links (`:171-182`). No schema push needed.
- **Pure-core/thin-wrapper pattern**: `buildQuestion`/`defaultQuestionTxn` (`src/lib/sessions.ts:568-599`) and `submitChatMessage` (`:644-658`) are the closest templates. Builders throw synchronously on bad input; wrappers take injectable `deps` (`{ write?, buildTxn? }`).
- **Guard pattern**: `assertLegalTransition` fed the LIVE status rejects re-issues (`src/lib/sessions.ts:165-173`).
- **Component conventions**: `SessionLifecycle` (`src/components/SessionLifecycle.tsx`) reads identity via `useAuth` (`:24`), live data via `db.useQuery` (`:25`), logs query errors (`:31`), surfaces failures via `surface()` (`:35-39`) into a `role="alert"` element (`:68-76`), and leaves displayed state untouched on rejection (`:59-66`). `StudentChat` (`:53-60`) shows the realtime `db.useQuery` + client-side `createdAt` then `id` sort.
- **Teacher exclusion**: `SessionLifecycle` mounts NO chat island (SPEC §9.3); the queue renders Questions only, never `messages` rows.
- **Tests**: Vitest beside the module (`src/lib/sessions.test.ts`, `src/lib/db.test.ts`) with injected stub `write`/`buildTxn`; Playwright multi-context teacher-A/student-B with `queryAdmin` observability and loud `test.skip(!adminAvailable())`. Template: `e2e/auto-create-question.spec.ts`.

## Desired End State
- `src/lib/sessions.ts` exports a pure `buildQuestionAnswer(input)` and an async `answerQuestion(input, deps?)` that dual-writes `QuestionAnswered` (one `writeEvent`, one `db.transact()`).
- `src/lib/db.ts` `applyEvent` folds `QuestionAnswered` (status → `answered`, applies `answerSummary`/`addressedBy`); `SessionProjection.questions` carries optional `answerSummary`/`addressedBy`.
- `SessionLifecycle` renders a realtime open-Questions-only queue with per-Question mark-answered controls (optional summary input) and an explicit empty state.
- Verify: `npm run test` (Vitest builder + fold), `npm run test:e2e` (realtime ask→see→answer loop), `npm run astro check` clean.

## What We're NOT Doing
- Student-facing answered section / showing answers back to students.
- Endorsements / upvotes; question clustering / AI summarization (Batch 2).
- Tightening the `$default` permission rule on `questions`/`messages` — **no `perms:push`**.
- Any schema push (`questions` fields already exist).
- Editing or un-answering a Question; answer-summary length/format validation beyond non-empty trimming.
- Adding a chat island to the teacher view (teacher exclusion preserved).

## Implementation Approach
Three vertical slices, each end-to-end testable:
1. **Fold first** (`QuestionAnswered` in `applyEvent` + projection type) so the event type is recognized and `rebuildSessionProjection` stays whole — unit-tested in isolation.
2. **Answer path** (`buildQuestionAnswer` + `answerQuestion`) mirroring `buildQuestion`/`submitChatMessage`, with the already-answered guard living in the **pure builder fed the current status** (mirroring `assertLegalTransition`), so the guard is unit-testable without a component.
3. **Teacher queue UI** in `SessionLifecycle`: a second `db.useQuery` over `questions` by `sessionId`, open-only filter, client-side sort, per-item mark-answered control routing through `answerQuestion`, reusing the existing `surface()`/`role="alert"` failure convention.

**Resolved open questions:**
- **Projection type**: extend `SessionProjection.questions` with optional `answerSummary?: string` and `addressedBy?: string`. SPEC AC requires the fold to apply them; the type must carry them.
- **Already-answered guard**: lives in the pure `buildQuestionAnswer`, which receives the Question's `currentStatus` (read from the live query in the component) and throws if `currentStatus === 'answered'` — mirroring `assertLegalTransition` fed the live status. No projection-only pre-check.
- **Testids**: `teacher-question-queue` (container), `teacher-question-item` (per row, with `data-question-id`), `teacher-question-text`, `question-mark-answered` (button), `question-answer-summary` (optional input), `teacher-question-queue-empty` (empty state), `teacher-question-error` (inline alert).

## Failure & Resilience Decisions

**Task 1 (`QuestionAnswered` fold)** — N/A — pure. `applyEvent` is a pure function over in-memory state; defensive reads tolerate partial payload (status default `answered` only when payload omits it is *not* applied — see below), never mutates input, re-fold reproduces the row. An unknown type still throws `UnknownEventTypeError` loudly (no silent drop).

**Task 2 (`buildQuestionAnswer` / `answerQuestion`)**:
- **Failure modes**: `buildQuestionAnswer` throws synchronously on missing `questionId`/`sessionId`/actor `userId`, non-`teacher` actor role, or `currentStatus === 'answered'` (duplicate-resolution guard) — producing no txn/envelope. `answerQuestion` awaits `writeEvent`; a rejected `db.transact()` propagates to the caller (never swallowed).
- **Idempotency**: the projection update is a keyed upsert on the existing known `questionId` (`db.tx.questions[questionId].update(...)`), so a re-run re-applies the same `status: 'answered'`/`answerSummary`/`addressedBy` to the same row — naturally convergent. `writeEvent` itself is not idempotent (each call appends a fresh envelope by design); the already-`answered` guard plus the component's `pending` latch suppress duplicate resolution attempts.
- **Observability**: builder throws carry a `buildQuestionAnswer: …` message; the wrapper rejection surfaces in the component (`console.error('[SessionLifecycle] …')`) and the `QuestionAnswered` envelope itself is the structured audit record.
- **No silent failure**: builder throws reach the caller; `writeEvent` returns the `db.transact()` promise unswallowed.

**Task 3 (teacher queue UI)**:
- **Failure modes**: query error logged via `console.error('[SessionLifecycle] questions query error:', …)` and a non-actionable error rendered; a failed/rejected answer write is caught and routed through `surface()` → inline `role="alert"` + `console.error`. The Question remains in the queue (UI is driven by the live query, which is unchanged on rejection).
- **Idempotency**: marking is guarded by a per-Question `pending` latch and the builder's already-`answered` guard, so a double-click cannot append two `QuestionAnswered` events for the same Question in the same tick.
- **Observability**: `[SessionLifecycle]`-prefixed logs on both query and write failure paths.
- **No silent failure**: every `catch` routes to `surface()`; no empty catch blocks.

---

## Task 1: Fold `QuestionAnswered` into `applyEvent` + extend projection type

### Overview
Make the new event type recognized by the fold so `rebuildSessionProjection` reproduces an answered Question and never raises `UnknownEventTypeError`.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**:
- Extend `SessionProjection.questions` value type (`:222-232`) with optional fields:
  ```ts
  status: string
  createdAt: number
  answerSummary?: string
  addressedBy?: string
  ```
- Add a `case 'QuestionAnswered':` to `applyEvent` (after `QuestionCreated`, `:381`). Defensive, no-mutation, keyed by `questionId`; flips the existing row's `status` to `'answered'`, applies `answerSummary`/`addressedBy` when present in payload, preserves prior row fields when the prior question exists, and tolerates an absent prior question (build a minimal row from payload) — mirroring the lifecycle cases:
  ```ts
  case 'QuestionAnswered': {
    const p = event.payload as {
      questionId?: string
      sessionId?: string
      status?: string
      answerSummary?: string
      addressedBy?: string
    }
    const questionId = p.questionId ?? event.id
    const prev = projection.questions[questionId]
    return {
      ...projection,
      questions: {
        ...projection.questions,
        [questionId]: {
          ...(prev ?? {
            id: questionId,
            messageId: '',
            participantId: '',
            sessionId: typeof p.sessionId === 'string' ? p.sessionId : projection.sessionId,
            createdAt: event.occurredAt,
          }),
          id: questionId,
          status: 'answered',
          ...(typeof p.answerSummary === 'string' ? { answerSummary: p.answerSummary } : {}),
          ...(typeof p.addressedBy === 'string' ? { addressedBy: p.addressedBy } : {}),
        },
      },
    }
  }
  ```

### Success Criteria
- [ ] `npm run astro check` reports no new errors/warnings.
- [ ] Vitest fold tests pass (status→`answered`, summary/addressedBy applied, absent-summary leaves field unset, re-fold reproduces row, no `UnknownEventTypeError`).
- [ ] `rebuildSessionProjection` over a log containing `QuestionCreated` then `QuestionAnswered` yields an `answered` row.
- [ ] Failure paths behave as designed: unknown types still throw `UnknownEventTypeError`; input never mutated.

---

## Task 2: `buildQuestionAnswer` + `answerQuestion` (sanctioned resolution path)

### Overview
Add the pure builder (total validation incl. the already-answered guard) and the thin dual-write wrapper, mirroring `buildQuestion`/`submitChatMessage`.

### Changes Required
**File**: `src/lib/sessions.ts`
**Changes** (added after `defaultQuestionTxn`, `:599`):
- Input + plan types:
  ```ts
  export type AnswerQuestionInput = {
    questionId: string
    sessionId: string
    currentStatus: string
    actor: { id: string; role: ActorRole }   // must be 'teacher'
    answerSummary?: string
  }
  export type QuestionAnswerRecord = {
    id: string
    sessionId: string
    status: 'answered'
    addressedBy: string
    answerSummary?: string
  }
  export type BuildQuestionAnswerPlan = { record: QuestionAnswerRecord; meta: WriteEventMeta }
  ```
- Pure builder — totally validates BEFORE producing any txn/envelope:
  ```ts
  export function buildQuestionAnswer(input: AnswerQuestionInput): BuildQuestionAnswerPlan {
    const { questionId, sessionId, currentStatus } = input
    if (!questionId) throw new Error('buildQuestionAnswer: a questionId is required')
    if (!sessionId) throw new Error('buildQuestionAnswer: a sessionId is required')
    if (!input.actor?.id) throw new Error('buildQuestionAnswer: an actor userId is required')
    if (input.actor.role !== 'teacher')
      throw new Error('buildQuestionAnswer: only a teacher may answer a question')
    if (currentStatus === 'answered')
      throw new Error('buildQuestionAnswer: question is already answered')
    const trimmed = input.answerSummary?.trim()
    const record: QuestionAnswerRecord = {
      id: questionId,
      sessionId,
      status: 'answered',
      addressedBy: input.actor.id,
      ...(trimmed ? { answerSummary: trimmed } : {}),
    }
    const meta: WriteEventMeta = {
      sessionId,
      actor: { id: input.actor.id, role: 'teacher' },
      payload: {
        questionId,
        sessionId,
        status: 'answered',
        addressedBy: input.actor.id,
        ...(trimmed ? { answerSummary: trimmed } : {}),
      },
    }
    return { record, meta }
  }
  ```
- Default txn (keyed upsert on the existing row id; scalar columns only):
  ```ts
  const defaultQuestionAnswerTxn = (r: QuestionAnswerRecord): ProjectionTxn =>
    db.tx.questions[r.id].update({
      status: r.status,
      addressedBy: r.addressedBy,
      ...(r.answerSummary !== undefined ? { answerSummary: r.answerSummary } : {}),
    })
  ```
- Thin wrapper with injectable deps:
  ```ts
  export type AnswerQuestionDeps = {
    write?: typeof writeEvent
    buildTxn?: (record: QuestionAnswerRecord) => ProjectionTxn
  }
  export async function answerQuestion(
    input: AnswerQuestionInput,
    deps: AnswerQuestionDeps = {}
  ): Promise<QuestionAnswerRecord> {
    const plan = buildQuestionAnswer(input)
    const write = deps.write ?? writeEvent
    const buildTxn = deps.buildTxn ?? defaultQuestionAnswerTxn
    await write('QuestionAnswered', plan.meta, [buildTxn(plan.record)])
    return plan.record
  }
  ```
- Import `ActorRole` from `./db` if not already imported (extend the `:1` import).

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Vitest: happy path (with summary, without summary, `addressedBy` set, role `teacher`); rejections (missing `questionId`/`sessionId`/`actor.id`, non-teacher role, already-`answered`); blank summary omitted; wrapper issues exactly one `write('QuestionAnswered', …)` with a non-empty txn array; wrapper propagates a stubbed write rejection.
- [ ] Failure paths: builder throws before any write (stub `write` never called on invalid input).

---

## Task 3: Teacher open-Question queue in `SessionLifecycle`

### Overview
Render a realtime, session-scoped, open-only Question queue below the lifecycle controls, with per-Question mark-answered controls (optional summary input), an empty state, and inline failure surfacing — never rendering `messages` rows.

### Changes Required
**File**: `src/components/SessionLifecycle.tsx`
**Changes**:
- Import `answerQuestion` from `@/lib/sessions`.
- Add a second `db.useQuery` over `questions` filtered by `sessionId`:
  ```ts
  const qq = db.useQuery(sessionId ? { questions: { $: { where: { sessionId } } } } : null)
  if (qq.error) console.error('[SessionLifecycle] questions query error:', qq.error)
  ```
- Derive the open queue (open-only filter + client-side sort by `createdAt` then `id`):
  ```ts
  const openQuestions = (qq.data?.questions ?? [])
    .filter((x) => x.status !== 'answered')
    .sort((a, b) => (a.createdAt !== b.createdAt ? a.createdAt - b.createdAt : a.id < b.id ? -1 : 1))
  ```
- Local state for per-Question summary draft, per-Question pending latch, and a queue-level error string surfaced via the existing `surface()`/`role="alert"` convention (new testid `teacher-question-error`, or reuse the existing error element — use a dedicated `teacher-question-error` alert to keep lifecycle and queue errors distinct).
- Mark-answered handler routes through `answerQuestion`, passing the LIVE `currentStatus` from the queried row and `actor: { id: user.id, role: 'teacher' }`:
  ```ts
  async function markAnswered(question) {
    if (!user?.id) { setQError('You must be signed in to answer'); return }
    setPendingId(question.id)
    setQError(null)
    try {
      await answerQuestion({
        questionId: question.id,
        sessionId,
        currentStatus: question.status,
        actor: { id: user.id, role: 'teacher' },
        answerSummary: drafts[question.id],
      })
      // live query drops the row; nothing to set locally
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setQError(message)
      console.error('[SessionLifecycle] answer failed:', err)
    } finally {
      setPendingId(null)
    }
  }
  ```
- Render a `Card` queue region (added to the existing render tree, `:138+`) with testids:
  - container `data-testid="teacher-question-queue"`,
  - empty state `data-testid="teacher-question-queue-empty"` when `openQuestions.length === 0`,
  - per row `data-testid="teacher-question-item"` `data-question-id={q.id}` containing `data-testid="teacher-question-text"` (renders `q.text`? — note: `questions` projection has no `text` column; the queue must show Question text. The Question row links to its source `message`; query the linked message text via the `questionMessage` link, i.e. `questions: { $: { where: { sessionId } }, message: {} }`, and render `q.message?.text`). Render **only** the linked Question's message text through the question, never a standalone `messages` query — the teacher sees Questions, not the chat stream.
  - optional summary input `data-testid="question-answer-summary"` bound to `drafts[q.id]`,
  - mark-answered button `data-testid="question-mark-answered"` disabled while `pendingId === q.id`,
  - inline alert `data-testid="teacher-question-error"` `role="alert"` when `qError`.

> Note on Question text: the queue reads the linked message via the `questionMessage` link in the same `db.useQuery` (`questions: { $: {...}, message: {} }`). This stays "Questions only" — there is no separate `messages` query and no chat island; the message is reached strictly as the Question's source, satisfying the Questions-only assertion (a non-`?` chat message never becomes a Question, so it never appears).

### Success Criteria
- [ ] `npm run astro check` clean.
- [ ] Queue renders open Questions only; answered Questions absent.
- [ ] Empty state element present when no open Questions.
- [ ] Mark-answered routes through `answerQuestion` (no projection-only `questions` write in component code).
- [ ] Failure paths: query error logged; answer-write rejection surfaces inline `role="alert"` + `console.error`, Question stays in queue, no crash.
- [ ] Teacher exclusion preserved (no chat island; no standalone `messages` query).

---

## Task 4: Documentation updates

### Overview
Documentation is part of "done".

### Changes Required
- **`AGENTS.md`** (extends the cycle-0009 Data Layer note, `:42`): add a "Teacher question queue + mark answered (cycle 0010)" note — `answerQuestion`/`buildQuestionAnswer` as the sole sanctioned resolution path, the `QuestionAnswered` event + `applyEvent` fold, the queue mounted in `SessionLifecycle` (open-Questions-only, no chat island — teacher exclusion preserved), the reused `questions` fields (`status`/`answerSummary`/`addressedBy`, no schema push), the unchanged `$default` rule (no `perms:push`), and the new fixed testids.
- **`README.md` / `release-notes.md`**: surface the user-facing change — teachers can now see a live queue of student questions and mark them answered during a session.

### Success Criteria
- [ ] AGENTS.md note added with the testid list and the sanctioned-path statement.
- [ ] README/release-notes mention the teacher question queue.
- [ ] N/A — pure (docs only, no failure surface).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **User-observable benefit**: with a session `live`, when a student (context B) sends a message ending in `?`, the teacher (context A) on `/dashboard/sessions/[id]` sees that Question appear in the queue **without reloading**, and clicking mark-answered removes it from the queue immediately. | Task 3 (+ E2E) | Realtime `db.useQuery` queue + `answerQuestion` |
| [ ] The teacher queue renders only `?`-derived Questions for the active session and contains **no** ordinary chat messages (assert a non-`?` chat message never appears in the queue). | Task 3 (+ E2E) | Queries `questions` only; message reached strictly via Question link |
| [ ] Marking a Question answered (both with a summary and without one) appends exactly one `QuestionAnswered` event via the dual-write helper and sets the `questions` projection row to `status: 'answered'` (with `answerSummary` present only when supplied, and `addressedBy` = the teacher's userId), verifiable in the event log / projection via the admin read helper. | Task 2 (+ E2E) | `answerQuestion` → single `writeEvent`; `queryAdmin` assertion |
| [ ] An answered Question is absent from the teacher's active queue after resolution (open-only filter holds). | Task 3 | `status !== 'answered'` filter |
| [ ] **Failure-path**: `buildQuestionAnswer` throws on missing `questionId`/`sessionId`/actor identity and produces no event/txn; and a forced answer-write rejection surfaces inline (`role="alert"`) + `console.error`, leaving the Question in the queue (state unchanged) rather than crashing or silently dropping it. | Task 2, Task 3 | Builder throw tests + component surface/alert leg |
| [ ] `applyEvent` folds `QuestionAnswered` (status → `answered`, applies `answerSummary`/`addressedBy`) so `rebuildSessionProjection` over a log containing the event reproduces the answered row and the type does not raise `UnknownEventTypeError`. | Task 1 | Fold + projection type extension |
| [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`). | Tasks 1–3 | Full suite run in verification |
| [ ] `npm run astro check` reports no new errors/warnings. | Tasks 1–3 | Type-check in each task's success criteria |

---

## Testing Strategy

### Unit Tests
- **`src/lib/db.test.ts`** (fold): add a `questionAnswered` `EventLike` fixture and `applyEvent` cases — status flips to `answered`; `answerSummary`/`addressedBy` applied when present; absent summary leaves the field unset (no spurious key); folding `QuestionAnswered` onto an absent prior question builds a minimal answered row (defensive); re-fold reproduces the same row (idempotent); no mutation of input; unknown type still throws `UnknownEventTypeError`. Extend `rebuildSessionProjection determinism` to cover a `QuestionCreated`→`QuestionAnswered` log yielding an `answered` row.
- **`src/lib/sessions.test.ts`** (builder + wrapper): `describe('buildQuestionAnswer', …)` — happy path with summary (record + meta carry `answerSummary`, `addressedBy`, `status: 'answered'`, actor role `teacher`), happy path without summary (no `answerSummary` key), validation rejections (missing `questionId`, missing `sessionId`, missing `actor.id`, non-teacher role, `currentStatus === 'answered'`), blank/whitespace summary omitted. `describe('answerQuestion', …)` — injected stub `write` records exactly one `('QuestionAnswered', meta, [txn])` call with a non-empty txn array (stub `buildTxn` returns `({}) as never`); a stub `write` that rejects propagates (wrapper rejects, never swallows); invalid input throws and the stub `write` is never called.
- **Failure-path tests**: builder-throw-before-write (assert stub `write` uncalled); wrapper rejection propagation (stub `write` rejects).
- **Mocking strategy**: real `buildQuestionAnswer` (pure), only `write`/`buildTxn` stubbed via `deps` — no network, no InstantDB mock. Folds use real `applyEvent`/`rebuildSessionProjection` over fixed `EventLike` fixtures.

### Integration / E2E Tests
- **`e2e/teacher-question-queue.spec.ts`** (multi-context, `test.skip(!adminAvailable(), …)` loud-skip, `retries: 3`): teacher A creates + starts a session; student B joins and asks a `?` question → assert it appears in A's `teacher-question-queue` with no reload (`expect.poll`/`getByTestId` waits, never `networkidle`); B sends a non-`?` message → assert it never enters the queue (Questions-only); A marks the Question answered **with** a summary on one Question and **without** on another → assert each leaves the queue and a `QuestionAnswered` event + `answered` projection row (with `addressedBy` = teacher userId, `answerSummary` present only when supplied) exist via `queryAdmin` over `sessionEvents` + `questions`; assert the empty-state element appears when the queue drains; assert the answer-write failure leg surfaces the `teacher-question-error` inline alert. Reuse `createSession`/`startAndReadJoinCode`/`signInStudent`/`joinAndOpenChat` helpers from `e2e/auto-create-question.spec.ts` and `queryAdmin`/`adminAvailable` from `e2e/support/auth.ts`.

## Walkthrough Plan
- **Flow**: teacher signs in → opens `/dashboard/sessions/[id]` for a live session → student (second context) joins and asks a `?` question → teacher watches it arrive in the live queue → teacher types an optional summary and clicks mark-answered → Question leaves the queue → empty state shown. The subject is the teacher facilitation route `/dashboard/sessions/[id]`, never the home page.
- **Capture points** (ordered, named):
  - `01-teacher-session-live` — teacher facilitation view with lifecycle controls and an empty `teacher-question-queue` (empty-state element).
  - `02-student-asks-question` — student chat context after sending a `?` message.
  - `03-question-in-queue` — teacher view showing the Question live in the queue (no reload), with the non-`?` message absent (Questions-only).
  - `04-mark-answered-summary` — teacher view with the `question-answer-summary` input filled and the `question-mark-answered` control focused.
  - `05-queue-empty-after-answer` — teacher view after answering: Question gone, empty-state element visible.
- **Preconditions / test data**: magic-code auth via the deterministic test code path (`mintCode`/`signInViaUi`, never a real inbox) for both teacher and student; a seeded/created session started to `live` via `createSession`/`startAndReadJoinCode`; realtime steps wait on explicit `getByTestId` elements (`teacher-question-item`, `teacher-question-queue-empty`) with generous timeouts, never `networkidle` (InstantDB keeps the socket busy). Requires `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID`; degrade loudly if absent.
- **If no observable UI this cycle**: N/A — this cycle adds observable teacher-facing realtime UI; the walkthrough must exercise it, not the home-page fallback.

## Risk Assessment
- **Question text source pulls in `messages` and risks violating Questions-only**: mitigate by reading the linked message strictly through the `questionMessage` link inside the single `questions` query (`questions: { $: {...}, message: {} }`) — no standalone `messages` query, no chat island; a non-`?` message never becomes a Question so it can never enter the queue.
- **Realtime flake in e2e**: mitigate with explicit element waits + `expect.poll` and the existing `retries: 3` harness; never `networkidle`.
- **Double-click appends two `QuestionAnswered` events**: mitigate with the per-Question `pendingId` latch in the component plus the already-`answered` guard in `buildQuestionAnswer` (fed the live status), which rejects the second attempt.
- **Projection type drift (extra optional fields)**: keep `answerSummary`/`addressedBy` optional and only set keys when present, so existing `QuestionCreated`-only rows and fold/determinism tests remain valid; `astro check` guards the type.
- **Forgetting `currentStatus` plumbing**: the component reads `q.status` from the live queried row and passes it into the builder; unit tests cover the already-`answered` rejection so a regression is caught.
