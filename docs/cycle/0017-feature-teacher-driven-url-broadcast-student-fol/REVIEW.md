All verification passed. Producing the review.

# Review: Cycle 0017

## Overall Verdict
PASS — no fixes needed

This cycle delivers the teacher-driven URL-broadcast vertical slice exactly to spec: a sole-sanctioned `broadcastResourceUrl`/`buildResourceUrlChange` write path mirroring the cycle-0016 activation slice, a version-keyed `ResourcePane` re-sync, and a teacher broadcast control. All gates are green (374 unit tests, `astro check` 0/0, coverage improved vs base), the SPEC→PLAN traceability is complete, and every in-scope documentation claim is backed by code at HEAD.

## Code Quality Review

### Summary
Clean, faithful mirror of the established activation pattern (pure total builder → thin wrapper → exported default txn). Validation is total and throws before any write; failures are surfaced inline and logged, never swallowed; the dual-write is atomic; the per-broadcast version token is minted (no read-before-write). No architectural drift from RESEARCH.md.

### Findings
1. **Failure handling (positive)**: `buildResourceUrlChange` validates role → actor.id → sessionId → activeResourceId → URL-seam in order, throwing before producing any plan — `src/lib/sessions.ts:1109-1124`.
2. **Fail-safe wrapper (positive)**: `broadcastResourceUrl` does not catch a rejecting `writeEvent`; the rejection propagates to the caller — `src/lib/sessions.ts:1156-1164`.
3. **Observable UI failure handling (positive)**: `broadcast()` gates `validateResourceUrl` before any write, surfaces `role="alert"` inline, `console.error`s the cause, retains the entered URL, and latches `broadcastPending` against double-submit — `src/components/SessionLifecycle.tsx:209-256`.
4. **Replay-safety (positive)**: the `ResourceUrlChanged` fold is type-guarded, tolerates an absent prior session, preserves `activeResourceId`, and never mutates input — `src/lib/db.ts:524-566`.
5. **Idempotency (by design, not a defect)**: broadcast is intentionally non-idempotent — each call mints a fresh `currentUrlVersion` (the re-sync mechanism), but a failed txn writes nothing so retry is safe. Documented in PLAN.md §Failure & Resilience and matches SPEC requirement "Re-sync on every broadcast".

### Spec Compliance Checklist
- [x] Single sanctioned path: only `broadcastResourceUrl`/`activateResource` write `currentUrl`/`currentUrlVersion` — `src/lib/sessions.ts:1147-1151`, `1037-1041`
- [x] URL seam reused, no inline parsing — `src/lib/sessions.ts:1119`
- [x] Pure total builder, throws before any plan — `src/lib/sessions.ts:1109-1126`
- [x] Per-broadcast minted version token via `generateUrlVersion(mint = id)` — `src/lib/sessions.ts:55-57`
- [x] Atomic dual-write through `writeEvent('ResourceUrlChanged', …)` — `src/lib/sessions.ts:1162`
- [x] Activation also stamps `currentUrlVersion` — `src/lib/sessions.ts:1020`, `1035`, `db.ts:520`
- [x] Replay-safe fold; `SessionProjection.session.currentUrlVersion?` added — `src/lib/db.ts:249-250`, `524-566`
- [x] Version-keyed iframe + both call sites threaded — `src/components/ResourcePane.tsx:39`, `SessionLifecycle.tsx:469`, `StudentSession.tsx:86`
- [x] No permission-rule change (inherits owner-only rule)
- [x] No email rendered in control or pane
- [x] Docs updated (AGENTS.md, README.md, release-notes.md)
- [x] SPEC has `## Acceptance Criteria` with 8 testable bullets
- [x] PLAN has complete `## SPEC Acceptance Traceability` (all 8 bullets verbatim, each paired with a covering task)

## Adversarial Test Review

### Summary
Strong. Tests exercise the real `validateResourceUrl` seam and real builders/folds; only `write`/`buildTxn`/`version`/`mint` are injected (the established seam pattern — no heavy mocking). Assertions are specific (full `toEqual` on plan + envelope), every rejection leg is covered, and the fold tests include tolerance, idempotency, no-mutation, type-guard, and shuffled-rebuild determinism.

### Findings
1. **Failure coverage (positive)**: every builder rejection leg asserted individually — non-teacher, missing actor.id, missing sessionId, absent/whitespace activeResourceId, and each `validateResourceUrl` rejection (blank/unsafe_scheme/unparseable) — `src/lib/sessions.test.ts:1499-1546`.
2. **No-write-on-rejection (positive)**: wrapper tests assert `called === false` on builder rejection and rejection-propagation on a rejecting `write` — `src/lib/sessions.test.ts:1571-1608`.
3. **Boundary/defensive (positive)**: malformed-payload folds (non-string `currentUrl`/`currentUrlVersion`) assert type-guard to `undefined` and that the active resource is untouched — `src/lib/db.test.ts:560-590`.
4. **Determinism (positive)**: `rebuildSessionProjection` asserted over both ordered and shuffled `[ResourceActivated, ResourceUrlChanged, ResourceUrlChanged]` (relies on `occurredAt` sort) reproducing the latest URL+version — `src/lib/db.test.ts:827-850`.
5. **Assertion quality (positive)**: version-uniqueness asserted via `.not.toBe` across successive mints rather than weak truthiness — `src/lib/sessions.test.ts:1456,1490`.

### Test Coverage
- Command run: `npm run test:coverage` (Vitest v8, scope `src/lib/**` per project config)
- Line / branch / function (overall src/lib): 91.73% / 83.17% / 83.6%
- Touched files: `sessions.ts` 96.73% stmts / 86.3% branch / 89.47% func; `db.ts` 93.24% stmts / 82.48% branch / 100% func
- Regressions vs base (per-file): none (cycle-0016 base lines 90.96 / branch 82.53 / func 82.45 — all three improved)
- New code without tests: none in `src/lib`. Components (`ResourcePane`, `SessionLifecycle`, `StudentSession`) are outside the `src/lib` coverage scope by the project's established config and are exercised by `e2e/broadcast-resource-url.spec.ts` (skips loudly without `INSTANT_ADMIN_TOKEN`).
- Specific scenarios missing tests: none material. The cross-origin local-navigation re-sync is asserted via the version-keyed `data-url-version` advance on a same-URL re-broadcast (per PLAN Risk Assessment — assert Blended-owned state, not cross-origin DOM); this deviation is honest and documented in BUILD.md.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Sole sanctioned path `broadcastResourceUrl`/`buildResourceUrlChange` | `AGENTS.md:53` | `src/lib/sessions.ts:1109`, `1156` | OK |
| Dual-write through `writeEvent('ResourceUrlChanged', …)` | `AGENTS.md:53` | `src/lib/sessions.ts:1162` | OK |
| `defaultResourceUrlChangeTxn` plain `update`, no `link` op | `AGENTS.md:53` | `src/lib/sessions.ts:1147-1151` | OK |
| `currentUrlVersion` minted via `generateUrlVersion(mint = id)` | `AGENTS.md:53` | `src/lib/sessions.ts:55-57` | OK |
| Activation also stamps `currentUrlVersion` | `AGENTS.md:53` | `src/lib/sessions.ts:1020`,`1035`; `db.ts:520` | OK |
| `applyEvent` folds `ResourceUrlChanged`; `SessionProjection.session` gains `currentUrlVersion?` | `AGENTS.md:53` | `src/lib/db.ts:524-566`, `249-250` | OK |
| Iframe keyed on `currentUrlVersion ?? url` | `AGENTS.md:53` | `src/components/ResourcePane.tsx:39` | OK |
| Additive `sessions.currentUrlVersion` field | `AGENTS.md:53`; `README.md:328` | `src/lib/db.ts:69` | OK |
| Testids `broadcast-url-control/input/submit/error` | `AGENTS.md:53` | `src/components/SessionLifecycle.tsx:437,443,451,461` | OK |
| Iframe carries `data-url-version` | `AGENTS.md:53` | `src/components/ResourcePane.tsx:42` | OK |
| `console.error('[SessionLifecycle] broadcast rejected:', …)` | `AGENTS.md:53` | `src/components/SessionLifecycle.tsx:230` | OK |
| `console.error('[SessionLifecycle] broadcast failed:', …)` | `AGENTS.md:53` | `src/components/SessionLifecycle.tsx:252` | OK |
| Control disabled until a resource is active | `README.md:322` | `src/components/SessionLifecycle.tsx:444,452` | OK |
| Non-teacher has no broadcast control (control only in teacher view) | `README.md:322` | `src/components/StudentSession.tsx:83-87` (mounts only `ResourcePane`) | OK |
| Blank/unsafe/unparseable rejected inline before write | `README.md:322`; `release-notes.md` | `src/components/SessionLifecycle.tsx:219-232` | OK |
| e2e suite `e2e/broadcast-resource-url.spec.ts` | `AGENTS.md:53`; `README.md:329` | `e2e/broadcast-resource-url.spec.ts:1-206` | OK |
| `npx instant-cli push schema` required, no `perms:push` | `AGENTS.md:53`; `README.md:326-328` | `src/lib/db.ts:63-69` (additive optional field; no perms file change) | OK |

All enumerated in-scope documentation claims are backed at HEAD; no unbacked claims.
