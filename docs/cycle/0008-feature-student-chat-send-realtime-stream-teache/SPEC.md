# SPEC — Cycle 0008: Student Chat — Send & Realtime Stream (Teachers Excluded)

## WHY
Students who join a live session (cycle 0007) can currently only *observe*
presence and status — there is no way to participate. The product spine (SPEC
§1) treats student messages as the raw participation signal that everything
downstream (questions, clusters, AI triage, moderation, replay) derives from,
yet today no message can be submitted. Without a student input and a shared
stream, the session is a read-only roster, not a classroom. The teacher must
also be kept out of the raw chat stream (SPEC §9.3 / §9.2.6): the teacher works
from curated Questions, not by reading every message, so leaking the stream into
the facilitation view would defeat the product's core distinction.

## CONCRETE USER BENEFIT
A student in a live session can type a message into a single input box, press
send, and watch it appear in the shared chat stream — and every other student in
that session sees it appear in realtime without reloading. A student who joins
late sees the chat history that was posted before they arrived. The teacher,
viewing the same live session, never sees that raw stream.

## USABLE END-STATE
- On the student session view (`/s/:joinCode`) of a `live` session, there is
  exactly one natural-text input and a send control — no message-type selector.
- Submitting non-blank text posts the message; it renders in the student's own
  stream and in every other student's stream in realtime.
- A student loading the view after messages were posted sees the prior history.
- The teacher facilitation view (`/dashboard/sessions/:id`) renders no chat
  stream and no chat input.
- Each submit writes both a `ChatMessageSubmitted` `sessionEvents` envelope and a
  `messages` projection row in one transaction, through `writeEvent()`.
- A double-submit carrying the same client action id produces one message, not
  two.

## Objective
Deliver the student chat vertical slice end-to-end: a single natural-text input
on the student session view, an idempotent dual-write submit path
(`ChatMessageSubmitted` event + `messages` projection in one `writeEvent()`
transaction, de-duplicated by a client action id), a realtime-syncing student
chat stream that includes late-joiner history, and the deliberate exclusion of
that stream from the teacher facilitation view. This is the first cycle in which
a student can actually *participate* in a session, turning the read-only roster
into a live classroom surface and producing the raw `Message` signal that all
later question/triage cycles depend on.

## Source Issue
`txt-20260606-213638-student-chat-send-stream` — "Student chat: send + realtime
stream (teachers excluded)"

## Scope

### In Scope
- A sanctioned submit path in `src/lib/sessions.ts` (`submitChatMessage` +
  pure `buildChatMessage`, mirroring the `joinSession` / `buildParticipantJoin`
  split) that routes the dual-write through `writeEvent('ChatMessageSubmitted', …)`,
  validates input totally before producing any plan, is idempotent per client
  action id, and is folded by a new `ChatMessageSubmitted` case in
  `applyEvent`. Includes the schema change to `messages` needed to de-dup
  (a `clientActionId` field) and a `messageSession` link for enumeration.
- A student chat island (e.g. `StudentChat.tsx`) — single input + send + the
  realtime-syncing message stream — mounted on the student session view
  (`/s/:joinCode`), gated so it only accepts input when the session is `live`.
- Confirming the teacher facilitation view (`/dashboard/sessions/:id`) renders
  no chat stream/input (assertion-backed; no chat island is added there).

### Out of Scope
- AI classification, moderation, visibility transitions, and optimistic
  pending/rejected display (SPEC §9.1 categories, §10) — messages render
  visible; classification/moderation events are a later batch.
- Question derivation from chat / `?`-detection (next issue,
  `txt-20260606-213639`).
- Teacher-facing question queue, endorsements, answered section.
- Roster/presence changes, cursor voting, resource rendering.
- Rate-limiting message submission (SPEC §16.9) — deferred.

## Requirements
- **Single natural input (SPEC §9.1):** exactly one text input, no message-type
  selector. Students MUST NOT choose a type before submitting.
- **Dual-write through `writeEvent()` only (AGENTS.md / ADR-0001, ADR-0003):**
  every submit appends a `ChatMessageSubmitted` envelope AND applies the
  `messages` projection update in a single `db.transact()`. No projection-only
  `messages` write may exist in product code. Envelope `actor.role` is
  `'student'`; `sessionId` is the real session id.
- **Idempotency (SPEC §15, §17.2):** submission de-dups on a client action id.
  Re-submitting the same client action id MUST NOT create a second event or
  projection row. The `messages` projection row id is derived deterministically
  from the client action id (mirroring the `participantId === record.id` pattern)
  so the `applyEvent` fold reproduces the same row, and a pre-check (mirroring
  `shouldCreateParticipant`) plus an in-flight latch prevents the double write.
- **Realtime stream:** the student view subscribes via `db.useQuery` over
  `messages` scoped to the session, ordered by `createdAt`, so a message posted
  by one student appears in every other student's stream with no reload, and a
  late-joiner's first load shows prior history.
- **Teacher exclusion (SPEC §9.3):** the teacher facilitation view renders no
  raw chat stream and no chat input.
- **Privacy:** the stream renders the participant `username` (local-part) only,
  never an email — consistent with the existing structural-privacy rule;
  messages carry no email.
- **Conventions:** no-semicolon TS, two-space indent, Tailwind utilities,
  `.tsx` island; UUID ids via `id()` re-exported from `@/lib/db`.
- **Failure behavior:**
  - **Bad input:** blank/whitespace-only text is rejected by `buildChatMessage`
    BEFORE any write (throws); the input surfaces the rejection and writes
    nothing. Missing `sessionId`, missing/empty `participantId`, or missing
    client action id throw before producing a plan.
  - **Not-live session:** when the session is not `live` (or the participant's
    `chatStatus` is not `allowed`), submission is disabled and any attempted
    submit is rejected, not silently dropped (SPEC §17.2 asserts `status == live`).
  - **Unavailable dependency / rejected transaction:** a failed `writeEvent`
    transaction or a `db.useQuery` error is surfaced (`role="alert"` inline +
    `console.error`), never swallowed; a rejected submit leaves no partial state
    (no orphan event, no orphan projection row).
  - **Duplicate:** a repeated client action id is a no-op for storage (one
    message), not an error shown to the user.

## Acceptance Criteria
- [ ] A student submits non-blank text on a `live` session's `/s/:joinCode`
      view and it appears in that student's chat stream and in another student
      context's stream in realtime, with no reload (user-observable benefit).
- [ ] The student chat surface contains exactly one text input and no
      message-type selector (assert single input / absent selector testid).
- [ ] A context loading `/s/:joinCode` after messages were posted renders the
      prior chat history (late-joiner sync).
- [ ] The teacher facilitation view (`/dashboard/sessions/:id`) renders no chat
      stream and no chat input (assert the chat stream/input testids are absent
      from the DOM).
- [ ] Each submit writes both a `ChatMessageSubmitted` `sessionEvents` envelope
      and a `messages` projection row through `writeEvent()` (admin-read
      observability assertion: counts match, one of each per logical message).
- [ ] **Failure path:** submitting the same client action id twice results in
      exactly one rendered message and exactly one `messages` row / one
      `ChatMessageSubmitted` event (idempotency).
- [ ] **Failure path:** submitting blank/whitespace-only text writes nothing
      (no new event, no new row) and the input shows a non-blank rejection;
      state is unchanged.
- [ ] `buildChatMessage` and the idempotency pre-check are covered by Vitest
      unit tests (valid plan shape, blank-text rejection, missing-field
      rejection, deterministic row id from client action id).
- [ ] `applyEvent` folds `ChatMessageSubmitted` and does not raise
      `UnknownEventTypeError` for it; folding the log reproduces the stream.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).
- [ ] `npm run astro check` passes with no new compiler/linter warnings.

## Testing Strategy
- **Vitest** for the pure core: `buildChatMessage` (valid plan, blank/whitespace
  rejection, missing `sessionId`/`participantId`/client-action-id rejection,
  deterministic projection id derived from the client action id), the
  `shouldCreate`-style idempotency pre-check, and the `applyEvent`
  `ChatMessageSubmitted` fold. Specs live beside the module (`*.test.ts`).
- **Playwright** (`e2e/student-chat.spec.ts`, skips loudly without
  `INSTANT_ADMIN_TOKEN`), driving the dev server on port 4399:
  - Happy path: contexts B and C (students) both see B's message appear without
    reload.
  - Late-joiner: context D joins after messages exist and sees prior history.
  - Teacher exclusion: context A (teacher) on the facilitation view — assert the
    chat stream/input testids are not present in the DOM.
  - Idempotency: submit the same client action id twice; assert exactly one
    message renders and (via `queryAdmin`) one row + one event exist.
  - Failure: blank submit writes nothing and surfaces a rejection.
- Reuse the existing multi-context auth/seed helpers (`e2e/support/auth.ts`,
  `queryAdmin`).

## Documentation Updates
- **AGENTS.md**: add a "Student chat (cycle 0008)" note in the Data Layer
  section documenting `submitChatMessage` / `buildChatMessage` as the sole
  sanctioned message-create path, the idempotency-by-client-action-id contract,
  the new `messages.clientActionId` field + `messageSession` link, the
  `ChatMessageSubmitted` fold, the teacher-exclusion invariant, and the fixed
  testids downstream cycles reuse (e.g. `student-chat-root`, `student-chat-input`,
  `student-chat-send`, `student-chat-stream`, `student-chat-message-item`,
  `student-chat-error`).
- **README.md**: surface that students can now send chat messages in a live
  session and see the realtime stream (teachers see Questions, not chat).
- **.env.example / release notes**: no new keys expected; note the schema delta
  (`messages.clientActionId`, `messageSession` link) requires
  `npx instant-cli push schema` before the feature works live.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Active session lifecycle (`startSession`/`endSession`, cycle 0006) and
  `isJoinEnabled` — chat only on `status === 'live'`.
- Joined participants (`joinSession`, cycle 0007) — a submitter must be a
  participant with `chatStatus: 'allowed'`; the student view `/s/:joinCode` and
  its `db.useQuery` plumbing already exist (`StudentSession.tsx`).
- `writeEvent()` dual-write helper, `applyEvent` fold, and `id()` (`src/lib/db.ts`).
- Schema delta (`messages.clientActionId` field, `messageSession` link) pushed
  with `npx instant-cli push schema`; permission rules pushed with
  `npm run perms:push` if a `messages` rule is added.
- `PUBLIC_INSTANTDB_APP_ID` (app); `INSTANT_ADMIN_TOKEN` (e2e observability only).
