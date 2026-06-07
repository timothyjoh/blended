# Review: Cycle 0009

## Overall Verdict
PASS — no fixes needed

All four PLAN tasks landed as specified. The classification decision is confined to one pure seam (`classifyMessage`), Question creation is wired as a second atomic `writeEvent` issued only after the message commits, the fold and schema links are in place, tests are thorough and honest (221 passed), coverage improved with no regression, `astro check` is clean, and every in-scope documentation claim is backed by source. SPEC has a populated `## Acceptance Criteria` section and PLAN has a complete `## SPEC Acceptance Traceability` table re-quoting all eight bullets verbatim. No swallowed errors, no fail-open defaults, and retried submits are idempotent via deterministic ids.

## Code Quality Review

### Summary
Clean, idiomatic implementation that faithfully follows the cycle-0008 pure-core / thin-wrapper and pure-seam-isolation patterns. The single-seam constraint is honored: there is no inline `endsWith('?')` anywhere outside `classifyMessage`. Failure handling is fail-safe — the second write propagates on rejection and shares one transaction with its projection row, so no orphan Question is possible.

### Findings
1. **Seam isolation (positive)**: the trailing-`?` rule exists only in `classifyMessage` — `src/lib/classify.ts:23`; the submit path calls it once and is otherwise classification-agnostic — `src/lib/sessions.ts:653`.
2. **Deterministic id, version/variant preserved (positive)**: `deriveQuestionId` XORs a fixed namespace whose `byte[6]` high nibble (`0x0e`) and `byte[8]` top two bits (`0x31`) are zero, so the source v4 version/variant bits pass through; empirically locked by a UUID-shape regex over 50 random inputs — `src/lib/classify.ts:36`, `src/lib/classify.test.ts:58`.
3. **Atomic, fail-safe second write (positive)**: `QuestionCreated` is a distinct `writeEvent` issued only after `ChatMessageSubmitted` resolves; event + projection share one transaction, the wrapper does not catch, so a Question-write rejection propagates and leaves the message chat-only with no orphan row — `src/lib/sessions.ts:652-656`.
4. **Defensive, immutable fold (positive)**: `QuestionCreated` folds keyed by `questionId ?? event.id` with typeof-guarded defaults (`status` → `'submitted'`, `createdAt` → `occurredAt`, `sessionId` → projection's), returns a new projection, never mutates input — `src/lib/db.ts:349`.
5. **Minor (not a defect)**: `defaultQuestionTxn` (`src/lib/sessions.ts:594`) and `buildQuestion`'s three defensive throws (`src/lib/sessions.ts:573-575`) are not unit-covered — consistent with cycle-0008 (`defaultChatTxn` is likewise e2e-only) and the defensive guards are unreachable given `buildChatMessage` already validates the same inputs. No action required.

### Spec Compliance Checklist
- [x] `classifyMessage(text) -> { isQuestion: boolean }`, pure/total, trims before trailing-`?` check (`src/lib/classify.ts:23`)
- [x] Single decision point; no inline `endsWith('?')` in submit path/component/fold
- [x] Question-like message dual-writes a `QuestionCreated` event + one `questions` row, `status: 'submitted'`, linked to message/participant/session, no email (`src/lib/sessions.ts:568`, `:594`)
- [x] `questions` id deterministically derived from `messageId` (idempotent keyed upsert) (`src/lib/classify.ts:59`)
- [x] Envelope `actor.role: 'student'`, payload references `messageId`/`participantId`/`questionId` (`src/lib/sessions.ts:582`)
- [x] `applyEvent` folds `QuestionCreated` into a `questions` map; no `UnknownEventTypeError`; `rebuildSessionProjection` stays whole (`src/lib/db.ts:349`)
- [x] Non-question message unchanged: one `ChatMessageSubmitted`, zero `questions`, zero `QuestionCreated`
- [x] Failure: second write rejection propagated, not swallowed; no partial Question
- [x] Schema links `questionMessage`/`questionParticipant`/`questionSession` added (`src/lib/db.ts:171`)
- [x] Docs updated: AGENTS.md, CONTEXT.md, README.md, release-notes.md
- [x] `npm run test` green (221 passed); `npm run astro check` clean (0 errors, 0 warnings)
- [ ] `npm run test:e2e` not executed here — `INSTANT_ADMIN_TOKEN` unset, suite skips loudly by design (spec authored at `e2e/auto-create-question.spec.ts`)
- [ ] `npx instant-cli push schema` not run — operator step, correctly deferred and documented

The two unchecked items are out-of-environment operator/integration steps explicitly scoped that way by SPEC/PLAN, not implementation gaps.

## Adversarial Test Review

### Summary
Strong. Tests exercise real pure functions (no network mocking); the only injected deps are `write`/`buildTxn`/`buildQuestionTxn`, asserted by captured call args. Assertions are specific (event ordering, exact payload fields, derived-id equality, txn counts). Both happy and failure paths are covered, including the dual-write rejection and fold idempotency/no-mutation.

### Findings
1. **Failure path covered**: a `write` that resolves on `ChatMessageSubmitted` and rejects on `QuestionCreated` asserts the rejection propagates and the message write was observed — `src/lib/sessions.test.ts:692`.
2. **Idempotency proven**: two submits with the same `clientActionId` yield identical derived question ids — `src/lib/sessions.test.ts:668`.
3. **Fold robustness**: partial-payload fold (keys by `event.id`, defensive defaults), re-fold idempotency, no-mutation, and an order-independent rebuild round-trip — `src/lib/db.test.ts:166-374`.
4. **Specific assertions**: event order via `calls.map(c => c[0])`, exact `QuestionCreated` payload `messageId`/`participantId`/`questionId`, and `calls[1][2]` txn length — `src/lib/sessions.test.ts:637-651`.
5. **Minor nit (no action)**: SPEC AC names `classifyMessage('ok')`; the suite asserts the equivalent `'ok thanks'` / `'hello class'` casual cases. Intent fully covered; the exact literal `'ok'` is not separately asserted.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`, v8)
- Line / branch / function: Lines 86.84% / Branches 79.40% / Statements 84.32% / Functions 75% (all-files)
- Per-file: `db.ts` 91.07% stmts / 78.02% branch / 100% func / 92% lines; `sessions.ts` 93.23% / 84.82% / 77.27% / 95.72%. `classify.ts` is 100% on all axes (omitted from the table by the reporter's full-coverage skip).
- Regressions vs base (per-file): none — `db.ts` and `sessions.ts` both improved; all-files Statements 83.62→84.32, Branches 77.96→79.40, Lines 85.20→86.84, Functions unchanged at 75% (per BUILD.md, consistent with observed totals).
- New code without tests: none material. `defaultQuestionTxn` and `buildQuestion`'s defensive throws are unit-uncovered (e2e-exercised / unreachable-defensive), matching the existing `defaultChatTxn` convention.
- Specific scenarios missing tests: none required by SPEC. All AC bullets have unit and/or e2e coverage; the e2e leg asserts the live dual-write and the chat-only negative case.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `classifyMessage(text) -> { isQuestion: boolean }` single seam in `src/lib/classify.ts` | `AGENTS.md:42` | `src/lib/classify.ts:23` | OK |
| trailing-`?` heuristic, `null`/`undefined`/empty/whitespace → false, never throws | `AGENTS.md:42` | `src/lib/classify.ts:24-25` | OK |
| `submitChatMessage` issues a SECOND `writeEvent('QuestionCreated', …)` after the message write | `AGENTS.md:42` | `src/lib/sessions.ts:655` | OK |
| `questions` id derived via bijective `deriveQuestionId(messageId)` XOR with a fixed 16-byte namespace preserving v4 version/variant bits | `AGENTS.md:42` | `src/lib/classify.ts:59`, `:36` | OK |
| `buildQuestion(plan)` builds row + `actor.role: 'student'` envelope, payload `{ questionId, messageId, participantId, sessionId, status, createdAt }` | `AGENTS.md:42` | `src/lib/sessions.ts:568-585` | OK |
| new `questionMessage`/`questionParticipant`/`questionSession` links (forward `one`/reverse `many`) | `AGENTS.md:42`, `README.md:211` | `src/lib/db.ts:171-181` | OK |
| `applyEvent` folds `QuestionCreated` into a `questions` map keyed by `questionId ?? event.id` with defensive defaults | `AGENTS.md:42` | `src/lib/db.ts:349-378` | OK |
| `messages`/`questions` stay under `$default`; no `perms:push` this cycle | `AGENTS.md:42` | `src/lib/perms.ts` (`$default: 'true'`, unchanged in diff) | OK |
| e2e suite is `e2e/auto-create-question.spec.ts` | `AGENTS.md:42`, `README.md:215`, `release-notes.md` | `e2e/auto-create-question.spec.ts:1` | OK |
| Re-sending the same message never creates a duplicate Question; row carries no email | `README.md:209`, `release-notes.md` | `src/lib/classify.ts:59`, `src/lib/sessions.ts:594` | OK |
| Decision lives behind the single `classifyMessage` seam in `src/lib/classify.ts` (cycle 0009) | `CONTEXT.md:54` | `src/lib/classify.ts:23` | OK |
| Three additive schema links require `npx instant-cli push schema` | `README.md:211`, `release-notes.md` | `src/lib/db.ts:171-181` (additive links, no destructive change) | OK |

All enumerated doc claims pair to a confirming `file:line` at HEAD. No unbacked claims.
