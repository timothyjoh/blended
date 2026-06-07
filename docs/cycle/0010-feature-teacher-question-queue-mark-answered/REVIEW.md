# Review: Cycle 0010

## Overall Verdict
PASS — no fixes needed

All gates are green: `npm test` → 242 passed (7 files); `npm run test:coverage` → Lines 88.04% / Branch 81.27% / Functions 76.59% / Statements 85.71% (every aggregate up vs the base reported in BUILD, no per-file regression); `npx astro check` → 0 errors, 0 warnings (100 files). Every SPEC acceptance bullet is implemented and backed by code, the SPEC→PLAN traceability section is present and complete, failure handling is fail-safe and observable, and all in-scope doc prose is backed by real `file:line` references. One minor test-coverage gap (the forced-write-rejection failure leg is verified by inspection plus its unit halves, not by an automated component/e2e assertion) is noted below; it does not block, because the surfacing mechanism is present, correct, and reuses an already-exercised pattern, and the gap is a documented no-seam constraint.

## Code Quality Review

### Summary
Clean, idiomatic implementation that mirrors the established pure-core/thin-wrapper and defensive-fold patterns from cycle 0009. The three vertical slices (fold → answer path → teacher queue UI) are well-separated, the dual-write is atomic, and failure paths are explicit and observable. SPEC adherence is one-for-one.

### Findings
1. **Failure-test coverage (minor)**: The SPEC AC failure-path bullet has two halves — (a) `buildQuestionAnswer` throws before any write, and (b) a forced answer-write rejection surfaces inline + `console.error`, leaving the Question in the queue. Half (a) is unit-tested (`src/lib/sessions.test.ts:826-852`); `answerQuestion` rejection-propagation is unit-tested (`src/lib/sessions.test.ts:893-898`). Half (b)'s *component* surfacing path (`markAnswered` catch → `surfaceQuestion` → `role="alert"`) is verified by inspection only — `src/components/SessionLifecycle.tsx:70-83`. The component reuses the proven lifecycle `surface()`/`role="alert"` convention (already exercised), the repo's vitest coverage is scoped to `src/lib/**` (components are e2e-only), and BUILD documents that forcing a real `db.transact()` rejection in a live multi-context e2e has no available seam. Acceptable as-is; flagged for transparency.
2. **Defensive fold (positive)**: `QuestionAnswered` fold is no-mutation, keyed by `questionId ?? event.id`, tolerates an absent prior question, and is convergent on re-fold — `src/lib/db.ts:385-417`. Matches the `QuestionCreated` template.
3. **Atomicity / idempotency (positive)**: resolution routes through a single `writeEvent('QuestionAnswered', …)` with a keyed `questions[id].update` upsert (`src/lib/sessions.ts:726-731,738-747`); the `pendingId` latch (`src/components/SessionLifecycle.tsx:271`) plus the builder's already-`answered` guard (`src/lib/sessions.ts:702-703`) suppress double-resolution. No projection-only `questions` write exists in product code.
4. **No silent failure (positive)**: both live-query errors are logged (`SessionLifecycle.tsx:57-58`), the answer catch surfaces inline + logs (`:70-83`), and `buildQuestionAnswer` throws before any envelope. No empty/bare catch blocks.
5. **Question text source (positive)**: text is reached strictly via the `questionMessage` link (label `message`, `src/lib/db.ts:170-173`) inside the single `questions` query (`SessionLifecycle.tsx:49`) — no standalone `messages` query, no chat island; teacher exclusion (SPEC §9.3) preserved. Renders a `'(question text unavailable)'` fallback (`:256`).

### Spec Compliance Checklist
- [x] Realtime open-Questions-only queue on `/dashboard/sessions/[id]`, filtered `status !== 'answered'`, client-sorted by `createdAt` then `id` — `SessionLifecycle.tsx:49,61-67,239+`
- [x] Renders Question identity only, never `messages` rows (reached via link) — `SessionLifecycle.tsx:49,256`
- [x] Sole sanctioned `answerQuestion` → `writeEvent('QuestionAnswered', …)`; pure `buildQuestionAnswer` totally validates (`questionId`/`sessionId`/actor `userId`/`role: 'teacher'`/already-answered) and trim-or-omits summary before any txn — `sessions.ts:692-723`
- [x] Envelope + projection update commit in one `db.transact()` (via `writeEvent`) — `sessions.ts:738-747`
- [x] Mark-answered supports with and without summary — builder + UI input (`sessions.ts:715-718`, `SessionLifecycle.tsx:259-267`)
- [x] Failure behavior: inline `role="alert"` + `console.error`, Question retained; builder throws before write; already-answered rejected; explicit empty state — `SessionLifecycle.tsx:70-83,241-247,280-289`
- [x] `applyEvent` folds `QuestionAnswered`; `rebuildSessionProjection` reproduces answered row; no `UnknownEventTypeError` — `db.ts:385-417`, tested `db.test.ts:459-489`
- [x] `SessionProjection.questions` carries optional `answerSummary?`/`addressedBy?` — `db.ts:232-233`
- [x] SPEC `## Acceptance Criteria` present with ≥1 testable bullet (8 bullets) — `SPEC.md:40-48`
- [x] CONCRETE USER BENEFIT realizable end-to-end (student `?` → teacher live queue → mark answered → leaves queue) — verified via e2e flow `e2e/teacher-question-queue.spec.ts:76-187`
- [x] Docs updated (AGENTS.md Data Layer note, README "Triaging questions" section, release-notes.md) — all present in diff
- [x] No schema push / no `perms:push` (fields pre-exist `db.ts:120-126`; no rules diff)

## Adversarial Test Review

### Summary
Strong. Unit tests use real pure functions with only `write`/`buildTxn` injected (no InstantDB mock, no network), assertions are specific (full-object `toEqual`, exact call-count/args, `not.toHaveProperty` for omitted keys), and the fold tests cover happy/defensive/idempotent/no-mutation/determinism. The e2e exercises the real realtime loop with admin-side observability and a precise Questions-only count assertion.

### Findings
1. **Assertion quality (positive)**: `buildQuestionAnswer` tests assert full record + meta + payload shape and key omission (`sessions.test.ts:781-820`); wrapper test asserts exactly one call, `'QuestionAnswered'`, actor role, sessionId, and single-txn array (`:862-888`). No weak `toBeTruthy`.
2. **Failure coverage (positive, with the gap in Code Quality finding 1)**: all five validation rejections + already-answered + rejection-propagation + before-write-not-called are unit-tested (`sessions.test.ts:822-915`).
3. **Boundary/defensive (positive)**: blank/whitespace summary omitted (`sessions.test.ts:814-820`); partial-payload fold keyed by event id with fallback sessionId (`db.test.ts:282-301`); idempotent re-fold and no-mutation (`db.test.ts:303-322`).
4. **Integration (positive)**: e2e is genuinely multi-context (teacher A + student B), waits on explicit testids (never `networkidle`), asserts non-`?` count holds at 2, and verifies both the event log and projection rows via `queryAdmin` including `addressedBy` and summary-present-only-when-supplied (`teacher-question-queue.spec.ts:108-184`).
5. **Mock abuse**: none — no test exceeds the "real logic, stub only the write seam" boundary.
6. **Test independence (positive)**: each unit test builds fresh fixtures; e2e uses `crypto.randomUUID()`-salted titles/messages and its own browser contexts.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`)
- Line / branch / function / statement: 88.04% / 81.27% / 76.59% / 85.71% (All files)
- Per-file (in-scope): `db.ts` 92.59% L / 80.39% B / 100% F; `sessions.ts` 96.32% L / 86.46% B / 80% F
- Regressions vs base (per-file): none — BUILD reports all four aggregates rose (Lines 86.84→88.04, Branch 79.40→81.27, Functions 75.00→76.59, Statements 84.32→85.71) and both touched lib files improved; coverage scope is `src/lib/**` only (components are e2e-tested per `vitest.config.ts`), so `SessionLifecycle.tsx` is intentionally outside the unit-coverage denominator (established pattern).
- New code without tests: none in-scope — `db.ts` fold and `sessions.ts` answer path both covered; component covered by e2e.
- Specific scenarios missing tests: the component-level forced-write-rejection inline-surface assertion (see Code Quality finding 1) — covered at unit level for both halves of the mechanism but not as a single component/e2e assertion; documented no-seam constraint.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `answerQuestion` / `buildQuestionAnswer` are the sole sanctioned resolution path (`src/lib/sessions.ts`) | `AGENTS.md:44` | `src/lib/sessions.ts:692`, `src/lib/sessions.ts:738` | OK |
| Envelope payload `{ questionId, sessionId, status: 'answered', addressedBy, answerSummary? }` | `AGENTS.md:44` | `src/lib/sessions.ts:709-722` | OK |
| Keyed `questions[id].update({ status, addressedBy, answerSummary? })` projection update | `AGENTS.md:44` | `src/lib/sessions.ts:726-731` | OK |
| `applyEvent` folds `QuestionAnswered` (status→`answered`, applies summary/addressedBy, keyed by `questionId ?? event.id`) | `AGENTS.md:44` | `src/lib/db.ts:385-417` | OK |
| `SessionProjection.questions` gains optional `answerSummary?`/`addressedBy?` | `AGENTS.md:44` | `src/lib/db.ts:232-233` | OK |
| Second `db.useQuery` over `questions` by `sessionId` pulling text via `questionMessage` link `{ ..., message: {} }` | `AGENTS.md:44`, `README.md` Triaging section | `src/components/SessionLifecycle.tsx:49`; link `db.ts:170-173` | OK |
| Testids `teacher-question-queue` / `-queue-empty` / `-item` / `-text` / `question-answer-summary` / `question-mark-answered` / `teacher-question-error` | `AGENTS.md:44` | `SessionLifecycle.tsx:239,242,251,255,260,269,282` | OK |
| Query/rejected-write surfaces inline `role="alert"` + `console.error('[SessionLifecycle] …')` | `AGENTS.md:44`, `README.md`, `release-notes.md` | `SessionLifecycle.tsx:57-58,70-83,282-285` | OK |
| Explicit empty-state element, never a blank region | `README.md` Triaging, `release-notes.md` | `SessionLifecycle.tsx:241-247` | OK |
| Resolution dual-writes `status:'answered'`, teacher as `addressedBy`, trimmed summary when given, in one transaction | `README.md`, `release-notes.md` | `sessions.ts:711-722,726-731,738-747` | OK |
| No schema push / no `perms:push` this cycle (fields pre-exist) | `AGENTS.md:44`, `README.md`, `release-notes.md` | `db.ts:120-126` (fields present); no schema/perms diff | OK |
| e2e suite `e2e/teacher-question-queue.spec.ts` | `AGENTS.md:44`, `README.md`, `release-notes.md` | `e2e/teacher-question-queue.spec.ts:1-188` | OK |
| README cycle-0009 "a later cycle" updated to point to "Triaging questions" | `README.md:195-196` | `README.md:220-237` (new section) | OK |
