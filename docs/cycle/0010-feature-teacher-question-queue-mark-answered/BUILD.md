All gates green: 242 tests pass, astro check reports 0 errors / 0 warnings.

## Summary

This cycle delivered the teacher-facing consumer of the `Question` object across three vertical slices, plus tests, docs, and a walkthrough.

**Slice 1 — `QuestionAnswered` fold (`src/lib/db.ts`, +~45 lines):** extended `SessionProjection.questions` with optional `answerSummary?`/`addressedBy?` and added a defensive `case 'QuestionAnswered'` to `applyEvent` that flips the keyed row's `status` to `'answered'`, applies `answerSummary`/`addressedBy` when present, tolerates an absent prior question (minimal row keyed by `questionId ?? event.id`), never mutates input, and re-folds convergently — so the type never reaches the `UnknownEventTypeError` default. Covered by 7 new cases in `src/lib/db.test.ts` (+~115 lines): prior-row fold, no-summary fold, defensive partial-payload fold, idempotent re-fold, no-mutation, known-type, and a `QuestionCreated`→`QuestionAnswered` determinism rebuild.

**Slice 2 — sanctioned answer path (`src/lib/sessions.ts`, +~95 lines):** added the pure `buildQuestionAnswer` (total validation of `questionId`/`sessionId`/actor `userId`, `actor.role: 'teacher'`, the already-`answered` duplicate-resolution guard fed the live status, and trim-or-omit of the optional summary — all *before* any txn/envelope), the `defaultQuestionAnswerTxn` keyed upsert, and the thin `answerQuestion` wrapper routing one `writeEvent('QuestionAnswered', …)`. Covered by 12 new cases in `src/lib/sessions.test.ts` (+~135 lines): builder happy paths (with/without/blank summary), all five validation rejections, and wrapper tests (single `QuestionAnswered` call with one txn, rejection propagation, invalid-input-before-write, plus two exercising the real default txn).

**Slice 3 — teacher queue UI (`src/components/SessionLifecycle.tsx`, +~95 lines):** a second `db.useQuery` over `questions` by `sessionId` (pulling source-message text strictly via the `questionMessage` link — no standalone `messages` query, teacher exclusion preserved), open-only filter + client-side `createdAt`/`id` sort, per-Question summary drafts and a `pendingId` latch, a `markAnswered` handler routing through `answerQuestion`, an explicit empty state, and an inline `role="alert"` error via `surfaceQuestion` (+`console.error`). New fixed testids: `teacher-question-queue`, `teacher-question-queue-empty`, `teacher-question-item` (with `data-question-id`), `teacher-question-text`, `question-answer-summary`, `question-mark-answered`, `teacher-question-error`.

**E2E (`e2e/teacher-question-queue.spec.ts`, new, ~190 lines):** multi-context teacher-A/student-B loop — empty-state assertion, `?` question appears live with no reload, non-`?` message never enters the queue (Questions-only, count holds at 2), answer with and without a summary each removes the row, empty-state returns, and `queryAdmin` verifies two `QuestionAnswered` events + two `answered` projection rows (`addressedBy` = teacher id; `answerSummary` present only when supplied). Loud `test.skip(!adminAvailable())`; `retries: 3` already set in `playwright.config.ts`.

**Walkthrough (`docs/cycle/.../walkthrough.mjs`, new):** drives the real `/dashboard/sessions/[id]` and `/s/[code]` routes via the admin magic-code seam, with the five planned capture points (`01-teacher-session-live` … `05-queue-empty-after-answer`); degrades to a login-surface capture with a loud diagnostic when admin env is unset. Deps are `playwright` + `@instantdb/admin` only.

**Docs:** `AGENTS.md` Data Layer note, `release-notes.md` entry, and a new README "Triaging questions (teacher queue)" section (plus updating the cycle-0009 "a later cycle" reference).

**Test/coverage commands:** `npm test` → **242 passed (7 files)**. `npm run test:coverage` → **Lines 88.04% (was 86.84%), Branch 81.27% (was 79.40%), Functions 76.59% (was 75.00%), Statements 85.71% (was 84.32%)** — every aggregate metric up, and no per-file regression (db.ts and sessions.ts both improved on all four metrics). An interim run showed db.ts branch dipping (78.02→77.45) and functions dipping (75→74.46) from the new uncovered default txn and fold fallback branches; I closed both gaps by adding the partial-payload fold test and the two real-default-txn wrapper tests rather than leaving a regression. `npm run astro check` → 0 errors, 0 warnings (100 files).

**Failure modes handled:** input validation (`buildQuestionAnswer` throws on missing `questionId`/`sessionId`/actor id, non-teacher role, already-`answered` — before any write; tested with stub `write` asserted uncalled); write-rejection propagation (`answerQuestion` awaits and never swallows — tested); atomicity (single `db.transact()` via `writeEvent` leaves no partial state on rejection); idempotency (keyed `questions[id].update` upsert is convergent; `pendingId` latch + already-`answered` guard suppress double-resolution); graceful degradation (query/answer errors surfaced inline `role="alert"` + `console.error('[SessionLifecycle] …')`, Question left in queue; empty-state element instead of a blank region).

**Deviations from PLAN.md:** the PLAN's e2e strategy named a "forced answer-write rejection surfaces the inline alert" leg. Forcing a real `db.transact()` rejection in a live multi-context e2e has no available seam (the component uses the production `answerQuestion`), so that failure-path requirement is covered at the unit level (`buildQuestionAnswer` throw tests + `answerQuestion` rejection-propagation test) and by the component's `catch → surfaceQuestion` path, while the e2e covers the full observable success loop. No scope was added beyond SPEC.

**Deferred / follow-up:** none beyond the SPEC's explicit out-of-scope items (student-facing answers, endorsements, clustering/AI summarization, `messages`/`questions` permission tightening — still the deferred Batch-2 `perms:push` follow-up).

## Touched Files
- src/lib/db.ts
- src/lib/db.test.ts
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- src/components/SessionLifecycle.tsx
- e2e/teacher-question-queue.spec.ts
- docs/cycle/0010-feature-teacher-question-queue-mark-answered/walkthrough.mjs
- AGENTS.md
- README.md
- release-notes.md
