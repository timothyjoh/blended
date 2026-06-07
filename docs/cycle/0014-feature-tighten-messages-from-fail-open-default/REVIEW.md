# Review: Cycle 0014

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

The in-repo implementation is high quality (clean code, full tests, green build, no coverage regression, accurate docs). It is gated by two critical items tied to the deferred live push: the SPEC's `npm run perms:push` acceptance criterion is unmet, and the central user benefit — a legitimate student send still succeeds under the new create rule — is unverified against the live data layer (with a real, un-derisked correctness risk in the create rule).

## Code Quality Review

### Summary
The change faithfully replaces `messages: { allow: { $default: 'true' } }` with an explicit, forgery-proof rule mirroring the `participants` row-owner + owning-teacher pattern, backed by an additive `messageParticipant` link wired into the sole sanctioned send path. It is fail-safe (deny-by-default global, explicit per-entity openness), introduces no swallowed errors, and preserves idempotency. The one substantive concern is that the create rule's live viability is unproven and is structurally riskier than the precedent it cites.

### Findings
1. **Correctness / live-behavior risk**: The `messages` create rule `isAuthor && scalarMatchesLink` depends entirely on `data.ref('participant.*')` resolving during create-rule evaluation against the link set in the same transaction — `src/lib/perms.ts:148-149,158`. Unlike the cited `participants` precedent, which admits a legitimate self-join via a scalar-only branch `isOwnRow = auth.id == data.userId` (`src/lib/perms.ts:118,124`), the messages create rule has **no scalar fallback**. If `data.ref`-on-create does not resolve, every legitimate send is rejected and chat breaks. Never verified (live push deferred). See MUST-FIX Task 2.
2. **Unmet SPEC AC (operational)**: `npm run perms:push` against the live app was not executed (BUILD.md "Deviations"); the tightened rule is not live, so production `messages` remains fully open. See MUST-FIX Task 1.
3. **Anti-spoof idiom unproven**: `data.participantId in data.ref('participant.id')` (`src/lib/perms.ts:149`) is a new CEL form never validated against the live app; PLAN carried an explicit `== data.ref('participant.id')[0]` contingency that has not been exercised.
4. **Failure handling — clean**: `defaultChatTxn` only adds a `.link({ participant })` (`src/lib/sessions.ts:622`); `submitChatMessage` still awaits each write and never catches. Deny-by-default `$default` (`src/lib/perms.ts:32`) keeps the change fail-safe. No swallowed errors, no fail-open default, idempotency preserved (row id = `clientActionId`).
5. **Minor doc inaccuracy**: BUILD.md:20 says `perms.ts` is "outside the coverage include set"; the include glob `src/lib/**/*.ts` (`vitest.config.ts:17`) does match it — it simply has no executable statements to report. See MUST-FIX Task 3.

### Spec Compliance Checklist
- [x] `rules.messages.allow.$default` no longer `'true'`; explicit `view`/`create`/`update`/`delete` + `bind` over `participant.userId` and `session.teacherId` — `src/lib/perms.ts:146-162`
- [x] `rules.messages.allow.view === 'true'` with adjacent intentional-open comment — `src/lib/perms.ts:154-157`
- [x] Non-author update/delete denied (owner/owning-teacher/admin only), pinned by structural guard — `src/lib/perms.ts:159-160`, `src/lib/perms.test.ts:104-112`
- [x] Spoofed-`participantId` create rejected by `isAuthor && scalarMatchesLink`, pinned by guard — `src/lib/perms.ts:158`, `src/lib/perms.test.ts:97-99,110-111`
- [x] Legit send sets the `messageParticipant` link — `src/lib/sessions.ts:622`, test `src/lib/sessions.test.ts:603-606`
- [x] `perms.test.ts` drops `messages` from the open-`$default` list and asserts scoped expressions — `src/lib/perms.test.ts:92-120,127`
- [ ] **`npm run perms:push` succeeds against the live Instant app — NOT met (deferred to operator; environmental)**
- [ ] **User-observable benefit verified end-to-end — only the txn shape is proven; the live create rule admitting a real send is unverified** (MUST-FIX Task 2)
- [x] All existing tests pass — `npm test` → 271 passed
- [x] No compiler/linter warnings introduced — `npm run build` exit 0; only the pre-existing unrelated `flex` CSS hint and the Vercel Node-version warning

## Adversarial Test Review

### Summary
Adequate-to-strong for this codebase's chosen strategy. Permission semantics are pinned by a structural guard over the inferred `rules` object (asserting exact CEL strings), the new link's endpoints are pinned exactly, and `defaultChatTxn` is now exercised for real rather than stubbed. The inherent limit — shared with every prior perms cycle here — is that no test executes live InstantDB CEL evaluation, so create-rule admission/denial is asserted by string shape, not by behavior.

### Findings
1. **Assertion quality — strong**: The `messages` guard asserts exact bind/allow strings and includes anti-forgery negative guards (`.not.toContain('data.teacherId')`, `.not.toContain('data.userId')`, create `!== 'auth.id != null'`) — `src/lib/perms.test.ts:97-119`.
2. **Boundary/negative coverage — good for the layer**: non-author update/delete and spoofed create are both asserted, not just the happy path — `src/lib/perms.test.ts:104-118`.
3. **Real-txn coverage closed a gap**: `defaultChatTxn` link shape and deterministic keying are tested against the real builder, not the stubbed `buildTxn` — `src/lib/sessions.test.ts:589-619`.
4. **Integration gap (inherent, not introduced)**: no test (or live push) confirms the CEL actually admits a legitimate create or rejects a forged one against the real app — the guard proves the strings, not the enforcement. This is the substance of MUST-FIX Task 2.
5. **Mock abuse — none**: perms are pure strings asserted directly; `defaultChatTxn` runs for real; `submitChatMessage` injects `write` per existing convention. No test is dominated by mocking.
6. **Test independence — fine**: new tests are pure/in-memory with local fixtures; no shared mutable state or ordering dependence.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`)
- Line / branch / function / statement: 88.75% lines, 82.1% branches, 79.59% functions, 86.42% statements (matches BUILD.md)
- Regressions vs base (per-file): none — `sessions.ts` 97.2% lines / 87.75% branch; `db.ts` 92.59% lines / 80.39% branch (both at or above prior cycle; new code is the additive declarative link plus the now-real `defaultChatTxn` test)
- New code without tests: none in-repo — the link is pinned (`db.test.ts:37-45`), the txn wiring is pinned (`sessions.test.ts:589-619`), the rule is pinned (`perms.test.ts:92-120`)
- Specific scenarios missing tests: live-enforcement scenarios only (legit create admitted; forged create denied; non-author update/delete denied) — these require the deferred live push + the `/dev/perms-probe` walkthrough legs, which degraded loudly this cycle

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| New `messageParticipant` link (forward `messages`/one/`participant`, reverse `participants`/many/`messages`) | `README.md:322`, `release-notes.md:17`, `AGENTS.md:41` | `src/lib/db.ts:186-189` | OK |
| `defaultChatTxn` → `.link({ session, participant })` sets the author link | `AGENTS.md:41` | `src/lib/sessions.ts:622` | OK |
| Create author check `auth.id in data.ref('participant.userId')` | `AGENTS.md:41` | `src/lib/perms.ts:148` | OK |
| Anti-spoof `data.participantId in data.ref('participant.id')` | `AGENTS.md:41` | `src/lib/perms.ts:149` | OK |
| Update/delete owning-teacher via `auth.id in data.ref('session.teacherId')` | `README.md:323-324`, `AGENTS.md:41` | `src/lib/perms.ts:150,159-160` | OK |
| Reads stay open `view: 'true'` (intentional for live stream) | `README.md:318`, `AGENTS.md:41` | `src/lib/perms.ts:157` | OK |
| `messages` no longer open `$default`; explicit clauses | `AGENTS.md:27`, `README.md` chat bullet | `src/lib/perms.ts:146-162` | OK |
| Deploy via `npx instant-cli push schema` then `npm run perms:push` | `README.md:326-329`, `AGENTS.md:41`, `release-notes.md:21-22` | `scripts/push-perms.mjs:18-20` (+ `instant-cli` builtin schema push) | OK |
| `questions`/`endorsements` remain the open Batch-2 namespaces | `README.md:324`, `AGENTS.md:27,41` | `src/lib/perms.ts:166-167` | OK |

All in-scope documentation prose changes (`README.md`, `AGENTS.md`, `release-notes.md`) are backed by a real `file:line` reference at HEAD. No unbacked claims.
