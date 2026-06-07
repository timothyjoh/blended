# Research: Cycle 0008

## Cycle Context
SPEC.md asks for the student-chat vertical slice: a single natural-text input on the student session view (`/s/:joinCode`) that, on submit of non-blank text, performs an idempotent dual-write (a `ChatMessageSubmitted` `sessionEvents` envelope **and** a `messages` projection row) through `writeEvent()` in one transaction, de-duplicated by a client action id; a realtime-syncing student chat stream that includes late-joiner history; a new `applyEvent` fold case for `ChatMessageSubmitted`; the schema delta (`messages.clientActionId` field + a `messageSession` link); and the deliberate exclusion of that stream/input from the teacher facilitation view (`/dashboard/sessions/:id`). It explicitly mirrors the existing `joinSession` / `buildParticipantJoin` pure-core/thin-wrapper split.

## Current Codebase State

### Relevant Components
- Data spine / schema / `writeEvent` / `applyEvent`: `src/lib/db.ts` — single source of the InstantDB client, the eight-entity `i.schema`, the dual-write choke point, and the in-memory fold.
- `messages` entity (current shape): `src/lib/db.ts:107` — fields `sessionId` (indexed), `participantId`, `text`, `visibility`, `classificationStatus`, `createdAt`. **No `clientActionId` field; no `messageSession` link** exists yet (`links` block has only `sessionResourceSession` and `participantSession`, `src/lib/db.ts:131`-`148`).
- `Message` type export: `src/lib/db.ts:165` (`InstaQLEntity<typeof schema, 'messages'>`).
- Session action module (where `submitChatMessage` / `buildChatMessage` will live): `src/lib/sessions.ts` — already holds `createSession`, lifecycle, and the join path; the join slice (`src/lib/sessions.ts:296`-end) is the closest template.
- Student session view island (mount point for the chat island): `src/components/StudentSession.tsx` — read-only live-syncing presence surface on `/s/[joinCode]`.
- Student session page shell: `src/pages/s/[joinCode].astro` — mounts `StudentSession` inside `RouteGuard` (`client:only="react"`), passes `joinCode`.
- Teacher facilitation view (must render NO chat stream/input): `src/components/SessionLifecycle.tsx`, mounted by `src/pages/dashboard/sessions/[id].astro` inside `SessionRouteGuard`.
- Auth/identity seam: `src/lib/useAuth.ts` — sole auth hook; `deriveUsername` / `IDENTITY_SCOPE` / `shouldCreateUserRow` in `src/lib/auth.ts`.
- Permission rules: `src/lib/perms.ts` — `messages` currently falls under the permissive `$default` (`src/lib/perms.ts:26`); no dedicated `messages` rule exists.

### Existing Patterns to Follow
- **Pure-core / thin-wrapper split** (the template the SPEC names): `buildParticipantJoin` (pure, totally validates, returns `{ record, meta }`) + `joinSession` (thin async wrapper, routes one `writeEvent` call, injectable `deps`) — `src/lib/sessions.ts:332`-`360` (builder), `src/lib/sessions.ts:419`-end (wrapper). `createSession`/lifecycle follow the same shape earlier in the file.
- **Deterministic projection id == payload id, for clean folding**: `buildParticipantJoin` keeps `participantId === record.id === meta.payload.participantId` (`src/lib/sessions.ts:347`-`358`). The SPEC asks the `messages` row id to be derived deterministically from the client action id, mirroring this (`participantId === record.id`).
- **Total pre-validation before any plan/txn**: builders trim and reject blank/missing input by throwing synchronously BEFORE producing a plan (`buildParticipantJoin` rejects missing `sessionId`/`userId`/blank `username`, `src/lib/sessions.ts:333`-`345`; `buildSessionCreate` rejects blank title, `src/lib/sessions.ts:75`-`78`).
- **Projection txn builder sets the ownership link**: `defaultParticipantTxn` calls `db.tx.participants[id].update({...}).link({ session: r.sessionId })` (`src/lib/sessions.ts:395`-`416`) — the pattern the new `messageSession` link write would follow.
- **Dual-write envelope contract**: `writeEvent(type, meta, projectionTxns)` appends a `sessionEvents` row + applies projection txns in one `db.transact()`; requires a non-empty `projectionTxns` array; validates `type`, `sessionId`, `actor.role` (must be in `ACTOR_ROLES`), integer `schemaVersion` before any transaction (`src/lib/db.ts:331`-`405`). Envelope `actor.role` for student writes is `'student'`.
- **`applyEvent` fold**: a `switch (event.type)` with one `case` per known type, each returning a new projection (pure, no mutation), tolerating absent prior state; the `default` throws `UnknownEventTypeError` (`src/lib/db.ts:213`-`280`). Adding `ChatMessageSubmitted` means a new `case` (note: the current `SessionProjection` shape — `src/lib/db.ts:178` — has `session` + `participants` only, no `messages` map).
- **Idempotency gate pattern**: `shouldCreateParticipant({ authUserId, participantsLoaded, existingCount, inFlight })` — pure, returns true only when authed + query loaded + `existingCount === 0` + not in flight (`src/lib/sessions.ts:368`-`377`); the island couples it with an `inFlight` ref latch and a live count query keyed on (session, user) (`src/components/JoinSession.tsx`). `shouldCreateUserRow` in `src/lib/auth.ts:47` is the older sibling. Deterministic keyed-upsert ids make the write itself idempotent even under a race (`src/lib/useAuth.ts` comment, lines ~58-62).
- **Failure handling**: builders throw synchronously and write nothing on bad input; wrappers do NOT catch (rejection propagates, never swallowed) — `joinSession` (`src/lib/sessions.ts:419`-end). Islands catch at the UI edge: a `surface(err)` helper sets an inline `role="alert"` message AND `console.error`s, never swallowing — `JoinSession.tsx:50`-`54`, `SessionLifecycle.tsx:37`-`41`. Query errors are logged via `console.error` and rendered as a non-blank error state (`StudentSession.tsx:23`-`46`). Atomic dual-write means a rejected submit leaves no partial state (no orphan event/row).
- **Observability conventions**: structured interaction events are the `sessionEvents` envelopes themselves (every mutation appends one via `writeEvent`); there is no separate metrics layer. UI-edge errors go to `console.error` with a bracketed component tag (e.g. `[JoinSession]`, `[SessionLifecycle]`, `[StudentSession]`). E2e observability is admin-read assertions via `queryAdmin` (`e2e/support/auth.ts`).
- **Idempotency / retry-safety mechanisms present**: `shouldCreateParticipant` + `inFlight` ref + deterministic keyed ids (join); `assertLegalTransition` fed current status as the stale-tab guard (lifecycle); `shouldCreateUserRow` (identity). `writeEvent` itself is explicitly NOT idempotent (`src/lib/db.ts:319`-`321`) — dedup is the caller's responsibility.
- **Testid convention**: stable `data-testid`s are fixed per cycle and reused downstream (e.g. `student-session-root`, `student-session-presence-item`, `session-status`, `session-join-state`). SPEC pins new ones: `student-chat-root`, `student-chat-input`, `student-chat-send`, `student-chat-stream`, `student-chat-message-item`, `student-chat-error`.
- **Astro mount convention**: islands are `client:only="react"` inside a guard; the route param is passed straight through, defaulting to `''` (`src/pages/s/[joinCode].astro`).

### Dependencies & Integration Points
- `writeEvent`, `applyEvent`, `id`, schema types — `src/lib/db.ts` (imported by `src/lib/sessions.ts:1`).
- `isJoinEnabled(session)` — sole join/live gate, `true` only when `status === 'live'` (`src/lib/sessions.ts` `isJoinEnabled`); chat input gating must derive from this.
- `useAuth()` — identity (`user.id`, `username`); product code must not call `db.useAuth()` directly (`src/lib/useAuth.ts`).
- `deriveUsername` (email local-part, SPEC §12.3) — `src/lib/auth.ts:35`.
- Participant resolution: a submitter must be a joined participant with `chatStatus: 'allowed'`; the participant row is produced by `joinSession` (`participants` keyed by (sessionId, userId), `role: 'student'`, `chatStatus: 'allowed'` — `src/lib/sessions.ts:325`-`358`). The student view currently queries participants by `sessionId` only (`StudentSession.tsx:18`-`21`); resolving the caller's own `participantId` (the SPEC's `messages.participantId`) requires a (session, user) query like `JoinSession.tsx:32`-`37`.
- Permission rules: `messages` currently sits under `$default` (`view/create/update/delete = 'true'`, `src/lib/perms.ts:26`); SPEC notes a `messages` rule MAY be added and pushed with `npm run perms:push`. `sessionEvents.create = 'auth.id != null'` already permits the envelope append (`src/lib/perms.ts:83`-`88`).
- Schema push requirement: the `messages.clientActionId` field + `messageSession` link must be pushed with `npx instant-cli push schema` before the feature works live (SPEC Dependencies).
- Existing student-chat mockup (NOT product code, presentation only): `src/components/mockups/StudentChatMockup.tsx` — a static design reference, not wired to the spine.

### Test Infrastructure
- **Test framework**: Vitest for pure logic (`npm run test` CI mode, `:watch`, `:coverage`); Playwright for e2e (`npm run test:e2e`, own dev server on port 4399, `retries: 3`). `npm run astro check` for type/lint. (`AGENTS.md` Testing Guidelines; `playwright.config.ts:10`,`13`,`25`-`27`.)
- **Test conventions**: unit specs live beside the module as `*.test.ts` (`src/lib/sessions.test.ts`, `src/lib/db.test.ts`); e2e specs in `e2e/<feature>.spec.ts`. Pure builders are tested with injected `deps` (a fake `write` that records calls, a stub `buildTxn`) so no network is touched — see `joinSession wrapper` tests (`src/lib/sessions.test.ts:421`-end). `applyEvent` is tested with `EventLike` fixtures + `emptyProjection` (`src/lib/db.test.ts:38`-`100`).
- **Current coverage of the change area**: none for chat yet (no `messages`/`ChatMessageSubmitted`/`submitChatMessage`/`buildChatMessage`/`StudentChat` references exist in `src/` or `e2e/` product/test code — only the static mockup and a `pitch.astro` mention). The closest existing coverage is the join slice: `buildParticipantJoin` (`src/lib/sessions.test.ts:323`-`401`), `shouldCreateParticipant` (`:404`-`419`), `joinSession` wrapper (`:421`-end), the `ParticipantJoined` fold (`src/lib/db.test.ts:79`-`88`), and `UnknownEventTypeError` (`src/lib/db.test.ts:96`-`98`).
- **Failure-path test coverage (existing, to mirror)**: blank/missing-input rejection (`it.each([null, undefined, ''])` over `sessionId`/`userId`/`username`, `src/lib/sessions.test.ts:378`-`391`); rejected-write propagation (`src/lib/sessions.test.ts:441`-`447`); invalid-input rejects before `write` is called (`src/lib/sessions.test.ts:449`-end); unknown-event-type throws (`src/lib/db.test.ts:96`-`98`). E2e failure legs (unknown code / draft session write nothing, asserted via `queryAdmin`) in `e2e/join-via-link.spec.ts`.
- **E2e helpers to reuse**: `e2e/support/auth.ts` — `adminAvailable()` (gate `test.skip`), `signInViaUi(page, email)`, `freshEmail()`, `mintCode(email)`, and `queryAdmin(query)` (Node-side admin read for count/observability assertions). Multi-context A/B/C/D pattern (teacher creates+starts, students join, late-joiner sync, idempotent reload) is established in `e2e/join-via-link.spec.ts`; `e2e/student-chat.spec.ts` is the SPEC-named new spec.

## Code References
- `src/lib/db.ts:107` — `messages` entity definition (no `clientActionId`, no link) — the schema-delta site.
- `src/lib/db.ts:131`-`148` — `links` block (`sessionResourceSession`, `participantSession`); the `messageSession` link would be added here mirroring `participantSession`.
- `src/lib/db.ts:178` — `SessionProjection` type (currently `session` + `participants` only).
- `src/lib/db.ts:213`-`280` — `applyEvent` switch; `ParticipantJoined` case at `:251`-`270`; `default` throws `UnknownEventTypeError` at `:276`. New `ChatMessageSubmitted` case goes here.
- `src/lib/db.ts:331`-`405` — `writeEvent` dual-write helper (validation + single `db.transact`).
- `src/lib/sessions.ts:323`-`360` — `ParticipantRecord` type + `buildParticipantJoin` (the pure-builder template).
- `src/lib/sessions.ts:368`-`377` — `shouldCreateParticipant` (idempotency-gate template).
- `src/lib/sessions.ts:395`-`416` — `defaultParticipantTxn` (`.update(...).link({ session })`, the projection-txn-with-link template).
- `src/lib/sessions.ts:419`-end — `joinSession` thin wrapper (single `writeEvent` call, injectable `deps`).
- `src/lib/sessions.ts` `isJoinEnabled` — the live gate the chat input must respect.
- `src/components/StudentSession.tsx:16`-`90` — student view island; participants query at `:18`-`21`, render at `:67`-`88`; the chat island mounts alongside on `/s/[joinCode]`.
- `src/components/JoinSession.tsx:32`-`37` — (session, user)-keyed participant probe pattern (resolving the caller's own participant row).
- `src/components/SessionLifecycle.tsx` — teacher facilitation island (must remain chat-free); error-surface helper at `:37`-`41`.
- `src/pages/s/[joinCode].astro` — student page shell (island mount).
- `src/pages/dashboard/sessions/[id].astro` — teacher detail shell.
- `src/lib/perms.ts:26` — `$default` rule currently covering `messages`; `:102`-`110` — `participants` owner-scoped rule (template if a `messages` rule is added).
- `src/lib/sessions.test.ts:323`-end — join-slice unit tests (builder/gate/wrapper templates).
- `src/lib/db.test.ts:38`-`100` — `applyEvent` fixtures + fold/unknown-type tests.
- `e2e/join-via-link.spec.ts` — multi-context e2e template (A/B/C late-joiner + failure legs + `queryAdmin` observability).
- `e2e/support/auth.ts` — `signInViaUi`, `freshEmail`, `mintCode`, `queryAdmin`, `adminAvailable`.

## Open Questions
- **`SessionProjection` shape for the fold**: `applyEvent`'s `SessionProjection` (`src/lib/db.ts:178`) currently has no `messages` collection. Should the `ChatMessageSubmitted` fold add a `messages` map to the projection (extending the type + `emptyProjection`), or fold into an existing field? The plan must decide how the fold represents a chat message so `rebuildSessionProjection` reproduces the stream without breaking existing `applyEvent`/`rebuild` tests.
- **`messages` permission rule**: SPEC says a `messages` rule MAY be added (`messages` currently under permissive `$default`). The plan should decide whether to tighten `messages` write/read this cycle (and push via `npm run perms:push`) or leave it under `$default` for now — and, if tightened, whether a `messageSession`-link-based owner/participant check is required.
- **Client action id source**: the SPEC requires a client action id that de-dups double-submits and from which the `messages` row id is deterministically derived. The plan must specify where the id is minted (per keystroke-session vs. per-submit) and how a retry of the *same* logical submit reuses it, so a double-fire collapses to one keyed-upsert row.
- **Participant resolution on the chat island**: the chat submit needs the caller's own `participantId`. The plan should confirm whether to resolve it via a (session, user) participants query on the chat island (as `JoinSession` does) and how to behave when the user is not yet a participant (`chatStatus`/eligibility gating).
