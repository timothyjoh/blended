All three passes complete. Implementation is clean, fully tested (400 tests pass, coverage healthy), `astro check` clean, all SPEC ACs met, traceability present, and every in-scope doc claim is backed by code. Producing the review.

# Review: Cycle 0018

## Overall Verdict
PASS — no fixes needed

No NEEDS-FIX trigger is present: the build and full test suite pass, coverage shows no regression and no new untested lib code, every SPEC Acceptance Criterion is implemented and verified, PLAN.md carries a complete `## SPEC Acceptance Traceability` section, SPEC.md has a populated `## Acceptance Criteria` section, error handling is fail-safe and observable, the teacher write is convergent/latched (idempotent per settled outcome), and all in-scope documentation prose is backed by real `file:line` references.

## Code Quality Review

### Summary
A tight, well-scoped vertical slice that delivers the SPEC §8.2 "never a blank pane" guarantee exactly as planned. The fallback card is purely prop-driven inside `ResourcePane`, so the visual guarantee holds in both contexts and independent of the teacher write; the single sanctioned `recordEmbedStatus` path mirrors the existing activation/broadcast triplet faithfully (pure total builder → injectable wrapper → keyed no-link txn), and `applyEvent` folds the new event tolerantly. Errors are surfaced inline and logged, never swallowed.

### Findings
1. **Comment accuracy (minor)**: The header in `src/lib/embed.ts:14` and `src/components/ResourcePane.tsx:19` state that for a slow-but-valid embed "a late `onLoad`, if it arrives, clears it." In the implementation, once `status` becomes `blocked`/`failed` the iframe is unmounted (the card replaces it — `ResourcePane.tsx:111-140`), so a late `onLoad` can never fire to clear the card. The behavior is still SPEC-correct — SPEC §44 explicitly *accepts* a permanently-shown card for a slow embed as "degraded-but-visible" — so this is only an over-promising comment, not a functional defect. The in-scope docs (README/AGENTS) do not repeat this claim and are accurate. — `src/lib/embed.ts:14`
2. **Coverage (informational)**: `embed.ts` branch coverage is 83.33% — the single uncovered branch is the `|| url` fallback when `new URL(url).hostname` is empty (`src/lib/embed.ts:23`). New code, not a regression; trivial. — `src/lib/embed.ts:23`

### Spec Compliance Checklist
- [x] **AC1** User-observable benefit — fallback card (title + URL + "Open externally", `target="_blank"`/`rel="noopener noreferrer"`) renders in both teacher and student contexts, no blank/broken iframe (`ResourcePane.tsx:111-140`, wired at `SessionLifecycle.tsx:525` and `StudentSession.tsx:107`; e2e asserts both at `blocked-embed-fallback.spec.ts:128-129`).
- [x] **AC2** Embeddable URL renders inline, no card, pending timeout cancelled on `onLoad` (`ResourcePane.tsx:154-157`; e2e `:155-162`).
- [x] **AC3** Teacher context transitions `embedStatus` `unchecked`→`blocked`/`failed` and appends exactly one `ResourceEmbedChecked` per settled outcome (convergence guard + per-resource latch `SessionLifecycle.tsx:279-313`; e2e count==1 `:132`).
- [x] **AC4** `applyEvent` folds `ResourceEmbedChecked`, never raises `UnknownEventTypeError` (`db.ts:574-607`; unit `db.test.ts` `not.toThrow`).
- [x] **AC5** Failure-path — card stays visible (prop-driven), rejection surfaces inline (`role="alert"`, `data-testid="embed-status-error"`) + `console.error`, never swallowed (`SessionLifecycle.tsx:305-312`, `:528-535`; wrapper propagation unit-tested in `sessions.test.ts`).
- [x] **AC6** All existing tests pass (400/400).
- [x] **AC7** `npm run astro check` clean (0 errors, 0 warnings; 36 pre-existing hints in vendored `ui/tabs.tsx`).
- [x] SPEC→PLAN traceability present and complete (`PLAN.md:418-428`, all 7 bullets re-quoted verbatim + covering task ids).
- [x] No-schema-push / no-`perms:push` honored (`embedStatus` pre-exists; teacher writes via existing owner-only rule).
- [x] Docs updated (AGENTS.md cycle-0018 paragraph, README section).
- [x] No email read or rendered in the card or event.

## Adversarial Test Review

### Summary
Strong. Unit tests use real builders/folds and stub only the `writeEvent` seam via injectable `deps`; assertions are specific (full-object `toEqual`, exact thrown-message regexes, `__ops` shape inspection). The e2e exercises real browser iframe behavior with deterministic fixtures and asserts admin-observable evidence with exact counts.

### Findings
1. **Assertion quality (positive)**: Builder accept-case asserts the full plan + envelope shape, not just truthiness (`sessions.test.ts` `buildEmbedStatusCheck` "produces the plan + ResourceEmbedChecked envelope"). Fold tests assert the entire resulting entry object and verify non-mutation of input.
2. **Failure coverage (positive)**: Reject paths (non-teacher, missing id/session/resource, status outside `{blocked,failed}`), wrapper rejection-propagation, and "no write on bad input" are all covered. Idempotent re-fold and type-guard-to-`undefined` covered in `db.test.ts`.
3. **Gap (minor)**: The teacher-side rejected-write *render* leg (inline `embed-status-error` actually appearing in the DOM after a failed `recordEmbedStatus`) is not directly asserted — only the wrapper-level rejection propagation is unit-tested and the catch block is straightforward. The e2e failure leg instead covers the student-no-write case. Acceptable per the plan's "UI behavior covered by e2e against a real browser" strategy; not blocking. — `blocked-embed-fallback.spec.ts:148-152`
4. **Independence (positive)**: Each unit test constructs its own projection/input; no shared mutable state or order dependence.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`, v8)
- Line / branch / function: Lines 92.40% / Branches 83.26% / Functions 84.61% (Statements 90.74%)
- Per-new-file: `embed.ts` 100% stmts/100% lines/83.33% branch; `sessions.ts` 97.01% stmts/98.28% lines; `db.ts` 93.67% stmts/94.52% lines
- Regressions vs base (per-file): none — every new lib export (`buildEmbedStatusCheck`/`recordEmbedStatus`/`defaultEmbedStatusTxn`, the fold, `resourceCardHeading`) ships with new unit tests; healthy file numbers held or improved
- New code without tests: none in the lib-scoped vitest set. `ResourcePane.tsx`, `SessionLifecycle.tsx`, `StudentSession.tsx`, `src/pages/e2e/hang.ts` are outside the vitest coverage set by design (browser-exercised by Playwright `e2e/blocked-embed-fallback.spec.ts`)
- Specific scenarios missing tests: teacher-side `embed-status-error` DOM render after a rejected write (covered indirectly via the wrapper rejection unit test + e2e student-no-write leg); `resourceCardHeading` empty-hostname `|| url` branch

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `recordEmbedStatus` / `buildEmbedStatusCheck` are the sole sanctioned writer of `embedStatus` | `AGENTS.md:55` | `src/lib/sessions.ts:1209`, `src/lib/sessions.ts:1252` | OK |
| Routes the dual-write through `writeEvent('ResourceEmbedChecked', …)` | `AGENTS.md:55` | `src/lib/sessions.ts:1259` | OK |
| `defaultEmbedStatusTxn` is a plain `db.tx.sessionResources[id].update({ embedStatus })` with no `link` op | `AGENTS.md:55` | `src/lib/sessions.ts:1233-1234` | OK |
| `applyEvent` folds `ResourceEmbedChecked` into the resources map entry | `AGENTS.md:55` | `src/lib/db.ts:574-607` | OK |
| `SessionProjection.resources[id]` gains optional `embedStatus?` | `AGENTS.md:55` | `src/lib/db.ts:286` | OK |
| Bounded load timeout `EMBED_LOAD_TIMEOUT_MS` in `src/lib/embed.ts` | `AGENTS.md:55` | `src/lib/embed.ts:16` | OK |
| Successful `onLoad` cancels the pending timeout (no false positive) | `AGENTS.md:55`, `README.md:340` | `src/components/ResourcePane.tsx:154-157` | OK |
| Fallback card: title (or `resourceCardHeading` hostname), URL text, "Open externally" `target="_blank"`+`rel="noopener noreferrer"` | `AGENTS.md:55`, `README.md:333` | `src/components/ResourcePane.tsx:111-140`, `src/lib/embed.ts:19` | OK |
| Teacher inline `embed-status-error` `role="alert"` + `console.error('[SessionLifecycle] record embed status failed:', …)` | `AGENTS.md:55` | `src/components/SessionLifecycle.tsx:528-535`, `:311` | OK |
| Student resolves title via narrowly-scoped active-resource query, passes no `onEmbedBlocked` | `AGENTS.md:55` | `src/components/StudentSession.tsx:45-49`, `:104-108` | OK |
| Testids `resource-pane-fallback` / `-fallback-title` / `-fallback-url` / `resource-pane-open-external` | `AGENTS.md:55` | `src/components/ResourcePane.tsx:115,119,123,129` | OK |
| Testid `embed-status-error` (teacher inline alert) | `AGENTS.md:55` | `src/components/SessionLifecycle.tsx:530` | OK |
| Dev-guarded `/e2e/hang` endpoint that delays past the timeout (404 in production) | `AGENTS.md:55`, `README.md:354` | `src/pages/e2e/hang.ts:18-21` | OK |
| Embeddable fixture `/e2e/embed-ok.html` renders inline with no card | `AGENTS.md:55` | `public/e2e/embed-ok.html:1-19` | OK |
| e2e suite is `e2e/blocked-embed-fallback.spec.ts` | `AGENTS.md:55`, `README.md:355` | `e2e/blocked-embed-fallback.spec.ts:1` | OK |
| No schema push / no `perms:push` this cycle | `AGENTS.md:55`, `README.md:351` | `src/lib/db.ts:89` (pre-existing `embedStatus`); no `perms.ts`/schema change in diff | OK |
