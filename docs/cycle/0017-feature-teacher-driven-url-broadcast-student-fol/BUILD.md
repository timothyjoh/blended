All gates pass. Producing the build summary.

## Summary

Cycle 0017 delivers the teacher-driven URL-broadcast vertical slice on top of cycle 0016's activation pane, mirroring the activation slice's pure-core / thin-wrapper / default-txn pattern exactly. All six PLAN.md tasks are complete.

**Data spine (`src/lib/db.ts`, +48 lines)** — Task 1 added the additive `sessions.currentUrlVersion: i.string().optional()` field and widened `SessionProjection.session` with optional `currentUrlVersion?`. Task 3 added the `applyEvent('ResourceUrlChanged', …)` fold (sets `currentUrl`/`currentUrlVersion`, preserves the active resource, tolerant of an absent prior session, type-guarded, never mutates input — keeping `rebuildSessionProjection` whole) and extended the `ResourceActivated` fold to also stamp `currentUrlVersion`.

**Action layer (`src/lib/sessions.ts`, +128 lines)** — Task 1 added the injectable `Mint` type + `generateUrlVersion(mint = id)` (the `generateJoinCode` determinism pattern). Task 2 added `buildResourceUrlChange` (pure total builder: throws before any plan on non-teacher actor, missing `actor.id`/`sessionId`, absent `activeResourceId`, or a `validateResourceUrl`-rejected URL — reusing the single URL seam, no inline parsing; mints a fresh per-broadcast token), `defaultResourceUrlChangeTxn` (keyed `sessions[id].update({ currentUrl, currentUrlVersion })`, no link op), and the `broadcastResourceUrl` thin wrapper routing the dual-write through `writeEvent('ResourceUrlChanged', …)`. It also stamped `currentUrlVersion` onto `buildResourceActivate`/`ResourceActivatePlan`/`defaultResourceActivateTxn` so activation and broadcast share one re-sync key.

**Components** — Task 4: `ResourcePane.tsx` (+8 lines) gained a `currentUrlVersion?` prop and keys the iframe on `currentUrlVersion ?? url` (forces a remount on every broadcast, including an identical URL; `?? url` keeps pre-0017 rows rendering) plus a `data-url-version` attribute; `StudentSession.tsx` (+1) threads the prop. Task 5: `SessionLifecycle.tsx` (+93 lines) added the `broadcast()` handler (gates `validateResourceUrl` before any write, inline `role="alert"` + `console.error` on rejection/failure, retains the entered URL, per-action `broadcastPending` latch) and the `broadcast-url-control` (input + Broadcast button, disabled until a resource is active) inside the "Active resource" card above the pane, threading `currentUrlVersion`.

**Tests** — `src/lib/sessions.test.ts` (+237 lines): `generateUrlVersion` determinism + uniqueness; `buildResourceUrlChange` happy path (full `toEqual`), seam-normalization, fresh-token-per-call, and every rejection leg (non-teacher, missing `actor.id`/`sessionId`, absent `activeResourceId`, and each `validateResourceUrl` rejection: blank/unsafe_scheme/unparseable); `broadcastResourceUrl` dual-write / no-write-on-rejected-builder (two legs) / rejection-propagates; `defaultResourceUrlChangeTxn` `__ops`; plus updated activation fixtures for `currentUrlVersion`. `src/lib/db.test.ts` (+138 lines): two `ResourceUrlChanged` fixtures and fold tests (sets fields, preserves active resource, tolerant of absent session, fresh-version-per-fold, idempotent, no-throw, no-mutation, non-string type-guard legs for both new events) plus a `rebuildSessionProjection` test over `[ResourceActivated, ResourceUrlChanged, ResourceUrlChanged]` (ordered + shuffled) reproducing the latest URL+version. Task 6: `e2e/broadcast-resource-url.spec.ts` (new, ~210 lines) — multi-context teacher→students follow, re-broadcast-same-URL re-sync via advancing `data-url-version`, slide-4 follow, late-joiner D, admin observability of one `ResourceUrlChanged` + projection per broadcast, and the failure leg (students lack the control; blank teacher submit writes nothing). Skips loudly without admin env; collected by Playwright (verified via `--list`).

**Walkthrough** — `docs/cycle/0017-…/walkthrough.mjs` (new, ~140 lines): drives the real facilitation + student routes with five named captures — `01-teacher-session-live`, `02-broadcast-control`, `03-teacher-after-broadcast`, `04-student-followed`, `05-late-joiner` — waiting on the iframe `src` (Blended-owned state), degrading loudly to the login surface when admin env is unset. Syntax-checked under bare `node`.

**Test & coverage commands** — `npm test` → **374 passed (9 files)**. `npm run astro check` → **0 errors, 0 warnings** (111 files). `npm run test:coverage` (scope `src/lib/**`) → **lines 91.73%, branch 83.17%, functions 83.6%** overall; touched files: `sessions.ts` 96.73% / 86.3% / 89.47%, `db.ts` 93.24% / 82.48% / 100%. **No regression** vs the cycle-0016 base (lines 90.96%, branch 82.53%, functions 82.45%) — all three metrics improved. I added two malformed-payload fold tests to recover a brief branch dip from the new type-guard `: undefined` legs before finalizing.

**Failure modes handled** — *Validation:* `buildResourceUrlChange` throws before any write on non-teacher / missing-id / no-active-resource / blank-unsafe-unparseable URL (covered by the rejection-leg unit tests); the component re-gates `validateResourceUrl` before calling the wrapper and disables the control with no active resource. *Rejection propagation:* the wrapper does not catch a rejecting `writeEvent` (covered by "rejection propagates"); the component catches it into an inline `role="alert"` + `console.error`, retaining the URL. *Idempotency/retry:* a fresh minted token per call means no read-before-write and no collision; a failed txn wrote nothing, so retry is safe; `broadcastPending` suppresses double-submit. *Replay-safety:* the new fold case removes the `UnknownEventTypeError` surface for `ResourceUrlChanged` and tolerates an absent prior session. No errors are swallowed.

**Deviations from PLAN.md** — None substantive. The plan's re-sync e2e step ("student navigates its iframe locally to slide-5") can't manipulate a cross-origin iframe from Playwright, so the spec proves the same invariant the SPEC names — that re-broadcasting an *identical* URL still re-syncs — by asserting the version-keyed frame's `data-url-version` advances on a same-URL re-broadcast (per the plan's own Risk Assessment guidance to assert on Blended-owned state, not cross-origin DOM). Added a `data-url-version` attribute to the iframe to make the remount observable in-browser (within the version-keyed-pane scope).

**Deferred / follow-up** — None beyond SPEC's explicit out-of-scope set (postMessage embed-API capture, prev/next slide-list stepping, same-origin restriction, blocked-embed fallback). The additive `sessions.currentUrlVersion` field requires `npx instant-cli push schema` before the feature works against the schema-enforced live app (documented in AGENTS.md / README.md / release-notes.md); no `perms:push` needed.

## Touched Files
- src/lib/db.ts
- src/lib/db.test.ts
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- src/components/ResourcePane.tsx
- src/components/SessionLifecycle.tsx
- src/components/StudentSession.tsx
- e2e/broadcast-resource-url.spec.ts
- AGENTS.md
- README.md
- release-notes.md
- docs/cycle/0017-feature-teacher-driven-url-broadcast-student-fol/walkthrough.mjs
