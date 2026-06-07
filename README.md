# Richardson Astro Starter Kit

```sh
npm i
npm run dev
```

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── TodoApp.tsx
│   │   └── Welcome.astro
│   ├── layouts/
│   │   └── Layout.astro
│   └── pages/
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |
| `npm run test`            | Run Vitest unit tests                            |
| `npm run test:coverage`   | Run unit tests with a coverage report            |
| `npm run test:e2e`        | Run Playwright e2e (after `test:e2e:install`)    |
| `npm run perms:push`      | Push InstantDB permission rules (fail-loud)      |

## Data Layer & Event Spine

Blended is event-sourced. `src/lib/db.ts` is the single shared module that
initializes the InstantDB client and defines the Blended schema, and exposes
`writeEvent()` — the dual-write convention every session feature builds on. A
call to `writeEvent()` appends a `sessionEvents` envelope **and** applies the
matching projection update in one transaction, so the log stays a complete,
replayable record (see `docs/adr/0001-…` and `docs/adr/0003-…`). The dev-only
`/dev/event-spine` route demonstrates it live across browser windows.

Before deploying against an Instant app with schema enforcement enabled, push
the schema once with `npx instant-cli push schema` — otherwise every
`writeEvent()` transaction is rejected (the rejection surfaces to the caller, it
is not silent).

### Permission rules

Security invariants are enforced at the data layer, not just in the UI:
private student email is readable only by its owner, and only the owning teacher
may mutate a session's state (`sessions` / `sessionResources`), while any
authenticated participant may append to the `sessionEvents` log. The rules live
in `src/lib/perms.ts` (root `instant.perms.ts` is the CLI adapter). After
`push schema`, push them with **`npm run perms:push`** — a fail-loud wrapper
around `npx instant-cli push perms` that exits non-zero with a clear message if
the app id or `instant-cli` auth is missing, and is safe to re-run (declarative).
No new required environment variable is introduced (the e2e-only
`INSTANT_ADMIN_TOKEN`, used by the permissions Playwright suite, is already
documented below).

> **Not yet live.** These rules ship in the repo but are **inert until an
> operator pushes them**. Until `npx instant-cli push schema` and
> `npm run perms:push` have been run against the app (and `e2e/permissions.spec.ts`
> has been run with `INSTANT_ADMIN_TOKEN` set — it skips loudly otherwise),
> email privacy and session-write authorization are enforced by convention only,
> exactly as before this cycle.

Set `PUBLIC_INSTANTDB_APP_ID` in `.env` (copy `.env.example`) — it is the only
required environment variable for the app, used by the Todo demo, the event
spine, and the sign-in gate.

## Sign-in (email magic code)

The app has a working passwordless sign-in gate at **`/login`**. A person enters
their email, receives a magic code, enters it, and lands in a signed-in view
that shows their derived username (email local-part) and a sign-out control. The
signed-in state survives a page reload; sign-out returns to the email form. On
first sign-in exactly one `users` row is created — keyed to the InstantDB auth
user id, `username` = email local-part, `adminLevel: 0` — routed through
`writeEvent()` (idempotent across repeat sign-ins). All auth state flows through
the shared `useAuth` hook (`src/lib/useAuth.ts`); product code never calls
`db.useAuth()` directly.

To exercise it locally: set `PUBLIC_INSTANTDB_APP_ID` in `.env`, push the schema
to your Instant app once (`npx instant-cli push schema`) so `users` writes are
accepted, run `npm run dev`, and visit `/login`.

The Playwright auth suite (`e2e/auth.spec.ts`) needs a deterministic code path,
so it mints codes via the InstantDB **admin** SDK (`generateMagicCode` — no
email sent). Set `INSTANT_ADMIN_TOKEN` (e2e-only; see `.env.example`) before
`npm run test:e2e`; when it is unset the auth suite skips loudly rather than
passing falsely.

## Protected routes (route guarding)

Protected destinations now require sign-in. A logged-out visitor who opens a
protected route is bounced to **`/login`** with the destination remembered, and
**after signing in lands back on the exact page they originally requested** —
including a deep link such as `/dashboard/sessions/<id>`, whose id is preserved
across the round-trip. A signed-in visitor opening `/login` with no destination
is routed to **`/dashboard`**. Opening an ownership-scoped route you are not
permitted to view (another teacher's session) shows a graceful "you don't have
access" denial rather than the protected content.

This cycle ships only the guard and thin placeholder shells (`/dashboard`,
`/dashboard/sessions/[id]` carry a heading and a `data-testid` — the real
screens are later cycles). The intended-destination round-trip is open-redirect
safe: a crafted `?next=` pointing off-origin (`//evil`, `https://evil`, …) is
discarded and falls back to `/dashboard`. The route-guard e2e suite
(`e2e/route-guarding.spec.ts`) reuses `INSTANT_ADMIN_TOKEN` and skips loudly
when it is unset.

## Creating a session

Signed-in users can now create a session from the dashboard. On `/dashboard`,
click **New session**, enter a title, and submit — a real session is created in
`draft` status, owned by you, with a generated, hard-to-guess **join code** shown
back on screen immediately (no navigation away). Creating a session is what makes
you its teacher — there is no special account type; any signed-in user can create
one. A blank or whitespace-only title is rejected inline and creates nothing. The
join code is a shareable bearer token for the (later) join-via-link flow.

## Starting and ending a session

A created `draft` session is no longer a dead end. From the post-create card,
click **Open session** to reach its detail page (`/dashboard/sessions/[id]`,
owner-only). There the owning teacher sees the session's current **status** and
its **join** state, and can run it through its real lifecycle:

- Click **Start session** — the status becomes `live` and the page shows that
  joining is now **enabled** (the join code is presented as active), so students
  would be able to join.
- Click **End session** — the status becomes `ended` and live participation is
  **closed** (join disabled).

Only `draft → live` (start) and `live → ended` (end) are permitted (SPEC §6.2);
any illegal or stale transition (e.g. ending a session that is not live) is
rejected with an inline error and the status is left unchanged — no half-applied
transition. Each transition appends a `SessionStarted` / `SessionEnded` event
alongside the projection update in a single write, so a rejected transition
leaves no partial state.

## Joining a session

Students can now join a **live** session via its link and land in the session
view. Open a teacher-shared link `/join/<joinCode>`: if you are not signed in you
are bounced to `/login` and returned to the link after entering a magic code. On a
live session you are added as a participant and routed to the student session view
`/s/<joinCode>`, which **live-syncs**: a student who joins *after* others
immediately sees the session's current shared state (its live status and the set
of present participants) with no manual refresh. Your display name is your email
**local-part only** — participant rows never store or show your email.

Joining is **idempotent**: reloading or re-opening the link as an already-joined
student routes you straight in without creating a second participant. Opening a
link for an **unknown** session shows a clear "session not found" state, and a link
for a **non-live** (draft or ended) session shows a "this session isn't open"
state — neither creates a participant. A failed join surfaces inline rather than
silently appearing to succeed, and leaves no partial participant row.

Behind the scenes the `participants` permission rules are now **owner-scoped**
(closing a former fail-open hole): a signed-in user can only create/update/delete
a participant row they own, or the owning teacher can (checked against a
forgery-proof parent-session link). The join e2e suite is
`e2e/join-via-link.spec.ts` (multi-context late-joiner + failure legs; skips
loudly when admin env is unset).

## Chatting in a session

Once you have joined a **live** session, the student view `/s/<joinCode>` now has
a single chat box: type a message, press **Send**, and it appears in your stream —
and in every other student's stream — in realtime, with no reload. A student who
opens the link *after* messages were posted sees the prior history. There is one
plain text input and no message-type picker: you just write naturally. A blank or
whitespace-only message is rejected inline and writes nothing; sending the same
message twice (e.g. a double-click) still produces exactly one message. Your
display name in the stream is your email **local-part only** — messages never store
or show your email.

**Teachers do not see this raw chat stream.** The teacher facilitation view
(`/dashboard/sessions/<id>`) renders no chat box and no message list by design —
teachers work from curated Questions (a later cycle), not by reading every message.

Each send writes both a replayable `ChatMessageSubmitted` event and a `messages`
projection row in one transaction, de-duplicated by a client action id. The chat
e2e suite is `e2e/student-chat.spec.ts` (realtime, late-joiner, teacher-exclusion,
dual-write, idempotency, and blank-failure legs; skips loudly when admin env is
unset). The schema gains `messages.clientActionId` + a `messageSession` link this
cycle — push it once with `npx instant-cli push schema` before the feature works
against a schema-enforced live app (no new `.env` keys).

**Asking a question.** A chat message whose text ends with `?` (e.g. "what is
mitosis?") now *also* becomes a **Question** — a distinct, teacher-facing
participation unit linked back to your message — while a casual message ("ok
thanks") stays chat-only. This is the durable object teachers will work from
(their queue view arrives in a later cycle, so nothing new is shown to you yet).
The decision lives behind one swappable function (`classifyMessage`,
`src/lib/classify.ts`): today an interim trailing-`?` heuristic, later an AI call.
Re-sending the same message never creates a duplicate Question, and the Question
stores no email. This adds three additive schema links
(`questionMessage`/`questionParticipant`/`questionSession`) — push them once with
`npx instant-cli push schema` before the feature works against a schema-enforced
live app (no new `.env` keys). The e2e suite is `e2e/auto-create-question.spec.ts`.

### Known limitations

- The `useAuth` integration path (island → hook → InstantDB auth → keyed
  `users` upsert) is verified only by the Playwright auth suite, which skips
  until `INSTANT_ADMIN_TOKEN` and a pushed live schema are provisioned. Until
  then this path has no runnable gate; the pure decision logic in
  `src/lib/auth.ts` is unit-covered, but the runtime creation/retry effect is
  not.
- First-sign-in `users`-row creation is fail-safe but **silent** on a
  projection-query error: if the `users` lookup in `useAuth` errors, the row is
  not created (avoiding a duplicate/partial write) and no signal is currently
  surfaced or logged, so a persistent query failure can leave a signed-in user
  without a `users` row. Downstream username/role reads should not assume the
  row always exists.
- Route guarding is **client-side only** — protected pages render an SSR shell
  that hydrates and then decides, so there is no server/middleware protection
  and the guarded content is gated only after `useAuth` resolves in the browser.
  Until that point the guard shows `route-guard-loading` rather than redirecting.
- The session-creation **dual-write and observability path** is exercised only
  by the `e2e/create-session.spec.ts` happy-path/observability specs, which skip
  (loudly, but green) when `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are
  unset. Without admin env provisioned, the real `db.transact` write and the
  cycle-0003 permission rules have no runnable gate, so a regression there can
  pass CI as a false green until the credentials are wired in.
- The session **lifecycle** dual-write, live status reflection, and join-gate
  affordance are exercised end-to-end only by `e2e/session-lifecycle.spec.ts`,
  which skips (loudly, but green) when `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID`
  are unset. The pure lifecycle core (`assertLegalTransition`, the builders,
  `isJoinEnabled`, the `applyEvent` fold) is fully unit-covered, but the live
  `startSession`/`endSession` write and the cycle-0003 owner-only rule backstop
  have no runnable gate until admin env is provisioned.
- Both **Start** and **End** controls are shown on the detail page; clicking the
  one that is not legal for the current status is intentionally rejected by the
  transition guard with an inline error (it is how the failure path is observed),
  rather than being hidden.
- The **student join** dual-write, live late-joiner sync, and the owner-scoped
  `participants` rule backstop are exercised end-to-end only by
  `e2e/join-via-link.spec.ts`, which skips (loudly, but green) when
  `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are unset. The pure join core
  (`buildParticipantJoin`, `shouldCreateParticipant`, `joinSession`) is fully
  unit-covered, but the live `writeEvent` join and the data-layer rule have no
  runnable gate until admin env is provisioned.
- Join **idempotency** rests on a live-query precheck plus an `inFlight` latch
  (the same posture as first-sign-in `users`-row creation), so a narrow
  double-submit race could in principle create two participant rows before the
  precheck observes the first; this is accepted for the MVP. `ParticipantLeft` /
  presence-heartbeat / `lastSeenAt` updates are out of scope, so the presence set
  only grows for now.
- The generated **join code** carries a slight modulo bias: `generateJoinCode`
  reduces each random byte mod the 31-char alphabet (`256 % 31 = 8`), so indices
  0–7 are marginally more likely than 8–30. The source is still a CSPRNG and the
  code stays unguessable (~49 bits); rejection sampling would make the
  distribution provably uniform if a future cycle needs it.
- **Chat messages still run under the permissive `$default` rule.** This is the
  first cycle to write real `messages` rows, but the entity is not yet covered by
  a scoped permission rule (`src/lib/perms.ts`), so every operation is open: any
  client (including unauthenticated) can read every session's chat, create a
  message spoofing another `participantId`, and edit or delete other students'
  messages. Open cross-student reads are needed for the realtime stream, but
  write/delete were never meant to stay open once rows exist. The `messageSession`
  link was added this cycle precisely to enable a participant/owner-scoped rule;
  it should be tightened (scope `create` to the owning participant; `update` /
  `delete` to the row owner + owning teacher/admin; keep reads open) and pushed
  with `npm run perms:push` before later cycles build on `messages`.

## Resources

### Fonts

All fonts are installed via NPM from Fontsource. https://fontsource.org/

1. Import fonts at the top of your Astro Layout file eg: `src/layouts/Layout.astro`
2. Add CSS classes to your Astro global css file eg: `src/styles/global.css`

### Components

This project intentionally is setup to use ARIA-tested components as a base from https://ariakit.org/

Secondarily, components from DaisyUI https://daisyui.com/ should be used where pure-tailwind components are sufficient. DaisyUI also allows a mechanism for themeability that we use to create custom themes for our clients and users.

In the case other components are needed, feel free to use Radix and ShadCn components, ensuring that your implementation of them fits with the accessibility standards of the project, and the general look-and-feel and themeable nature that DaisyUI allows.


