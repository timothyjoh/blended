# Review: Cycle 0008

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

The slice is well-built, fully tested at the pure-core layer, and adheres closely to the SPEC and the join-slice template. One genuine defect remains: `db.useQuery` errors are logged but never surfaced inline (contrary to SPEC failure-behavior and PLAN Task 3), and a non-blank submit made while a query has errored is silently dropped with no user feedback.

## Code Quality Review

### Summary
Clean, idiomatic implementation that mirrors the established `joinSession` slice verbatim (pure builder → idempotency gate → thin injectable wrapper → fold case). Schema delta, fold, action core, island, and docs all land as planned. Idempotency design (deterministic `messages` row id === `clientActionId` + `inFlight` latch + `shouldSubmitChatMessage` pre-check) is sound. The sole gap is query-error surfacing at the UI edge.

### Findings
1. **Failure handling / silent failure**: `db.useQuery` errors (`sessionQ.error`, `partsQ.error`, `messagesQ.error`) are `console.error`'d but never written to `error` state, so the `student-chat-error` `role="alert"` block never renders for a query failure — SPEC requires inline surfacing — `src/components/StudentChat.tsx:69-71`, `src/components/StudentChat.tsx:152-156`.
2. **Failure handling / silent drop**: a non-blank submit while `messagesLoaded === false` (incl. `messagesQ.error`) fails the gate and returns with no error state set — the blank-text branch is the only feedback path — `src/components/StudentChat.tsx:94-108` (esp. line 106-107). Contrary to SPEC "rejected, not silently dropped".
3. **Coverage (informational, not a regression)**: `StudentChat.tsx` has no Vitest coverage (island; covered only by the loud-skipped e2e). Consistent with the established `JoinSession`/`StudentSession` pattern; the pure core (`buildChatMessage`/`shouldSubmitChatMessage`/`submitChatMessage`) and the fold are unit-tested — `src/lib/sessions.test.ts`, `src/lib/db.test.ts`.

### Spec Compliance Checklist
- [x] Single natural-text input, no message-type selector — `StudentChat.tsx:164-183`
- [x] Dual-write through `writeEvent('ChatMessageSubmitted', …)` only; `actor.role: 'student'` — `src/lib/sessions.ts:577-583`
- [x] Idempotency by client action id; deterministic row id === `clientActionId` — `src/lib/sessions.ts` (`buildChatMessage`/`defaultChatTxn`)
- [x] `applyEvent` folds `ChatMessageSubmitted`, no `UnknownEventTypeError` — `src/lib/db.ts:292`
- [x] Realtime stream scoped to session, client-sorted by `createdAt`/`id` — `StudentChat.tsx:53-60`
- [x] Late-joiner history (subscribe-on-load) — `StudentChat.tsx:53-55` + e2e leg
- [x] Teacher exclusion: `SessionLifecycle` mounts no chat island (grep confirmed absent) — verified
- [x] Privacy: stream renders `username` only, no email; record carries no email key — `StudentChat.tsx:64,145`; `sessions.test.ts` email-absence test
- [x] Schema delta (`messages.clientActionId` indexed, `messageSession` link) — `src/lib/db.ts:112,157-161`
- [x] Bad-input rejection before any write (blank/whitespace, missing ids) — `src/lib/sessions.ts:buildChatMessage`
- [ ] Unavailable dependency: `db.useQuery` error surfaced inline (`role="alert"`) — **NOT met** (console-only); see Findings 1–2
- [x] AGENTS.md / README.md updated per SPEC — both diffs present and accurate
- [x] SPEC has a populated `## Acceptance Criteria` section (11 bullets)
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting every AC bullet

## Adversarial Test Review

### Summary
Strong. Pure-core tests are specific and exhaustive (exact-object assertions, `it.each` over null/undefined/empty for every required field, blank/whitespace text matrix, gate truth table, wrapper call-shape + rejection propagation + never-called-on-invalid). E2e covers realtime, late-joiner, exclusion, dual-write counts, idempotency, and blank-failure with explicit testid waits and admin-count observability.

### Findings
1. **Assertion quality (strong)**: `buildChatMessage` asserts full record/meta objects with `toEqual`, not truthiness — `src/lib/sessions.test.ts:476-508`.
2. **Failure coverage (strong)**: rejected-`write` propagation and "write never called on invalid input" both asserted — `src/lib/sessions.test.ts` (`submitChatMessage wrapper`).
3. **Determinism (strong)**: out-of-order rebuild including chat messages compared with `toEqual` against in-order — `src/lib/db.test.ts:244-263`.
4. **Gap (minor)**: no unit/integration test exercises the query-error UI branch (Findings 1–2 above); the e2e idempotency leg relies on `dblclick` timing and is admin-gated, so the latch is unverified in token-less CI. Acceptable given the deterministic-id storage guarantee, but the query-error path is untested at every layer.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: Lines 85.2% / Branches 77.96% / Functions 75% (Statements 83.62%)
- Regressions vs base (per-file): none — all metrics rose vs the BUILD-reported base (81.59 / 75.5 / 75 / 83.52); `db.ts` and `sessions.ts` at 90.56%/95.57% statements
- New code without tests: `src/components/StudentChat.tsx` (island; e2e-only, loud-skips without `INSTANT_ADMIN_TOKEN`) — consistent with existing island pattern; `sessions.ts:543` (`defaultChatTxn` `db.tx` builder) uncovered, matching the established untested-default-txn pattern
- Specific scenarios missing tests: query-error inline surfacing and non-blank-submit-while-not-loaded drop (Findings 1–2) — untested at all layers

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `messages.clientActionId` (indexed) field added | `AGENTS.md:40` / `README.md:202` | `src/lib/db.ts:112` | OK |
| `messageSession` link added | `AGENTS.md:40` / `README.md:202` | `src/lib/db.ts:157-161` | OK |
| `applyEvent` folds `ChatMessageSubmitted` into a `messages` map | `AGENTS.md:40` | `src/lib/db.ts:292` | OK |
| `submitChatMessage`/`buildChatMessage` are the sole sanctioned message-create path via `writeEvent('ChatMessageSubmitted', …)` | `AGENTS.md:40` | `src/lib/sessions.ts:580` | OK |
| Row id IS the `clientActionId` (deterministic keyed upsert) | `AGENTS.md:40` / `README.md:201` | `src/lib/sessions.ts` (`buildChatMessage` `id: clientActionId`) | OK |
| Stream sorted client-side by `createdAt` then `id` | `AGENTS.md:40` | `src/components/StudentChat.tsx:57-60` | OK |
| Input gated on `isJoinEnabled(session)` AND `chatStatus === 'allowed'` | `AGENTS.md:40` | `src/components/StudentChat.tsx:66` | OK |
| Testids `student-chat-root/input/send/stream/message-item/error` (+ `student-chat-disabled`) | `AGENTS.md:40` | `src/components/StudentChat.tsx:135,166,176,138,142,153,159` | OK |
| Teacher facilitation view mounts no chat island | `AGENTS.md:40` / `README.md:191` | `src/components/SessionLifecycle.tsx` (no `StudentChat` import — grep confirms absent) | OK |
| E2e suite `e2e/student-chat.spec.ts` (realtime, late-joiner, exclusion, dual-write, idempotency, blank-failure) | `AGENTS.md:40` / `README.md:204` | `e2e/student-chat.spec.ts:68,123,150,99,161,206` | OK |
| Double-click still produces exactly one message | `README.md:201` | `src/components/StudentChat.tsx:87,90` (`inFlight` latch + deterministic id) | OK |
| Each send writes a `ChatMessageSubmitted` event + `messages` row in one transaction | `README.md:200-201` | `src/lib/sessions.ts:580` (`writeEvent` dual-write) | OK |
| Display name is email local-part only; messages never store/show email | `README.md:185-186` | `src/components/StudentChat.tsx:64,145`; `src/lib/sessions.ts` (record has no email key) | OK |
| Schema additive — push once with `npx instant-cli push schema`, no new `.env` keys | `AGENTS.md:40` / `README.md:203-204` | `src/lib/db.ts:112,157-161` (additive field+link); no `.env.example` change | OK |

All enumerated doc claims are backed; no unbacked claims.
