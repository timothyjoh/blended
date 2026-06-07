# SPEC — Cycle 0011: Make Cycle Walkthrough Degradation Loud

## WHY
Every cycle's walkthrough evidence has been silently useless. `scripts/walkthrough-capture.mjs` runs a per-cycle Playwright scenario at `$CYCLE_ARTIFACT_DIR/walkthrough.mjs`; when that scenario is absent, unimportable, or throws, the runner degrades to a single home-page screenshot plus a homepage-only video. The runner collects an `errors[]` array internally, but the engine — which owns the manifest — only lists the media files on disk and writes `walkthrough-artifacts.json` as `{ media, count }`. The hook's `errors[]` and the fact that a fallback was taken are **never persisted**. The result: a degraded homepage-only walkthrough is byte-for-byte indistinguishable from an intentional one, so it looks deliberate and ships unnoticed (confirmed across `docs/cycle/0003-…`, `0004-…`).

The plan/build prompt wiring that *authors* the scenario is already fixed directly in `.cycle/prompts/plan.md` and `build.md` (do not redo). This cycle delivers the remaining hardening: make the degradation **visible and caught** for `feature` cycles.

## CONCRETE USER BENEFIT
A developer reviewing a completed `feature` cycle can open its artifact directory and immediately tell whether the walkthrough is real evidence of the new functionality or a degraded homepage fallback — by reading a `walkthrough-errors.json` sidecar that states `degraded: true` with a human-readable `reason`. When a `feature` cycle that built observable UI produces only a degraded walkthrough, that fact is raised as a reflection sharp edge instead of passing quietly — so it gets filed and addressed rather than silently shipped.

## USABLE END-STATE
- After any `walkthrough_capture` run, `$CYCLE_ARTIFACT_DIR/walkthrough-errors.json` exists and carries an explicit `degraded` boolean, a `reason` string, and the captured `errors[]`.
- When a real scenario ran and produced its named captures, the sidecar reports `degraded: false`.
- When the scenario was absent / unimportable / threw and the runner fell back to the home page, the sidecar reports `degraded: true` with the reason (e.g. `"no walkthrough.mjs"`), and the process still exits 0 (a degraded walkthrough never fails a cycle).
- The `reflection` step reads the sidecar and, for a `feature` cycle whose diff shipped observable UI, surfaces a sharp edge when the walkthrough was degraded — routing it so it is filed, not lost.

## Objective
This cycle persists the walkthrough degradation signal that the runner already computes but currently discards, and teaches the reflection step to act on it for `feature` cycles. The runner gains an explicit `degraded` + `reason` result derived by a pure, testable core and serialized to an engine-independent `walkthrough-errors.json` sidecar (the manifest is engine-owned and only records media). The reflection prompt then treats a degraded walkthrough on a UI-shipping `feature` cycle as a sharp edge. Together these make a homepage-only walkthrough loud at capture time and caught at reflection time, closing the silent-degradation gap for the `feature` workflow.

## Source Issue
`txt-20260607-052735-cycle-walkthrough-authors-real-scenario` — "Make cycle walkthrough degradation loud + cover quickfix before/after capture"

## Scope

### In Scope
- **Loud degradation signal.** `captureWalkthrough` (`scripts/walkthrough-capture.mjs`) returns an explicit `{ degraded, reason }` (in addition to `media`, `chapters`, `errors`), computed by a new pure helper; `main()` writes a `walkthrough-errors.json` sidecar into `CYCLE_ARTIFACT_DIR` (phase-aware naming mirroring the engine's `walkthrough-<phase>-artifacts.json` convention so a later `quickfix` cycle can reuse it). The signal is hook-owned, so it survives independent of the engine-written manifest.
- **Reflection catches it.** `.cycle/prompts/reflection.md` gains an input + rule: read `walkthrough-errors.json`, and when `degraded: true` on a `feature` cycle whose shipped diff includes observable UI (e.g. touches `src/components/` or `src/pages/`), surface a sharp edge (routed to `defer`, high priority) so the degraded walkthrough is filed rather than silently shipped.
- **Pure-core unit test** (Vitest) of the degradation-decision helper and the sidecar serialization, covering both the real-scenario (`degraded: false`) and fallback (`degraded: true` + reason) paths.

### Out of Scope
- **Quickfix `walkthrough_before` / `walkthrough_after` wiring** (issue item 3 — define + author before/after walkthroughs via `plan_fix`/`quick_fix`). Deferred to a sibling cycle; the sidecar naming here is made phase-aware so that cycle can build on it without rework.
- The `plan.md` / `build.md` walkthrough wiring (already applied directly — must not regress).
- Changing the engine-owned `walkthrough-artifacts.json` manifest format or `.cycle/bin/cycle.js`.
- Hosting walkthrough videos externally; walkthroughs stay internal cycle evidence.
- The pnpm-lockfile build failure (tracked separately).

## Requirements
- `captureWalkthrough` exposes an explicit degradation result: `degraded: boolean` and a non-empty `reason` string. `degraded` is `true` exactly when the per-cycle scenario did not run to completion and the runner fell back to the default home-page capture (scenario absent, not a function, unimportable, or threw); `false` when the authored scenario ran and recorded at least one non-fallback capture.
- The degradation decision is implemented as a **pure, total, exported helper** (mirroring the repo's pure-core split convention, e.g. `buildSessionCreate`) so it is unit-testable without booting a dev server. It never throws on missing/empty inputs.
- `main()` writes `walkthrough-errors.json` (phase-aware name) to `CYCLE_ARTIFACT_DIR` on every run, containing at least `{ degraded, reason, errors }`. The write is best-effort and must not throw out of `main()`.
- The runner continues to honor its resilience contract: `walkthrough_capture` (and the future phased steps) **always exit 0**; degradation and any sidecar-write failure emit the existing loud `[blended-walkthrough] …` stderr diagnostic — nothing swallowed.
- The reflection prompt instructs the agent to read `walkthrough-errors.json`, and to emit a sharp edge when `degraded: true` for a `feature` cycle that shipped observable UI; the rule names the bucket (`defer`) and priority (`high`).
- No new runtime dependencies: the runner stays `playwright` + node built-ins only.
- **Failure behavior**: If the sidecar cannot be written (e.g. unwritable `CYCLE_ARTIFACT_DIR`), the runner logs a `[blended-walkthrough] …` diagnostic and still exits 0 — the degradation signal failing to persist must not fail a cycle. If `CYCLE_ARTIFACT_DIR` is unset, `main()` logs and exits 0 without writing a sidecar (unchanged). The pure helper, given empty/missing chapters or errors, returns a well-formed `{ degraded: true, reason }` rather than throwing. A degraded walkthrough is itself a degraded-but-working outcome: the home capture and video are still produced.

## Acceptance Criteria
- [ ] Running the runner against a `CYCLE_ARTIFACT_DIR` containing a hand-written `walkthrough.mjs` that records ≥2 named non-home captures produces those screenshots + a non-trivial video, AND `walkthrough-errors.json` reports `degraded: false`. *(user-observable benefit: a real walkthrough is recorded as real)*
- [ ] Running the runner against a `CYCLE_ARTIFACT_DIR` with **no** `walkthrough.mjs` produces the home-page capture AND writes `walkthrough-errors.json` with `degraded: true` and a non-empty `reason` (e.g. `"no walkthrough.mjs"`), and the process exits 0. *(failure-path criterion: absent scenario is flagged, not silently passed)*
- [ ] The exported pure degradation helper returns `{ degraded: true, reason }` for the fallback case and `{ degraded: false }` for the real-scenario case, verified by a Vitest unit test that runs without launching a browser or dev server.
- [ ] `.cycle/prompts/reflection.md` contains an explicit instruction to read `walkthrough-errors.json` and to surface a `defer`/high sharp edge when a `feature` cycle shipped observable UI but the walkthrough is `degraded: true`.
- [ ] The already-applied `plan.md` / `build.md` walkthrough wiring is unchanged (no diff to those files' walkthrough sections).
- [ ] `npm run test` passes; `npm run astro check` reports no new errors.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- **Framework**: Vitest for the pure-core unit test (the runner is `.mjs`; the exported helper is imported directly). Follow the repo's `*.test.*` co-location convention for the new test beside the runner under `scripts/`.
- **Key scenarios**:
  - *Happy path*: helper given a completed-scenario result (chapters present, no fallback) → `degraded: false`.
  - *Failure paths*: helper given the fallback result (scenario absent → reason `"no walkthrough.mjs"`; scenario threw → reason is the error message; default export not a function) → `degraded: true` with the corresponding reason.
  - *Edge cases*: empty `chapters`/`errors`, missing fields → well-formed `degraded: true` result, never throws.
  - *Serialization*: sidecar object includes `degraded`, `reason`, `errors`.
- **Integration verification** (documented, run manually/locally — heavier, boots the Astro dev server + Playwright): the two runner invocations described in the first two acceptance criteria, confirming the on-disk `walkthrough-errors.json` contents and `exit 0` in both paths. Not part of the automated CI gate because of the dev-server cost; the pure-core unit test is the automated gate.
- No app UI changes in this cycle, so no new Playwright e2e is required.

## Documentation Updates
- **AGENTS.md**: Document the new `walkthrough-errors.json` sidecar — that the walkthrough runner now persists an explicit `degraded` + `reason` signal independent of the engine-owned manifest, and that reflection flags a degraded walkthrough on a UI-shipping `feature` cycle. (No CLAUDE.md exists at repo root; AGENTS.md is the conventions file.)
- **README.md**: No user-facing app change; no update required. State this explicitly rather than omitting.
- The `scripts/walkthrough-capture.mjs` module header comment is updated to describe the sidecar it now writes.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `scripts/walkthrough-capture.mjs` (the existing runner) and its injectable `scenarioRunner` seam.
- The engine's `walkthrough_capture` step invocation via `.cycle/walkthrough.sh` with `CYCLE_ARTIFACT_DIR` (and optional `CYCLE_WALKTHROUGH_PHASE`) in env — unchanged; this cycle only adds a hook-written sidecar alongside the engine-written manifest.
- `.cycle/prompts/reflection.md` (the reflection step prompt).
- Vitest (already configured: `npm run test`); `playwright` already installed for the runner.
- No new env vars or external services.
