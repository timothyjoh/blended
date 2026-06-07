# Final Fixes — Cycle 0018

> Footprint: AGENTS.md, README.md, src/components/ResourcePane.tsx, src/components/SessionLifecycle.tsx, src/components/StudentSession.tsx, src/lib/db.test.ts, src/lib/db.ts, src/lib/embed.test.ts, src/lib/embed.ts, src/lib/sessions.test.ts, src/lib/sessions.ts, src/pages/e2e/

## Fix 1: embed-detection comment over-promises late-onLoad clearing the fallback card

`src/lib/embed.ts:14` and the mirrored header in `src/components/ResourcePane.tsx:19` claim that for a slow-but-valid embed "a late `onLoad`, if it arrives, clears it." That is not what the shipped code does: once `status` settles to `blocked`/`failed` the iframe is unmounted and replaced by the fallback card (`ResourcePane.tsx:111-140`), so no late `onLoad` can ever fire to clear it. The behavior is SPEC-correct (SPEC §44 accepts a permanently-shown card for a slow embed as degraded-but-visible), and the user-facing README/AGENTS prose does not repeat the claim — this is purely an inaccurate inline comment in two files already touched this cycle.

Correct both comment headers to say the timeout fires once and the card then stays (the embed is not re-checked until `activeResourceId`/`currentUrlVersion` changes), rather than implying a late `onLoad` recovers the inline frame. Mechanical wording fix, no design decision. Flagged as finding #1 in REVIEW.md.
