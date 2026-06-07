# Implementation Plan: Cycle 0011

## Overview
Persist the walkthrough-degradation signal the runner already computes but discards: `scripts/walkthrough-capture.mjs` gains a pure, exported degradation helper and writes a hook-owned `walkthrough-errors.json` sidecar (`{ degraded, reason, errors }`), and `.cycle/prompts/reflection.md` learns to flag a degraded walkthrough on a UI-shipping `feature` cycle as a `defer`/high sharp edge.

## Current State (from Research)
- `scripts/walkthrough-capture.mjs` is a `playwright` + node-built-ins-only runner. `captureWalkthrough({ artifactDir, scenarioRunner })` never throws and returns `{ media, chapters, errors }` — **no** `degraded`/`reason` (`:176-260`). `main()` reads `CYCLE_ARTIFACT_DIR`, calls it, and `process.exit(0)` in `finally` (`:262-280`).
- `runScenarioOrFallback(harness, artifactDir, errors)` is the **sole** site that knows a fallback was taken; it returns `void`. Reason derivation: `ERR_MODULE_NOT_FOUND` → `"no walkthrough.mjs"`; otherwise `String(err?.message ?? err)` (covers the not-a-function message and any thrown error) — `:151-170`.
- `defaultFallback` captures `00-home` — the chapter that marks a degraded run (`:133-145`). `makeHarness.capture(name)` pushes `name` onto `chapters` (`:111-125`).
- Phase already resolved: `phase = process.env.CYCLE_WALKTHROUGH_PHASE?.trim() || undefined`; mediaDir becomes `walkthrough/<phase>` (`:187-190`). Engine mirrors this with `walkthrough-${phase}-artifacts.json` / `walkthrough-artifacts.json` (`.cycle/bin/cycle.js:9965-9967`).
- Loud-diagnostic convention: every degraded branch pushes a string onto `errors[]` and calls `logDiag` (`[blended-walkthrough] …`, `:43-45`). Nothing swallowed.
- Pure-core split convention to mirror: `buildSessionCreate` etc. in `src/lib/sessions.ts:76`, `:200` — total, never-throws, dependency-free, unit-tested via co-located `*.test.ts` (`src/lib/sessions.test.ts:1-25`).
- `vitest.config.ts` `include: ['src/**/*.test.ts']` (`:11`) does **not** match a test under `scripts/`; `npm run test` → `vitest run`.
- `.cycle/prompts/reflection.md` lists read-inputs (`:9-26`) and a bucket/priority routing table where `defer` **requires** `priority` (`:84-101`); output is strict JSON `{ "sharp_edges": [...] }`. No `CYCLE_WORKFLOW` env var is exported — workflow is the second token of the artifact-dir name `<id>-<workflow>-<slug>`.

## Desired End State
- `scripts/walkthrough-capture.mjs` exports a pure, total degradation helper and serialization helpers; `captureWalkthrough` returns `{ media, chapters, errors, degraded, reason }` on **every** return path; `main()` writes a phase-aware `walkthrough-errors.json` sidecar (best-effort) and still exits 0.
- A co-located Vitest test (`scripts/walkthrough-capture.test.mjs`) exercises the pure helper + serialization for both the real-scenario (`degraded: false`) and fallback (`degraded: true` + reason) paths, runs with no browser/dev server, and is picked up by `npm run test`.
- `.cycle/prompts/reflection.md` reads the sidecar and emits a `defer`/high sharp edge when a `feature` cycle shipped observable UI but the walkthrough is `degraded: true`.
- AGENTS.md documents the sidecar; the module header comment describes it.
- **Verify**: `npm run test` passes (incl. the new test); `npm run astro check` reports no new errors; `git diff` shows no change to `.cycle/prompts/plan.md` / `build.md` walkthrough sections.

## What We're NOT Doing
- Quickfix `walkthrough_before` / `walkthrough_after` behavior wiring (only the sidecar **name** is made phase-aware so the sibling cycle can build on it).
- Editing the `plan.md` / `build.md` walkthrough wiring (already applied; must not regress).
- Changing the engine-owned `walkthrough-artifacts.json` manifest format or `.cycle/bin/cycle.js`.
- Hosting walkthrough videos externally.
- Touching the pnpm-lockfile build failure (tracked separately).
- Adding any runtime dependency — the runner stays `playwright` + node built-ins.

## Implementation Approach
Keep the impure orchestrator thin and extract the decision into a pure, exported, total helper (`decideDegradation`) mirroring `buildSessionCreate`. Thread a structured outcome out of `runScenarioOrFallback` (`{ fellBack, reason }`) so `captureWalkthrough` can feed `decideDegradation({ outcome, chapters })` and surface `{ degraded, reason }` on every return path — including the early failure returns (missing artifactDir, mkdir/boot failure), which synthesize a fallback outcome carrying the specific failure reason. `main()` serializes `{ degraded, reason, errors }` to a phase-aware `walkthrough-errors.json` via `node:fs/promises` `writeFile`, wrapped best-effort so a write failure logs and still exits 0.

Resolve the open question on test placement by **extending the Vitest `include` glob to `['src/**/*.test.ts', 'scripts/**/*.test.mjs']`** and co-locating `scripts/walkthrough-capture.test.mjs` beside the runner — this honors the SPEC's "co-locate beside the runner" instruction, keeps the helper inside the node-built-ins-only `.mjs` (no new project `.ts` import in the runner), and keeps the automated CI gate (`npm run test`) covering the new test. Vitest's `node` environment imports `.mjs` directly. Coverage `include` (`src/lib/**/*.ts`) is left unchanged — the SPEC does not require coverage of `scripts/`.

## Failure & Resilience Decisions

**Task 1 — pure helpers (`decideDegradation`, `buildWalkthroughErrorsSidecar`, `walkthroughErrorsFileName`)**: N/A — pure. Total by construction: guards non-array `chapters` and missing `outcome`, never throws, always returns a well-formed `{ degraded, reason }` (empty/missing inputs → `{ degraded: true, reason }`).

**Task 2 — thread outcome + write sidecar in `main()`**:
- **Failure modes**: (a) sidecar `writeFile` fails (unwritable `CYCLE_ARTIFACT_DIR`, ENOSPC) → caught, `logDiag('[blended-walkthrough] sidecar write failed: …')`, exit 0 (degradation signal failing to persist must not fail a cycle). (b) `CYCLE_ARTIFACT_DIR` unset → `logDiag` + exit 0 without writing (unchanged). (c) any of the existing degraded capture branches → unchanged: push to `errors[]`, `logDiag`, return early with a synthesized `{ degraded: true, reason }`. The runner still **always exits 0** and never throws out of `captureWalkthrough`/`main()`.
- **Idempotency**: safe to re-run. Sidecar is written by fixed (phase-aware) name and overwritten in place, mirroring the existing fixed-name media/screenshot overwrite behavior. No dedup key, no lock held by the hook; `.cycle/engine.lock` is the engine's guard and is untouched.
- **Observability**: every failure path emits a one-line `[blended-walkthrough] …` stderr diagnostic via `logDiag`; the degradation itself is now also persisted to disk in the sidecar. `main()`'s existing done-line is retained.
- **No silent failure**: no empty catches added; the sidecar-write catch logs and the error string is also appended to `errors[]` before exit; nothing is swallowed.

**Task 3 — Vitest test**: N/A — pure (asserts on the pure helpers; no I/O).

**Task 4 — reflection prompt edit**: N/A — pure (prompt text; the agent reads the sidecar best-effort and the engine already tolerates an absent file via "Read whichever of these files exist").

**Task 5 — docs (AGENTS.md, module header)**: N/A — pure (documentation).

---

## Task 1: Add the pure degradation core + serialization helpers

### Overview
Add three exported, total, dependency-free helpers to the runner module: the degradation decision, the sidecar object builder, and the phase-aware filename. These are the SPEC's automated-gate surface and must never throw.

### Changes Required
**File**: `scripts/walkthrough-capture.mjs`
**Changes**: Add near the top (after `logDiag`), exported:

```js
const HOME_CHAPTER = "00-home";

/**
 * Pure, total degradation decision. Given the scenario outcome and the chapters
 * recorded, decide whether this run degraded to the home-page fallback.
 * Never throws on missing/empty inputs.
 *
 * @param {{ outcome?: { fellBack?: boolean, reason?: string|null }, chapters?: string[] }} input
 * @returns {{ degraded: boolean, reason: string }}
 */
export function decideDegradation({ outcome, chapters } = {}) {
  const ch = Array.isArray(chapters) ? chapters : [];
  const nonHome = ch.filter((c) => c !== HOME_CHAPTER);
  if (outcome?.fellBack === true) {
    const r =
      typeof outcome.reason === "string" && outcome.reason.trim()
        ? outcome.reason.trim()
        : "scenario fell back to default home capture";
    return { degraded: true, reason: r };
  }
  if (nonHome.length === 0) {
    return { degraded: true, reason: "scenario ran but recorded no non-home captures" };
  }
  return { degraded: false, reason: `scenario recorded ${nonHome.length} non-home capture(s)` };
}

/**
 * Phase-aware sidecar filename, mirroring the engine's
 * `walkthrough-${phase}-artifacts.json` / `walkthrough-artifacts.json`.
 */
export function walkthroughErrorsFileName(phase) {
  const p = typeof phase === "string" ? phase.trim() : "";
  return p ? `walkthrough-${p}-errors.json` : "walkthrough-errors.json";
}

/** Pure serialization of the hook-owned sidecar payload. */
export function buildWalkthroughErrorsSidecar({ degraded, reason, errors } = {}) {
  return {
    degraded: degraded === true,
    reason: typeof reason === "string" ? reason : "",
    errors: Array.isArray(errors) ? errors : [],
  };
}
```

### Success Criteria
- [ ] Module still parses and `captureWalkthrough` still runs (no behavior change yet).
- [ ] `decideDegradation`, `walkthroughErrorsFileName`, `buildWalkthroughErrorsSidecar` are exported.
- [ ] Helpers never throw on `undefined` / `{}` / empty arrays (covered by Task 3).
- [ ] Failure paths behave as designed (N/A — pure; total by construction).

---

## Task 2: Thread the degradation signal through the runner and write the sidecar

### Overview
Make `runScenarioOrFallback` return a structured outcome, fold `decideDegradation` into every `captureWalkthrough` return path, and have `main()` write the phase-aware sidecar best-effort.

### Changes Required
**File**: `scripts/walkthrough-capture.mjs`

1. **Import `writeFile`** alongside the existing `mkdir`:
```js
import { mkdir, writeFile } from "node:fs/promises";
```

2. **`runScenarioOrFallback`** — return the outcome instead of `void` (`:151-170`):
```js
async function runScenarioOrFallback(harness, artifactDir, errors) {
  const scenarioPath = join(artifactDir, "walkthrough.mjs");
  try {
    const mod = await import(pathToFileURL(scenarioPath).href);
    const scenario = mod.default;
    if (typeof scenario !== "function") {
      throw new Error("walkthrough.mjs default export is not a function");
    }
    await scenario(harness);
    return { fellBack: false, reason: null };
  } catch (err) {
    const reason =
      err?.code === "ERR_MODULE_NOT_FOUND"
        ? "no walkthrough.mjs"
        : String(err?.message ?? err);
    errors.push(reason);
    logDiag(`scenario unavailable (${reason}); falling back to default home capture`);
    await defaultFallback(harness, errors);
    return { fellBack: true, reason };
  }
}
```

3. **`captureWalkthrough`** — add `degraded`/`reason` to every return. Each early-failure return synthesizes a fallback outcome carrying its specific reason; the main path uses the runner's outcome:
   - missing `artifactDir` (`:181-185`): `return finalize({ media, chapters, errors, outcome: { fellBack: true, reason: "missing artifactDir" } });`
   - mkdir media dir failure (`:194-198`): `outcome: { fellBack: true, reason: \`mkdir media dir: …\` }`
   - boot failure (`:203-207`): `outcome: { fellBack: true, reason: \`boot: …\` }`
   - main path (`:226-259`): capture `const outcome = await runner(harness, artifactDir, errors);` (a custom injected `scenarioRunner` returning `undefined` is treated as `{ fellBack: false }` — i.e. "ran"), then at the tail `return finalize({ media, chapters, errors, outcome });`
   - the catch at `:228-230` records into `errors` as today; the `finally` tail is unchanged; `outcome` defaults to `{ fellBack: false }` if the try threw before assignment so a genuine capture crash with no chapters still resolves to `degraded: true` via the "no non-home captures" branch.

   Add a small local folder used by all returns:
```js
function finalize({ media, chapters, errors, outcome }) {
  const { degraded, reason } = decideDegradation({ outcome, chapters });
  return { media, chapters, errors, degraded, reason };
}
```
   (Media-name population — `for (const name of chapters) media.push(...)` then `walkthrough.webm` — stays before the main-path `finalize`.)

4. **`main()`** (`:262-276`) — write the sidecar best-effort after `captureWalkthrough`:
```js
const result = await captureWalkthrough({ artifactDir });
const phase = process.env.CYCLE_WALKTHROUGH_PHASE?.trim() || undefined;
const sidecarName = walkthroughErrorsFileName(phase);
try {
  await writeFile(
    join(artifactDir, sidecarName),
    JSON.stringify(buildWalkthroughErrorsSidecar(result), null, 2) + "\n",
  );
  logDiag(`wrote ${sidecarName} (degraded=${result.degraded}; reason=${result.reason})`);
} catch (err) {
  const msg = `sidecar write failed: ${String(err?.message ?? err)}`;
  result.errors.push(msg);
  logDiag(msg);
}
logDiag(`done: ${result.chapters.length} screenshot(s), ${result.errors.length} error(s)`);
```
   The `finally { process.exit(0) }` is unchanged.

5. **Module header comment** (`:1-26`) is updated in Task 5.

### Success Criteria
- [ ] `node scripts/walkthrough-capture.mjs` with `CYCLE_ARTIFACT_DIR` set and **no** `walkthrough.mjs` writes `walkthrough-errors.json` with `degraded: true`, `reason: "no walkthrough.mjs"`, captures `00-home`, and exits 0 (manual integration verify).
- [ ] With a hand-written `walkthrough.mjs` recording ≥2 non-home captures, the sidecar reports `degraded: false` and a non-trivial video is produced (manual integration verify).
- [ ] `captureWalkthrough` returns `degraded`/`reason` on every code path; still never throws; `main()` still exits 0 on sidecar-write failure (e.g. read-only dir) with a `[blended-walkthrough] sidecar write failed: …` diagnostic.
- [ ] Failure paths behave as designed (sidecar-write failure logged + appended to `errors[]`, exit 0; no silent catch).

---

## Task 3: Vitest unit test for the pure helpers + serialization

### Overview
Co-locate a Vitest test beside the runner that exercises `decideDegradation`, `walkthroughErrorsFileName`, and `buildWalkthroughErrorsSidecar` with no browser/dev server, and extend the Vitest `include` glob so `npm run test` picks it up.

### Changes Required
**File**: `vitest.config.ts`
**Changes**: extend the include glob (line 11):
```ts
include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
```
(Coverage `include: ['src/lib/**/*.ts']` is left unchanged — `scripts/` is out of the unit-coverage scope, consistent with the existing config.)

**File**: `scripts/walkthrough-capture.test.mjs` (new)
**Changes**: `import { describe, it, expect } from 'vitest'` and import the three helpers from `./walkthrough-capture.mjs`. Cases:
- *Happy path*: `decideDegradation({ outcome: { fellBack: false }, chapters: ['01-foo', '02-bar'] })` → `degraded === false`.
- *Fallback — absent*: `decideDegradation({ outcome: { fellBack: true, reason: 'no walkthrough.mjs' }, chapters: ['00-home'] })` → `{ degraded: true, reason: 'no walkthrough.mjs' }`.
- *Fallback — threw*: `outcome.reason` an arbitrary error message → that exact message echoed; `degraded: true`.
- *Fallback — not a function*: `reason: 'walkthrough.mjs default export is not a function'` → echoed; `degraded: true`.
- *Ran but no non-home captures*: `{ outcome: { fellBack: false }, chapters: ['00-home'] }` → `degraded: true`, reason mentions "no non-home captures".
- *Edge — empty/missing inputs*: `decideDegradation()`, `decideDegradation({})`, `decideDegradation({ chapters: [] })` → never throw, `degraded: true`, non-empty `reason`.
- *Filename*: `walkthroughErrorsFileName(undefined) === 'walkthrough-errors.json'`; `walkthroughErrorsFileName('before') === 'walkthrough-before-errors.json'`; `walkthroughErrorsFileName('after') === 'walkthrough-after-errors.json'`; whitespace/`''` → no-phase name.
- *Serialization*: `buildWalkthroughErrorsSidecar({ degraded: true, reason: 'no walkthrough.mjs', errors: ['no walkthrough.mjs'] })` deep-equals `{ degraded: true, reason: 'no walkthrough.mjs', errors: ['no walkthrough.mjs'] }`; missing fields coerce to `{ degraded: false, reason: '', errors: [] }`.

### Success Criteria
- [ ] `npm run test` discovers and runs `scripts/walkthrough-capture.test.mjs` and it passes.
- [ ] No browser or dev server is launched by the test.
- [ ] All existing tests still pass; no new `astro check` errors.
- [ ] Failure-path assertions (each fallback reason, empty-input totality) are present.

---

## Task 4: Teach the reflection prompt to catch degraded walkthroughs

### Overview
Add a sidecar input and a routing rule to `.cycle/prompts/reflection.md` so a degraded walkthrough on a UI-shipping `feature` cycle becomes a `defer`/high sharp edge.

### Changes Required
**File**: `.cycle/prompts/reflection.md`

1. **Inputs section** (after `FIX.md`, around `:21`): add
   > - `walkthrough-errors.json` (and any `walkthrough-<phase>-errors.json`, may be absent) — the walkthrough runner's degradation sidecar: `{ degraded, reason, errors }`.

2. **Inspect section** (after the `git diff` / `tail` bullets, `:24-26`): add an instruction to determine the workflow from the artifact-dir name, since no `CYCLE_WORKFLOW` env var exists:
   > - The cycle workflow is the second hyphen-delimited token of the artifact directory name (`<id>-<workflow>-<slug>`), e.g. `basename "$PWD"` → `0011-feature-…` ⇒ workflow `feature`.

3. **"What counts as a sharp edge" list** (after the resilience-gaps bullet, `:37-45`): add
   > - **Degraded walkthrough on a UI-shipping `feature` cycle.** If this is a `feature` cycle (per the artifact-dir name) and `git diff "${CYCLE_BASE}"...HEAD` touches observable UI (`src/components/` or `src/pages/`), read `walkthrough-errors.json`; when it reports `degraded: true`, the cycle shipped UI but its walkthrough is only the home-page fallback (reason in the sidecar). Surface this as a sharp edge routed to `defer` with `priority: "high"` so the missing real walkthrough is filed, not silently shipped. Do **not** surface it when the diff ships no observable UI (a degraded walkthrough is then legitimate), nor for non-`feature` workflows.

### Success Criteria
- [ ] Prompt names `walkthrough-errors.json` as a read input.
- [ ] Prompt explicitly states the `feature` + observable-UI condition, the `degraded: true` trigger, and routes to `bucket: "defer"`, `priority: "high"`.
- [ ] Prompt tells the agent how to derive the `feature` workflow from the artifact-dir name.
- [ ] Output contract (strict JSON) is unchanged.
- [ ] Failure paths behave as designed (N/A — pure; absent sidecar is tolerated by "read whichever exist").

---

## Task 5: Documentation — sidecar in AGENTS.md and the module header

### Overview
Record the new sidecar in the conventions doc and the runner's header comment, per SPEC "Documentation is part of done."

### Changes Required
**File**: `AGENTS.md`
**Changes**: add a short walkthrough section documenting that `scripts/walkthrough-capture.mjs` now writes a hook-owned `walkthrough-errors.json` (phase-aware: `walkthrough-<phase>-errors.json`) sidecar with `{ degraded, reason, errors }`, independent of the engine-owned `walkthrough-artifacts.json` manifest; that `degraded: true` means the per-cycle `walkthrough.mjs` was absent/unimportable/threw and the runner fell back to the home page; and that reflection flags a degraded walkthrough on a UI-shipping `feature` cycle as a `defer`/high sharp edge.

**File**: `scripts/walkthrough-capture.mjs`
**Changes**: update the module header comment (`:1-26`) — amend the "this hook only PRODUCES media" sentence to note it also writes the `walkthrough-errors.json` degradation sidecar (best-effort, never fails the cycle).

**File**: `README.md`
**Changes**: none — no user-facing app change. Stated explicitly here per SPEC.

### Success Criteria
- [ ] AGENTS.md describes the sidecar, the `degraded`/`reason` semantics, phase-aware naming, and the reflection rule.
- [ ] The module header mentions the sidecar.
- [ ] No README change (explicitly waived).
- [ ] Failure paths behave as designed (N/A — pure docs).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Running the runner against a CYCLE_ARTIFACT_DIR containing a hand-written walkthrough.mjs that records ≥2 named non-home captures produces those screenshots + a non-trivial video, AND walkthrough-errors.json reports degraded: false. (user-observable benefit: a real walkthrough is recorded as real)` | Task 2 | Manual/local integration verify (boots dev server + Playwright), per SPEC Testing Strategy. |
| `[ ] Running the runner against a CYCLE_ARTIFACT_DIR with no walkthrough.mjs produces the home-page capture AND writes walkthrough-errors.json with degraded: true and a non-empty reason (e.g. "no walkthrough.mjs"), and the process exits 0. (failure-path criterion: absent scenario is flagged, not silently passed)` | Task 2 | Sidecar write in `main()`; `reason` from `runScenarioOrFallback` → `decideDegradation`. Manual/local integration verify. |
| `[ ] The exported pure degradation helper returns { degraded: true, reason } for the fallback case and { degraded: false } for the real-scenario case, verified by a Vitest unit test that runs without launching a browser or dev server.` | Task 1, Task 3 | Helper in Task 1; automated CI-gate test in Task 3. |
| `[ ] .cycle/prompts/reflection.md contains an explicit instruction to read walkthrough-errors.json and to surface a defer/high sharp edge when a feature cycle shipped observable UI but the walkthrough is degraded: true.` | Task 4 | |
| `[ ] The already-applied plan.md / build.md walkthrough wiring is unchanged (no diff to those files' walkthrough sections).` | Task 4, Task 5 | Neither file is edited by this plan; verified via `git diff` at close. |
| `[ ] npm run test passes; npm run astro check reports no new errors.` | Task 3 | Glob extension ensures the new test runs; no `.ts`/app changes affect `astro check`. |
| `[ ] All existing tests still pass.` | Task 3 | Runner change is additive; helpers are new exports. |
| `[ ] No compiler/linter warnings introduced.` | Task 1, Task 2, Task 3 | New code follows existing `.mjs`/Vitest conventions. |

---

## Testing Strategy

### Unit Tests
- **What to test** (automated CI gate, `scripts/walkthrough-capture.test.mjs`): `decideDegradation` happy path (`degraded: false` with ≥1 non-home chapter), `walkthroughErrorsFileName` for no-phase/`before`/`after`/whitespace, `buildWalkthroughErrorsSidecar` field shaping.
- **Failure-path tests** (one per named failure mode of the pure core): fallback-absent → reason `"no walkthrough.mjs"`; fallback-threw → echoes the error message; fallback-not-a-function → echoes that message; ran-but-no-non-home-captures → `degraded: true`; empty/missing inputs (`decideDegradation()`, `{}`, `{ chapters: [] }`) → never throws, well-formed `degraded: true`.
- **Mocking strategy**: none — the helpers are pure and imported directly (real implementations). No browser, dev server, or filesystem is touched by the automated test, matching the SPEC's pure-core scope.

### Integration / E2E Tests
- **Documented, run manually/locally** (heavier — boots Astro dev server + Playwright; not in the CI gate per SPEC): the two runner invocations in the first two acceptance criteria — (a) a temp `CYCLE_ARTIFACT_DIR` with a hand-written `walkthrough.mjs` recording ≥2 non-home captures → assert on-disk `walkthrough-errors.json` has `degraded: false` and a non-trivial `walkthrough.webm`; (b) a temp `CYCLE_ARTIFACT_DIR` with no `walkthrough.mjs` → assert `walkthrough-errors.json` has `degraded: true`, `reason: "no walkthrough.mjs"`, `00-home.png` exists, and `echo $?` is `0`.
- No new Playwright e2e is added — this cycle ships no app UI behavior.

## Walkthrough Plan
- **No observable app UI this cycle.** This cycle changes tooling only — the walkthrough runner script (`scripts/walkthrough-capture.mjs`), its Vitest test, the reflection prompt, and docs. It adds **no** route, screen, or component, and the diff does not touch `src/components/` or `src/pages/`. There is therefore no real new app route to drive, and authoring a per-cycle `walkthrough.mjs` over the existing app would not demonstrate *this* cycle's functionality.
- **The walkthrough may legitimately degrade**, and that is the correct, honest outcome: with no `$CYCLE_ARTIFACT_DIR/walkthrough.mjs` authored, the runner falls back to the home-page capture and — by the very behavior this cycle ships — writes `walkthrough-errors.json` with `degraded: true`, `reason: "no walkthrough.mjs"`. Because this is a `feature` cycle that ships **no** observable UI (no `src/components/` or `src/pages/` diff), the new reflection rule will **not** raise a sharp edge — the degraded walkthrough is expected and defensible here. This is stated explicitly rather than left to the silent home-page fallback the cycle exists to eliminate.
- **Flow / capture points**: none — no `walkthrough.mjs` is authored for this cycle.
- **Preconditions / test data**: none required for a walkthrough; the cycle's evidence is the passing Vitest unit test plus the two documented manual integration runs that show the sidecar's `degraded` value flipping with scenario presence.

## Risk Assessment
- **Vitest glob change misses the test or pulls in unintended files**: scope the addition to exactly `scripts/**/*.test.mjs` and confirm `npm run test` lists the new file in its run summary; coverage `include` left untouched so no `scripts/` source enters the coverage gate.
- **Early-return paths forget the new `degraded`/`reason` fields**: funnel every `captureWalkthrough` return through the single `finalize(...)` folder so no path can return the old `{ media, chapters, errors }` shape.
- **A custom injected `scenarioRunner` (test seam) returns `undefined`**: treated as `{ fellBack: false }` ("ran"), so `decideDegradation` falls through to the chapter-based check — a genuine no-capture run still resolves to `degraded: true`. Documented in Task 2.
- **Accidental edit to `plan.md` / `build.md`**: those files are not in any task's change set; verify with `git diff --name-only` before close that only `scripts/walkthrough-capture.mjs`, `scripts/walkthrough-capture.test.mjs`, `vitest.config.ts`, `.cycle/prompts/reflection.md`, and `AGENTS.md` changed.
- **Sidecar write on an unwritable `CYCLE_ARTIFACT_DIR`**: caught, logged via `logDiag`, appended to `errors[]`, exit 0 — the degradation signal failing to persist never fails a cycle (Task 2 Failure & Resilience).
