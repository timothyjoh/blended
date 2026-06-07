All quality gates pass. Final verification confirms 193 Vitest tests pass, `astro check` is clean, and the e2e suite loud-skips without admin env.

## Summary

This cycle delivered the student-chat vertical slice end-to-end. **`src/lib/db.ts`** (+43 lines) gained the `messages.clientActionId` indexed field, the `messageSession` link, a `messages` map on `SessionProjection`/`emptyProjection`, and a `ChatMessageSubmitted` fold case in `applyEvent` (defensive defaults, keyed by `messageId`), completing **PLAN Task 1**. **`src/lib/sessions.ts`** (+152 lines) added the pure chat action core — `MessageRecord`, `buildChatMessage` (total pre-validation, `record.id === clientActionId === payload.messageId`), `shouldSubmitChatMessage` (idempotency gate), `defaultChatTxn` (update + `session` link), and the thin `submitChatMessage` wrapper — mirroring the join slice (**Task 2**). **`src/components/StudentChat.tsx`** (new, 186 lines) is the single-input realtime island, gated on `isJoinEnabled` + `chatStatus === 'allowed'`, idempotent via a `currentActionId`/`inFlight` ref pair, mounted on **`src/pages/s/[joinCode].astro`** beside `StudentSession` (**Task 3**). The teacher facilitation view was confirmed chat-free by inspection (**Task 4**). **`e2e/student-chat.spec.ts`** (new, 234 lines) covers realtime B→C, late-joiner D, teacher exclusion, dual-write counts, idempotency, and blank-failure (**Task 5**). **AGENTS.md** and **README.md** gained the cycle-0008 notes; `.env.example` needed no change (no new keys) (**Task 6**). The **walkthrough** (new, 185 lines) drives the real flow with 7 capture points (`01-teacher-session-live` … `07-blank-rejected`).

**Tests:** `npm test` (`vitest run`) → **193 passed** (was 155; +38 new across `db.test.ts` and `sessions.test.ts`). **Coverage:** `npm run test:coverage` → Statements **83.62%** (was 81.59), Branches **77.96%** (was 75.5), Functions **75%** (unchanged), Lines **85.2%** (was 83.52) — no metric regressed; the single uncovered new line (`sessions.ts:543`, `defaultChatTxn`'s `db.tx` builder) matches the established untested-default-txn pattern. `npm run astro check` → 0 errors, 0 warnings (35 pre-existing library hints). `npm run test:e2e` (student-chat) → 5 loud-skipped (no `INSTANT_ADMIN_TOKEN`); the verify gate exercises the real legs when the token is present (`playwright.config.ts` already sets `retries: 3`).

**Failure modes handled:** *bad input* — `buildChatMessage` throws synchronously before any plan on missing `sessionId`/`participantId`/`userId`/`clientActionId` and on blank/whitespace-only text (unit tests: `it.each([null, undefined, ''])` per field + blank-text rejection); *not-live / not-eligible* — the island rejects submit with a non-blank message rather than dropping it; *rejected transaction* — `submitChatMessage` does not catch, the rejection propagates (unit test: rejected fake `write`), the island surfaces it inline (`student-chat-error`, `role="alert"`) + `console.error`, and atomic dual-write leaves no orphan state; *invalid input never writes* — unit test asserts the fake `write` is never called; *duplicate* — deterministic keyed-upsert row id + `inFlight` latch + `shouldSubmitChatMessage` collapse a double-fire to one row/event (e2e `dblclick` idempotency leg); *unknown event type* — the `applyEvent` `default` still throws `UnknownEventTypeError` (regression-guarded).

**Deviations from PLAN.md:** the island resolves the caller's own participant by filtering the existing by-`sessionId` participants query (reused for the username map) instead of adding a separate `(sessionId, userId)` probe — fewer queries, same result; and `existingForActionId` for the gate is computed from the loaded `messages` set rather than a dedicated per-action-id probe (the plan explicitly permitted keeping the probe minimal and relying on the deterministic id). Added a `student-chat-disabled` testid for the not-eligible state (documented in AGENTS.md).

**Deferred / follow-up:** tightening the `messages` permission rule (stays under `$default` this cycle, per plan); AI classification/moderation/visibility transitions; question derivation; rate-limiting — all out of scope per SPEC. Operator step: run `npx instant-cli push schema` before the feature works against a schema-enforced live app (additive, idempotent; no `perms:push`).

## Touched Files
- src/lib/db.ts
- src/lib/db.test.ts
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- src/components/StudentChat.tsx
- src/pages/s/[joinCode].astro
- e2e/student-chat.spec.ts
- AGENTS.md
- README.md
- docs/cycle/0008-feature-student-chat-send-realtime-stream-teache/walkthrough.mjs
