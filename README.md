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

## Resources

### Fonts

All fonts are installed via NPM from Fontsource. https://fontsource.org/

1. Import fonts at the top of your Astro Layout file eg: `src/layouts/Layout.astro`
2. Add CSS classes to your Astro global css file eg: `src/styles/global.css`

### Components

This project intentionally is setup to use ARIA-tested components as a base from https://ariakit.org/

Secondarily, components from DaisyUI https://daisyui.com/ should be used where pure-tailwind components are sufficient. DaisyUI also allows a mechanism for themeability that we use to create custom themes for our clients and users.

In the case other components are needed, feel free to use Radix and ShadCn components, ensuring that your implementation of them fits with the accessibility standards of the project, and the general look-and-feel and themeable nature that DaisyUI allows.


