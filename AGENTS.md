# Repository Guidelines

## Project Structure & Module Organization
`src/` holds application code: page shells live in `src/pages`, shared UI in `src/components`, layout wrappers in `src/layouts`, domain logic and utilities in `src/lib`, and styling tokens in `src/styles`. Content collections (e.g., blog posts) live in `src/content`, while long-form references sit under `docs/`. Static assets ship from `public/`, and Tailwind configuration is centralized in `components.json`.

## Build, Test & Development Commands
Use `npm install` to sync dependencies. `npm run dev` starts the Astro dev server with hot reload. `npm run build` compiles the production site to `dist/`, and `npm run preview` serves that build for smoke-testing. `npm run astro check` runs Astro's type and content safety checks; call it before opening a pull request.

## Coding Style & Naming Conventions
Stick to modern TypeScript/JS without semicolons and two-space indentation, mirroring existing files. Favor `.astro` files for composition and `.tsx` React islands for interactive widgets. Co-locate feature assets (images, partials) with their component or page. Tailwind utility classes are preferred over ad-hoc CSS; keep custom styles in `src/styles` when utilities fall short.

## Data Layer (Blended event spine)
`src/lib/db.ts` is the **single** place that initializes the InstantDB client and defines the Blended `i.schema` (entities `users`, `sessions`, `sessionResources`, `participants`, `sessionEvents`, `messages`, `questions`, `endorsements`). Product code imports the `db` client and schema-derived types from this module — do not call `init()` or redeclare schema elsewhere. It throws at module init if `PUBLIC_INSTANTDB_APP_ID` is missing rather than building a broken client.

**All product mutations MUST route through `writeEvent(type, meta, projectionTxns)`** (ADR-0001, ADR-0003). It appends a SPEC §7.2 `sessionEvents` envelope **and** applies the caller's projection update(s) inside one `db.transact()`, so the event log and projections stay consistent and every interaction is replayable. No product code path may write a Blended projection row (`db.tx.<entity>[…].update/delete`) outside the helper — a projection-only write is a bug (the legacy `todos` demo is exempt). `applyEvent` / `rebuildSessionProjection` in the same module fold an ordered event list back into a projection (SPEC §17.1) and surface unknown event types loudly. InstantDB entity ids must be UUIDs (use `id()` re-exported from `@/lib/db`).

The dev-only scratch harness `/dev/event-spine` (`src/components/EventSpineHarness.tsx`) exercises the dual-write path for two event types and renders the live event/projection rows; it is disabled in production builds. If writes are rejected with a schema error, push the schema to the Instant app once with `npx instant-cli push schema`.

## Testing Guidelines
Vitest covers pure logic modules: `npm run test` (CI mode), `npm run test:watch`, and `npm run test:coverage`. Playwright drives the browser/e2e gate: run `npm run test:e2e:install` once to fetch Chromium, then `npm run test:e2e` — it starts its own dev server on port 4399 and verifies the `/dev/event-spine` dual-write spine, realtime cross-context sync, and the invalid-input failure path (`playwright.config.ts` sets `retries: 3` to absorb realtime-sync flake). Always also run `npm run astro check`. Name scenario files after the component or page they validate (e.g., `TodoApp.spec.ts`); unit specs live beside their module as `*.test.ts`, e2e specs in `e2e/`.

## Commit & Pull Request Guidelines
Follow the existing short, imperative commit style (`bbc7a3c better aside styles, with mobile`). Group related changes into a single commit and reference issue IDs when available. Pull requests should summarize the user-facing impact, list verification steps (`npm run build`, route screenshots), and note any config or environment changes such as new `.env` keys. Request review from maintainers familiar with the touched area (UI, data, content).

## Environment & Secrets
Copy `.env.example` to `.env` and populate `PUBLIC_INSTANTDB_APP_ID` (the only required key) before running the Todo demo, the event-spine harness, or any session feature. Never commit populated `.env` files; instead, update `.env.example` when new variables are required and mention them in release notes.
