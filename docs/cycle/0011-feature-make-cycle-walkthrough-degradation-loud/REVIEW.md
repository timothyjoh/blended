# Review: Cycle 0011

## Overall Verdict
PASS — no fixes needed

All quality gates pass (`npm run test` → 256 passed; `npm run astro check` → 0 errors / 0 warnings / 35 pre-existing hints). Every SPEC acceptance bullet is satisfied, PLAN includes a complete SPEC→PLAN traceability table, all AGENTS.md doc claims are backed by code, the `plan.md`/`build.md` walkthrough wiring is untouched, and the failure-handling contract (best-effort sidecar, always-exit-0, loud diagnostics, no swallowed errors) is correctly implemented. No NEEDS-FIX triggers found; MUST-FIX.md not created.

## Code Quality Review

### Summary
A clean, well-scoped tooling change that faithfully implements the plan. The degradation decision is extracted into a pure, total, exported helper (`decideDegradation`) mirroring the repo's pure-core convention; every `captureWalkthrough` return path is funneled through a single `finalize()` closure so no path can return the stale shape; and `main()` writes the phase-aware sidecar best-effort behind a logging catch. Resilience and observability requirements are met without silent failure.

### Findings
1. **Resilience (correct)**: `main()` always exits 0 via `finally`, and the sidecar-write failure is caught, appended to `errors[]`, and logged — no silent failure — `scripts/walkthrough-capture.mjs:377-386`.
2. **Pure-core totality (correct)**: `decideDegradation` guards non-array `chapters`, missing `outcome`, and blank reasons, always returning a well-formed `{ degraded, reason }` — `scripts/walkthrough-capture.mjs:74-99`.
3. **Single-funnel invariant (correct)**: the `finalize` closure over `media`/`chapters`/`errors` guarantees every early-return path (missing artifactDir, mkdir failure, boot failure, capture crash, main path) carries `degraded`/`reason` — `scripts/walkthrough-capture.mjs:263-268`, `:280`, `:286-288`, `:296-298`, `:356`.
4. **Idempotency (correct)**: sidecar is written by a fixed (phase-aware) name and overwritten in place; safe to re-run — `scripts/walkthrough-capture.mjs:372-375`.
5. **Minor (observation, not a defect)**: AGENTS.md says the sidecar is written "on every run"; strictly, when `CYCLE_ARTIFACT_DIR` is unset `main()` exits 0 before writing (`scripts/walkthrough-capture.mjs:362-365`). This is the documented/expected edge (no artifact dir ⇒ nothing to write) and matches the SPEC's failure-behavior clause; no change required.
6. **Documentation (correct)**: module header (`scripts/walkthrough-capture.mjs:11-37`) and AGENTS.md (`AGENTS.md:49-50`) both describe the sidecar; README explicitly waived per SPEC.

### Spec Compliance Checklist
- [x] Real scenario (≥2 non-home captures) → `degraded: false` (helper logic at `:84-92`; pure-helper path is the automated gate, integration documented as manual)
- [x] No `walkthrough.mjs` → `degraded: true`, `reason: "no walkthrough.mjs"`, exit 0 (`:240-247` reason derivation → `:74-82` → `main()` exit 0)
- [x] Exported pure helper verified by Vitest without browser/dev server (`scripts/walkthrough-capture.test.mjs`)
- [x] `.cycle/prompts/reflection.md` reads sidecar and routes degraded UI-shipping `feature` cycle to `defer`/high (`reflection.md:21-23`, `:53-60`)
- [x] `plan.md` / `build.md` walkthrough wiring unchanged (`git diff HEAD` → 0 lines)
- [x] `npm run test` passes; `npm run astro check` reports no new errors
- [x] All existing tests still pass (256/256)
- [x] No compiler/linter warnings introduced (0 warnings)
- [x] SPEC has a non-empty `## Acceptance Criteria` section with testable bullets
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting every AC bullet

## Adversarial Test Review

### Summary
Strong for the targeted surface. The pure helpers are tested directly with real implementations (zero mocks — no mock-abuse risk), covering happy path, every named failure reason, and totality/edge inputs with specific assertions.

### Findings
1. **No mock abuse**: tests import and exercise real helpers; 0% mocking — `scripts/walkthrough-capture.test.mjs:2-6`.
2. **Failure paths covered**: absent (`:18-24`), threw (`:26-33`), not-a-function (`:35-45`), blank reason (`:47-54`), ran-but-no-non-home (`:56-63`), empty/missing/non-array inputs (`:65-77`).
3. **Assertion quality**: specific (`toEqual({ degraded: true, reason: "no walkthrough.mjs" })` at `:23`, `toBe` exact-message echoes at `:32`, `:44`), not weak truthiness.
4. **Boundary conditions**: empty arrays, `undefined`, `{}`, non-array `chapters`, whitespace/empty phase all asserted.
5. **Coverage gap (acceptable, SPEC-scoped)**: the `captureWalkthrough` orchestration, `runScenarioOrFallback` outcome threading, and `main()` sidecar-write round-trip are NOT automatically tested — they're documented as heavier manual integration runs because they boot the Astro dev server + Playwright. This matches SPEC Testing Strategy ("pure-core unit test is the automated gate") and is not a defect. The `scenarioRunner` seam does not make `captureWalkthrough` browser-free (it still launches Chromium), so the integration cannot be cheaply unit-tested.
6. **Test independence**: each `it` is self-contained; no shared mutable state or order dependence.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: Lines 88.04% (221/251), Branches 81.27% (243/299), Functions 76.59% (36/47), Statements 85.71% (252/294)
- Regressions vs base (per-file): none — coverage scope is `src/lib/**/*.ts` (unchanged config); this cycle touches only `scripts/`, prompts, and docs, so no `src/lib` file changed
- New code without tests: the new pure helpers are covered by `scripts/walkthrough-capture.test.mjs`; the `.mjs` runner is outside the coverage `include` (`src/lib/**/*.ts`) by existing config, consistent with `scripts/` never being in the coverage gate
- Specific scenarios missing tests: `main()` sidecar-write failure path and the on-disk `degraded` flip (both documented as manual integration per SPEC; not an automated gap)

## Doc-vs-Code Claim Verification

In-scope doc change: `AGENTS.md` (`.cycle/prompts/reflection.md` is a prompt under `.cycle/`, not an in-scope doc path). All claims introduced in the AGENTS.md diff are backed:

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Runner writes hook-owned sidecar `walkthrough-errors.json` | `AGENTS.md:50` | `scripts/walkthrough-capture.mjs:372` | OK |
| Phase-aware name `walkthrough-<phase>-errors.json` | `AGENTS.md:50` | `scripts/walkthrough-capture.mjs:103-105` | OK |
| Written into `$CYCLE_ARTIFACT_DIR` on every run | `AGENTS.md:50` | `scripts/walkthrough-capture.mjs:366-375` | OK |
| Payload carries `{ degraded, reason, errors }` | `AGENTS.md:50` | `scripts/walkthrough-capture.mjs:100-106` | OK |
| `degraded: true` = absent/unimportable/threw/no non-home → home fallback | `AGENTS.md:50` | `scripts/walkthrough-capture.mjs:74-99`, `:240-247` | OK |
| Pure exported total helper `decideDegradation` | `AGENTS.md:50` | `scripts/walkthrough-capture.mjs:74` | OK |
| Covered by `scripts/walkthrough-capture.test.mjs` | `AGENTS.md:50` | `scripts/walkthrough-capture.test.mjs:8-78` | OK |
| In `npm run test` gate via `scripts/**/*.test.mjs` glob | `AGENTS.md:50` | `vitest.config.ts:11` | OK |
| Best-effort write never fails cycle; `walkthrough_capture` always exits 0 | `AGENTS.md:50` | `scripts/walkthrough-capture.mjs:377-386` | OK |
| Loud `[blended-walkthrough] …` stderr diagnostic on any failure | `AGENTS.md:50` | `scripts/walkthrough-capture.mjs:48`, `:58` | OK |
| Reflection flags degraded UI-shipping `feature` cycle as `defer`/high | `AGENTS.md:50` | `.cycle/prompts/reflection.md:53-60` | OK |
