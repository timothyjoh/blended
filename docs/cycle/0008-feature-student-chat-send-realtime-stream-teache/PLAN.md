# Implementation Plan: Cycle 0008

## Overview
Deliver the student-chat vertical slice: a single natural-text input on the student session view (`/s/:joinCode`) that performs an idempotent dual-write (`ChatMessageSubmitted` envelope + `messages` projection row in one `writeEvent()` transaction, de-duplicated by a client action id), a realtime-syncing chat stream with late-joiner history, the `applyEvent` fold for `ChatMessageSubmitted`, and the deliberate exclusion of that stream from the teacher facilitation view.

## Current State (from Research)
- **Data spine** (`src/lib/db.ts`): `messages` entity exists (`sessionId` indexed, `participantId`, `text`, `visibility`, `classificationStatus`, `createdAt`) but has **no `clientActionId` field and no `messageSession` link**. `links` holds only `sessionResourceSession` and `participantSession`. `SessionProjection` (`db.ts:183`) has `session` + `participants` only — no `messages` map. `applyEvent` (`db.ts:218`) is a `switch` with a `default` that throws `UnknownEventTypeError`. `writeEvent` (`db.ts:336`) is the sole dual-write choke point, validates before any transaction, is NOT idempotent (dedup is the caller's job).
- **Action module** (`src/lib/sessions.ts`): the join slice is the exact template the SPEC names — `buildParticipantJoin` (pure builder, totally validates, `participantId === record.id === payload.participantId`), `shouldCreateParticipant` (pure idempotency gate), `defaultParticipantTxn` (`.update(...).link({ session })`), `joinSession` (thin wrapper, injectable `deps`).
- **Student view** (`src/components/StudentSession.tsx`): read-only live-syncing presence surface on `/s/[joinCode]`, queries `participants` by `sessionId`. Mount point for the chat island. Error pattern: `console.error` + `role="alert"`.
- **Membership probe** (`src/components/JoinSession.tsx:35`-`39`): the `(sessionId, userId)`-keyed participants query + `inFlight` ref latch + `shouldCreateParticipant` idempotency pattern to mirror for resolving the caller's own `participantId`.
- **Teacher view** (`src/components/SessionLifecycle.tsx`): facilitation island on `/dashboard/sessions/[id]` — must remain chat-free.
- **Permissions** (`src/lib/perms.ts:26`): `messages` sits under permissive `$default` (`view/create/update/delete = 'true'`); `sessionEvents.create = 'auth.id != null'` already permits the envelope append.
- **Tests**: Vitest specs beside the module (`src/lib/db.test.ts`, `src/lib/sessions.test.ts`) with injected `deps` and `EventLike` fixtures; Playwright multi-context A/B/C/D pattern in `e2e/join-via-link.spec.ts` with `queryAdmin` observability and `adminAvailable()` skip-gate. No full-projection literal `toEqual` exists, so extending `emptyProjection` is safe.

## Resolved Open Questions
1. **`SessionProjection` shape for the fold** → Extend `SessionProjection` with a `messages: Record<string, { id; participantId; text; createdAt }>` map and add `messages: {}` to `emptyProjection`. The `ChatMessageSubmitted` case keys by the deterministic message id, exactly mirroring `ParticipantJoined`'s `participants` map. Existing `db.test.ts` assertions are field-scoped or compare two rebuilt projections to each other (no hand-built full-projection literal), so this is non-breaking.
2. **`messages` permission rule** → **Leave `messages` under the permissive `$default` this cycle; no `perms:push`.** Read-visibility policy is explicitly out of scope (SPEC Out of Scope; §9.1 categories deferred), the realtime stream requires open cross-student reads, and `sessionEvents.create` already admits the envelope. Tightening `messages` is a documented Batch-2 follow-up. The `messageSession` link is still added (for enumeration parity), but no rule is based on it this cycle.
3. **Client action id source** → Mint one id per *pending submit*, held in a `currentActionId` ref. On submit, if the ref is empty mint `id()`; use it verbatim as the `messages` row id (`record.id === clientActionId === payload.messageId`). Clear the ref + input on success so the next send mints a fresh id; **keep** it on failure so a retry of the same logical submit reuses it and the keyed-upsert collapses a double-fire to one row. An `inFlight` ref latch guards against concurrent double-submit; the deterministic keyed-upsert id makes the write idempotent even under a race.
4. **Participant resolution on the chat island** → Resolve the caller's own `participantId` via a `(sessionId, userId)` participants query on the island (exactly as `JoinSession.tsx:35`-`39`). Input is enabled only when `isJoinEnabled(session)` is true **and** a participant row exists for `(session, user)` with `chatStatus === 'allowed'`. When the user is not yet a participant or not allowed, render a disabled, non-actionable state (not an error). Students reach `/s/:joinCode` via the join flow, so the row normally exists.

## Desired End State
- `messages` entity carries `clientActionId`; a `messageSession` link exists; schema pushed via `npx instant-cli push schema`.
- `applyEvent` folds `ChatMessageSubmitted` into a `messages` map and never throws `UnknownEventTypeError` for it.
- `src/lib/sessions.ts` exports `buildChatMessage` (pure), `shouldSubmitChatMessage` (gate), `submitChatMessage` (thin wrapper), unit-tested.
- `src/components/StudentChat.tsx` exists, mounted on `/s/[joinCode]` beside `StudentSession`, with one input + send + a realtime-syncing message stream, gated on `live` + participant eligibility, idempotent per client action id, with surfaced errors.
- The teacher facilitation view renders no `student-chat-*` testids (assertion-backed).
- `npm run test`, `npm run test:e2e`, and `npm run astro check` all pass.

Verify: `npm run test` (Vitest), `npm run test:e2e` (Playwright, requires `INSTANT_ADMIN_TOKEN`), `npm run astro check`.

## What We're NOT Doing
- AI classification, moderation, visibility transitions, optimistic pending/rejected display (SPEC §9.1 / §10) — messages render visible.
- Question derivation / `?`-detection (next issue, `txt-20260606-213639`).
- Teacher-facing question queue, endorsements, answered section.
- Roster/presence changes, cursor voting, resource rendering.
- Rate-limiting submission (SPEC §16.9).
- Tightening the `messages` permission rule (deferred — stays under `$default`; no `perms:push` this cycle).
- Message edit/delete.

## Implementation Approach
Follow the join slice verbatim as the template. Build bottom-up in vertical slices: (1) schema + fold so the log is replayable; (2) pure action core in `sessions.ts` (builder + gate + wrapper) unit-tested with injected `deps`; (3) the `StudentChat` island wiring identity, the membership/eligibility probe, the realtime query, the idempotent submit, and error surfacing, mounted on the existing student page; (4) the teacher-exclusion assertion; (5) the multi-context e2e; (6) docs. The message row id equals the client action id (deterministic keyed upsert), which is what makes the dual-write idempotent and the fold reproduce the stream. The stream query is scoped by the indexed `sessionId` and sorted client-side by `createdAt` (tie-break by id) to avoid requiring a new server-side order index.

## Failure & Resilience Decisions

**Task 1 — schema + `applyEvent` fold**
- **Failure modes**: `applyEvent` meeting an unknown type still throws `UnknownEventTypeError` (loud, never silent). The new case tolerates absent prior `messages` state and missing payload fields (defensive defaults, mirroring `ParticipantJoined`), so an out-of-order/partial log folds without a spurious throw. Schema push (`instant-cli push schema`) is an operator step outside the build; if the field/link is absent live, writes that set `clientActionId`/`messageSession` fail at `db.transact()` and surface to the island error path.
- **Idempotency**: `applyEvent` is pure — re-folding the same event reproduces the identical `messages[id]` entry (keyed by the deterministic id). `instant-cli push schema` is idempotent (additive field + link; re-push is a no-op).
- **Observability**: divergence surfaces as `UnknownEventTypeError`; the fold is covered by Vitest fixtures.
- **No silent failure**: confirmed — the `default` branch throws; no `catch` added.

**Task 2 — `buildChatMessage` / `shouldSubmitChatMessage` / `submitChatMessage`**
- **Failure modes**: `buildChatMessage` throws synchronously BEFORE producing a plan on blank/whitespace-only text, missing `sessionId`, missing/empty `participantId`, or missing `clientActionId` — so nothing is ever written for invalid input. `submitChatMessage` does not catch; a rejected `writeEvent` propagates. The dual-write is atomic, so a rejected submit leaves no orphan event or row.
- **Idempotency**: the `messages` row id === `clientActionId` (deterministic keyed upsert), so re-running `submitChatMessage` with the same id writes the same row, not a second. `shouldSubmitChatMessage` is the pure pre-check (authed + query loaded + eligible + no existing row for this action id + not in flight). `writeEvent` appends a fresh envelope per call, so dedup is enforced by the caller's pre-check + the deterministic row id — a duplicate logical submit collapses to one row; the envelope dedup is observed in e2e (one `ChatMessageSubmitted`).
- **Observability**: rejections propagate to the island, which `console.error`s with `[StudentChat]` and renders `role="alert"`. The envelope itself is the structured interaction record.
- **No silent failure**: confirmed — builder throws, wrapper does not catch, rejection propagates.

**Task 3 — `StudentChat.tsx` island (I/O at the UI edge)**
- **Failure modes**: a failed `writeEvent` transaction or a `db.useQuery` error is surfaced inline (`data-testid="student-chat-error"`, `role="alert"`) AND `console.error`'d — never swallowed, never a false "sent". Submit is disabled when the session is not `live` or the participant is not `allowed`; an attempted submit in that state is rejected (returns early with a non-blank message), not silently dropped. Blank/whitespace text is rejected by `buildChatMessage` before any write; the island catches and shows the rejection, writing nothing.
- **Idempotency**: `inFlight` ref latch blocks concurrent double-submit; the per-submit `currentActionId` ref + deterministic row id make a retry of the same logical submit a no-op for storage. On success the input + action-id ref clear (next send mints a new id); on failure the id is retained so retry reuses it.
- **Observability**: `console.error('[StudentChat] …', err)` on submit failure and on query error; inline alert renders the message.
- **No silent failure**: confirmed — every catch sets the visible error state and logs; no empty catch.

**Task 4 — teacher-exclusion assertion**: N/A — assertion/test only, no I/O.

**Task 5 — e2e spec**: external-process orchestration; `test.skip` loudly when `adminAvailable()` is false (never a false green); `retries: 3` (playwright.config) absorbs realtime flake; explicit testid waits, never `networkidle`. Idempotent across retries (fresh emails/sessions per run).

**Task 6 — docs**: pure text edits, no failure surface. N/A.

---

## Task 1: Schema delta + `ChatMessageSubmitted` fold

### Overview
Add the `clientActionId` field and `messageSession` link to the `messages` entity, extend the session projection with a `messages` map, and fold `ChatMessageSubmitted` in `applyEvent`.

### Changes Required
**File**: `src/lib/db.ts`
**Changes**:
- In the `messages` entity (`db.ts:107`), add `clientActionId: i.string().indexed()` (indexed so the per-action-id probe is server-queryable). Leave existing fields unchanged.
- In `links` (`db.ts:130`-`149`), add `messageSession` mirroring `participantSession`:
  ```ts
  messageSession: {
    forward: { on: 'messages', has: 'one', label: 'session' },
    reverse: { on: 'sessions', has: 'many', label: 'messages' },
  },
  ```
- Extend `SessionProjection` (`db.ts:183`) with:
  ```ts
  messages: Record<string, { id: string; participantId: string; text: string; createdAt: number }>
  ```
- Extend `emptyProjection` (`db.ts:197`) to return `{ sessionId, session: null, participants: {}, messages: {} }`.
- Add a `case 'ChatMessageSubmitted'` before the `default` in `applyEvent` (`db.ts:218`), mirroring `ParticipantJoined`:
  ```ts
  case 'ChatMessageSubmitted': {
    const p = event.payload as {
      messageId?: string; participantId?: string; text?: string; createdAt?: number
    }
    const messageId = p.messageId ?? event.id
    return {
      ...projection,
      messages: {
        ...projection.messages,
        [messageId]: {
          id: messageId,
          participantId: typeof p.participantId === 'string' ? p.participantId : '',
          text: typeof p.text === 'string' ? p.text : '',
          createdAt: typeof p.createdAt === 'number' ? p.createdAt : event.occurredAt,
        },
      },
    }
  }
  ```

**File**: `src/lib/db.test.ts`
**Changes**: add a `chatMessageSubmitted` `EventLike` fixture and tests: folds keyed by `messageId`; does not throw for the type; folding two messages accumulates both; `rebuildSessionProjection` reproduces the stream including messages; out-of-order determinism still holds with a message in the mix.

### Operational note
After merge, run `npx instant-cli push schema` before the feature works live (additive, idempotent). No `perms:push` (messages stays under `$default`).

### Success Criteria
- [ ] `npm run astro check` clean
- [ ] New `applyEvent`/`rebuild` tests pass; all existing `db.test.ts` tests still pass
- [ ] Unknown-type path still throws `UnknownEventTypeError`
- [ ] Failure paths behave as designed (unknown type loud; defensive defaults on partial payload)

---

## Task 2: Pure chat action core in `sessions.ts`

### Overview
Add `MessageRecord`, `buildChatMessage` (pure builder), `shouldSubmitChatMessage` (idempotency gate), and `submitChatMessage` (thin wrapper) mirroring the join slice.

### Changes Required
**File**: `src/lib/sessions.ts`
**Changes** (append after the join slice):
- `MessageRecord` type: `{ id: string; sessionId: string; participantId: string; clientActionId: string; text: string; visibility: 'visible'; classificationStatus: 'unclassified'; createdAt: number }` (defaults chosen so the row is renderable now; classification deferred).
- `BuildChatMessageInput`: `{ sessionId, participantId, clientActionId, text, now? }` (all id fields `string | null | undefined`).
- `buildChatMessage(input): ChatMessagePlan` — validates totally BEFORE any plan: throw on missing `sessionId`, missing/empty `participantId`, missing `clientActionId`, and blank/whitespace-trimmed `text`. The row id === `clientActionId` (deterministic), `payload = { messageId: clientActionId, participantId, text, createdAt }`, `actor: { id: <userId-not-needed; use participant's userId? >, role: 'student' }`.
  - **Decision**: the envelope `actor.id` is the submitting user's auth id (passed through as an input field `userId`), `actor.role: 'student'`. Add `userId` to `BuildChatMessageInput` and require it (throws if missing) so the envelope carries a real actor.
- `shouldSubmitChatMessage(input: { authUserId; participantId; messagesLoaded; existingForActionId; inFlight; text }): boolean` — true only when authed, a `participantId` exists, the per-action-id query has loaded, `existingForActionId === 0`, not in flight, and `text.trim() !== ''`.
- `defaultChatTxn(r: MessageRecord): ProjectionTxn` — `db.tx.messages[r.id].update({ sessionId, participantId, clientActionId, text, visibility, classificationStatus, createdAt }).link({ session: r.sessionId })`.
- `submitChatMessage(input, deps = {})` — builds plan (sync-throws on bad input), dual-writes `writeEvent('ChatMessageSubmitted', plan.meta, [buildTxn(plan.record)])`, returns the record. Injectable `deps: { write?, buildTxn? }`.

**File**: `src/lib/sessions.test.ts`
**Changes**: add a `buildChatMessage` describe block mirroring `buildParticipantJoin`'s:
- valid plan shape (`record.id === clientActionId === meta.payload.messageId`; `actor.role === 'student'`; trimmed text)
- `it.each([null, undefined, ''])` blank/missing rejection over `sessionId`, `participantId`, `clientActionId`, `userId`
- blank/whitespace-only `text` rejection (throws, no plan)
- deterministic row id derived from `clientActionId`
- `shouldSubmitChatMessage` gate truth table (loaded + existing 0 + not in flight + non-blank → true; each false condition → false)
- `submitChatMessage` wrapper with a fake `write` recording calls: routes one `writeEvent('ChatMessageSubmitted', …)`; rejected-write propagation; invalid input rejects before `write` is called.

### Success Criteria
- [ ] `npm run astro check` clean
- [ ] All new Vitest cases pass; existing `sessions.test.ts` unaffected
- [ ] Builder throws on every invalid-input case before producing a plan
- [ ] Failure paths behave as designed (rejection propagates; nothing written on invalid input)

---

## Task 3: `StudentChat` island + mount on `/s/[joinCode]`

### Overview
A single-input chat island with a realtime-syncing stream, gated on `live` + participant eligibility, idempotent per client action id, mounted beside `StudentSession` on the student page.

### Changes Required
**File**: `src/components/StudentChat.tsx` (new)
**Changes**:
- Props: `{ joinCode: string }`. Read identity via `useAuth()` (never `db.useAuth()`).
- Resolve session by `joinCode` (`db.useQuery`), as `StudentSession` does.
- Resolve the caller's own participant via a `(sessionId, userId)` query (mirroring `JoinSession.tsx:35`-`39`); derive `participantId`, `chatStatus`, and `eligible = isJoinEnabled(session) && chatStatus === 'allowed'`.
- Realtime stream query: `{ messages: { $: { where: { sessionId: session.id } } } }`; sort client-side by `createdAt` asc, tie-break by `id`. Render each as `data-testid="student-chat-message-item"` showing `username` (resolve via the participants set already present on the page; render the message's participant `username`, never email) + text.
- State: `text` (controlled input), `error`, `pending`; refs `inFlight` and `currentActionId`.
- Per-action-id probe: `db.useQuery` keyed on `(sessionId, currentActionId)` to drive `existingForActionId` for the gate (or rely on deterministic keyed-upsert + `inFlight` latch — keep the probe minimal; the deterministic id is the primary idempotency guarantee).
- `onSubmit`: prevent default; if `!eligible` set a non-blank disabled message and return; if `inFlight.current` return; mint `currentActionId.current ||= id()`; call `submitChatMessage({ sessionId, userId: user.id, participantId, clientActionId: currentActionId.current, text })`; on success clear `text` + `currentActionId.current`; on failure `surface(err)` (keep the id for retry); `finally` clear `inFlight`.
- Testids: `student-chat-root`, `student-chat-input`, `student-chat-send`, `student-chat-stream`, `student-chat-message-item`, `student-chat-error`. Tailwind utilities; no-semicolon TS; two-space indent.
- Error/branch states: query error → `console.error('[StudentChat] …')` + `role="alert"` (`student-chat-error`); not eligible → disabled input + non-blank explanatory text; loading → non-blank loading state. Exactly **one** text input and **no** message-type selector.

**File**: `src/pages/s/[joinCode].astro`
**Changes**: mount `StudentChat` beside `StudentSession` inside the existing `RouteGuard`:
```astro
<StudentSession client:only="react" joinCode={joinCode} />
<StudentChat client:only="react" joinCode={joinCode} />
```

### Success Criteria
- [ ] `npm run astro check` clean
- [ ] Exactly one `student-chat-input`, no message-type selector in the DOM
- [ ] Submitting non-blank text renders it in `student-chat-stream`; another context sees it without reload (verified in Task 5)
- [ ] Blank submit writes nothing and shows a non-blank rejection
- [ ] Failure paths behave as designed (query/write errors surface via `student-chat-error` + `console.error`; not-eligible submit rejected, not dropped)

---

## Task 4: Teacher-exclusion confirmation

### Overview
Confirm and lock that the teacher facilitation view renders no chat stream/input.

### Changes Required
- **No chat island is added** to `src/components/SessionLifecycle.tsx` or `src/pages/dashboard/sessions/[id].astro` (verified by inspection).
- Covered by an e2e assertion in Task 5 (teacher context A on `/dashboard/sessions/:id`: assert `student-chat-root`, `student-chat-stream`, `student-chat-input` testids are **absent** from the DOM).

### Success Criteria
- [ ] No `student-chat-*` testid present on the facilitation view (asserted in e2e)
- [ ] `SessionLifecycle.tsx` imports/renders no chat component

---

## Task 5: E2e spec `e2e/student-chat.spec.ts`

### Overview
Multi-context Playwright spec proving the slice end-to-end against the live app, mirroring `e2e/join-via-link.spec.ts`.

### Changes Required
**File**: `e2e/student-chat.spec.ts` (new)
**Changes**: reuse `e2e/support/auth.ts` (`adminAvailable`, `signInViaUi`, `freshEmail`, `mintCode`, `queryAdmin`). `test.skip(!adminAvailable(), …)` loud-skip. Helpers from the join spec (teacher create + start + read join code; sign a student into its own context). Tests:
- **Happy path / realtime**: A creates+starts; B and C join via `/join/<code>` → `/s/<code>`. B types non-blank text and sends; assert it appears in B's `student-chat-stream` and, **without reload**, in C's stream (explicit testid wait, not `networkidle`).
- **Late-joiner history**: D joins after messages exist; D's first `/s/<code>` load renders prior `student-chat-message-item`s.
- **Teacher exclusion**: A on `/dashboard/sessions/:id` — assert `student-chat-root`/`student-chat-stream`/`student-chat-input` are absent.
- **Dual-write observability**: via `queryAdmin`, assert one `messages` row and one `ChatMessageSubmitted` `sessionEvents` row per logical message.
- **Idempotency**: drive a double-submit carrying the same client action id (e.g. rapid double-click / submit) — assert exactly one rendered message and, via `queryAdmin`, one `messages` row + one `ChatMessageSubmitted` event.
- **Failure**: blank/whitespace submit writes nothing (admin counts unchanged) and surfaces a non-blank rejection.

### Success Criteria
- [ ] `npm run test:e2e` passes (or loud-skips without `INSTANT_ADMIN_TOKEN`)
- [ ] Realtime, late-joiner, exclusion, dual-write, idempotency, and blank-failure legs all assert as designed
- [ ] No `networkidle` waits; explicit testid waits only

---

## Task 6: Documentation

### Overview
Update docs as part of "done".

### Changes Required
- **`AGENTS.md`** (Data Layer section): add a "Student chat (cycle 0008)" note documenting `submitChatMessage`/`buildChatMessage` as the sole sanctioned message-create path, the idempotency-by-client-action-id contract (row id === `clientActionId`), the new `messages.clientActionId` field + `messageSession` link, the `ChatMessageSubmitted` fold, the teacher-exclusion invariant, that `messages` stays under `$default` this cycle, and the fixed testids (`student-chat-root`, `student-chat-input`, `student-chat-send`, `student-chat-stream`, `student-chat-message-item`, `student-chat-error`).
- **`README.md`**: students can now send chat in a live session and see the realtime stream; teachers see Questions, not chat.
- **`.env.example` / release notes**: no new keys; note the schema delta (`messages.clientActionId`, `messageSession` link) requires `npx instant-cli push schema` before the feature works live.

### Success Criteria
- [ ] AGENTS.md, README.md, .env.example reflect the cycle
- [ ] Schema-push requirement documented

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A student submits non-blank text on a `live` session's `/s/:joinCode` view and it appears in that student's chat stream and in another student context's stream in realtime, with no reload (user-observable benefit). | Task 3, Task 5 | Island + realtime e2e leg |
| [ ] The student chat surface contains exactly one text input and no message-type selector (assert single input / absent selector testid). | Task 3, Task 5 | Single `student-chat-input`, no selector |
| [ ] A context loading `/s/:joinCode` after messages were posted renders the prior chat history (late-joiner sync). | Task 3, Task 5 | Late-joiner e2e leg (context D) |
| [ ] The teacher facilitation view (`/dashboard/sessions/:id`) renders no chat stream and no chat input (assert the chat stream/input testids are absent from the DOM). | Task 4, Task 5 | Exclusion assertion |
| [ ] Each submit writes both a `ChatMessageSubmitted` `sessionEvents` envelope and a `messages` projection row through `writeEvent()` (admin-read observability assertion: counts match, one of each per logical message). | Task 2, Task 5 | Dual-write via `submitChatMessage`; `queryAdmin` counts |
| [ ] **Failure path:** submitting the same client action id twice results in exactly one rendered message and exactly one `messages` row / one `ChatMessageSubmitted` event (idempotency). | Task 2, Task 3, Task 5 | Deterministic row id + `inFlight` latch + gate |
| [ ] **Failure path:** submitting blank/whitespace-only text writes nothing (no new event, no new row) and the input shows a non-blank rejection; state is unchanged. | Task 2, Task 3, Task 5 | Builder rejects pre-plan; island surfaces |
| [ ] `buildChatMessage` and the idempotency pre-check are covered by Vitest unit tests (valid plan shape, blank-text rejection, missing-field rejection, deterministic row id from client action id). | Task 2 | `sessions.test.ts` |
| [ ] `applyEvent` folds `ChatMessageSubmitted` and does not raise `UnknownEventTypeError` for it; folding the log reproduces the stream. | Task 1 | `db.test.ts` fold + rebuild tests |
| [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`). | Task 1–6 | Verified in each task's success criteria |
| [ ] `npm run astro check` passes with no new compiler/linter warnings. | Task 1–6 | Verified per task |

---

## Testing Strategy

### Unit Tests (Vitest, beside the module)
- **`db.test.ts`**: `ChatMessageSubmitted` fold keyed by `messageId`; type is known (no throw); two messages accumulate; `rebuildSessionProjection` reproduces the message stream; out-of-order determinism with a message present; unknown-type still throws `UnknownEventTypeError`.
- **`sessions.test.ts`** (`buildChatMessage`/`shouldSubmitChatMessage`/`submitChatMessage`): valid plan shape (`record.id === clientActionId === payload.messageId`, `actor.role === 'student'`, trimmed text); deterministic row id from client action id; gate truth table.
- **Failure-path tests** (one per named failure mode):
  - blank/whitespace-only `text` → `buildChatMessage` throws, no plan.
  - `it.each([null, undefined, ''])` over `sessionId`/`participantId`/`clientActionId`/`userId` → throws before any plan.
  - rejected `write` → `submitChatMessage` rejection propagates (fake `write` that rejects).
  - invalid input → `write` is never called (assert the fake `write` recorded zero calls).
  - unknown event type still throws (regression guard in `db.test.ts`).
- **Mocking strategy**: no network — inject `deps` (`write`, `buildTxn`) and use `EventLike` fixtures, exactly as the join slice does. No heavy mocking; real pure functions under test.

### Integration / E2E Tests (Playwright, port 4399, `retries: 3`)
- `e2e/student-chat.spec.ts` as in Task 5: realtime (B→C no reload), late-joiner history (D), teacher exclusion (A), dual-write observability (`queryAdmin` counts), idempotency (double-submit → one message/row/event), blank-failure (no write + non-blank rejection). Loud-skips without `INSTANT_ADMIN_TOKEN`; explicit testid waits only.

## Walkthrough Plan
- **Flow**: Teacher (context A) signs in via deterministic magic code, creates a session at `/dashboard`, opens `/dashboard/sessions/:id`, Starts it (→ `live`), reads the join code. Student B opens `/join/<code>` → lands on `/s/<code>`, types a message and sends it. Student C (own context) opens `/s/<code>` and sees B's message appear in realtime. A late joiner D opens `/s/<code>` after messages exist and sees prior history. Finally, A's facilitation view is shown to demonstrate the absence of any chat surface. Real cycle-0008 routes only — never the home page.
- **Capture points** (ordered, named):
  - `01-teacher-session-live` — `/dashboard/sessions/:id` showing status `live` + join code.
  - `02-student-chat-empty` — B on `/s/<code>` with the single chat input visible, empty stream.
  - `03-student-chat-sent` — B's own message rendered in `student-chat-stream`.
  - `04-realtime-peer` — C's `/s/<code>` showing B's message arrived with no reload.
  - `05-late-joiner-history` — D's first `/s/<code>` load showing prior messages.
  - `06-teacher-no-chat` — A's facilitation view with no chat stream/input present.
  - `07-blank-rejected` — B attempting a blank submit, `student-chat-error` shown, stream unchanged.
- **Preconditions / test data**: auth via admin-minted magic codes (`@instantdb/admin` inline, never a real inbox); a freshly created + started (`live`) session (no pre-seeding); multiple browser contexts (A teacher, B/C/D students). Realtime waits on explicit testid elements (`student-chat-message-item`, `student-chat-stream`), never `networkidle` (InstantDB keeps the socket busy). Degrades **loudly** to capturing `/login` when `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are unset — never the home-page fallback.
- **If no observable UI this cycle**: N/A — this cycle builds clearly observable UI (the student chat input + realtime stream).

## Risk Assessment
- **Realtime sync flake in e2e**: mitigated by `retries: 3` and explicit testid waits (never `networkidle`), matching the established join-spec pattern.
- **Client-side ordering of the stream**: chosen over a server-side `order` index to avoid a new index requirement; message volume per session is small, so client sort by `createdAt` (tie-break by id) is correct and cheap.
- **Idempotency under a render double-fire**: mitigated by the deterministic row id (`messages[clientActionId]` keyed upsert collapses duplicates) plus the `inFlight` ref latch; the envelope-count assertion in e2e proves a double-fire yields one `ChatMessageSubmitted`.
- **Schema not pushed before deploy**: writes setting `clientActionId`/`messageSession` would fail at `db.transact()` and surface via `student-chat-error`; documented `npx instant-cli push schema` step in Task 1 + Task 6 prevents this.
- **`messages` left under `$default` (open reads)**: acceptable and required for the realtime cross-student stream this cycle; tightening is a documented Batch-2 follow-up, not a silent gap.
