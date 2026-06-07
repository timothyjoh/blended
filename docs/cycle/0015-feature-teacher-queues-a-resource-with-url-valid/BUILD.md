## Summary

This cycle delivers the first vertical slice of the Resource feature: a Teacher can queue a lesson resource (URL + title + type) onto a session, with the URL validated so an unsafe scheme can never be stored. All five PLAN.md tasks are complete.

**Files created:** `src/lib/resources.ts` (43 lines — the single pure `validateResourceUrl` seam), `src/lib/resources.test.ts` (103 lines — full accept/reject table + totality), `e2e/queue-resource.spec.ts` (136 lines — happy path + ordering + unsafe-scheme rejection with admin observability), `docs/cycle/0015-feature-teacher-queues-a-resource-with-url-valid/walkthrough.mjs` (117 lines — 5 named capture points driving the real Card).

**Files modified:** `src/lib/db.ts` (+52 — `SessionProjection.resources` map, `emptyProjection` init, `applyEvent` `ResourceQueued` fold), `src/lib/db.test.ts` (+119 — fold fixtures, idempotency/partial/no-mutate tests, rebuild round-trip), `src/lib/sessions.ts` (+161 — `RESOURCE_TYPES`, `buildResourceQueue`, `queueResource`, exported `defaultResourceTxn`), `src/lib/sessions.test.ts` (+215 — builder validation/ordering/defaults, wrapper dual-write/propagation, real-txn link/key tests), `src/components/SessionLifecycle.tsx` (+197 — third live query, add-resource control, realtime queue list with mutually-exclusive error/loading/empty/rows states), plus `AGENTS.md`, `README.md`, `release-notes.md`.

**PLAN tasks complete:** Task 1 (validation seam), Task 2 (builder + dual-write wrapper), Task 3 (projection fold), Task 4 (UI control + live queue), Task 5 (e2e + docs + walkthrough).

**Test suite:** `npm test` (`vitest run`) → **322 passed (9 files)**. `npm run test:e2e -- e2e/queue-resource.spec.ts` → **1 skipped** (skips loudly; `INSTANT_ADMIN_TOKEN` unset in this environment, by design). `npx astro check` → **0 errors, 0 warnings, 36 hints** (hints are pre-existing `ElementRef` deprecations in `src/components/ui/*`).

**Coverage:** `npm run test:coverage` → **Statements 88.04% (302/343), Branches 82.92% (301/363), Functions 81.13% (43/53), Lines 90.13% (265/294)**. No regression vs the cycle base (cycle 0014: 86.42 / 82.1 / 79.59 / 88.75 — every metric rose). `src/lib/resources.ts` is 100/100/100 (omitted from the truncated text table but confirmed in `coverage-summary.json`); `sessions.ts` 95.81/86.2/86.66/97.6; `db.ts` 92.06/82.9/100/92.98. The function metric initially dipped 0.35% because the new `defaultResourceTxn` closure (like the other `default*Txn` closures) wasn't exercised by the wrapper tests; I exported it and added a real-txn test asserting the `.link({ session })` op and keyed update (mirroring cycle 0014's `defaultChatTxn` precedent), restoring the metric above base.

**Failure modes handled:** (1) **Validation** — `validateResourceUrl` is total (try/catch around `new URL`, typeof-guarded input), never throws, and tags every rejection (`unsafe_scheme`/`blank`/`unparseable`); `buildResourceQueue` throws synchronously before any txn on non-teacher actor, missing `actor.id`/`sessionId`, blank title, or rejected URL — covered by builder failure-path tests asserting a spy `write` is never called. (2) **No write on rejection** — the UI gates the URL through `validateResourceUrl` before calling `queueResource`; the e2e proves `javascript:` and `data:` leave the `sessionResources`/`ResourceQueued` counts unchanged via admin read. (3) **Propagation, not swallowing** — `queueResource` has no try/catch; a rejecting `write` propagates (unit test), and the UI catches it into an inline `role="alert"` + `console.error`, retaining inputs for retry. (4) **Query-error render** — `resource-queue-error` is checked before the empty state so an errored query never reads as falsely-empty. (5) **Atomicity** — single `writeEvent` transaction, so a rejected queue leaves no orphan event/row. (6) **Idempotency / race** — not idempotent by design (each add is deliberate); the accepted `sortOrder` race is non-blocking, resolved by the deterministic id tie-break in the inline comparator; a `resPending` latch suppresses double-submit.

**Deviations from PLAN:** none of substance. The only addition beyond the PLAN's literal code was exporting `defaultResourceTxn` and adding a real-txn test (to hold function coverage at/above base) — consistent with the cycle-0014 `defaultChatTxn` pattern, not a scope change.

**Deferred / follow-up:** reorder/remove (`ResourceReordered`/`ResourceRemoved`), activation (`ResourceActivated`), and embed-mode checking (`ResourceEmbedChecked`) remain explicitly out of scope per SPEC; `embedMode: 'blocked'` / `embedStatus: 'unchecked'` are conservative defaults owned by the deferred embed cycle. The e2e happy/ordering legs run only when `INSTANT_ADMIN_TOKEN` is provisioned.

## Touched Files
- src/lib/resources.ts
- src/lib/resources.test.ts
- src/lib/db.ts
- src/lib/db.test.ts
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- src/components/SessionLifecycle.tsx
- e2e/queue-resource.spec.ts
- AGENTS.md
- README.md
- release-notes.md
- docs/cycle/0015-feature-teacher-queues-a-resource-with-url-valid/walkthrough.mjs
