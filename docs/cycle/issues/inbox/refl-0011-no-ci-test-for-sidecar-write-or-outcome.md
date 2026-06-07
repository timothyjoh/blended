---
id: refl-0011-no-ci-test-for-sidecar-write-or-outcome
source: reflection
title: no-ci-test-for-sidecar-write-or-outcome-to-degraded-threading
added_at: 2026-06-07T08:46:13.515Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0011"
---

The new failure branches shipped in `scripts/walkthrough-capture.mjs` — the `main()` best-effort sidecar-write catch, the `runScenarioOrFallback` `{ fellBack, reason }` outcome threading, and the `finalize()` funnel that maps `outcome` → `decideDegradation` — have no automated failure-path test. Only the pure helpers (`decideDegradation`, `walkthroughErrorsFileName`, `buildWalkthroughErrorsSidecar`) are exercised in CI; REVIEW.md finding #5 confirms the orchestration and the on-disk `degraded` round-trip are documented as manual integration only. Manual tests do not run in the gate, so a future edit to `captureWalkthrough`/`main` wiring could silently regress the degradation signal or the sidecar write.

The injected `scenarioRunner` seam does not make `captureWalkthrough` browser-free (it still launches Chromium), so closing this cheaply needs a narrow seam — e.g. extract the sidecar-write/serialize step in `main()` behind an injectable writer so the result→sidecar round-trip and the outcome→degraded threading can be asserted without a dev server. File a follow-up to add that seam and a CI test covering the sidecar-write-failure path and the degraded flip.
