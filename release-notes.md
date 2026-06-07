# Release Notes

## Cycle 0014 — Chat messages: author-scoped writes, spoof-proof identity

- **A student's chat messages can no longer be edited, deleted, or impersonated
  by another student or an unauthenticated client.** Until now the `messages`
  entity was governed by a fully-open permission rule — every operation was
  permitted for everyone. This cycle replaces it with an explicit, forgery-proof
  rule enforced at the data layer (not just hidden in the UI): you can only post
  a message under your own identity, and only the message's author or the
  session's owning teacher can subsequently edit or delete it. An attempt by
  anyone else — including a hand-crafted client — is rejected by InstantDB.
- **Live cross-student chat is unchanged.** Reads stay open by design, so every
  joined student still sees the whole class's messages stream in live; a denied
  write degrades to "message not posted/changed" and never breaks the stream for
  others.
- **Under the hood:** a new `messageParticipant` link makes each message's author
  traversable so the rule verifies ownership against the real linked participant
  (and that the stored `participantId` matches it) rather than trusting a
  client-supplied field. Deploying the change is an additive
  `npx instant-cli push schema` (the link) followed by `npm run perms:push` (the
  tightened rules). `questions` and `endorsements` remain the open namespaces,
  pending their own follow-ups.

## Cycle 0010 — Teacher question queue + mark answered

- **New: teachers can now see student questions live and mark them answered.**
  On the session facilitation view (`/dashboard/sessions/<id>`), below the
  lifecycle controls, a teacher running a live session sees a realtime queue of
  **open Questions only** — every `?`-derived Question a student asks appears in
  the queue with no reload. Each row shows the question text and a control to
  mark it answered, with an optional summary field; resolving a Question makes it
  disappear from the queue immediately. When the queue is empty an explicit
  empty-state message is shown. This closes the core teacher loop — see what's
  being asked, resolve it, move on — and is the first surface where the `Question`
  object created in cycle 0009 has a human consumer.
- **The queue shows Questions, never the raw chat.** The teacher view still
  mounts no chat island (SPEC §9.3): the queue reads only `questions`, reaching
  each question's text strictly through its source-message link, so an ordinary
  (non-`?`) chat message never appears.
- **One sanctioned resolution path.** Marking answered routes through
  `answerQuestion` → a replayable `QuestionAnswered` event dual-written with the
  `questions` projection update (`status: 'answered'`, the teacher's id as
  `addressedBy`, and the trimmed `answerSummary` when supplied) in a single
  transaction — so a rejected answer leaves no partial state and the Question
  stays in the queue to retry. A failed query or write surfaces inline and is
  logged, never silently dropped.
- New unit coverage in `src/lib/sessions.test.ts` (builder + wrapper, validation
  and failure-path rejections) and `src/lib/db.test.ts` (the `QuestionAnswered`
  fold + determinism), plus a new e2e suite `e2e/teacher-question-queue.spec.ts`
  (student asks → teacher sees → mark answered, with admin-side observability;
  skips loudly when admin env is unset).
- **Migration / verification:** no schema change (the `questions` fields already
  exist) and no permission change this cycle — **no `npx instant-cli push schema`
  and no `perms:push` required.** No new env/config keys.

## Cycle 0009 — Auto-create a Question from messages ending in "?"

- **New: a chat message ending in `?` now becomes a Question.** When a student
  sends a message whose trimmed text ends with `?` (e.g. "what is mitosis?"), the
  app now also creates a teacher-facing `Question` — a distinct participation unit
  linked back to the originating message and the author participant — and appends a
  replayable `QuestionCreated` event to the session timeline. A casual message
  ("ok thanks") stays chat-only and creates no Question. This is the first cycle
  that produces the `Question` object the teacher-facing half of the product is
  built around. (`src/lib/classify.ts`, `src/lib/sessions.ts`, `src/lib/db.ts`)
- **One swappable classification seam.** The decision lives behind a single pure
  function, `classifyMessage` (`src/lib/classify.ts`) — today an interim, AI-free
  trailing-`?` heuristic, designed so a later cycle can swap in AI classification
  by editing only that function. The `questions` row id is derived deterministically
  from the source message id, so re-sending the same logical message never creates a
  duplicate Question. The row carries **no email** by design.
- **No teacher-facing Question UI yet.** Questions are created but not yet rendered
  to the teacher — that is a subsequent cycle. Permissions are unchanged
  (`messages`/`questions` stay under the permissive default).
- New unit coverage in `src/lib/classify.test.ts`, `src/lib/sessions.test.ts`, and
  `src/lib/db.test.ts`, plus a new e2e suite `e2e/auto-create-question.spec.ts`
  (a `?` message creates one linked Question + event; a non-`?` message stays
  chat-only; skips loudly when admin env is unset).
- **Migration / verification:** the schema gains three additive links
  (`questionMessage`, `questionParticipant`, `questionSession`) — run
  `npx instant-cli push schema` before the feature works against a schema-enforced
  live app. No new env/config keys; no `perms:push` this cycle.

## Cycle 0007 — Student joins via link and becomes a participant

- **New: students can now join a live session via its link and land in the
  session view.** A student opens a teacher-shared join link (`/join/<joinCode>`),
  signs in with a magic code if needed (returning to the link), and — on a `live`
  session — is added as a participant and routed to the student session view
  (`/s/<joinCode>`). A student who joins *late* immediately sees the session's
  current shared state (its live status and the set of present participants), with
  no manual refresh — proving real-time late-joiner sync. (`src/lib/sessions.ts`,
  `src/components/JoinSession.tsx`, `src/components/StudentSession.tsx`,
  `src/pages/join/[joinCode].astro`, `src/pages/s/[joinCode].astro`)
- **One sanctioned join path, idempotent per (user, session).** Joining routes
  exclusively through `joinSession` → `writeEvent('ParticipantJoined', …)`,
  committing the event and the `participants` row in one transaction; reloading or
  re-opening the link never creates a second participant row. The display name is
  the email **local-part only** — participant rows carry **no email** by design.
- **Clear failure states.** An unknown link shows a non-blank "session not found"
  state and a non-live (draft/ended) session shows a "this session isn't open"
  state — neither creates a participant.
- **Security: the `participants` permission rules are now owner-scoped**, closing
  the former fail-open hole before any participant rows exist — a signed-in user
  can no longer create/update/delete a participant row they don't own (own row, or
  the owning teacher via a forgery-proof parent-session link).
- **Reused testids for downstream cycles:** `join-root`, `join-loading`,
  `join-not-found`, `join-not-open`, `join-error`, `student-session-root`,
  `student-session-status`, `student-session-presence`,
  `student-session-presence-item`.
- New unit coverage in `src/lib/sessions.test.ts` / `src/lib/perms.test.ts` and a
  new e2e suite `e2e/join-via-link.spec.ts` (multi-context late-joiner + failure
  legs; reuses `queryAdmin`, skips loudly when admin env is unset). Schema gains a
  `participantSession` link; no new env/config keys.

## Cycle 0006 — Teacher starts / ends a session (lifecycle)

- **New: run a session through its lifecycle.** From a session's detail page
  (`/dashboard/sessions/[id]`, owner-only), the teacher can click **Start** to
  move a `draft` session to `live` — opening the join gate (the join code is
  presented as active) — and **End** to move a `live` session to `ended`, closing
  live participation. Reached from the post-create card's new **Open session**
  link. (`src/lib/sessions.ts`, `src/components/SessionLifecycle.tsx`,
  `src/pages/dashboard/sessions/[id].astro`, `src/components/NewSession.tsx`)
- **Legal-transition guard (SPEC §6.2).** Only `draft → live` and `live → ended`
  are permitted; any illegal or stale transition is rejected inline with no
  half-applied state and the displayed status unchanged. Transitions route
  exclusively through `writeEvent('SessionStarted'/'SessionEnded', …)`, appending
  the event and updating the `sessions` projection (status + `startedAt`/`endedAt`)
  in one transaction; `applyEvent` folds the two new events so the log still
  rebuilds the projection. `isJoinEnabled` is the sole join gate (true only when
  `live`).
- **Reused testids for downstream cycles:** `session-start`, `session-end`,
  `session-status`, `session-join-state`, `session-lifecycle-error`,
  `created-session-link`.
- New unit coverage in `src/lib/sessions.test.ts` / `src/lib/db.test.ts` and a new
  e2e suite `e2e/session-lifecycle.spec.ts` (reuses `queryAdmin`; skips loudly
  when admin env is unset). No new env/config keys.

## Cycle 0005 — Teacher creates a session (draft)

- **New: create a session from the dashboard.** A signed-in user can open
  `/dashboard`, click **New session**, enter a title, and create a real `draft`
  session they own — reflected back on screen immediately with its status and a
  generated, unguessable **join code**. Creating a session is what makes a user
  its teacher (session-scoped role, no account type). (`src/lib/sessions.ts`,
  `src/components/NewSession.tsx`, `src/pages/dashboard/index.astro`)
- **Single write path preserved.** Creation routes through
  `writeEvent('SessionCreated', …)`, so the event envelope and the `sessions`
  projection commit in one transaction; a rejected create leaves no partial
  state. A blank/whitespace title is rejected inline and writes nothing.
- **Reused testids for downstream cycles:** `new-session-open`,
  `new-session-title`, `new-session-submit`, `new-session-error`,
  `created-session`, `created-session-title`, `created-session-status`,
  `created-session-joincode`.
- New unit suite `src/lib/sessions.test.ts` and e2e suite
  `e2e/create-session.spec.ts` (adds the `queryAdmin` admin-read helper; reuses
  `INSTANT_ADMIN_TOKEN`, skips loudly when unset). No new env vars.

## Cycle 0004 — Route guarding + role-aware routing

- **New: client-side route guard.** Protected routes now require sign-in. A
  logged-out visit to a protected route bounces to `/login` with the intended
  destination remembered (`?next=…`), and after sign-in returns the user to that
  exact page — including a deep link like `/dashboard/sessions/<id>` (id
  preserved). A signed-in `/login` load with no target lands on `/dashboard`.
  (`src/components/RouteGuard.tsx`, `src/lib/routing.ts`, redirect added to
  `src/components/AuthGate.tsx`)
- **New: ownership-scoped denial.** Opening a session you don't own renders a
  graceful "you don't have access" state instead of the protected shell
  (`src/components/SessionRouteGuard.tsx`, authorized via
  `sessions.teacherId == user.id`).
- **Open-redirect safe.** `safeNextPath` honors only same-origin absolute paths;
  a crafted `?next=//evil` / `https://evil` / empty falls back to `/dashboard`.
- **New placeholder routes** (thin shells only; real screens are later cycles):
  `/dashboard` and `/dashboard/sessions/[id]`.
- **Reused testids for downstream cycles:** `route-guard-loading`,
  `route-guard-denied`, `dashboard-root`, `session-root`.
- New e2e suite `e2e/route-guarding.spec.ts` (reuses `INSTANT_ADMIN_TOKEN`;
  skips loudly when unset). No new env vars.

## Cycle 0002 — Email magic-code authentication

- **New: email magic-code sign-in gate** at `/login`. Email → code → signed-in
  view (shows the derived username, never the raw email) → sign-out. Session
  persists across reload. (`src/components/AuthGate.tsx`, `src/pages/login.astro`)
- **New: shared `useAuth` hook** (`src/lib/useAuth.ts`) — the single app-wide
  auth seam. Product code must not call `db.useAuth()` directly.
- First sign-in creates exactly one `users` row keyed to the InstantDB auth user
  id (`username` = email local-part, `adminLevel: 0`), routed through
  `writeEvent()` under the reserved `IDENTITY_SCOPE` sentinel — idempotent across
  repeat sign-ins.
- **New env var (e2e-only): `INSTANT_ADMIN_TOKEN`.** Used by the Playwright auth
  suite to mint deterministic magic codes via `@instantdb/admin` (no email
  sent). Never used by client/product code. When unset, `e2e/auth.spec.ts` skips
  loudly. Added `@instantdb/admin` as a devDependency. See `.env.example`.
