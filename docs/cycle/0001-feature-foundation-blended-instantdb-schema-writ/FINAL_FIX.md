## Summary

Applied **Fix 1: raise-e2e-harness-visibility-timeout-to-remove-known-flake**.

- Edited `e2e/event-spine.spec.ts` in the shared `gotoHarness` helper (line 12). The `event-spine-harness` visibility assertion previously relied on Playwright's implicit 5s default timeout, which the `client:only="react"` island's cold-start hydration could exceed — the source of the `1 flaky, 2 passed` result recorded in REVIEW.md #6, masked by `retries: 3`.
- Changed the assertion to `toBeVisible({ timeout: 15_000 })` and added a comment explaining the hydration budget and referencing the review finding. Because `gotoHarness` is the single entry point used by all three e2e specs, the explicit budget removes the retry dependency from every test.
- The change stays within the cycle footprint: it is a test file edit, and `e2e/event-spine.spec.ts:12` is the exact location named in `FINAL_FIXES.md`.

**Test-suite outcome:** `npm test` (`vitest run`) passes — 1 file, 18 tests passed. No assertions were weakened, skipped, or removed; the unit suite is unchanged. The fix targets the e2e harness flake at its root (insufficient hydration timeout) rather than masking it via retries.

**Unfixed tasks:** none — `FINAL_FIXES.md` contained a single fix, which was applied.
