I have everything needed to produce the research document.

```markdown
# Research: Cycle 0009

## Cycle Context
SPEC.md asks for the interim, AI-free message-to-Question classification: a single, pure, total decision seam `classifyMessage(text) -> { isQuestion: boolean }` in a new `src/lib/classify.ts` implementing the trailing-`?` heuristic (`isQuestion` true iff the trimmed text ends with `?`), wired into the existing sole sanctioned chat submit path `submitChatMessage` (`src/lib/sessions.ts`). When a message is question-like, the submit path must additionally dual-write a `questions` projection row — id deterministically derived from the source `messageId` (idempotent keyed upsert), linked to the source `messages` row, the author `participants` row, and the `sessions` row, `status: 'submitted'`, carrying no email — plus a `QuestionCreated` event through the established `writeEvent()` helper (`actor.role: 'student'`, payload referencing `messageId`/`participantId`/`questionId`), issued as a **second** `writeEvent` transaction only after the `ChatMessageSubmitted` write succeeds. Schema gains the `questionMessage`/`questionParticipant`/`questionSession` links in `src/lib/db.ts`, and `applyEvent` must fold `QuestionCreated` into a `questions` map so `rebuildSessionProjection` stays whole. Non-question messages follow the cycle-0008 path unchanged.

## Current Codebase State

### Relevant Components
- Chat submit core (cycle 0008): `buildChatMessage` (pure builder) + `submitChatMessage` (thin async wrapper) — `src/lib/sessions.ts:480` and `src/lib/sessions.ts:569`. This is the sole sanctioned message-create path and the attachment point for Question creation.
- `MessageRecord` type and `ChatMessagePlan` — `src/lib/sessions.ts:444` and `src/lib/sessions.ts:467`. The plan exposes `record` and `meta`; `record.id === clientActionId === meta.payload.messageId`.
- `SubmitChatMessageDeps` (injectable `write`/`buildTxn`) and `defaultChatTxn` — `src/lib/sessions.ts:537` and `src/lib/sessions.ts:542`. `defaultChatTxn` builds `db.tx.messages[r.id].update({...}).link({ session: r.sessionId })`.
- Pure idempotency gate `shouldSubmitChatMessage` — `src/lib/sessions.ts:518`.
- `db.ts` schema, links, `writeEvent`, `applyEvent`, `rebuildSessionProjection` — `src/lib/db.ts`. The `questions` entity is already declared (`src/lib/db.ts:120`) but has no links and no fold.
- `writeEvent()` dual-write choke point — `src/lib/db.ts:377`. Validates input, stamps `id`/`occurredAt`/`receivedAt`/`schemaVersion`, then `db.transact([eventTx, ...projectionTxns])`.
- `applyEvent` fold + `SessionProjection` type + `UnknownEventTypeError` — `src/lib/db.ts:233`, `src/lib/db.ts:197`, `src/lib/db.ts:205`. The projection currently has no `questions` map; `emptyProjection` is `src/lib/db.ts:212`.
- `StudentChat` island (calls `submitChatMessage`) — `src/components/StudentChat.tsx:121`. No `endsWith('?')` or classification logic exists here today.
- Student page mounting the island — `src/pages/s/[joinCode].astro:20`.

### Existing Patterns to Follow
- Pure-core / thin-wrapper split: every action (create, lifecycle, join, chat) splits into a pure `build*` function that totally validates and returns `{ record/plan, meta }` BEFORE any write, and a thin async wrapper that routes the dual-write through `writeEvent`. See `buildChatMessage`/`submitChatMessage` — `src/lib/sessions.ts:480`, `src/lib/sessions.ts:569`; identical shape in `buildSessionCreate`/`createSession` (`src/lib/sessions.ts:75`, `:125`), `buildParticipantJoin`/`joinSession` (`src/lib/sessions.ts:341`, `:417`).
- Pure-seam isolation precedent: pure, total, db-free decision functions kept apart from impure writers — e.g. `isJoinEnabled` (`src/lib/sessions.ts:293`), `generateJoinCode` (`src/lib/sessions.ts:35`), `assertLegalTransition` (`src/lib/sessions.ts:164`). The new `classifyMessage` follows this style (likely its own module `src/lib/classify.ts` per SPEC scope).
- Trimming convention: stored text is trimmed before persistence — `buildChatMessage` does `(input.text ?? '').trim()` (`src/lib/sessions.ts:489`). SPEC requires `classifyMessage` to apply the same trim before the trailing-`?` check.
- Deterministic-id idempotency (keyed upsert): the `messages` row id IS the `clientActionId` so a repeat logical submit re-upserts one row — `src/lib/sessions.ts:494`, `:506`. SPEC requires the `questions` row id be deterministically derived from `messageId` to mirror this guarantee.
- Injectable deps for unit-testing without a network: `*Deps = { write?: typeof writeEvent; buildTxn?: ... }`, defaulted in the wrapper — `src/lib/sessions.ts:537`, `:574`. Tests pass fake `write`/`buildTxn` (see Test Infrastructure).
- Projection txn with parent link: `db.tx.<entity>[id].update({...}).link({ session: sessionId })` — `defaultChatTxn` (`src/lib/sessions.ts:542`), `defaultParticipantTxn` (`src/lib/sessions.ts:391`). The Question txn must set `message`/`participant`/`session` links via the new schema links.
- Envelope meta shape: `{ sessionId, actor: { id, role }, payload }`; `actor.role` must be one of `ACTOR_ROLES` (`src/lib/db.ts:29`); student actions use `actor.role: 'student'` (`src/lib/sessions.ts:505`). `writeEvent` rejects an invalid role (`src/lib/db.ts:387`).
- Fold convention (defensive, tolerant, idempotent, immutable): each `applyEvent` case reads `event.payload` with optional fields, applies typeof-guarded defaults, returns a NEW projection object, and never mutates input. The closest template is the `ChatMessageSubmitted` case keyed into a `messages` map — `src/lib/db.ts:292`. `ParticipantJoined` (`src/lib/db.ts:271`) shows the keyed-map + `?? event.id` fallback pattern. Unknown types throw `UnknownEventTypeError` via the `default` (`src/lib/db.ts:318`).
- Failure handling: `writeEvent` validates before transacting and writes nothing on bad input; append + projection share ONE `db.transact`, so a rejected transaction is atomic (no partial dual-write) and the rejection propagates — never swallowed (`src/lib/db.ts:413`). Wrappers re-throw by not catching (e.g. `submitChatMessage` awaits `write(...)` and returns; rejection bubbles — `src/lib/sessions.ts:576`). NOTE for SPEC: `QuestionCreated` is a SECOND `writeEvent` transaction issued only after the first succeeds; event + projection share that second transaction so a failed Question write leaves the message chat-only with no orphan Question row.
- Component-level failure surfacing: `StudentChat` logs with the `[StudentChat] …` prefix and renders an inline `role="alert"` (`student-chat-error`), keeping the input usable — `src/components/StudentChat.tsx:76`, `:131`, `:160`. On submit failure the action id is retained for idempotent retry (`src/components/StudentChat.tsx:131`).
- Observability: every mutation appends a `sessionEvents` envelope via `writeEvent` (`src/lib/db.ts:401`); there is no separate metrics/log sink. The `QuestionCreated` event IS the observability signal (SPEC). Component query/submit errors go to `console.error('[StudentChat] …')` (`src/components/StudentChat.tsx:71`, `:79`).
- Idempotency / retry-safety: deterministic row ids (message id = client action id; question id derived from message id) make a retry re-upsert the same rows; caller-side `shouldSubmitChatMessage` + `inFlight` ref latch + per-submit `currentActionId` ref suppress duplicate envelopes — `src/lib/sessions.ts:518`, `src/components/StudentChat.tsx:32`, `:93`. `writeEvent` itself is NOT idempotent (each call appends a fresh event — `src/lib/db.ts:372`); idempotency is achieved through deterministic projection ids + caller pre-checks.

### Dependencies & Integration Points
- Cycle 0008 chat submit path (`submitChatMessage`/`buildChatMessage`, `MessageRecord`, `messageSession` link, `ChatMessageSubmitted` fold) — `src/lib/sessions.ts`, `src/lib/db.ts`. The Question hook attaches here.
- `questions` entity already declared (`status`, `sessionId` indexed, `activeResourceIdAtSubmission?`, `addressedBy?`, `answerSummary?`, `createdAt`) — `src/lib/db.ts:120`. This cycle adds its links + fold; `activeResourceIdAtSubmission` stays unpopulated (out of scope).
- `writeEvent()` and the `id()` re-export — `src/lib/db.ts:377`, `src/lib/db.ts:171`.
- Schema links pattern to mirror (forward `one` / reverse `many`) — `messageSession` (`src/lib/db.ts:160`), `participantSession` (`src/lib/db.ts:151`), `sessionResourceSession` (`src/lib/db.ts:141`). New links needed: `questionMessage`, `questionParticipant`, `questionSession`.
- Permissions: `messages` and `questions` are both under the permissive `$default` rule (`allow: { $default: 'true' }`) — `src/lib/perms.ts:25`. SPEC explicitly defers tightening; no `perms:push` this cycle. `sessionEvents` create is `auth.id != null` (`src/lib/perms.ts:84`).
- Env: `PUBLIC_INSTANTDB_APP_ID` required at module init (`src/lib/db.ts:26`, `requireAppId` `src/lib/db.ts:17`); `INSTANT_ADMIN_TOKEN` is e2e-only for `queryAdmin` observability (`e2e/support/auth.ts`, `adminAvailable` line 14).
- Additive InstantDB schema push (`npx instant-cli push schema`) for the new `questions` links before the feature works against a schema-enforced live app (per SPEC + AGENTS.md cycle-0008 precedent — `AGENTS.md:40`).

### Test Infrastructure
- Test framework: Vitest for unit (`npm run test` → `vitest run`, `package.json:11`); Playwright for e2e (`npm run test:e2e`, `package.json:14`). Type/lint gate via `astro check` (within `npm run build`, `package.json:7`).
- Test conventions: unit tests live beside modules as `src/lib/*.test.ts` (`auth.test.ts`, `db.test.ts`, `perms.test.ts`, `routing.test.ts`, `sessions.test.ts`). `import { describe, it, expect } from 'vitest'` (`src/lib/sessions.test.ts:1`). E2E specs in `e2e/*.spec.ts` with shared helpers in `e2e/support/auth.ts`.
- Mocking approach (unit): inject fake `write`/`buildTxn` deps rather than mocking the network. The chat wrapper tests push call-args into an array and assert `calls[0][0] === 'ChatMessageSubmitted'`, the meta `sessionId`/`actor.role`, and `calls[0][2]` length — `src/lib/sessions.test.ts:589`. The new `submitChatMessage` Question legs follow this exact pattern.
- E2E approach: multi-context (teacher + student browser contexts), `queryAdmin` (`e2e/support/auth.ts:43`) for observability reads, `freshEmail`/`signInViaUi`/`mintCode` helpers, `test.skip(!adminAvailable(), …)` loud-skip guard (`e2e/student-chat.spec.ts:24`), explicit testid waits, `retries: 3` for realtime flake. SPEC mandates a new `e2e/auto-create-question.spec.ts` following this pattern.
- Current coverage of the change area:
  - `buildChatMessage`: record shape, envelope, id equality, trimming, no-email, all validation throws — `src/lib/sessions.test.ts:471`.
  - `submitChatMessage`: one write with `ChatMessageSubmitted` + one txn, rejected-write propagation, invalid-input pre-write throw — `src/lib/sessions.test.ts:580`.
  - `applyEvent` `ChatMessageSubmitted` fold (happy, accumulation, partial payload, no-mutation) and unknown-type throw — `src/lib/db.test.ts:84` onward; fold fixtures at `src/lib/db.test.ts:69`–`83`.
  - `rebuildSessionProjection` determinism incl. chat messages — `src/lib/db.test.ts:222`, `:244`.
  - E2E chat dual-write counts, idempotency (dblclick), blank-failure — `e2e/student-chat.spec.ts:99`, `:161`, `:206`.
- Failure-path test coverage (exists for the change area): rejected-write propagation (`src/lib/sessions.test.ts:606`), pre-write validation throw (`src/lib/sessions.test.ts:614`), unknown-event-type throw (`src/lib/db.test.ts:151`), partial-payload defensive fold (`src/lib/db.test.ts:126`), blank-submit e2e (writes nothing + surfaces rejection, `e2e/student-chat.spec.ts:206`). SPEC adds: injected failing Question write surfaces the error and leaves no orphan `questions` row.
- No `classifyMessage`, `QuestionCreated`, `questionMessage`, `questionParticipant`, or `questionSession` exists anywhere in `src/` or `e2e/` today (grep returned none) — this is greenfield against the cycle-0008 base.

## Code References
- `src/lib/sessions.ts:480` — `buildChatMessage` pure builder (validation, trim, `record.id === clientActionId === payload.messageId`).
- `src/lib/sessions.ts:542` — `defaultChatTxn` (`db.tx.messages[id].update().link({ session })`), the txn-builder template for the Question row.
- `src/lib/sessions.ts:569` — `submitChatMessage` wrapper (single `writeEvent('ChatMessageSubmitted', …)`), the integration point for the second Question write.
- `src/lib/db.ts:120` — `questions` entity declaration (links + fold to be added).
- `src/lib/db.ts:160` — `messageSession` link, the forward-one/reverse-many template for the three new question links.
- `src/lib/db.ts:197` — `SessionProjection` type (no `questions` map yet); `emptyProjection` at `:212`.
- `src/lib/db.ts:292` — `applyEvent` `ChatMessageSubmitted` fold case, the template for the `QuestionCreated` fold.
- `src/lib/db.ts:318` — `default` case throwing `UnknownEventTypeError` (what `QuestionCreated` would hit until a case is added).
- `src/lib/db.ts:377` — `writeEvent` dual-write choke point (atomic event + projection).
- `src/lib/perms.ts:25` — permissive `$default` covering `messages`/`questions` (no `perms:push` this cycle).
- `src/components/StudentChat.tsx:121` — the `submitChatMessage` call site; surfacing/retain-id failure handling at `:76`/`:131`.
- `src/lib/sessions.test.ts:580` — `submitChatMessage` wrapper test block (dep-injection assertion pattern).
- `src/lib/db.test.ts:69` — chat fold fixtures; `:84` `applyEvent` describe; `:222` `rebuildSessionProjection` describe.
- `e2e/student-chat.spec.ts:1` — cycle-0008 e2e multi-context + `queryAdmin` pattern for the new question spec to mirror.
- `e2e/support/auth.ts:43` — `queryAdmin`; `:14` `adminAvailable` loud-skip guard.
- `CONTEXT.md:54` — Question glossary entry already describing the trailing-`?` interim heuristic.
- `AGENTS.md:40` — cycle-0008 Data Layer note (the location/style the cycle-0009 note must extend).

## Open Questions
- Module location of the seam: SPEC names `src/lib/classify.ts`; confirm whether `classifyMessage` lives there as its own module (matching `src/lib/auth.ts`/`routing.ts` standalone-pure-module precedent) versus being colocated in `sessions.ts` — SPEC text says `src/lib/classify.ts`, so a new module with a beside-it `classify.test.ts` is implied.
- Deterministic question-id derivation function: SPEC requires the `questions` id be "deterministically derived from the source `messageId`" but does not pin the exact derivation (e.g. a fixed-namespace transform vs. reusing `messageId` directly). The plan must choose a concrete, collision-safe, UUID-valid derivation (the `questions` row id must remain a valid InstantDB UUID like the `messages` keyed-upsert id).
- Whether `SessionProjection` should also expose a `questions` map publicly (SPEC says fold `QuestionCreated` into a `questions` map) — confirm the projection type extension and `emptyProjection` default shape the plan adds.
- Exact `QuestionCreated` payload field names (`messageId`, `participantId`, `questionId`) and whether `status`/`createdAt`/`sessionId` belong in the payload for the fold to reproduce the row — SPEC lists the references but the fold's defensive defaults need the precise keys fixed in the plan.
```
