---
id: txt-20260607-052735-cycle-walkthrough-authors-real-scenario
title: Make cycle walkthrough degradation loud + cover quickfix before/after capture
workflow: feature
depends_on: []
triaged_at: 2026-06-07T05:47:27.731Z
source: triage
priority: high
---
## Problem

Every cycle's walkthrough artifacts have been useless — just one static homepage screenshot (`walkthrough/00-home.png`) plus a homepage-only video (confirmed across `docs/cycle/0003-…`, `0004-…`).

**Root cause (diagnosed):** `scripts/walkthrough-capture.mjs` runs a per-cycle Playwright scenario at `$CYCLE_ARTIFACT_DIR/walkthrough.mjs`; if absent it silently degrades to a home-page capture. Nothing authored that scenario — the `feature` workflow had no step and no prompt referenced it.

**Already fixed directly (in `.cycle/prompts/`, do NOT redo):**
- `plan.md` now has a "Step 3b: Plan the Walkthrough" + a required `## Walkthrough Plan` section in the PLAN.md template + guideline #12 — the **plan step defines** the walkthrough (flow over real new routes, ordered named capture points, preconditions/test data).
- `build.md` now has step 8 + a quality gate — the **build step authors** `$CYCLE_ARTIFACT_DIR/walkthrough.mjs` from that plan section (exports `default async ({page, baseURL, capture}) => {…}`, multiple named captures of the new functionality).

This cycle covers only the **remaining hardening** so the fix is durable.

## What to build

1. **Make degradation loud, not silent.** When the capture falls back to the home page (scenario absent / unimportable / threw), record it in the walkthrough artifacts (e.g. `degraded: true` + `reason`/`errors`) so a homepage-only walkthrough is visibly flagged instead of looking intentional. The runner already collects `errors[]`; surface them. Note the engine (not the hook) currently writes `walkthrough-artifacts.json` — if the manifest is engine-owned, emit a sidecar like `walkthrough-errors.json` from the hook so the degradation signal is not lost.
2. **A feature cycle that builds observable UI must not pass quietly on a degraded walkthrough** — surface it via reflection/FINAL_FIX so it is caught rather than silently shipped.
3. **Cover `quickfix`.** Its `walkthrough_before` / `walkthrough_after` bash steps currently do nothing useful; wire them (via the `plan_fix` / `quick_fix` prompts) to define + author a before/after walkthrough of the fixed behavior, mirroring the feature plan/build wiring.

## Acceptance Criteria

- [ ] A degraded / home-page-only walkthrough is explicitly flagged (`degraded: true` + reason) in the cycle's artifacts, not indistinguishable from a real one.
- [ ] A `feature` cycle that builds observable UI but produces only a home-page walkthrough is surfaced (reflection/FINAL_FIX), not silently passed.
- [ ] `quickfix` cycles capture the fixed behavior (before/after), not the home page.
- [ ] `walkthrough_capture` still exits 0 in all paths (never fails a cycle).
- [ ] No regression to the already-applied `plan.md` / `build.md` walkthrough wiring.

## Verification (Playwright)

- [ ] Run `node scripts/walkthrough-capture.mjs` against a temp `CYCLE_ARTIFACT_DIR` with a hand-written `walkthrough.mjs` → ≥2 non-home screenshots + non-trivial video; manifest NOT flagged degraded.
- [ ] Run it with NO `walkthrough.mjs` → home capture produced AND degradation explicitly flagged in the manifest/sidecar; process still exits 0.

## Out of Scope

- The plan/build prompt wiring (already done directly in `.cycle/prompts/plan.md` and `build.md`).
- Hosting walkthrough videos externally; this stays internal cycle evidence.
- The pnpm-lockfile build failure (tracked separately via the deployment monitor).
