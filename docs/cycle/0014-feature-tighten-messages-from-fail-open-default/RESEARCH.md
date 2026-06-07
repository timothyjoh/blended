I have everything needed to write the research document.

```markdown
# Research: Cycle 0014

## Cycle Context
This cycle replaces the fully-open `messages` permission rule (`messages: { allow: { $default: 'true' } }` in `src/lib/perms.ts`) with an explicit, forgery-proof rule that scopes message **create** to the authenticated author's own participant (rejecting a spoofed `participantId`), restricts **update**/**delete** to the row's authoring participant plus the owning teacher/admin, and keeps **read** open so the live cross-student chat stream keeps rendering. To make the author traversable without trusting a client-supplied scalar, the cycle adds a `messageParticipant` link (`messages` → `participants`, forward `one` / reverse `many`) in `src/lib/db.ts` and sets it on the chat-message projection txn (`defaultChatTxn` in `src/lib/sessions.ts`). It mirrors the row-owner-plus-owning-teacher pattern already landed for `participants` (cycle 0013) and `sessionResources` (cycle 0003), reuses the existing `messageSession` link for the `session.teacherId` traversal, updates the structural permission tests, and pushes via `npm run perms:push`.

## Current Codebase State

### Relevant Components
- `messages` permission rule (the change target): currently `messages: { allow: { $default: 'true' } }` — `src/lib/perms.ts:135`. Sits among the explicitly-open Batch-2 namespaces alongside `questions` (`:136`) and `endorsements` (`:137`), and the `todos` demo (`:129`).
- Global deny-by-default rule: `$default: { allow: { $default: 'false' } }` — `src/lib/perms.ts:37`. Any entity without an explicit block is non-readable/non-writable; openness must be declared per entity.
- `messages` entity schema: `src/lib/db.ts:107-119` — fields `sessionId` (indexed), `participantId` (client-supplied scalar, `:109`), `clientActionId` (indexed, `:114`), `text`, `visibility`, `classificationStatus`, `createdAt`. No author link column today; `participantId` is a plain string.
- Existing `messageSession` link (`messages` → `sessions`, forward `session` / reverse `messages`): `src/lib/db.ts:160-163`. Supplies the `data.ref('session.teacherId')` traversal for the owning-teacher clause; added in cycle 0008 precisely to enable a tightened rule.
- Chat-message projection txn (`defaultChatTxn`): `src/lib/sessions.ts:607-620`. Writes the `messages` scalar columns and sets `.link({ session: r.sessionId })`. This is where the new `messageParticipant` link must be added.
- Sole sanctioned message-create path: `submitChatMessage` (`src/lib/sessions.ts:644-658`) and its pure core `buildChatMessage` (`src/lib/sessions.ts:481-510`). `buildChatMessage` already requires a present `participantId` and `userId`; the `MessageRecord` carries `participantId` (`src/lib/sessions.ts:445-454`).
- `participants` rule — the pattern to mirror: `src/lib/perms.ts:113-125`. `bind: ['isOwnRow', 'auth.id == data.userId', 'isSessionOwner', "auth.id in data.ref('session.teacherId')", 'isAdmin', 'false']`; `view: 'true'`; create/update/delete = `isOwnRow || isSessionOwner || isAdmin`.
- `sessionResources` rule — the original forgery-proof-link precedent: `src/lib/perms.ts:69-88`.

### Existing Patterns to Follow
- Forgery-proof link traversal: ownership is checked against the LINKED parent (e.g. `auth.id in data.ref('session.teacherId')`), never a client-supplied denormalized scalar. Established in `sessionResources` (`src/lib/perms.ts:81`) and `participants` (`src/lib/perms.ts:116`). The matching link must be set on the write txn (`participantSession` set in `defaultParticipantTxn` via `.link({ session: r.sessionId })` — `src/lib/sessions.ts:403-405`).
- Link definition convention: forward `one` on the child / reverse `many` on the parent, with a comment explaining what the permission rule traverses. The `questionParticipant` link (`questions` → `participants`, `src/lib/db.ts:175-178`) is the exact precedent the new `messageParticipant` link mirrors; `defaultQuestionTxn` sets it via `.link({ ..., participant: r.participantId, ... })` — `src/lib/sessions.ts:594-599`.
- `bind` array shape: alternating name/expression pairs, e.g. `['isOwnRow', '<expr>', 'isSessionOwner', '<expr>', 'isAdmin', 'false']` (`src/lib/perms.ts:114-118`). `isAdmin` is always the reserved client-admin slot evaluating `'false'` (admin actions use the admin SDK, which bypasses rules — documented at `src/lib/perms.ts:9-13`).
- Open-read-with-comment convention: rules that keep `view: 'true'` carry an inline comment stating the reason (e.g. `sessions` `:58-59`, `participants` `:111-112`). The new `messages` block must carry a comment that the open read is deliberate for the live stream.
- Type annotation intentionally omitted on `rules` so the structural guard gets non-optional inferred access — `src/lib/perms.ts:14-19`.
- Dual-write choke point: all projection writes route through `writeEvent(type, meta, projectionTxns)` (`src/lib/db.ts:479-517`), which appends the `sessionEvents` envelope + projection txn(s) in one `db.transact()`.
- Failure handling: `writeEvent` validates synchronously and throws before any transaction on bad input (`src/lib/db.ts:484-500`); a rejected transaction fails atomically (no half-applied dual-write) and the rejection propagates — `submitChatMessage` awaits each `write(...)` and never catches/swallows (`src/lib/sessions.ts:652-657`). `submitChatMessage`'s contract docstring states the rejection "propagates to the caller and is never swallowed" (`src/lib/sessions.ts:622-643`). A permission-denied write therefore surfaces to the caller (`StudentChat`) as it does today; reads are unaffected.
- Idempotency / retry-safety: message idempotency is by client action id — the `messages` row id IS the `clientActionId` (deterministic keyed upsert, `src/lib/sessions.ts:494-503`); the caller pre-checks via the pure `shouldSubmitChatMessage` (`src/lib/sessions.ts:519-536`). The new link is additive and does not change this. Permission rules are themselves declarative/idempotent to push (`scripts/push-perms.mjs` header comment).
- Observability: there is no `.cycle/log.jsonl`-style logging inside the perms/db/sessions layer; observability here is the unit-test structural guard plus inline `console.error('[StudentChat] …')` in the UI on rejected writes (per AGENTS.md note). The perms-push runner fails loud with non-zero exit + a clear message on every failure path (`scripts/push-perms.mjs`).

### Dependencies & Integration Points
- `src/lib/perms.ts` — the single source of permission rules; re-exported unchanged by the root CLI adapter `instant.perms.ts`, which the structural guard pins via `expect(rootRules).toBe(rules)` (`src/lib/perms.test.ts:98-102`).
- `npm run perms:push` → `scripts/push-perms.mjs` → `npx instant-cli push perms --app <PUBLIC_INSTANTDB_APP_ID>`. Validates the app-id precondition first and exits non-zero on any failure. Requires a configured Instant app + credentials.
- `src/lib/db.ts` — schema (`messages` entity + links) and `db` client. The new `messageParticipant` link endpoints (`messages`, `participants`) are both existing entities with explicit rules, so the "every entity has a rule" guard (`src/lib/perms.test.ts:81-90`) stays satisfied.
- `src/lib/sessions.ts` — `defaultChatTxn` / `submitChatMessage` write path that must set the new link.
- `src/components/StudentChat.tsx` — the chat island that calls `submitChatMessage` and renders the realtime `db.useQuery` stream; surfaces rejected writes inline (per AGENTS.md `src/lib/...` note). Out of scope except as the link addition requires on the write path.
- `e2e/permissions.spec.ts` and `e2e/student-chat.spec.ts` — live Playwright suites (skip loudly without admin env); no new E2E required this cycle per SPEC.

### Test Infrastructure
- Test framework: Vitest (`npm test` → `vitest run`); Playwright for E2E (`npm run test:e2e`).
- Relevant unit test files: `src/lib/perms.test.ts`, `src/lib/db.test.ts`, `src/lib/sessions.test.ts`.
- Test conventions: pure-core builders are tested directly with injected deps; the perms layer is pinned by a structural guard over the inferred `rules` object (`src/lib/perms.test.ts:11-103`) rather than a live policy emulator — each rule asserts exact expression strings (e.g. `expect(rules.sessions.allow.view).toBe('true')`) and `bind` membership (`toContain`). `submitChatMessage` wrapper tests inject `write` and stub `buildTxn: () => ({})`, so the projection txn body (including `.link(...)`) is not exercised by those wrapper tests today (`src/lib/sessions.test.ts:606-730`); `buildChatMessage` is tested for record/meta shape and validation throws (`src/lib/sessions.test.ts:479-586`).
- Structural guard tests that must be updated:
  - `formerly-default-governed entities are explicitly open` currently asserts `messages` among `['todos','messages','questions','endorsements']` with `allow.$default === 'true'` (`src/lib/perms.test.ts:92-96`) — `messages` must be removed from this list.
  - `every schema entity has an explicit rule` iterates `schema.entities` (`src/lib/perms.test.ts:81-90`) — stays green with the additive link.
  - `$default denies by default` (`src/lib/perms.test.ts:76-79`) and `root instant.perms.ts re-exports` (`:98-102`) unchanged.
  - New `messages` assertions should mirror the `participants` / `sessionResources` guard blocks (`src/lib/perms.test.ts:33-48`, `:56-74`): assert `view === 'true'`, that create/update/delete are not `'true'`, and that `bind` contains both `auth.id in data.ref('session.teacherId')` and the participant-author traversal.
- Failure-path test coverage that exists today: `submitChatMessage` has explicit rejection-propagation tests — a rejected `write` propagates and is not swallowed (`src/lib/sessions.test.ts:707-713`); a `QuestionCreated` rejection keeps the message committed and propagates (`:686-705`); invalid input throws before `write` is called (`:715-729`). `buildChatMessage` rejects missing `sessionId`/`participantId`/`userId`/`clientActionId`/blank `text` (`:535-559`). These pin the existing propagation/atomicity contract the new rule must keep.
- Cycle-0013 precedent for the test edits: the same structural-guard test was extended in commit `736c6dc` (`src/lib/perms.test.ts` diff) — it removed `participants` from the open list and added the deny-by-default + schema-driven + explicitly-open assertions; this cycle repeats that shape for `messages`.

## Code References
- `src/lib/perms.ts:135` — `messages: { allow: { $default: 'true' } }`, the fully-open rule to replace.
- `src/lib/perms.ts:113-125` — `participants` rule: the row-owner + owning-teacher + `isAdmin` pattern to mirror (bind + create/update/delete).
- `src/lib/perms.ts:69-88` — `sessionResources` rule: original forgery-proof `data.ref('session.teacherId')` precedent.
- `src/lib/perms.ts:37` — global deny-by-default `$default`.
- `src/lib/db.ts:107-119` — `messages` entity (scalar `participantId` at `:109`).
- `src/lib/db.ts:160-163` — existing `messageSession` link (supplies `session.teacherId`).
- `src/lib/db.ts:175-178` — `questionParticipant` link: the exact model for the new `messageParticipant` link.
- `src/lib/db.ts:151-154` — `participantSession` link (forward `one` / reverse `many` convention).
- `src/lib/sessions.ts:607-620` — `defaultChatTxn`, where the `messageParticipant` link must be set (currently sets only `.link({ session })`).
- `src/lib/sessions.ts:594-599` — `defaultQuestionTxn` setting `.link({ message, participant, session })` — the link-setting precedent.
- `src/lib/sessions.ts:403-405` — `defaultParticipantTxn` setting `.link({ session })` for the forgery-proof participant rule.
- `src/lib/sessions.ts:644-658` — `submitChatMessage` dual-write wrapper (propagation contract).
- `src/lib/db.ts:479-517` — `writeEvent` dual-write choke point + synchronous validation.
- `src/lib/perms.test.ts:92-96` — open-namespace list that must drop `messages`.
- `src/lib/perms.test.ts:33-48`, `:56-74` — `sessionResources` / `participants` structural-guard blocks to mirror for `messages`.
- `instant.perms.ts` — root adapter re-exporting `src/lib/perms.ts` default.
- `scripts/push-perms.mjs` — fail-loud `perms:push` runner.
- `AGENTS.md:41` — the Batch-2/`messages` fail-open note to update (records `messages` is now participant-scoped create + row-owner/owning-teacher update/delete, reads intentionally open).
- `README.md:313-329` — README "Chat messages now carry an explicit open permission block" note to update.

## Open Questions
- InstantDB CEL precedent in this codebase only ever traverses `data.ref('<link>.<field>')` for ownership (e.g. `session.teacherId`). The SPEC requires the create rule ALSO assert the stored `participantId` scalar equals the linked participant's id (anti-spoof, scalar ↔ link coupling). Whether `data.participantId == data.ref('participant.id')` (or the precise CEL form/collection-membership idiom InstantDB accepts for this equality) validates against the live app is not demonstrated by any existing rule and is resolved at `npm run perms:push` time.
- Whether the new `messageParticipant` link addition is schema-additive only (no migration) and whether `npx instant-cli push schema` must precede `perms:push` against the schema-enforced live app — prior cycles (0008/0009) ran a schema push for additive links; the planner should confirm the push order.
- Whether the existing `submitChatMessage` wrapper tests (which stub `buildTxn`) should be extended to assert the new `.link({ participant })`, or whether a dedicated `defaultChatTxn`/link-shape test is added — current wrapper tests do not exercise the real txn body.
```
