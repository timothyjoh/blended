## Summary

Applied **Fix 1: embed-detection comment over-promises late-onLoad clearing the fallback card** from `FINAL_FIXES.md`.

- `src/lib/embed.ts` — Rewrote the `EMBED_LOAD_TIMEOUT_MS` docstring. It previously claimed "a late `onLoad`, if it arrives, clears it," which the shipped code cannot do. The comment now states that a real `onLoad` arriving before the deadline cancels the timeout (inline frame stays), but once the timeout fires the status settles, the iframe is unmounted, the fallback card replaces it and stays, and the embed is not re-checked until `activeResourceId`/`currentUrlVersion` changes.
- `src/components/ResourcePane.tsx` — Corrected the mirrored header comment with the same clarification: a real `onLoad` before the deadline cancels the pending timeout, but after the timeout fires the card replaces the iframe and stays until `activeResourceId`/`currentUrlVersion` changes; a late `onLoad` cannot recover the inline frame.

Both edits are mechanical inline-comment wording fixes within the cycle footprint (`touched.json`); no code behavior, assertions, or design changed.

**Test-suite outcome:** `npm test` passes — 10 test files, 400 tests passed.

**Unfixed tasks:** None.
