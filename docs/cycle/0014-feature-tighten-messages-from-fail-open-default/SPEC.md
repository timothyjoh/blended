# SPEC — Cycle 0014: Tighten `messages` from fail-open default to participant-scoped create + row-owner update/delete

## WHY
Cycle 0008 began writing real `messages` rows, but the `messages` entity is still governed by an explicit-but-fully-open rule (`messages: { allow: { $default: 'true' } }` in `src/lib/perms.ts`) carried over as a deferred Batch-2 follow-up. Every operation is permitted for everyone — not even gated on `auth.id`. Today any client, including an unauthenticated one, can read every session's chat (intended, for the live stream), but also **create** messages stamped with another student's `participantId`, and **edit or delete** other students' messages. Write and delete were never meant to stay open once rows exist. The very next queued cycle (`txt-20260606-213639-auto-create-question-from-question-mark`) and the already-shipped question-promotion path build directly on `messages`, so the open default must close before more surfaces depend on it.

## CONCRETE USER BENEFIT
A student's chat messages can no longer be edited, deleted, or impersonated by a different student or by an unauthenticated client. After this cycle, if student B tries to delete or rewrite student A's message, the data layer rejects it and A's message is unchanged — whereas today B succeeds. A student also cannot post a message stamped as if another participant authored it. The owning teacher retains moderation control, and the live cross-student chat stream keeps rendering for everyone.

## USABLE END-STATE
In a running session with two joined students, a student can still send chat and see every classmate's messages stream in live (unchanged). But the only people who can mutate a given message are its author and the session's owning teacher. An attempt by anyone else — or by a hand-crafted/unauthenticated client — to update or delete that message, or to create a message spoofing another participant's identity, is denied at the InstantDB permission layer, not merely hidden in the UI.

## Objective
This cycle replaces the fully-open `messages` permission rule with an explicit, forgery-proof rule that scopes message **create** to the authenticated author's own participant (rejecting spoofed `participantId`), restricts **update**/**delete** to the row's authoring participant plus the owning teacher/admin, and keeps **read** open so the live cross-student stream continues to work. It mirrors the row-owner-plus-owning-teacher pattern already landed for `participants` (cycle 0013) and `sessionResources`, reusing forgery-proof link traversal rather than trusting client-supplied scalar fields. The change moves a SPEC-level authorization invariant from UI convention into the data layer so it holds against a hand-crafted client.

## Source Issue
`refl-0008-messages-ships-under-fully-open-default` — "Tighten messages from fail-open default to participant-scoped create + row-owner update/delete"

## Scope

### In Scope
- Add a forgery-proof author link for `messages`: a `messageParticipant` link (`messages` → `participants`, forward `one` / reverse `many`) in `src/lib/db.ts`, set on the chat-message projection txn (`defaultChatTxn` in `src/lib/sessions.ts`, mirroring how `defaultQuestionTxn` sets `participant`), so the permission rule can traverse to the author's `userId` rather than trusting the client-supplied `participantId` scalar.
- Replace `messages: { allow: { $default: 'true' } }` in `src/lib/perms.ts` with an explicit rule: **create** = the author owns the linked participant (`auth.id in data.ref('participant.userId')`) **and** the stored `participantId` scalar matches that linked participant's id (anti-spoof); **update**/**delete** = authoring participant (`auth.id in data.ref('participant.userId')`) OR owning teacher (`auth.id in data.ref('session.teacherId')`) OR the reserved `isAdmin` slot; **read** = `'true'`, with an inline comment stating the open read is deliberate (the live cross-student stream depends on it), not an oversight.
- Update the permission test guard (`src/lib/perms.test.ts`) so `messages` is asserted as the new scoped rule instead of an open `$default`, add coverage for the new bind/allow expressions, update the db/sessions tests for the new link, and push the rules with `npm run perms:push`.

### Out of Scope
- Tightening `questions` and `endorsements` (the remaining intentionally-open Batch-2 namespaces) — separate follow-ups.
- Restricting `messages` **read** (cross-student reads stay open by design so the realtime stream works).
- Any UI change to the chat compose/send/list surface beyond what the new `messageParticipant` link requires on the write path.
- Removing or restructuring the `participantId` scalar column (kept for the projection/UI; the new link is additive).

## Requirements
- `messages` has its own explicit permission block in `src/lib/perms.ts`; it is no longer governed by `$default` and no longer `allow.$default === 'true'`.
- **create** is participant-scoped and anti-spoof: a message is creatable only when the authenticated user owns the participant the message is linked to, and the row's `participantId` scalar equals that linked participant's id. A client cannot create a message attributed to a participant it does not own, whether by setting a foreign `participantId` scalar or by decoupling the scalar from the link.
- **update**/**delete** are restricted to the authoring participant (row owner) plus the owning teacher (checked via the forgery-proof `session` link `teacherId`, never a client-supplied field) plus the reserved `isAdmin` slot (evaluates `false` today; server/admin actions use the admin SDK, which bypasses these rules).
- **read** stays open (`'true'`) with an explicit code comment recording that this is intentional for the live stream.
- The legitimate chat send path (`submitChatMessage` / `defaultChatTxn`) sets the `messageParticipant` link so real student sends continue to satisfy the create rule; the realtime stream subscription is unaffected.
- The structural guard test continues to enforce that every schema entity (including the new link's endpoints) has an explicit rule.
- **Failure behavior**: A create/update/delete that violates the rule is rejected by InstantDB with a permission error that surfaces to the caller (the existing `submitChatMessage` propagation already logs/surfaces rejections — it must keep propagating, never swallow). A rejected create leaves no `messages` row and no orphan event (the dual-write transaction already guarantees atomicity). An unauthenticated or non-author client attempting update/delete leaves the target row unchanged. Read remains available even when writes are denied, so a permission failure on write degrades to "message not posted/changed" rather than breaking the stream for other students.

## Acceptance Criteria
- [ ] In `src/lib/perms.ts`, `rules.messages.allow.$default` is no longer `'true'`; `messages` has explicit `view`/`create`/`update`/`delete` clauses and a `bind` traversing both `participant.userId` and `session.teacherId`.
- [ ] `rules.messages.allow.view === 'true'` and an adjacent comment states the open read is intentional for the live stream.
- [ ] A non-author authenticated student attempting to `update` or `delete` another student's message is denied and the target message row is unchanged (covered by a test asserting the rule expression rejects the non-owner, owner-only path).
- [ ] A create whose `participantId` does not resolve to a participant owned by `auth.id` (spoofed identity) is rejected by the create rule (covered by a test of the create expression / link binding).
- [ ] **User-observable benefit**: a legitimate student chat send still succeeds end-to-end and the message appears in the live cross-student stream, while only the author and owning teacher can subsequently edit/delete it (verified by the chat-send path test plus the perms guard for owner/owning-teacher update/delete).
- [ ] `src/lib/perms.test.ts` no longer lists `messages` among the fully-open `$default:'true'` namespaces and asserts the new scoped expressions.
- [ ] `npm run perms:push` completes successfully against the live Instant app.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`astro check` clean).

## Testing Strategy
- Vitest (existing `src/lib/perms.test.ts`, `src/lib/db.test.ts`, and the `sessions` tests) — this codebase pins permission semantics with a structural guard over the inferred `rules` object rather than a live policy emulator.
- Key scenarios to cover:
  - Happy path: `messages.allow.view === 'true'`; the `messageParticipant` link exists in the schema and is set by `defaultChatTxn`; legitimate chat send builds the expected txn including the participant link.
  - Failure paths: create rule rejects a spoofed/foreign `participantId` (author does not own the linked participant, or scalar ≠ linked id); update/delete rule rejects a non-author, non-owning-teacher requester; unauthenticated requester is denied write (no `auth.id`).
  - Authorization-positive: author can update/delete own row; owning teacher (via `session.teacherId` traversal) can update/delete; the reserved `isAdmin` slot is present and `false`.
  - Regression: the schema-driven "every entity has an explicit rule" guard still passes with the new link endpoints; the `instant.perms.ts` re-export identity test still passes; existing `submitChatMessage` atomicity/idempotency tests still pass.
- No UI behavior changes in this cycle; no new Playwright E2E required. (The chat send/stream path is exercised by existing unit tests; if the link addition alters the rendered chat, re-run the existing chat E2E.)

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the note that flags `messages` as a fail-open Batch-2 follow-up — record that `messages` is now participant-scoped (create) + row-owner/owning-teacher (update/delete) with reads intentionally open, and that `questions`/`endorsements` remain the open Batch-2 namespaces.
- **README.md**: No user-facing feature change to surface; if README enumerates the permission posture of chat, update the line for `messages` writes. Otherwise no change.
- Inline: the `messages` rule block in `src/lib/perms.ts` and the new `messageParticipant` link in `src/lib/db.ts` must carry comments explaining the forgery-proof traversal and the deliberate open read, matching the documentation density of the `participants` / `sessionResources` blocks.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `refl-0003-tighten-participants-fail-open-update-an` (landed in cycle 0013) — provides the row-owner + owning-teacher pattern this cycle reuses.
- Existing `messageSession` link (`messages` → `sessions`, cycle 0008) — supplies the `session.teacherId` traversal for the owning-teacher clause.
- Existing `questionParticipant` link precedent (`questions` → `participants`, cycle 0009) — the model the new `messageParticipant` link mirrors.
- The `messages` projection/write path: `defaultChatTxn` and `submitChatMessage` in `src/lib/sessions.ts`.
- A configured Instant app and credentials for `npm run perms:push` (`scripts/push-perms.mjs` → `instant-cli push perms`).
