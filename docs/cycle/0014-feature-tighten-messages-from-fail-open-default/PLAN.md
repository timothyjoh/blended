# Implementation Plan: Cycle 0014

## Overview
Replace the fully-open `messages: { allow: { $default: 'true' } }` permission rule with an explicit, forgery-proof rule that scopes message **create** to the authenticated author's own participant (rejecting a spoofed `participantId`), restricts **update**/**delete** to the authoring participant plus the owning teacher/admin, and keeps **read** open so the live cross-student chat stream keeps rendering — backed by a new `messageParticipant` link that makes the author traversable without trusting a client-supplied scalar.

## Current State (from Research)
- `messages` is governed by an explicit-but-fully-open block: `messages: { allow: { $default: 'true' } }` (`src/lib/perms.ts:135`), sitting beside the still-open `questions`/`endorsements` Batch-2 namespaces and the `todos` demo. Every op (incl. unauthenticated) is permitted.
- The global catch-all denies by default (`$default: { allow: { $default: 'false' } }`, `src/lib/perms.ts:37`), so openness is declared per entity.
- The row-owner + owning-teacher pattern to mirror already exists for `participants` (`src/lib/perms.ts:113-125`) and `sessionResources` (`src/lib/perms.ts:69-88`): `bind` alternating name/expr pairs, `view: 'true'`, writes = `isOwnRow || isSessionOwner || isAdmin`, ownership checked against the LINKED parent via `auth.id in data.ref('session.teacherId')` (never a client scalar), `isAdmin` reserved-but-`'false'`.
- `messages` entity (`src/lib/db.ts:107-119`) carries a plain `participantId` scalar and no author link. The `messageSession` link (`src/lib/db.ts:160-163`) already supplies `session.teacherId` traversal. The `questionParticipant` link (`src/lib/db.ts:175-178`, forward `one`/reverse `many`) is the exact model for the new `messageParticipant` link; `defaultQuestionTxn` sets `participant` via `.link({ ..., participant: r.participantId, ... })` (`src/lib/sessions.ts:594-599`).
- `defaultChatTxn` (`src/lib/sessions.ts:607-620`) currently sets only `.link({ session: r.sessionId })`; this is where the author link must be added. `submitChatMessage` (`src/lib/sessions.ts:644-658`) is the sole sanctioned create path; its dual-write atomicity + non-swallowing propagation contract is established and tested.
- The perms structural guard (`src/lib/perms.test.ts`) pins exact expression strings and `bind` membership. The `formerly-default-governed entities are explicitly open` test (`:92-96`) lists `messages` among `['todos','messages','questions','endorsements']` asserting `allow.$default === 'true'` — `messages` must be removed from it. The `every schema entity has an explicit rule` test (`:81-90`) stays green with the additive link. `npm run perms:push` → `scripts/push-perms.mjs` is a fail-loud, idempotent runner.

### Open Questions — Resolved
1. **Anti-spoof CEL form.** The create rule must assert the stored `participantId` scalar equals the linked participant's id. `data.ref('<link>.<field>')` returns a collection in InstantDB CEL, and the proven idiom in this codebase is collection membership (`auth.id in data.ref('session.teacherId')`). **Decision:** express the coupling as `data.participantId in data.ref('participant.id')` (membership against the single-element linked-id collection), mirroring the proven `in data.ref(...)` form rather than an unproven scalar `==`. The author check is `auth.id in data.ref('participant.userId')`. Both forms are validated end-to-end at `npm run perms:push` time (Task 3); if the live app rejects the membership idiom for the id-equality, the fallback is the explicit-index form `data.participantId == data.ref('participant.id')[0]` — Task 3 carries this contingency and fails loudly rather than pushing a weaker rule.
2. **Schema push order.** The new rule traverses `data.ref('participant.*')`, which only resolves against the live schema once the `messageParticipant` link exists there. **Decision:** the additive `npx instant-cli push schema` MUST precede `npm run perms:push` (matching cycles 0008/0009 for additive links). Task 3 sequences them explicitly.
3. **Where to test the link is set.** The existing `submitChatMessage` wrapper tests stub `buildTxn`, so they do not exercise the real `defaultChatTxn` body. **Decision:** add a dedicated `defaultChatTxn` link-shape test (Task 1) that asserts the real txn sets both `session` and `participant` links, rather than relying on the stubbed wrapper tests.

## Desired End State
- `src/lib/db.ts` defines a `messageParticipant` link (`messages` forward `participant` `one` / `participants` reverse `messages` `many`) with an explanatory comment.
- `defaultChatTxn` sets `.link({ session: r.sessionId, participant: r.participantId })`.
- `src/lib/perms.ts` has an explicit `messages` block: `bind` traversing both `participant.userId`/`participant.id` and `session.teacherId`; `view: 'true'` with an inline comment that the open read is deliberate for the live stream; `create = isAuthor && scalarMatchesLink`; `update`/`delete = isAuthor || isOwningTeacher || isAdmin`. `messages` is no longer `$default`-governed and `allow.$default` is no longer `'true'`.
- `src/lib/perms.test.ts` drops `messages` from the open-namespace list and asserts the new scoped expressions (mirroring the `participants`/`sessionResources` guard blocks).
- `db.test.ts` asserts the new link's endpoints/shape; `sessions.test.ts` asserts `defaultChatTxn` sets the participant link.
- Live schema + perms pushed (`npx instant-cli push schema` then `npm run perms:push`).
- Docs updated (AGENTS.md, README.md, release-notes.md).
- **Verify:** `npm test`, `npm run build` (incl. `astro check`) green; `npm run perms:push` exits 0 against the live app; the chat-send path test plus the perms owner/owning-teacher guard prove the user-observable benefit.

## What We're NOT Doing
- Tightening `questions` or `endorsements` (remain the explicitly-open Batch-2 namespaces).
- Restricting `messages` **read** (cross-student reads stay open by design for the realtime stream).
- Removing or restructuring the `participantId` scalar column (kept for the projection/UI; the new link is additive).
- Any product UI change to the chat compose/send/list surface beyond what the new link requires on the write path.
- New product Playwright E2E (per SPEC the unit structural guard pins the semantics; existing chat E2E re-runs if the link alters the rendered chat).

## Implementation Approach
Two code slices then an operational slice then docs. Slice 1 makes the author **traversable** (additive link + write-path wiring + unit tests) — safe to land before the rule because the link is purely additive and changes no behavior. Slice 2 swaps the open rule for the forgery-proof one and re-pins the structural guard, reusing the exact `participants` pattern. Slice 3 pushes schema-then-perms live (the only order that works against a schema-enforced app) with a fail-loud contingency for the anti-spoof CEL idiom. Slice 4 completes the docs that are part of "done." Each code slice is independently testable via Vitest; no behavior regresses for the legitimate send path because `defaultChatTxn` sets the link that the create rule requires.

## Failure & Resilience Decisions

**Task 1 — `messageParticipant` link + `defaultChatTxn` wiring (`src/lib/db.ts`, `src/lib/sessions.ts`).**
- *Failure modes:* Link declaration is static (no runtime failure surface). The write path: a `submitChatMessage` whose `participant` link target is invalid is rejected by InstantDB inside the existing `writeEvent` single-transaction dual-write — the rejection propagates through `submitChatMessage` (which never catches) to `StudentChat`, exactly as today. No new catch is introduced.
- *Idempotency:* Unchanged and preserved. The `messages` row id IS the `clientActionId` (deterministic keyed upsert); adding a `.link({ participant })` to the same keyed row on re-submit re-links the same edge, not a second row. Schema link declarations are static and idempotent.
- *Observability:* A rejected send surfaces inline (`role="alert"`) + `console.error('[StudentChat] …')` as today; no new silent path. The structural/unit tests are the layer's observability for the link shape.
- *No silent failure:* `submitChatMessage` keeps awaiting each `write(...)` and never swallows; the wrapper's propagation tests still pass.

**Task 2 — tighten `messages` perms rule + guard test (`src/lib/perms.ts`, `src/lib/perms.test.ts`).** N/A — pure (declarative CEL strings + in-memory structural assertions; no I/O). The live enforcement and any CEL-form rejection surface operationally in Task 3, not here.

**Task 3 — live schema + perms push (`npx instant-cli push schema`, `npm run perms:push`).**
- *Failure modes:* Missing `PUBLIC_INSTANTDB_APP_ID` → `push-perms.mjs` exits non-zero BEFORE any network call. CLI unspawnable → non-zero with a clear message. CLI rejects (auth/network/unreachable, or the anti-spoof CEL idiom invalid) → the runner forwards the non-zero exit. The schema push must run first; if it fails, perms push is not attempted (the rule's `data.ref('participant.*')` would not resolve).
- *Idempotency:* Both pushes are declarative — re-applying the same additive link / identical rules is a no-op; re-runs are safe. The runner performs no local mutation.
- *Observability:* Every failure path prints a specific diagnostic and exits non-zero; the operator never sees a false success.
- *No silent failure:* Non-zero exit on every failure leg; the contingency anti-spoof form (open question 1) is tried explicitly and, if it too is rejected, the push fails loudly rather than landing a weaker rule.

**Task 4 — documentation (`AGENTS.md`, `README.md`, `release-notes.md`).** N/A — pure (prose edits, no failure surface).

---

## Task 1: Add `messageParticipant` author link and set it on the chat-message txn

### Overview
Make the message author traversable by the permission rule without trusting the client-supplied `participantId` scalar: add an additive `messageParticipant` link and set it on the sole sanctioned create path. Behavior-neutral; proven by unit tests.

### Changes Required

**File**: `src/lib/db.ts` (links block, after `questionSession` / alongside the `question*` links)
**Changes**: Add the link mirroring `questionParticipant`, with a comment explaining the forgery-proof traversal the new `messages` rule depends on:
```ts
// Cycle 0014: link each `messages` row to its AUTHOR participant (mirroring
// `questionParticipant`) so the tightened `messages` rule can traverse the
// REAL author — `data.ref('participant.userId')` for the author check and
// `data.ref('participant.id')` for the anti-spoof scalar↔link coupling —
// instead of trusting the client-supplied `participantId` scalar. The chat
// submit sets the forward `participant` link; the reverse `messages` label
// lets a participant enumerate its authored messages.
messageParticipant: {
  forward: { on: 'messages', has: 'one', label: 'participant' },
  reverse: { on: 'participants', has: 'many', label: 'messages' },
},
```

**File**: `src/lib/sessions.ts` (`defaultChatTxn`, `:607-620`)
**Changes**: Add `participant: r.participantId` to the existing `.link(...)`:
```ts
    // Set the parent-session link AND the author-participant link so the session
    // can enumerate its messages, and the tightened create rule can verify the
    // author owns the linked participant (forgery-proof) rather than trusting the
    // `participantId` scalar.
    .link({ session: r.sessionId, participant: r.participantId })
```

**File**: `src/lib/db.test.ts`
**Changes**: Add an assertion that `schema.links.messageParticipant` exists with forward `{ on: 'messages', has: 'one', label: 'participant' }` and reverse `{ on: 'participants', has: 'many', label: 'messages' }` (mirroring any existing link-shape assertions; if none exist, follow the `questionParticipant` precedent).

**File**: `src/lib/sessions.test.ts`
**Changes**: Add a dedicated `defaultChatTxn` link-shape test that invokes the **real** `defaultChatTxn` (not the stubbed `buildTxn`) with a sample `MessageRecord` and asserts the produced txn sets both the `session` and `participant` links to `r.sessionId` / `r.participantId`. Because the wrapper tests stub `buildTxn`, this is the test that exercises the real link body. Keep existing `submitChatMessage` propagation/atomicity/idempotency tests unchanged (they must still pass).

### Success Criteria
- [ ] `astro check` / build clean.
- [ ] `npm test` passes; new `messageParticipant` link assertion green.
- [ ] `defaultChatTxn` test proves both `session` and `participant` links are set.
- [ ] Existing `submitChatMessage` propagation/idempotency tests still pass (no swallow introduced).
- [ ] Failure paths behave as designed: a rejected send still propagates through `submitChatMessage` (covered by existing rejection-propagation tests).

---

## Task 2: Replace the open `messages` rule with the participant-scoped, anti-spoof rule

### Overview
Swap `messages: { allow: { $default: 'true' } }` for an explicit, forgery-proof block mirroring `participants`, and re-pin the structural guard so the new semantics can't silently drift.

### Changes Required

**File**: `src/lib/perms.ts` (`:135`, replacing the `messages` line within the Batch-2 group; update the surrounding comment so only `questions`/`endorsements` remain described as fully-open)
**Changes**:
```ts
  // Cycle 0014: `messages` is no longer fail-open. CREATE is participant-scoped
  // AND anti-spoof — the author must own the LINKED participant
  // (`auth.id in data.ref('participant.userId')`, forgery-proof via the
  // `messageParticipant` link) AND the stored `participantId` scalar must equal
  // that linked participant's id (`data.participantId in data.ref('participant.id')`),
  // so a client cannot attribute a message to a participant it does not own,
  // whether by setting a foreign scalar or decoupling the scalar from the link.
  // UPDATE/DELETE are restricted to the authoring participant, the owning teacher
  // (checked against the LINKED session's `teacherId`, never a client field), or
  // the reserved `isAdmin` slot (false today; the admin SDK bypasses rules).
  messages: {
    bind: [
      'isAuthor', "auth.id in data.ref('participant.userId')",
      'scalarMatchesLink', "data.participantId in data.ref('participant.id')",
      'isOwningTeacher', "auth.id in data.ref('session.teacherId')",
      'isAdmin', 'false',
    ],
    allow: {
      // READ stays OPEN by design — the live cross-student chat stream depends on
      // every client reading every session's messages. This is intentional, not
      // an oversight; tightening reads would break the realtime stream.
      view: 'true',
      create: 'isAuthor && scalarMatchesLink',
      update: 'isAuthor || isOwningTeacher || isAdmin',
      delete: 'isAuthor || isOwningTeacher || isAdmin',
    },
  },
```
Leave `questions`/`endorsements` as their explicit open blocks; adjust the Batch-2 comment to note `messages` is now scoped and only `questions`/`endorsements` remain open.

**File**: `src/lib/perms.test.ts`
**Changes**:
- In `formerly-default-governed entities are explicitly open` (`:92-96`), change the list from `['todos','messages','questions','endorsements']` to `['todos','questions','endorsements']` (drop `messages`).
- Add a `messages` guard block mirroring the `participants`/`sessionResources` blocks:
  - `expect(rules.messages.allow.view).toBe('true')`
  - For `['create','update','delete']`: `expect(expr).not.toBe('true')`.
  - `expect(rules.messages.allow.create).toContain('isAuthor')` and `.toContain('scalarMatchesLink')`.
  - For `update`/`delete`: `.toContain('isAuthor')` and `.toContain('isOwningTeacher')` and `.toContain('isAdmin')`.
  - `expect(rules.messages.bind).toContain("auth.id in data.ref('participant.userId')")`
  - `expect(rules.messages.bind).toContain("data.participantId in data.ref('participant.id')")`
  - `expect(rules.messages.bind).toContain("auth.id in data.ref('session.teacherId')")`
  - `expect(rules.messages.bind).toContain('isAdmin')` and `.toContain('false')`.
  - Regression guard (anti-forgery): for each write op, `expect(rules.messages.allow[op]).not.toContain('data.teacherId')` and the create expr does not reduce to bare `auth.id != null`.
- Confirm `every schema entity has an explicit rule` and `root instant.perms.ts re-exports` remain green unchanged.

### Success Criteria
- [ ] `rules.messages.allow.$default` is no longer `'true'` (the key is gone); `messages` has explicit `view`/`create`/`update`/`delete`.
- [ ] `rules.messages.allow.view === 'true'` with the adjacent intentional-open comment present.
- [ ] New `messages` guard assertions pass; `messages` removed from the open-`$default` list.
- [ ] `npm test` green; `astro check`/build clean.
- [ ] Structural guard rejects any future re-loosening (create not `'true'`, no `data.teacherId` trust).

---

## Task 3: Push the additive schema link, then the tightened perms, live

### Overview
Apply the additive `messageParticipant` link to the live schema, then push the new rules — the only order that resolves the rule's `data.ref('participant.*')` against a schema-enforced app — with a fail-loud contingency for the anti-spoof CEL idiom.

### Changes Required
**Operational (no source change beyond what Tasks 1–2 landed):**
1. `npx instant-cli push schema` — applies the additive `messageParticipant` link (idempotent; additive-only, no migration).
2. `npm run perms:push` (`scripts/push-perms.mjs` → `npx instant-cli push perms`) — pushes the tightened rules.
3. **Contingency for open question 1:** if the live app rejects `data.participantId in data.ref('participant.id')` for the scalar↔link equality, switch the `scalarMatchesLink` bind expression to the explicit-index form `data.participantId == data.ref('participant.id')[0]`, update the matching `perms.test.ts` assertion string, re-run `npm test`, and re-push. Do **not** weaken or drop the anti-spoof clause to make the push succeed — fail loudly and escalate if neither form is accepted.

### Success Criteria
- [ ] `npx instant-cli push schema` applies the additive link (exit 0).
- [ ] `npm run perms:push` exits 0 against the live app.
- [ ] If the contingency form was needed, `perms.ts`/`perms.test.ts` reflect it and `npm test` is green.
- [ ] Failure paths behave as designed: missing app id / CLI failure / rejected rule all exit non-zero with a clear message; no false success; no weakened rule pushed silently.

---

## Task 4: Update documentation to record the new `messages` posture

### Overview
Docs are part of "done." Flip the AGENTS.md note that flags `messages` as fail-open, and update README/release-notes for the new posture.

### Changes Required
**File**: `AGENTS.md` (the cycle-0008 Student-chat note that currently says `messages` carries its own fully-open block and every op is open)
**Changes**: Record that `messages` is now **participant-scoped create** (author must own the linked participant + scalar matches the link, anti-spoof via the new `messageParticipant` link) + **row-owner / owning-teacher update/delete** (via `data.ref('session.teacherId')`), with **reads intentionally open** for the live stream; note the new `messageParticipant` link, that this cycle **does** run `perms:push` (and the additive `npx instant-cli push schema` for the link), and that `questions`/`endorsements` remain the open Batch-2 namespaces.

**File**: `README.md` (`:313-329`, the chat permission-posture note)
**Changes**: Update the `messages` line to state writes are now author-scoped (create) + author/owning-teacher (update/delete) with reads open by design; list the additive `npx instant-cli push schema` + `npm run perms:push` as the migration/verification steps for this cycle.

**File**: `release-notes.md`
**Changes**: Add a cycle-0014 entry: students' chat messages can no longer be edited, deleted, or impersonated by other students or unauthenticated clients; reads stay open for the live stream; note the additive schema push + perms push.

### Success Criteria
- [ ] AGENTS.md no longer describes `messages` as fully-open; describes the new scoped posture, the link, and the push steps.
- [ ] README/release-notes reflect the new posture and migration steps.
- [ ] No stale "every operation is still open" language remains for `messages`.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] In `src/lib/perms.ts`, `rules.messages.allow.$default` is no longer `'true'`; `messages` has explicit `view`/`create`/`update`/`delete` clauses and a `bind` traversing both `participant.userId` and `session.teacherId`. | Task 2 | Bind includes `participant.userId`, `participant.id`, `session.teacherId`. |
| [ ] `rules.messages.allow.view === 'true'` and an adjacent comment states the open read is intentional for the live stream. | Task 2 | Inline intentional-open comment added. |
| [ ] A non-author authenticated student attempting to `update` or `delete` another student's message is denied and the target message row is unchanged (covered by a test asserting the rule expression rejects the non-owner, owner-only path). | Task 2 | Guard asserts update/delete contain `isAuthor`/`isOwningTeacher`/`isAdmin` and are not `'true'`; live enforcement proven by Task 3 push + existing e2e on re-run. |
| [ ] A create whose `participantId` does not resolve to a participant owned by `auth.id` (spoofed identity) is rejected by the create rule (covered by a test of the create expression / link binding). | Task 2 (rule/test) + Task 1 (link enabling traversal) | `create = isAuthor && scalarMatchesLink`; guard asserts both binds present. |
| [ ] **User-observable benefit**: a legitimate student chat send still succeeds end-to-end and the message appears in the live cross-student stream, while only the author and owning teacher can subsequently edit/delete it (verified by the chat-send path test plus the perms guard for owner/owning-teacher update/delete). | Task 1 (chat-send/link test) + Task 2 (owner/owning-teacher guard) | `defaultChatTxn` sets the `participant` link so legit sends satisfy create; walkthrough demonstrates it. |
| [ ] `src/lib/perms.test.ts` no longer lists `messages` among the fully-open `$default:'true'` namespaces and asserts the new scoped expressions. | Task 2 | Drops `messages` from the open list; adds the `messages` guard block. |
| [ ] `npm run perms:push` completes successfully against the live Instant app. | Task 3 | Schema push first, then perms push; fail-loud contingency for the CEL idiom. |
| [ ] All existing tests still pass (`npm test`). | Task 1, Task 2 | Existing `submitChatMessage`/`buildChatMessage` and guard tests kept green. |
| [ ] No compiler/linter warnings introduced (`astro check` clean). | Task 1, Task 2 | `npm run build` runs `astro check`. |

## Testing Strategy

### Unit Tests
- **Perms guard (`src/lib/perms.test.ts`)** — assert `messages.allow.view === 'true'`; create not `'true'` and contains `isAuthor` + `scalarMatchesLink`; update/delete not `'true'` and contain `isAuthor`/`isOwningTeacher`/`isAdmin`; `bind` contains `auth.id in data.ref('participant.userId')`, `data.participantId in data.ref('participant.id')`, `auth.id in data.ref('session.teacherId')`, `isAdmin`, `false`. **Failure-path / anti-forgery:** for each write op assert `.not.toContain('data.teacherId')` (no client-scalar trust) and create does not collapse to bare `auth.id != null`. **Regression:** `messages` removed from the open-`$default` list; `every schema entity has an explicit rule` and `root instant.perms.ts re-exports` stay green.
- **Schema link (`src/lib/db.test.ts`)** — assert `messageParticipant` link endpoints/labels exactly (forward `messages`/`one`/`participant`, reverse `participants`/`many`/`messages`).
- **Write-path (`src/lib/sessions.test.ts`)** — new real-`defaultChatTxn` test asserts both `session` and `participant` links are set from the record. **Failure-path (existing, kept green):** rejected `write` propagates and is not swallowed (`:707-713`); a `QuestionCreated` rejection keeps the message committed and propagates (`:686-705`); invalid input throws before `write` (`:715-729`); `buildChatMessage` validation throws on missing `sessionId`/`participantId`/`userId`/`clientActionId`/blank `text`.
- **Mocking strategy:** none added — perms are pure strings asserted directly; `defaultChatTxn` is invoked for real (the txn builder is in-memory); `submitChatMessage` tests inject `write` per the existing convention. No heavy mocking.

### Integration / E2E Tests
- No new product E2E required (SPEC). The live `npm run perms:push` (Task 3) is the integration proof that the CEL forms validate against the real app. If the additive `participant` link alters the rendered chat, re-run the existing `e2e/student-chat.spec.ts` and `e2e/auto-create-question.spec.ts` (both skip loudly without admin env) — they should remain green since the link is additive and the legitimate send sets it.

## Walkthrough Plan
This cycle ships **no new product UI** — it is a data-layer authorization change. Its observable effects are (a) the legitimate student chat send still works end-to-end over the real `/s/:joinCode` route, and (b) a forged/non-author write is now **denied** at the data layer. The walkthrough exercises both over real, non-home routes, reusing the deterministic admin magic-code seam from `e2e/permissions.spec.ts` (never a real inbox), mirroring cycle 0013's `walkthrough.mjs` structure.
- **Flow**: Sign in as student A via the deterministic code-minting seam → join a seeded live session and open `/s/:joinCode` → A sends a chat message and it renders in A's stream (`student-chat-message-item`) → a second context (student B) signed in via the same seam opens the **same** `/s/:joinCode` and sees A's message stream in live (proves cross-student read stays open) → drive the **denial** legs via the dev `PermsProbe` harness at `/dev/perms-probe` (the same observable dev surface cycle 0013 used): as B, a raw `messages` create stamped with A's `participantId` (spoof) is rejected, and a raw update/delete of A's message id is rejected — `probe-write-result` shows `error:`. Waits are on explicit testids (`student-chat-stream`, `student-chat-message-item`, `probe-write-result`), never `networkidle` (InstantDB keeps the socket busy).
- **Capture points** (ordered, named):
  - `01-student-a-sends` — `/s/:joinCode` with A's just-sent message visible in `student-chat-stream` (legitimate send still succeeds).
  - `02-student-b-sees-stream` — B's `/s/:joinCode` showing A's message live (open cross-student read preserved).
  - `03-spoofed-create-denied` — `/dev/perms-probe`, `probe-write-result` = `error:` after B attempts a `messages` create stamped with A's `participantId`.
  - `04-nonauthor-delete-denied` — `probe-write-result` = `error:` after B attempts to delete/update A's message row (only author/owning-teacher may).
- **Preconditions / test data**: `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID` for deterministic sign-in (skip loudly if absent); the schema link + tightened rules pushed live (Task 3) — the denial legs are only meaningful once pushed; a seeded live session with a join code; two browser contexts (A, B) each with a distinct minted code; realtime assertions wait on explicit testids.
- **If no observable UI this cycle**: The denial behavior has no *product* UI (no product surface lets one student edit another's message), so the spoof/non-author legs use the dev `PermsProbe` harness — which IS observable — exactly as cycle 0013 did; the positive legs use the real `/s/:joinCode` chat. If the admin/auth env or the live push is unavailable, the walkthrough **degrades loudly** (capturing the login/chat surface with a one-line diagnostic to stderr), never silently falling back to the home page. If `PermsProbe` does not already support a raw `messages` write target, the denial legs degrade loudly with that diagnostic rather than adding product UI (out of scope).

## Risk Assessment
- **Anti-spoof CEL idiom not accepted by the live app**: the `in data.ref('participant.id')` equality form is unproven in this codebase. Mitigation: Task 3 carries an explicit contingency (`== data.ref('participant.id')[0]`), updates the test string to match, and fails loudly rather than dropping the anti-spoof clause.
- **Pushing perms before schema**: the rule's `data.ref('participant.*')` won't resolve without the live link. Mitigation: Task 3 mandates `push schema` before `perms:push`.
- **Legitimate sends breaking because the create rule needs a link the txn didn't set**: Mitigation: Task 1 sets `.link({ participant })` in `defaultChatTxn` (the sole sanctioned path) and a dedicated test pins it; the create rule is satisfied by exactly what the legit path writes.
- **Structural-guard string drift**: asserting exact CEL strings can be brittle if the contingency form is adopted. Mitigation: keep the test assertions in lockstep with whichever bind form is pushed (Task 3 updates both together); the guard's value is precisely catching unintended drift.
- **Forgotten docs**: Mitigation: Task 4 is an explicit gated task; AGENTS.md/README/release-notes are part of "done."
