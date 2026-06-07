# Review: Cycle 0006

## Overall Verdict
PASS — no fixes needed

All three review passes clear. The lifecycle slice is implemented exactly as specified: a pure §6.2 transition guard, owner-validating builders, atomic dual-write wrappers, two `applyEvent` fold cases, a pure `isJoinEnabled` gate, and an owner-only Start/End island reachable from the post-create card. `npm run test` → 130 passed; `npm run astro check` → 0 errors / 0 warnings; coverage improved on every metric vs base with no per-file regression. SPEC has a populated `## Acceptance Criteria` section and PLAN has a complete `## SPEC Acceptance Traceability` table covering all nine bullets verbatim. No swallowed errors, no fail-open defaults, non-idempotency is intentional and guard-protected. No unbacked documentation claims.

## Code Quality Review

### Summary
Clean extension of the cycle-0005 pure-core pattern. The legal-transition table is the single source of §6.2 truth, builders validate transition + ownership + present id before producing any plan, and the dual-write routes exclusively through `writeEvent` in one transaction. Failure handling is explicit and observable throughout.

### Findings
1. **Idempotency (by design, correct)**: `startSession` / `endSession` are intentionally non-idempotent; retry safety comes from `assertLegalTransition` fed the live status, which rejects a stale re-issue rather than appending a duplicate event — `src/lib/sessions.ts:261`, `src/lib/sessions.ts:277`. Matches `writeEvent`'s documented single-transaction atomicity (`src/lib/db.ts:305`), so a rejected transition leaves no partial state. Correct.
2. **Fail-safe transition guard**: `assertLegalTransition` is total over hostile input — a `null`/`undefined`/unknown `from` has no allowed targets and always throws (fail-closed), never silently permits — `src/lib/sessions.ts:164`.
3. **No silent failure (island)**: every failure path in `SessionLifecycle` sets the inline `role="alert"` error **and** `console.error`s; query errors are logged and render a non-actionable state with no controls — `src/components/SessionLifecycle.tsx:31`, `src/components/SessionLifecycle.tsx:35`. No empty/bare catch.
4. **Ownership in depth**: builder rejects `actorId !== session.teacherId` (`src/lib/sessions.ts:201`, `src/lib/sessions.ts:225`), the island is mounted behind `SessionRouteGuard` (`src/pages/dashboard/sessions/[id].astro:19`), and the cycle-0003 data-layer rule remains the backstop. No new write path bypasses `writeEvent`.
5. **Fold cases tolerate partial logs**: `SessionStarted` / `SessionEnded` build a minimal session from payload when no prior session exists, rather than throwing — `src/lib/db.ts:226`, `src/lib/db.ts:236`. No mutation of the input projection.
6. **Minor — redundant live query**: both `SessionRouteGuard` and `SessionLifecycle` run a `db.useQuery` for the same session id (`src/components/SessionRouteGuard.tsx:25`, `src/components/SessionLifecycle.tsx:25`). InstantDB dedupes the subscription, so this is a cosmetic redundancy, not a correctness issue. No action required.

### Spec Compliance Checklist
- [x] `assertLegalTransition` permits only `draft → live` and `live → ended`; all others rejected before any write — `src/lib/sessions.ts:164`
- [x] `buildSessionStart` / `buildSessionEnd` validate transition + owner + present `sessionId`, emit `actor.role: 'teacher'`, `sessionId === payload.id`, and the projection `update` stamping `startedAt`/`endedAt` — `src/lib/sessions.ts:199`, `src/lib/sessions.ts:223`
- [x] `startSession` / `endSession` route the dual-write through `writeEvent('SessionStarted'/'SessionEnded', …)` with one projection txn — `src/lib/sessions.ts:261`, `src/lib/sessions.ts:277`
- [x] `applyEvent` folds both lifecycle events to `live`/`ended`; rebuild over the full lifecycle yields `ended` — `src/lib/db.ts:226`
- [x] `isJoinEnabled` pure/total, true iff `status === 'live'` — `src/lib/sessions.ts:293`
- [x] Owner-only Start/End controls, status, join-gate affordance, inline error on detail page — `src/components/SessionLifecycle.tsx`
- [x] Post-create card links to the detail page (`created-session-link`) — `src/components/NewSession.tsx:115`
- [x] Concrete user benefit deliverable end-to-end: draft → Start → live (join code presented active) → End → ended; reachable from the create flow without a session list
- [x] Docs updated (AGENTS.md, README.md, release-notes.md) consistent with shipped behavior and testids
- [x] No schema change needed — `status`/`startedAt`/`endedAt`/`joinCode` already present — `src/lib/db.ts:48`

## Adversarial Test Review

### Summary
Strong. Unit tests use the existing injectable-deps seam (thin spies, not heavy mocks); pure functions are tested directly. Assertions are specific (`toEqual` on full `meta.payload` / `update` objects, not truthiness). Failure paths are first-class: rejected `write` propagation, illegal/non-owner rejection *without* calling write, and no-mutation of folded projections are all asserted.

### Findings
1. **Failure-path coverage is real, not happy-path-only**: rejecting `write` propagation (`src/lib/sessions.test.ts` "propagates (does not swallow) a rejected write"), illegal transition asserts `called === false`, non-owner end asserts `called === false`. Good.
2. **Boundary coverage**: `assertLegalTransition` tested across `null`/`undefined`/`'bogus'` from; `isJoinEnabled` truth table across all statuses plus `null`/`undefined`/`{}`. Strong.
3. **Determinism / independence**: fold tests assert input is not mutated and that out-of-order rebuild equals in-order rebuild; e2e uses `freshEmail()` per test — no shared state or order dependence.
4. **Minor gap — default-dep txn path not unit-exercised**: the wrapper unit tests inject `buildTxn: () => ({})`, so the real `defaultTransitionTxn` (`src/lib/sessions.ts:247`) `db.tx.sessions[id].update(...)` is only covered by the e2e suite, which skips when admin env is unset. This mirrors the pre-existing uncovered `defaultBuildTxn` (`src/lib/sessions.ts:106`) — a sanctioned, established pattern, not a new gap. No action required.
5. **Island logic e2e-only**: `SessionLifecycle`'s `run` guards (no-auth-id, still-loading) and inline-error rendering are exercised only by `e2e/session-lifecycle.spec.ts`, which skips loudly without `INSTANT_ADMIN_TOKEN`. Consistent with the cycle-0005 convention and documented in README known limitations. Not a NEEDS-FIX.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (all files): **82% lines / 73.74% branch / 75% funcs** (stmts 79.77%). Base was ~76.99% lines (per BUILD.md) — improvement on every metric.
- Per-changed-file: `sessions.ts` 95.16% stmts / 83.33% branch / 96.49% lines; `db.ts` 90% stmts / 71.01% branch / 90.9% lines.
- Regressions vs base (per-file): none.
- New code without tests: none of substance. Uncovered lines are `sessions.ts:106` and `sessions.ts:248` — the production-only `db.tx` default-dep thunks (`defaultBuildTxn`, `defaultTransitionTxn`); `db.ts:199-200`, `349-350` are pre-existing.
- Specific scenarios missing tests: live `startSession`/`endSession` write, the live join-gate UI, and the start→end browser flow are verified only by the (env-gated, loudly-skipping) e2e suite — by SPEC design, not an omission.

## Doc-vs-Code Claim Verification

In-scope doc paths changed: `AGENTS.md`, `README.md`. (`release-notes.md` at repo root is not in the in-scope set.) Every introduced behavioral claim, testid, function name, and path is backed:

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `startSession` / `endSession` (`src/lib/sessions.ts`) are the only sanctioned transition paths | `AGENTS.md:36` | `src/lib/sessions.ts:261`, `src/lib/sessions.ts:277` | OK |
| route dual-write through `writeEvent('SessionStarted'/'SessionEnded', …)` | `AGENTS.md:36` | `src/lib/sessions.ts:268`, `src/lib/sessions.ts:284` | OK |
| `assertLegalTransition` pins §6.2 — only `draft → live`, `live → ended` | `AGENTS.md:36` | `src/lib/sessions.ts:164`, `src/lib/sessions.ts:170` | OK |
| builders validate owner identity `actorId === session.teacherId`, `actor.role: 'teacher'` | `AGENTS.md:36` | `src/lib/sessions.ts:201`, `src/lib/sessions.ts:210` | OK |
| `applyEvent` folds `SessionStarted` / `SessionEnded` (status → live/ended) | `AGENTS.md:36` | `src/lib/db.ts:226`, `src/lib/db.ts:236` | OK |
| `isJoinEnabled(session)` true ONLY when `status === 'live'` | `AGENTS.md:36`, `README.md` | `src/lib/sessions.ts:293` | OK |
| `SessionLifecycle` (`src/components/SessionLifecycle.tsx`) mounted inside `SessionRouteGuard` on `/dashboard/sessions/[id]` | `AGENTS.md:36` | `src/pages/dashboard/sessions/[id].astro:19` | OK |
| testids `session-start`, `session-end`, `session-status`, `session-join-state`, `session-lifecycle-error`, `session-root` | `AGENTS.md:36` | `src/components/SessionLifecycle.tsx:142,150,114,121,70,106` | OK |
| `created-session-link` post-create link to the detail page | `AGENTS.md:34`, `README.md` | `src/components/NewSession.tsx:115` | OK |
| "Open session" link reaches `/dashboard/sessions/[id]`; Start → live (join code active), End → ended (join disabled) | `README.md` (Starting/ending section) | `src/components/NewSession.tsx:116`, `src/components/SessionLifecycle.tsx:129-136` | OK |
| illegal/stale transition rejected inline, status unchanged, no half-applied state | `README.md` | `src/lib/sessions.ts:170`, `src/components/SessionLifecycle.tsx:61` | OK |
| Both Start and End controls are shown (illegal click rejected, not hidden) | `README.md` known limitations | `src/components/SessionLifecycle.tsx:141,149` | OK |

No unbacked claims.
