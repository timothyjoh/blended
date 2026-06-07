---
id: refl-0011-file-quickfix-walkthrough-before-after-c
title: Author before/after quickfix walkthroughs + phase-named degradation sidecars
workflow: feature
depends_on: []
triaged_at: 2026-06-07T08:48:47.608Z
source: triage
priority: medium
---
SPEC item 3 — the `walkthrough_before` / `walkthrough_after` wiring via `plan_fix` / `quick_fix` — was deliberately carved out of cycle 0011 and is acknowledged as deferred in both BUILD.md ("Deferred / follow-up") and the SPEC's Out-of-Scope section, but it was never re-filed as its own issue. The source issue `txt-20260607-052735-cycle-walkthrough-authors-real-scenario` bundled both halves and has now been consumed, so the quickfix half will be lost unless it is tracked separately. This issue is that follow-up.

The groundwork already landed in cycle 0011: sidecar naming was made phase-aware (`walkthroughErrorsFileName`) specifically so a sibling quickfix cycle can build on it without rework. Pick up from there.

## Scope

- Define and author the before/after quickfix walkthroughs driven through the `plan_fix` / `quick_fix` path.
- Wire `walkthrough_before` and `walkthrough_after` capture so each quickfix run records its before/after state.
- Persist the resulting phase-named degradation sidecars using the existing phase-aware naming (`walkthroughErrorsFileName`), matching the convention established in cycle 0011.
- Cover the new capture path with tests, and make any degradation in the quickfix walkthroughs loud (consistent with the "loud degradation" behavior added in cycle 0011) rather than silently swallowed.

## Done when

- Quickfix before/after walkthroughs exist and run through `plan_fix` / `quick_fix`.
- Phase-named degradation sidecars are written for the quickfix phase and verified by tests.
- BUILD.md / SPEC "Deferred" notes for item 3 can be closed out.
