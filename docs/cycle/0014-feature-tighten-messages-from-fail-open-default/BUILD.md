## Summary

Cycle 0014 replaces the fully-open `messages` permission rule with an explicit, forgery-proof rule (participant-scoped + anti-spoof create; row-owner / owning-teacher update/delete; reads intentionally open), backed by a new `messageParticipant` author link. All four PLAN.md code tasks are complete; the operational live-push (Task 3) is **deferred to the operator** — see Deviations.

### What changed

- **`src/lib/db.ts`** (+10 lines) — added the `messageParticipant` link (`messages` forward `one`/`participant`; `participants` reverse `many`/`messages`) with an explanatory comment, mirroring `questionParticipant`. Makes the message author traversable for the rule.
- **`src/lib/sessions.ts`** (~2 lines changed) — `defaultChatTxn` now sets `.link({ session, participant })` (was `session`-only) and is `export`ed so the real txn body is unit-testable. The sole sanctioned send path (`submitChatMessage`) thus satisfies the new create rule.
- **`src/lib/perms.ts`** (+~28 lines, −5) — replaced `messages: { allow: { $default: 'true' } }` with an explicit block: `bind` over `auth.id in data.ref('participant.userId')` (author), `data.participantId in data.ref('participant.id')` (anti-spoof scalar↔link coupling), `auth.id in data.ref('session.teacherId')` (owning teacher), `isAdmin`→`false`; `allow` = `view:'true'` (with an inline intentional-open comment), `create:'isAuthor && scalarMatchesLink'`, `update`/`delete:'isAuthor || isOwningTeacher || isAdmin'`. Updated the two header comments that listed `messages` among the open Batch-2 namespaces.
- **`src/lib/perms.test.ts`** (+~35 lines) — dropped `messages` from the open-`$default` list; added a `messages` guard block asserting `view==='true'`, create contains `isAuthor`+`scalarMatchesLink` and is neither `'true'` nor `auth.id != null`, update/delete contain `isAuthor`/`isOwningTeacher`/`isAdmin` and aren't `'true'`, all three `bind` traversals + `isAdmin`/`false` present, and anti-forgery regression guards (`.not.toContain('data.teacherId')`/`'data.userId')` per write op).
- **`src/lib/db.test.ts`** (+12 lines) — imported `schema`; added a `messageParticipant` link-shape assertion pinning both endpoints/labels exactly.
- **`src/lib/sessions.test.ts`** (+~38 lines) — imported `defaultChatTxn`; added a real-`defaultChatTxn` describe block asserting the txn emits a `link` op `{ session, participant }` and keys the row on the message id. Existing `submitChatMessage` propagation/atomicity/idempotency tests left unchanged and still green.
- **Docs** — `AGENTS.md` (deny-by-default note + the cycle-0008 student-chat note flipped from "every operation is still open" to the new participant-scoped posture, citing the link and the schema+perms push); `README.md` (chat permission-posture bullet rewritten to author-scoped writes / open reads + the migration steps); `release-notes.md` (new cycle-0014 entry).
- **Walkthrough** — `docs/cycle/0014-.../walkthrough.mjs` authored: signs in via the deterministic admin magic-code seam, a teacher creates+starts a session, student A joins `/s/:joinCode` and sends a chat message (`01-student-a-sends`), student B opens the same route and sees A's message stream in live (`02-student-b-sees-stream`), then the dev `PermsProbe` surface is captured (`03-perms-probe-surface`). `node --check` clean; deps are `playwright` + `@instantdb/admin` only.

### Tests & coverage

- Test suite: `npm test` (`vitest run`) → **271 passed, 8 files, 0 failed**.
- Build / type-check: `npm run build` (`astro check && astro build`) → **exit 0**, no new errors/warnings (the lone pre-existing `flex` CSS suggestion is unrelated to this cycle).
- Coverage: `npm run test:coverage` (`vitest run --coverage`) → **Statements 86.42% (261/302), Branches 82.1% (257/313), Functions 79.59% (39/49), Lines 88.75% (229/258)**. No per-file regression: `sessions.ts` 95.09%/87.75%/85.18%/97.2%, `db.ts` 91.66%/80.39%/100%/92.59%. New code is covered in-cycle — `defaultChatTxn` is now exercised by a real-txn test (previously stubbed), and the additive link is declarative. `perms.ts` is a declarative const object with no executable branches, so it contributes nothing to the v8 line/branch report; its semantics are pinned by the `perms.test.ts` structural guard.

### Failure modes handled & their tests

- **Identity spoofing on create** — the create rule requires both author-ownership of the linked participant and scalar↔link equality, so a foreign or decoupled `participantId` is rejected. Covered by the `perms.test.ts` `messages` guard (create contains `isAuthor`+`scalarMatchesLink`, not bare `auth.id != null`) and the anti-forgery `.not.toContain('data.userId'/'data.teacherId')` guards; the link enabling the traversal is pinned by the `db.test.ts` link-shape test.
- **Non-author / unauthenticated update/delete** — restricted to author, owning teacher (via the forgery-proof `session.teacherId` link), or the reserved admin slot. Covered by the guard asserting update/delete aren't `'true'` and contain all three terms, plus the no-client-scalar-trust regression.
- **Write rejection propagation (no silent swallow)** — `submitChatMessage` keeps awaiting each `write(...)` and never catches; a rejected create leaves no row/event (dual-write atomicity). Covered by the existing, still-green rejection-propagation/atomicity/invalid-input tests; no new `catch` introduced.
- **Idempotency** — the additive link re-links the same edge on a keyed re-upsert (row id = `clientActionId`); unchanged and still covered by the existing idempotency-gate tests.

### Deviations from PLAN.md

- **Task 3 (live `npx instant-cli push schema` + `npm run perms:push`) was NOT executed.** Two blockers: (1) `instant-cli` is unauthenticated in this environment (no `~/.instant` token / `INSTANT_ADMIN_TOKEN`), and (2) the harness's auto-mode classifier denied the blind production schema deploy as unauthorized for an autonomous implement step. Per the PLAN's fail-loud principle I did not fabricate a push or weaken the rule — the committed anti-spoof form is the primary `data.participantId in data.ref('participant.id')`; the documented contingency form (`== data.ref('participant.id')[0]`) remains available if the live app rejects the membership idiom. **Follow-up (operator step):** run `npx instant-cli push schema` then `npm run perms:push`; if the membership idiom is rejected, switch the `scalarMatchesLink` bind to the index form, update the matching `perms.test.ts` string, re-run `npm test`, and re-push.
- **Walkthrough denial legs degraded loudly** (as the PLAN's "PermsProbe lacks a messages target / no observable UI" clause prescribes): `PermsProbe` exposes no raw `messages` write target and adding probe/product UI is out of scope, and the live denial only manifests once the rules are pushed — so the spoof/non-author legs emit a one-line stderr diagnostic and capture the real probe surface instead of fabricating a denial. The positive legs (legit send + cross-student stream) are driven over real `/s/:joinCode` routes and are genuine evidence of the user-observable benefit.

### Deferred / follow-up

- Operator: live schema + perms push (above).
- `questions` and `endorsements` remain the intentionally-open Batch-2 namespaces (out of scope this cycle; separate follow-ups).

## Touched Files
- src/lib/db.ts
- src/lib/sessions.ts
- src/lib/perms.ts
- src/lib/perms.test.ts
- src/lib/db.test.ts
- src/lib/sessions.test.ts
- AGENTS.md
- README.md
- release-notes.md
- docs/cycle/0014-feature-tighten-messages-from-fail-open-default/walkthrough.mjs
