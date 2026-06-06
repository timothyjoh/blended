# Final Fixes — Cycle 0001

> Footprint: .env.example, .gitignore, AGENTS.md, README.md, astro.config.mjs, package-lock.json, package.json, src/components/EventSpineHarness.tsx, src/lib/db.test.ts, src/lib/db.ts, src/pages/dev/, tsconfig.json

## Fix 1: raise-e2e-harness-visibility-timeout-to-remove-known-flake

`e2e/event-spine.spec.ts:12` asserts `event-spine-harness` is visible using the implicit 5s default timeout. The harness is a `client:only="react"` island whose cold-start hydration can exceed 5s — REVIEW.md finding #6 records that the "writeEvent twice" spec failed its first attempt on exactly this check and only passed on retry (`1 flaky, 2 passed`). `retries: 3` currently masks the flake.

Give the `gotoHarness` visibility assertion an explicit timeout (e.g. 15s) so the green run no longer depends on a retry. This is a localized, single-line change in a file touched this cycle and requires no design decision.
