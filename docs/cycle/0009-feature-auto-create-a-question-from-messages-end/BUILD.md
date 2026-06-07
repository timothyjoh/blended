## Summary

Cycle 0009 promotes student chat messages ending in `?` to teacher-facing `Question` objects through a single, swappable classification seam, completing all four PLAN.md tasks.

**Files created:**
- `src/lib/classify.ts` (71 lines) — the pure, total `classifyMessage(text) -> { isQuestion: boolean }` interim trailing-`?` seam (the sole point Batch 2 swaps for AI) plus the pure, bijective `deriveQuestionId(messageId)` (XOR-with-fixed-namespace, preserving v4 version/variant bits). **Task 1.**
- `src/lib/classify.test.ts` (84 lines) — exhaustive unit coverage of both functions.
- `e2e/auto-create-question.spec.ts` (166 lines) — multi-context Playwright observability suite. **Task 4.**
- `docs/cycle/0009-feature-auto-create-a-question-from-messages-end/walkthrough.mjs` (181 lines) — bare-node walkthrough driving the real teacher-create→start→student-chat flow with four capture points (`01-session-live`, `02-student-chat-open`, `03-question-message`, `04-casual-message`), degrading loudly to `/login` when admin env is unset. **Task 4.**

**Files modified:**
- `src/lib/db.ts` (+66) — three additive `questionMessage`/`questionParticipant`/`questionSession` links (forward `one`/reverse `many`), a `questions` map on `SessionProjection`, `emptyProjection` default, and the `QuestionCreated` fold case. **Task 2.**
- `src/lib/db.test.ts` (+89) — `QuestionCreated` fold tests (happy, partial-payload, re-fold idempotency, no-mutation) and a rebuild round-trip.
- `src/lib/sessions.ts` (+80) — `QuestionRecord` type, pure `buildQuestion(plan)`, `defaultQuestionTxn`, `buildQuestionTxn` dep, and the second `writeEvent('QuestionCreated', …)` in `submitChatMessage`. **Task 3.**
- `src/lib/sessions.test.ts` (+142) — non-question single-event, question-like dual-event ordering + envelope, stable derived id on re-submit, the injected-Question-failure propagation path, and a `buildQuestion` block.
- `AGENTS.md`, `CONTEXT.md`, `README.md`, `release-notes.md` — cycle-0009 documentation including the additive schema-push step and the no-`perms:push` decision.

**Test/coverage results:** `npm test` → **7 files, 221 tests passed** (was 193). `npm run test:coverage` → Statements **84.32%** (was 83.62), Branches **79.40%** (was 77.96), Functions **75%** (unchanged), Lines **86.84%** (was 85.20) — no regression on any axis; `db.ts` and `sessions.ts` both improved. `npx astro check` → **0 errors, 0 warnings** (35 pre-existing UI-deprecation hints, none from this cycle's files).

**Failure modes handled:** (1) `classifyMessage` is total — `null`/`undefined`/empty/whitespace return `{ isQuestion: false }` without throwing (unit-proven); (2) `deriveQuestionId` throws on a non-UUID input rather than emitting garbage (unit-proven); (3) the `QuestionCreated` dual-write is a second transaction issued only after the message commits, so a rejected Question write leaves the message chat-only with no orphan row/event and propagates to the caller — covered by the injected-rejecting-`write` test asserting the message write was observed and the rejection re-thrown; (4) idempotency — the deterministic message id and derived question id make a logical re-submit re-upsert the same rows (unit-proven: same `clientActionId` → same question id across submits); (5) the fold is defensive (partial-payload keyed by `event.id`, typeof-guarded defaults, idempotent on re-fold, never mutates input).

**Deviations from PLAN.md:** none functionally. `deriveQuestionId` additionally validates its input shape and throws on malformed UUIDs (the plan left the implementation to the build); this strengthens the seam without changing the keyed-upsert behavior.

**Deferred / follow-up:** The additive schema push (`npx instant-cli push schema` for the three `question*` links) is an operator step and was **not** run here — it was correctly denied as a shared-infra/production deploy outside the build scope; the operator must run it before the feature works against a schema-enforced live app (documented in AGENTS.md / README.md / release-notes.md). The e2e suite (`auto-create-question.spec.ts`) was authored but not executed in this environment (`INSTANT_ADMIN_TOKEN` unset → it skips loudly by design). Teacher-facing Question UI remains out of scope (subsequent cycle), as do permission tightening and AI classification (Batch 2).

## Touched Files
- src/lib/classify.ts
- src/lib/classify.test.ts
- src/lib/db.ts
- src/lib/db.test.ts
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- e2e/auto-create-question.spec.ts
- docs/cycle/0009-feature-auto-create-a-question-from-messages-end/walkthrough.mjs
- AGENTS.md
- CONTEXT.md
- README.md
- release-notes.md
