All gates pass. The runner parses under bare `node`, helpers behave as specified. Per PLAN.md's `## Walkthrough Plan`, this cycle ships no observable app UI (the diff touches neither `src/components/` nor `src/pages/`), so no `walkthrough.mjs` is authored — the runner's legitimate degradation to the home-page fallback (writing `degraded: true`, `reason: "no walkthrough.mjs"`) is itself the honest demonstration of this cycle's functionality, and the new reflection rule correctly will not flag it since no UI shipped.

## Summary

This cycle persists the walkthrough-degradation signal the runner already computed but discarded, and teaches reflection to act on it for UI-shipping `feature` cycles.

**Files modified/created:**
- `scripts/walkthrough-capture.mjs` (+~95 lines): added three pure, exported, total helpers — `decideDegradation` (the degradation decision, never throws on empty/missing input), `walkthroughErrorsFileName` (phase-aware sidecar name), and `buildWalkthroughErrorsSidecar` (sidecar payload serializer/coercer); changed `runScenarioOrFallback` to return a structured `{ fellBack, reason }` outcome; funneled every `captureWalkthrough` return through a single `finalize({ outcome })` so all five return paths (missing artifactDir, mkdir failure, boot failure, capture crash, main path) carry `degraded`/`reason`; made `main()` write the phase-aware `walkthrough-errors.json` sidecar best-effort; rewrote the module header to document the sidecar.
- `vitest.config.ts` (1 line): extended `include` to `['src/**/*.test.ts', 'scripts/**/*.test.mjs']` so the co-located runner test runs in the CI gate; coverage `include` left unchanged.
- `scripts/walkthrough-capture.test.mjs` (new, ~140 lines): 14 Vitest cases over the pure helpers — happy path, each fallback reason (absent / threw / not-a-function / blank reason), ran-but-no-non-home-captures, empty/missing/non-array-input totality, filename phase variants, and sidecar field coercion. No browser or dev server launched.
- `.cycle/prompts/reflection.md` (+~15 lines): added the `walkthrough-errors.json` read input, an instruction to derive the workflow from the artifact-dir name's second token, and a sharp-edge rule routing a `degraded: true` walkthrough on a UI-shipping (`src/components/`|`src/pages/`) `feature` cycle to `defer`/`high`.
- `AGENTS.md` (+1 section): documented the hook-owned sidecar, its `degraded`/`reason` semantics, phase-aware naming, the `npm run test` coverage of the helper, the always-exit-0 contract, and the reflection rule.
- `README.md`: no change (no user-facing app change), explicit per SPEC.

**PLAN tasks complete:** Task 1 (pure helpers), Task 2 (thread outcome + write sidecar), Task 3 (Vitest unit test + glob), Task 4 (reflection prompt), Task 5 (docs). All five done.

**Test suite:** `npm run test` → **256 tests, 8 files, all passed** (the new `scripts/walkthrough-capture.test.mjs` contributes 14, confirmed via a scoped run). `npm run astro check` → **0 errors, 0 warnings, 35 hints** (the 35 hints, e.g. `ElementRef` deprecation in `src/components/ui/tabs.tsx`, are pre-existing and not introduced by this cycle).

**Coverage:** `npm run test:coverage` → Statements 85.71% (252/294), Branches 81.27% (243/299), Functions 76.59% (36/47), Lines 88.04% (221/251). Coverage scope is `src/lib/**/*.ts` (unchanged config); this cycle touches only `scripts/` and prompts/docs, so no `src/lib` file changed and there is no per-file regression vs base. The new runner code is `.mjs`, outside the unit-coverage scope per the existing config (consistent with `scripts/` never being in coverage), but is exercised by the new automated unit test.

**Failure modes handled this cycle:**
- *Absent / unimportable / throwing scenario* → `runScenarioOrFallback` returns `{ fellBack: true, reason }` (`ERR_MODULE_NOT_FOUND` → `"no walkthrough.mjs"`, else the error message), `decideDegradation` yields `degraded: true`. Tested: the absent, threw, and not-a-function fallback cases.
- *Scenario ran but recorded no non-home captures* → `degraded: true` via the chapter-based branch (also the default when a genuine capture crash leaves `outcome` as "ran"). Tested.
- *Empty/missing/non-array inputs to the pure helper* → well-formed `{ degraded: true, reason }`, never throws. Tested (totality cases).
- *Sidecar write failure* (unwritable dir / ENOSPC) → caught in `main()`, logged via `logDiag('… sidecar write failed: …')`, appended to `errors[]`, process still exits 0 — the degradation signal failing to persist never fails a cycle. No empty catch; nothing swallowed.
- *Idempotency*: the sidecar is written by a fixed (phase-aware) name and overwritten in place on re-run, mirroring the existing fixed-name media overwrite.

**Deviations from PLAN.md:** none. The plan's `finalize` was implemented as a closure over `media`/`chapters`/`errors` (taking only `{ outcome }`) rather than receiving all four as args — equivalent behavior, less repetition, and it guarantees no path can return the stale shape.

**Walkthrough:** No `walkthrough.mjs` authored, per PLAN.md's `## Walkthrough Plan`. This cycle ships no observable app UI (diff touches no `src/components/` or `src/pages/`); the new functionality is the tooling runner/sidecar itself, which has no browsable route. The runner's legitimate degradation (home-page capture + `walkthrough-errors.json` with `degraded: true`, `reason: "no walkthrough.mjs"`) is the correct, honest outcome and is exactly what this cycle makes loud — and reflection will not flag it because no UI shipped. Authoring a homepage walkthrough would be the silent-deliberate-looking fallback this cycle exists to eliminate; the cycle's evidence is the passing unit test plus the two documented manual integration runs in PLAN/SPEC.

**Deferred / follow-up:** Quickfix `walkthrough_before`/`walkthrough_after` behavior wiring remains out of scope (SPEC item 3); the sidecar naming is already phase-aware so the sibling cycle can build on it without rework. The two heavier integration runs (boot dev server + Playwright, asserting on-disk `degraded` flips with scenario presence) are documented for manual/local verification and intentionally outside the CI gate per SPEC's Testing Strategy.

## Touched Files
- scripts/walkthrough-capture.mjs
- scripts/walkthrough-capture.test.mjs
- vitest.config.ts
- .cycle/prompts/reflection.md
- AGENTS.md
