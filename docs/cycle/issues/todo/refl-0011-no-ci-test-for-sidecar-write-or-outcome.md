---
id: refl-0011-no-ci-test-for-sidecar-write-or-outcome
title: Add a CI test for the sidecar-write-failure path and the degraded outcome
  flip in walkthrough-capture
workflow: feature
depends_on: []
triaged_at: 2026-06-07T08:49:19.994Z
source: triage
priority: medium
---
The failure branches added to `scripts/walkthrough-capture.mjs` in cycle 0011 have no automated failure-path coverage. CI only exercises the pure helpers (`decideDegradation`, `walkthroughErrorsFileName`, `buildWalkthroughErrorsSidecar`); REVIEW.md finding #5 confirms the orchestration and the on-disk `degraded` round-trip are documented as manual integration only. Because manual tests do not run in the gate, a future edit to the `captureWalkthrough` / `main` wiring could silently regress the degradation signal or the sidecar write.

The injected `scenarioRunner` seam does not make `captureWalkthrough` browser-free (it still launches Chromium), so this can't be tested cheaply as-is. Close the gap with a narrow seam:

- Extract the sidecar serialize/write step in `main()` behind an injectable writer so the `result → sidecar` round-trip and the `outcome → degraded` threading can be asserted without a dev server or Chromium.
- Add a CI test (runs in the gate, no live server) covering:
  - the best-effort sidecar-write **failure** path in `main()` (writer throws → handled, not fatal), and
  - the `runScenarioOrFallback` `{ fellBack, reason }` outcome threading through `finalize()` → `decideDegradation` so the `degraded` flip is exercised end-to-end against the seam.

Full slice: introduce the injectable seam, wire it into `main()` without changing default behaviour, and land the CI tests. Keep the change minimal — do not add scope beyond making the existing degradation/sidecar logic testable in the gate.
