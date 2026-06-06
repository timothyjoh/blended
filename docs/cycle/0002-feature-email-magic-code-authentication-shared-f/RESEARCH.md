# Research: Cycle 0002 — Email Magic-Code Authentication

## Cycle Context
SPEC.md (`docs/cycle/0002-feature-email-magic-code-authentication-shared-f/SPEC.md`) asks for the single shared passwordless sign-in gate for Blended: one reusable login UI React island (email step → code step → signed-in view with sign-out), one shared `useAuth` hook in `src/lib` wrapping InstantDB's `db.useAuth()` / `auth.sendMagicCode` / `auth.signInWithMagicCode` / `auth.signOut` and exposing `{ user, isLoading, error, sendCode, verifyCode, signOut }` plus a derived username, an Astro gate page that renders the island, session persistence across reload, sign-out, and first-sign-in creation of exactly one `users` projection row keyed to the InstantDB auth user id (`username` = email local-part, `adminLevel: 0`) routed through `writeEvent()` using a reserved `IDENTITY_SCOPE` sentinel sessionId and actor role `'unknown'`. Role/authorization, route guarding, admin promotion, and per-session participants are explicitly out of scope.

## Current Codebase State

### Relevant Components
- **InstantDB client & schema (single source)**: `src/lib/db.ts:120` initializes the client (`db = init({ appId, schema })`); the `users` entity is defined at `src/lib/db.ts:40-47` with fields `email: i.string().optional()`, `username: i.string()`, `adminLevel: i.number()`, `createdAt: i.number()`.
- **`writeEvent()` dual-write choke point**: `src/lib/db.ts:275-313` — the only sanctioned path to write a projection row.
- **No authentication code exists yet**: a repo-wide grep for `useAuth`, `sendMagicCode`, `signInWithMagicCode`, `signOut`, `IDENTITY_SCOPE` across `src/` and `e2e/` returns zero matches. There is no login UI, no auth hook, no gate page, and no `IDENTITY_SCOPE` constant today.
- **Existing dev island wiring example**: `src/components/EventSpineHarness.tsx` (island) + `src/pages/dev/event-spine.astro` (gate page) show the established island-on-an-Astro-page pattern, including dev/prod gating via `import.meta.env.PROD` (`src/pages/dev/event-spine.astro:7,14-18`).
- **UI primitives**: `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, plus `card.tsx`, `avatar.tsx`, `badge.tsx`, etc. All use `cn` from `src/lib/utils.ts` and Tailwind utility classes. `input-otp@^1.4.2` is a declared dependency (`package.json`) but has no wrapper in `src/components/ui`.

### Existing Patterns to Follow
- **Shared-module data layer (ADR-0001 / AGENTS.md invariant)**: product code imports `db`, schema-derived types, and `id` from `@/lib/db` — never calls `init()` or redeclares schema. `id` is re-exported at `src/lib/db.ts:124`. (Note: the legacy `src/components/TodoApp.tsx:1-21` re-inits its own client for the `todos` demo and is explicitly exempt per AGENTS.md — do not copy it for product code.)
- **`writeEvent(type, meta, projectionTxns)` contract** — `src/lib/db.ts:241-313`:
  - `meta` is `{ sessionId, actor: { id: string|null, role: ActorRole }, payload, correlationId?, schemaVersion?, occurredAt?, receivedAt? }` (`src/lib/db.ts:241-249`).
  - `ActorRole` closed set is `['teacher','student','ai','system','unknown']` (`src/lib/db.ts:29`); `'unknown'` is valid — matches the SPEC's required identity-scope actor role.
  - Validates synchronously and throws BEFORE any transaction when `type`, `sessionId`, or `actor.role` is missing/invalid, `schemaVersion` is non-integer, or `projectionTxns` is empty/not an array (`src/lib/db.ts:280-296`). A `sessionId` is mandatory — hence the SPEC's `IDENTITY_SCOPE` sentinel requirement.
  - Stamps `occurredAt`/`receivedAt`/`schemaVersion` (default 1) when omitted, appends the `sessionEvents` envelope, and commits it together with `projectionTxns` in one `db.transact([...])` (`src/lib/db.ts:298-312`).
  - Returns the `db.transact()` promise; rejection propagates (atomic, no partial write). Not idempotent by design — each call appends a fresh event (`src/lib/db.ts:262-273`). The SPEC's "create only if no `users` row exists" guard must be implemented by the caller, not by `writeEvent`.
  - Projection txns are caller-built `db.tx.<entity>[id].update(...)` chunks; entity ids must be UUIDs via `id()` (`src/components/EventSpineHarness.tsx:18-20`).
- **`applyEvent` fold** — `src/lib/db.ts:185-223` recognizes only `SessionCreated` and `ParticipantJoined`; any other `type` in a folded list throws `UnknownEventTypeError` (`src/lib/db.ts:157-162,220-221`). It folds the **session** projection keyed by `sessionId`; it has no `users` / identity handling. A `UserSignedIn`/`UserCreated` event written under the `IDENTITY_SCOPE` sentinel will not appear in any real session's event list, so it does not currently feed `rebuildSessionProjection`.
- **Island ↔ page convention**: interactive widgets are `.tsx` islands mounted from `.astro` pages with `client:only="react"` (`src/pages/dev/event-spine.astro:17`) or `client:load` (`src/layouts/Layout.astro:38`). Pages wrap content in `@/layouts/Layout.astro`.
- **Failure handling (existing approach)** — `src/components/EventSpineHarness.tsx:32-105`:
  - Synchronous `writeEvent` validation errors are caught in a `try/catch`; the returned promise's rejection is handled with `.catch((err) => surface(err))`.
  - `surface()` (`src/components/EventSpineHarness.tsx:101-105`) sets a React error state and calls `console.error('[EventSpineHarness] writeEvent failed:', err)`. Errors are rendered inline via a `data-testid="harness-error"` element with `role="alert"` (`src/components/EventSpineHarness.tsx:133-137`) — never swallowed.
  - Query loading/error are branched before render: `isLoading` → loading element, `queryError` → error element (`src/components/EventSpineHarness.tsx:107-110`).
- **Observability conventions**: the structured `sessionEvents` envelope IS the system's interaction log (ADR-0001, `docs/adr/0001-...md`); every mutation must append one via `writeEvent`. Client-side errors use `console.error` with a bracketed component tag. There is no separate metrics layer. The cycle engine logs to `.cycle/log.jsonl` (engine-level, not product code).
- **Idempotency / retry-safety**: `writeEvent` is atomic (event + projection commit together) so a rejected call leaves no partial state and is safe to retry (`src/lib/db.ts:262-273`). There is no built-in dedup; the SPEC's "create `users` row only if absent" guard must be a caller-side check against an existing `users` query result, keyed to the auth user id, to stay idempotent across repeat sign-ins.
- **Code style**: modern TS/JS, no semicolons, two-space indent, Tailwind utilities, path alias `@/` → `src/` (used throughout, e.g. `src/components/EventSpineHarness.tsx:2`).

### Dependencies & Integration Points
- **`@instantdb/react@^1.0.43`** (`package.json`) — provides `init`, `id`, `i`, `tx`, `db.useQuery`, and the auth API (`db.useAuth`, `db.auth.sendMagicCode`, `db.auth.signInWithMagicCode`, `db.auth.signOut`) the SPEC requires. Today only `init`, `id`, `i`, `useQuery`, `transact` are used (`src/lib/db.ts`, `src/components/EventSpineHarness.tsx`).
- **`PUBLIC_INSTANTDB_APP_ID`** — validated at module init by `requireAppId` (`src/lib/db.ts:17-26`); throws if missing. Declared as a client/public env field in `astro.config.mjs:23-30` and `.env.example`. The Blended schema must be pushed to the live Instant app (`npx instant-cli push schema`) for `users` writes to be accepted (AGENTS.md Data Layer note).
- **Astro config** — `output: 'server'` with the Vercel adapter; `vite.resolve.dedupe: ['react','react-dom']` is required so React islands using hooks (including InstantDB hooks) don't throw "Invalid hook call" (`astro.config.mjs:13-20`). A new `useAuth` hook inside an island inherits this.
- **`input-otp@^1.4.2`** (`package.json`) — available for code entry but currently unwrapped/unused.
- **UI**: `src/components/ui/button.tsx`, `input.tsx`, `card.tsx` (+ `cn`/`src/lib/utils.ts`) for composing the login surface; `@/layouts/Layout.astro` for the gate page shell.

### Test Infrastructure
- **Unit (Vitest)**: `vitest run` via `npm run test` (config `vitest.config.ts`). Specs live beside their module as `*.test.ts` — the only existing example is `src/lib/db.test.ts`, which covers `requireAppId`, `applyEvent`/fold determinism, `UnknownEventTypeError`, and `writeEvent` synchronous input-validation throws (`src/lib/db.test.ts:18-168`). It uses a `dummyTxns` stand-in for validation cases that must throw before `db.transact()` (`src/lib/db.test.ts:14-16`). This establishes the pattern for testing pure logic (email local-part derivation, email validation, "create-only-if-absent" decision) without hitting the network.
- **E2E (Playwright)**: specs in `e2e/`, named after the surface (`e2e/event-spine.spec.ts`). Config `playwright.config.ts`: `testDir: 'e2e'`, `timeout: 60_000`, `retries: 3`, `baseURL: http://localhost:4399`, `webServer` runs `npm run dev -- --port 4399` with `reuseExistingServer: !process.env.CI`. Run `npm run test:e2e:install` once, then `npm run test:e2e`.
- **E2E conventions to mirror**: mint disposable ids per test (`crypto.randomUUID()`, `e2e/event-spine.spec.ts:6-8`); give island-hydration assertions an explicit longer timeout (15s) to absorb cold-start (`e2e/event-spine.spec.ts:13-16`); use `data-testid` hooks and `role="alert"` for assertable error surfaces.
- **Failure-path test coverage (existing)**: `e2e/event-spine.spec.ts:61-76` asserts an invalid `writeEvent` surfaces `data-testid="harness-error"` containing `projectionTxns` and that row counts stay unchanged — the template for the SPEC's invalid-email / wrong-code failure assertions. No auth-specific tests exist yet.
- **Type gate**: `npm run astro check` (AGENTS.md; SPEC acceptance criterion).

## Code References
- `src/lib/db.ts:40-47` — `users` entity definition (`email?`, `username`, `adminLevel`, `createdAt`).
- `src/lib/db.ts:29-30` — `ACTOR_ROLES` closed set including `'unknown'`.
- `src/lib/db.ts:120,124` — `db` client export and re-exported `id`.
- `src/lib/db.ts:127` — exported `User` type (`InstaQLEntity<typeof schema, 'users'>`).
- `src/lib/db.ts:275-313` — `writeEvent` signature, synchronous validation, single-transaction dual-write.
- `src/lib/db.ts:185-223` — `applyEvent` (knows only `SessionCreated`/`ParticipantJoined`).
- `src/components/EventSpineHarness.tsx:26-110` — island data-fetch + try/catch + `.catch` + `surface()` error pattern.
- `src/pages/dev/event-spine.astro:1-21` — Astro gate page rendering an island with prod gating.
- `src/components/ui/button.tsx`, `src/components/ui/input.tsx` — Tailwind/`cn` UI primitives for the form.
- `astro.config.mjs:13-30` — React dedupe and `PUBLIC_INSTANTDB_APP_ID` env schema.
- `playwright.config.ts:7-31` — e2e harness (port 4399, retries 3).
- `e2e/event-spine.spec.ts:10-16,61-76` — island-hydration wait + failure-path assertion template.
- `src/lib/db.test.ts:121-168` — Vitest pattern for pure-logic / validation tests.
- `docs/adr/0001-dual-write-events-and-projections-on-instantdb.md` — "all mutations route through `writeEvent()`; no direct projection writes" invariant.
- `docs/adr/0003-global-admin-role-and-internal-observability.md` — Admin uses the same email magic-code flow; `adminLevel` lives on `User`; first uber-admin bootstrapped via an env allowlist (future, not built).
- `AGENTS.md` (Data Layer section) — single-`db` rule, `writeEvent` choke-point invariant, `npx instant-cli push schema` on schema-rejected writes, `.env` / release-notes conventions.

## Open Questions
- **Deterministic Playwright magic-code path**: the SPEC flags this as a known risk — whether `@instantdb/react@1.0.43` exposes a dev/test magic-code mechanism, or whether a seeded test user / token-based test entry must be wired and documented, is unresolved against this codebase. No such mechanism exists today.
- **`IDENTITY_SCOPE` event type vs. fold safety**: the SPEC proposes a `UserSignedIn`/`UserCreated` event under the sentinel sessionId. `applyEvent` (`src/lib/db.ts:185-223`) throws `UnknownEventTypeError` on unrecognized types; the planner must confirm whether this new event type needs an `applyEvent` case (it folds *session* projections, and identity-scope events are not part of any session's event list) or is intentionally left outside the fold.
- **Where the `useAuth` hook lives and how it is shared across islands**: the SPEC says `src/lib`, but hooks today live under `src/hooks` (`src/hooks/use-toast.ts`); the canonical location for the shared auth hook needs confirmation at plan time.
- **Gate page route / production exposure**: unlike `/dev/event-spine`, the auth gate is a product surface; its route path and whether/how it is reachable from existing pages (`src/pages/index.astro` currently renders only `Welcome`) is unspecified.
