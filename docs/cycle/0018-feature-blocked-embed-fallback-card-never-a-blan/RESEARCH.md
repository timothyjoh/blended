# Research: Cycle 0018

## Cycle Context
SPEC.md (`docs/cycle/0018-feature-blocked-embed-fallback-card-never-a-blan/SPEC.md`) asks for the SPEC §8.2 "never a blank pane" guarantee as one vertical slice: add best-effort **client-side detection** of a blocked/failed embed to the shared `ResourcePane` (a bounded load timeout as the primary signal, cleared on `onLoad`; `onError` as a secondary signal; detection state reset when `activeResourceId` / `currentUrlVersion` change), render a **fallback card** (resource title or hostname fallback, the URL as readable text, and an "Open externally" action that opens the URL in a new tab with `target="_blank"` + `rel="noopener noreferrer"`) in place of the blank/broken iframe in **both** the teacher view (`SessionLifecycle`) and the student view (`StudentSession`), and — from the teacher's authorized context only — persist the outcome via a single sanctioned `recordEmbedStatus` / `buildEmbedStatusCheck` path that routes a dual-write through `writeEvent('ResourceEmbedChecked', …)` transitioning `sessionResources[activeResourceId].embedStatus` (`unchecked` → `blocked`/`failed`) and folds `ResourceEmbedChecked` in `applyEvent`. Embeddable URLs continue to render inline with no false fallback. No schema push (`embedStatus` already exists) and no `perms:push` (teacher writes `sessionResources` via the existing owner-only rule).

## Current Codebase State

### Relevant Components

- **`ResourcePane`** (the shared pane to be extended): a pure prop-driven function component, no internal state today — `src/components/ResourcePane.tsx:13-51`. Props: `activeResourceId`, `currentUrl`, `currentUrlVersion`. Renders the `resource-pane-empty` state when no resource is active (`src/components/ResourcePane.tsx:27-35`); otherwise renders the sandboxed iframe keyed on `currentUrlVersion ?? url` (`src/components/ResourcePane.tsx:36-50`). The iframe has `data-testid="resource-pane-frame"`, `data-resource-id`, `data-url-version`, `sandbox="allow-scripts allow-popups allow-forms"` (no `allow-same-origin`), `referrerPolicy="no-referrer"`. There is **no** `onLoad`/`onError` handler and **no** title prop today (`src/components/ResourcePane.tsx:38-48`).

- **`SessionLifecycle`** (teacher view, mounts `ResourcePane`): `src/components/SessionLifecycle.tsx:74`. Holds identity via `useAuth` (`src/components/SessionLifecycle.tsx:75`), the live `sessions` query (`:76`), and a live `sessionResources` query `rq` by `sessionId` (`:93-95`) whose rows carry `title`/`url`/`embedMode`/`embedStatus`. The sorted `resources` array is already in scope (`:125-128`). The pane is mounted inside the "Active resource" card at `src/components/SessionLifecycle.tsx:467-471` with `activeResourceId`/`currentUrl`/`currentUrlVersion`. The active resource's `title` is available from `resources` (matched by `session.activeResourceId`, cf. `isActive` at `:611`).

- **`StudentSession`** (student view, mounts `ResourcePane`): `src/components/StudentSession.tsx:24`. It deliberately holds only a `sessions`-by-`joinCode` query and a `participants` query — **no `sessionResources` query** (`src/components/StudentSession.tsx:25-31`; comment §0016 at `:15-21`). Pane mounted at `src/components/StudentSession.tsx:83-87`. The active resource's `title` is **not currently resolvable** here (no resources query); SPEC §Scope calls for a narrowly-scoped active-resource title lookup or the hostname fallback.

- **Data layer** (`src/lib/sessions.ts`, `src/lib/db.ts`): the sanctioned write helpers, projection types, and fold live here.

### Existing Patterns to Follow

- **Pure builder + thin dual-write wrapper + exported default txn** (the established shape for every write; `recordEmbedStatus`/`buildEmbedStatusCheck` must mirror it):
  - `buildResourceActivate` (pure, total-validates BEFORE producing a plan, throws synchronously on bad input) — `src/lib/sessions.ts:1005-1029`.
  - `defaultResourceActivateTxn` (a plain `db.tx.sessions[id].update({...})` with **no link op** because the row already exists) — `src/lib/sessions.ts:1031-1036`.
  - `activateResource` (thin wrapper: build plan, `write('ResourceActivated', plan.meta, [buildTxn(plan)])`, injectable `deps` for testing) — `src/lib/sessions.ts:1053-1062`.
  - Identical structure for `broadcastResourceUrl` / `buildResourceUrlChange` / `defaultResourceUrlChangeTxn` — `src/lib/sessions.ts:1109-1165`.
  - Resource-create variant that DOES `.link({ session })` — `defaultResourceTxn` — `src/lib/sessions.ts:917-933`. (For a `sessionResources[id].update` on an existing row, the activation txn's no-link pattern is the closer model.)

- **Validation-before-write, reject without throwing-from-component**: builders throw `Error('<fn>: <reason>')`; the SPEC requires `buildEmbedStatusCheck` to reject (before any txn) on missing `sessionId`/`resourceId`, a non-teacher actor, or a status outside `blocked`/`failed`. Mirror `buildResourceActivate`'s role/id/session checks (`src/lib/sessions.ts:1006-1018`).

- **`writeEvent` dual-write choke point** (the ONLY sanctioned projection writer): `src/lib/db.ts:629-667`. Validates `type`, `meta.sessionId`, `meta.actor.role` (must be in `ACTOR_ROLES`), integer `schemaVersion`, and a **non-empty `projectionTxns`** array (`src/lib/db.ts:634-650`) — projection-only writes are rejected. Appends a `sessionEvents` envelope + the caller's projection txns in ONE `db.transact` (`src/lib/db.ts:652-666`). Stamps `id`/`occurredAt`/`receivedAt`/`schemaVersion` when absent. `WriteEventMeta` shape: `{ sessionId, actor: { id, role }, payload, correlationId?, schemaVersion?, occurredAt?, receivedAt? }` — `src/lib/db.ts:595-603`.

- **`applyEvent` fold (must gain a `ResourceEmbedChecked` case)**: switch over `event.type`, each case returns a new projection (pure, never mutates input), tolerant of absent prior state, keyed defensively, type-guards payload fields to `undefined` — `src/lib/db.ts:316-577`. The `default` throws `UnknownEventTypeError` (`src/lib/db.ts:570-575`), so a new event type that is NOT folded WILL throw. Closest model is the `QuestionAnswered` keyed-update case that mutates an existing keyed entry tolerantly (`src/lib/db.ts:434-468`) and the `ResourceQueued` case that builds the `resources` map entry (`src/lib/db.ts:469-503`). **Note**: `SessionProjection.resources` entries currently carry only render fields and explicitly **omit `embedStatus`/`embedMode`/`activatedAt`** (`src/lib/db.ts:270-284`) — the fold target for `embedStatus` is not present in the projection type today.

- **`embedStatus` storage already exists**: `sessionResources.embedStatus: i.string()` — `src/lib/db.ts:89` (alongside `embedMode: i.string()` at `:88`). Queued rows default `embedMode: 'blocked'`, `embedStatus: 'unchecked'` — `src/lib/sessions.ts:896-897` and the projection-row type `src/lib/sessions.ts:840-841`. The create txn writes both — `src/lib/sessions.ts:926-927`. **No schema push needed.**

- **Component dual-write call pattern (teacher write wired via a callback)**: `SessionLifecycle.activate()` is the model for the teacher embed-status callback — clears error, guards `user?.id`, sets a pending latch, `await`s the sanctioned wrapper, and on failure sets an inline error string + `console.error('[SessionLifecycle] …')` in a `try/catch/finally` (`src/components/SessionLifecycle.tsx:182-207`). The same shape appears in `broadcast()` (`:209-256`) and `addResource()` (`:133-180`).

- **Inline alert + console.error (never swallow)**: every failure surfaces an inline `<p role="alert" data-testid="…-error" className="text-sm text-destructive">` AND `console.error`. Existing alerts: `activate-resource-error` (`src/components/SessionLifecycle.tsx:647-655`), `broadcast-url-error` (`:455-463`), `add-resource-error` (`:575-583`), `teacher-question-error` (`:521-529`). The SPEC's new teacher alert testid is `embed-status-error`.

- **Failure handling (existing approach to match)**:
  - Builders reject invalid input synchronously BEFORE any write — nothing is written (`src/lib/sessions.ts:1006-1018`; tested at `src/lib/sessions.test.ts:1379-1399`).
  - Wrappers DO NOT catch a rejecting `write` — the rejection propagates (`src/lib/sessions.ts:1060`; tested at `src/lib/sessions.test.ts:1394-1399`).
  - Components catch wrapper rejections, surface inline + `console.error`, and leave live state unchanged for retry (`src/components/SessionLifecycle.tsx:198-206`).
  - `writeEvent` is atomic: a rejected transaction leaves no partial state, retry-safe (`src/lib/db.ts:618-625`).
  - The SPEC requires the **fallback card to render regardless** of whether the teacher write succeeds (the visual guarantee is prop-driven, independent of the write).

- **Observability conventions**: structured events are appended to `sessionEvents` via `writeEvent` (the timeline / admin-observable evidence) — `src/lib/db.ts:652-663`. UI-side errors go to `console.error('[<Component>] …', err)` (`src/components/SessionLifecycle.tsx:117-119`, `:203`, `:252`; `src/components/StudentSession.tsx:34-35`). The cycle/run log `.cycle/log.jsonl` is engine-level, not written by product code.

- **Idempotency / retry-safety**: the codebase writes are **NOT idempotent by design** — each call appends a fresh event; projection updates are **convergent** (re-applying sets identical values) — `src/lib/sessions.ts:1048-1051`. Components use **pending latches** to suppress double-submits: `activatingId` (`src/components/SessionLifecycle.tsx:104`, gating at `:637`), `broadcastPending`, `pendingId`, `resPending`. The SPEC additionally requires for `recordEmbedStatus`: a **guard so a resource already at the detected `embedStatus` is not re-written**, plus a **per-resource latch** to suppress repeated writes from repeated detections (no analogous "skip if already at value" guard exists today — activation has "No re-activation dedup guard" per AGENTS.md; this is new behavior to add in the new path).

- **Detection-state reset key**: `ResourcePane` already keys the iframe React `key` on `currentUrlVersion ?? url` (`src/components/ResourcePane.tsx:39`) so a broadcast/activation forces a remount. The SPEC requires detection state (timeout/loaded flags) to reset when `activeResourceId` or `currentUrlVersion` changes — the same version token is the reset signal.

- **Hostname fallback**: `validateResourceUrl` returns a normalized `parsed.href` and uses `new URL(...)` (`src/lib/resources.ts:26-44`); the hostname can be derived via `new URL(url).hostname`. The SPEC marks a "pure helper used for the timeout/hostname-fallback decision" as unit-test scope. (URL validation/SSRF tightening must stay confined to `src/lib/resources.ts` per its header comment `:1-8` — but the card only displays a URL the activation path already validated.)

### Dependencies & Integration Points

- **`writeEvent` / `applyEvent` / `UnknownEventTypeError`** — `src/lib/db.ts` (imported into `sessions.ts` at `src/lib/sessions.ts:1`).
- **`validateResourceUrl`** seam — `src/lib/resources.ts` (out of scope to change per SPEC; reused only for hostname parsing if needed).
- **`db.useQuery` (InstantDB)** — the live-query mechanism in both components; `StudentSession` would need a narrowly-scoped active-resource title query if the title is resolved server-side (open reads are permitted: `sessionResources.view = 'true'` — `src/lib/perms.ts:86`).
- **Permission rule** `sessionResources` — owner-only create/update/delete via the forgery-proof `session` link, reads open (`src/lib/perms.ts:72-91`). A teacher `sessionResources[id].update({ embedStatus })` is admitted by the existing `update: 'isSessionOwner || isAdmin'` rule (`:88`) **provided the txn carries the `session` link or the row already has it** — note `defaultResourceActivateTxn` updates `sessions` (a different entity) with no link; an `embedStatus` update targets an existing `sessionResources` row whose `session` link was set at create (`src/lib/sessions.ts:933`). **No `perms:push` needed.**
- **`RESOURCE_TYPES`** and the `Mint`/`id` helpers — `src/lib/sessions.ts:54-57` (exported from sessions.ts), `id` from `@instantdb/react`.
- **Env**: `PUBLIC_INSTANTDB_APP_ID` (app), `INSTANT_ADMIN_TOKEN` (e2e observability only) — per SPEC §Dependencies.

### Test Infrastructure

- **Test framework**: Vitest for pure logic (`npm test` → `vitest run`; `package.json` scripts), Playwright for e2e (`npm run test:e2e`). Astro typecheck via `npm run astro check` (SPEC acceptance: clean).
- **Unit test conventions**: `src/lib/*.test.ts` co-located; `describe`/`it`/`expect` from `vitest` (`src/lib/sessions.test.ts:1`, `src/lib/db.test.ts:1`). Builders tested by asserting thrown messages and produced plan/envelope; wrappers tested with an **injected `write` stub** capturing `type`/`txns.length`/rejection (`src/lib/sessions.test.ts:1363-1399`). Real txns tested by inspecting the mock's `__ops` array for `update`/`link` ops (`src/lib/sessions.test.ts:1424-1442`). Fold tested by applying an `EventLike` onto a projection and asserting `result.session`/maps (`src/lib/db.test.ts:472-601`), including tolerance of absent prior state, idempotent re-fold, non-mutation, type-guarding, and `not.toThrow()` for known types / `toThrow(UnknownEventTypeError)` for unknown (`src/lib/db.test.ts:514-617`).
- **Existing coverage of the change area**:
  - `buildResourceActivate` / `activateResource` / `defaultResourceActivateTxn` unit tests — `src/lib/sessions.test.ts:1257-1443`.
  - `buildResourceUrlChange` / broadcast unit tests — `src/lib/sessions.test.ts:1455-1539+`.
  - `applyEvent` folds for `ResourceQueued`/`ResourceActivated`/`ResourceUrlChanged` + `UnknownEventTypeError` default — `src/lib/db.test.ts:223-617`; `rebuildSessionProjection` determinism — `src/lib/db.test.ts:680-879`.
  - `writeEvent` input validation — `src/lib/db.test.ts:883+`.
  - e2e for the touched flow: `e2e/activate-resource.spec.ts`, `e2e/broadcast-resource-url.spec.ts`, `e2e/queue-resource.spec.ts`. **No `e2e/blocked-embed-fallback.spec.ts` exists yet** (SPEC requires it).
- **Failure-path test coverage that exists**: builder-rejection-writes-nothing and wrapper-does-not-swallow-rejection are explicitly tested (`src/lib/sessions.test.ts:1379-1399`); fold defensiveness/type-guarding tested (`src/lib/db.test.ts:572-601`); e2e failure legs assert students lack the teacher control and cannot move admin counts (`e2e/activate-resource.spec.ts:18-21`, `e2e/broadcast-resource-url.spec.ts:21-24`). These are the patterns the new `buildEmbedStatusCheck` rejection tests, `ResourceEmbedChecked` fold test, and the e2e blocked/embeddable/evidence/student-no-write legs must mirror.
- **e2e support**: `adminAvailable()`, `freshEmail()`, `signInViaUi()`, `queryAdmin()`, `mintCode()` — `e2e/support/auth.ts:14-58`. Specs `test.skip(!adminAvailable(), …)` loudly (e.g. `e2e/activate-resource.spec.ts:28-31`); `playwright.config.ts` sets `retries: 3` to absorb realtime-sync flake.

## Code References

- `src/components/ResourcePane.tsx:13-51` — the shared pane; prop-only, no load/error handlers, no title prop, iframe keyed on `currentUrlVersion ?? url`. The detection + fallback card lands here.
- `src/components/SessionLifecycle.tsx:467-471` — teacher mount of `ResourcePane`; `resources` (with `title`) in scope at `:125-128`; the teacher `recordEmbedStatus` callback would be wired here following `activate()` (`:182-207`).
- `src/components/StudentSession.tsx:83-87` — student mount of `ResourcePane`; no `sessionResources` query (`:25-31`), so no title source / no write callback (student fallback is local-only).
- `src/lib/sessions.ts:1005-1062` — `buildResourceActivate` / `defaultResourceActivateTxn` / `activateResource`: the builder+txn+wrapper pattern `recordEmbedStatus` / `buildEmbedStatusCheck` must mirror.
- `src/lib/sessions.ts:896-897`, `840-841`, `926-927` — `embedStatus: 'unchecked'` default written at queue time; the `unchecked → blocked/failed` transition target.
- `src/lib/db.ts:88-89` — `sessionResources.embedMode` / `embedStatus` schema fields (already present; no push).
- `src/lib/db.ts:316-577` — `applyEvent` switch; add a `ResourceEmbedChecked` case before the throwing `default` at `:570-575`.
- `src/lib/db.ts:270-284` — `SessionProjection.resources` entry type (currently omits `embedStatus`); the fold target field is absent today.
- `src/lib/db.ts:629-667` — `writeEvent` dual-write choke point + non-empty-`projectionTxns` rule.
- `src/lib/perms.ts:72-91` — `sessionResources` owner-only write rule (open reads); admits the teacher `embedStatus` update; no `perms:push`.
- `src/lib/resources.ts:26-44` — `validateResourceUrl` (URL parsing seam; hostname-fallback source); out of scope to modify.
- `src/lib/sessions.test.ts:1257-1443` and `src/lib/db.test.ts:472-617` — unit-test patterns the new builder/fold tests follow.
- `e2e/activate-resource.spec.ts:1-60`, `e2e/broadcast-resource-url.spec.ts:1-44`, `e2e/support/auth.ts:14-58` — e2e structure, admin observability, skip-loudly convention for the new `blocked-embed-fallback.spec.ts`.
- `AGENTS.md:49-53` — the cycle-0015/0016/0017 data-layer paragraphs documenting the testid conventions, the dual-write pattern, and the "no schema push / no perms:push" wording the cycle-0018 paragraph must follow.

## Open Questions

- **Title resolution in `StudentSession`**: the SPEC §Scope says "a narrowly-scoped active-resource title lookup (open reads permit this)." Whether this is a new `db.useQuery` over `sessionResources` filtered to `session.activeResourceId`, or relying solely on the hostname fallback, is a plan decision — `StudentSession` currently issues no `sessionResources` query (`src/components/StudentSession.tsx:25-31`).
- **Projection fold target for `embedStatus`**: `SessionProjection.resources` entries omit `embedStatus` today (`src/lib/db.ts:270-284`). Whether the `ResourceEmbedChecked` fold adds `embedStatus` to the existing `resources[id]` entry (requiring the projection type to gain the field) or folds onto a different shape is for the plan to settle, consistent with the SPEC's "`applyEvent` folds `ResourceEmbedChecked` into the resources projection."
- **`ResourceEmbedChecked` payload/envelope shape** (which keys: `sessionId`, `resourceId`, `embedStatus`) and whether `buildEmbedStatusCheck` derives the txn as `db.tx.sessionResources[resourceId].update({ embedStatus })` with or without a re-asserted `.link({ session })` — the existing row already carries the link from create (`src/lib/sessions.ts:933`); the plan must confirm the owner-only rule is satisfied by the update txn as written.
- **Named timeout constant value**: the SPEC mandates the load-timeout duration be a named constant but does not fix the millisecond value — a plan decision.
- **Convergence guard placement**: the "do not re-write a resource already at the detected `embedStatus`" guard could live in the builder, the wrapper, or the component callback (against the live `embedStatus` from the `sessionResources` query); the per-resource detection latch is component-local. Plan to decide, consistent with the existing latch pattern (`src/components/SessionLifecycle.tsx:104`).
