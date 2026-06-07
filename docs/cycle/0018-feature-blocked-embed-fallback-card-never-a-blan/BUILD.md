All gates pass. Now producing the build summary.

## Summary

Cycle 0018 delivers the SPEC §8.2 "never a blank pane" guarantee as one vertical slice: best-effort client-side blocked/failed-embed detection in the shared `ResourcePane`, a prop-driven fallback card (title + URL + "Open externally") rendered in **both** the teacher and student contexts, and a single sanctioned `recordEmbedStatus` path that dual-writes a `ResourceEmbedChecked` event transitioning `sessionResources[id].embedStatus` (`unchecked` → `blocked`/`failed`) from the teacher's authorized context only.

### What was built (PLAN.md tasks)

- **Task 1 (complete)** — `src/lib/db.ts` (+~35 lines): extended the `SessionProjection.resources` entry type with optional `embedStatus?` and added a `ResourceEmbedChecked` fold case before the throwing `default` (tolerant of an absent prior entry, type-guarded, convergent, never mutates input). `src/lib/db.test.ts` (+~60 lines): six fold tests (existing-entry set, tolerant minimal-entry, non-string type-guard, idempotent re-fold, `not.toThrow`, non-mutation).
- **Task 2 (complete)** — `src/lib/sessions.ts` (+~95 lines): `buildEmbedStatusCheck` (pure total builder rejecting non-teacher actor / missing ids / out-of-`{blocked,failed}` status synchronously), `defaultEmbedStatusTxn` (keyed `sessionResources` update, no `link` op), `recordEmbedStatus` (thin wrapper routing one dual-write through `writeEvent`, propagating rejections). `src/lib/sessions.test.ts` (+~150 lines): builder accept/reject cases, wrapper dual-write + no-write-on-bad-input + rejection-propagation, real-txn `__ops` inspection.
- **Task 3 (complete)** — `src/lib/embed.ts` (new, 28 lines): `EMBED_LOAD_TIMEOUT_MS = 4000` and the pure `resourceCardHeading`. `src/lib/embed.test.ts` (new, 32 lines): heading title/hostname/raw-url fallbacks + positive-constant guard. `src/components/ResourcePane.tsx` (rewritten, ~165 lines): stateful — bounded load-timeout (primary), `onError` (secondary), `onLoad` cancels; renders the fallback card in place of the iframe; reports the settled outcome via `onEmbedBlocked`; detection resets on `activeResourceId`/`currentUrlVersion` change with timeout cleared on reset/unmount (no leak).
- **Task 4 (complete)** — `src/components/SessionLifecycle.tsx` (+~50 lines): imports `recordEmbedStatus`, supplies `title={activeResource?.title}` + an `onEmbedBlocked` callback (convergence guard against live `embedStatus` + per-resource latch keyed `resourceId::version`), and an inline `embed-status-error` (`role="alert"`) + `console.error` on rejection.
- **Task 5 (complete)** — `src/components/StudentSession.tsx` (+~15 lines): a narrowly-scoped active-resource title query (logged + degrades to hostname on error), passes `title` and **no** `onEmbedBlocked` (students cannot write `sessionResources`).
- **Task 6 (complete)** — `public/e2e/embed-ok.html` (new), `src/pages/e2e/hang.ts` (new, dev-guarded endpoint delaying past the timeout, abort-safe), `e2e/blocked-embed-fallback.spec.ts` (new): blocked (card in teacher + student, no frame), embeddable (frame, no card), evidence (exactly one `ResourceEmbedChecked` + `blocked` row), student-no-write failure leg. Skips loudly without admin env; lists/parses cleanly.
- **Task 7 (complete)** — `AGENTS.md` cycle-0018 data-layer paragraph and `README.md` user-facing section, both documenting the new path, event/fold, testids, and the no-schema-push / no-`perms:push` facts.
- **Walkthrough (complete)** — `docs/cycle/0018-.../walkthrough.mjs` drives the real teacher + student routes with five named captures (`01-teacher-session-live` … `05-teacher-embeddable-inline`); degrades loudly to the login surface when admin env is unset; parses under bare `node --check`.

### Verification

- **Test suite**: `npm test` (`vitest run`) → **10 files, 400 tests passed**.
- **Typecheck**: `npm run astro check` → **0 errors, 0 warnings, 36 hints** (the `ts(6385)` ElementRef deprecation hints are pre-existing in vendored `src/components/ui/tabs.tsx`, not introduced here).
- **Coverage**: `npm run test:coverage` (v8) → Statements **90.74%**, Branches **83.26%**, Functions **84.61%**, Lines **92.40%**. New code is well-covered: `embed.ts` 100% stmts/lines, `sessions.ts` 97.01% stmts / 98.28% lines, `db.ts` 93.67% stmts / 94.52% lines. No per-file regression — every new lib export (builder/wrapper/txn, fold, heading helper) ships with new unit tests. `ResourcePane.tsx`, `hang.ts`, and the components are outside the lib-scoped vitest coverage set (browser-tested by Playwright), as before.
- **e2e**: `npx playwright test blocked-embed-fallback` → **1 skipped** (admin env unset locally — skips loudly, never a false green), exactly as designed.

### Failure modes handled

- **Bad input to `buildEmbedStatusCheck`** (non-teacher actor, missing `sessionId`/`resourceId`, status outside `{blocked,failed}`) → rejected synchronously, nothing written. Covered by the builder reject tests in `sessions.test.ts`.
- **Embed-status write rejected/unavailable** → the teacher callback drops the latch (retry-safe), surfaces `embed-status-error` (`role="alert"`) + `console.error`, and the fallback card stays visible (prop-driven, independent of the write). Covered by the wrapper rejection-propagation test and the e2e failure leg.
- **Duplicate writes from repeated detections** → convergence guard (skip when live `embedStatus` already equals detected) + per-resource latch; the e2e evidence leg asserts exactly one event.
- **False positive on a slow-but-valid embed** → bounded timeout with `onLoad` cancelling it; embeddable e2e leg asserts the inline frame and no card.
- **Unfolded event** → `applyEvent` folds `ResourceEmbedChecked` (never `UnknownEventTypeError`); the `default` still throws for genuinely unknown types.
- **Student title-query error** → logged, degrades to the hostname heading (never blank, never crash).
- **`hang.ts` leaking to production / hanging the handler** → 404 outside `import.meta.env.DEV`; the delay is abort-cleared on request teardown (no swallowed error, no timer leak).

### Deviations from PLAN.md

None of substance. The fallback card includes a short explanatory line ("This resource can't be shown inline here.") above the heading for clarity — additive, within SPEC's "readable card" intent, and not relied on by any test. The walkthrough uses `page.goBack()` to return to the facilitation view for capture `05` (re-waiting on `session-status`), a harness-driven choice equivalent to the plan's single-page route switching.

### Deferred / follow-up

Per SPEC Out-of-Scope: server-side preflight URL probing, a `failed`→retry/recovery affordance beyond the card, and auto-flipping `embedMode`/auto-re-embedding remain future cycles. No new follow-up surfaced during the build.

## Touched Files
- src/lib/db.ts
- src/lib/db.test.ts
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- src/lib/embed.ts
- src/lib/embed.test.ts
- src/components/ResourcePane.tsx
- src/components/SessionLifecycle.tsx
- src/components/StudentSession.tsx
- public/e2e/embed-ok.html
- src/pages/e2e/hang.ts
- e2e/blocked-embed-fallback.spec.ts
- AGENTS.md
- README.md
- docs/cycle/0018-feature-blocked-embed-fallback-card-never-a-blan/walkthrough.mjs
