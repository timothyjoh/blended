# Research: Cycle 0001

## Cycle Context
This cycle establishes the Blended data spine: a shared db module (`src/lib/db.ts` or equivalent) exporting a typed InstantDB `i.schema` for eight Blended entities (`users`, `sessions`, `sessionResources`, `participants`, `sessionEvents`, `messages`, `questions`, `endorsements`) plus an initialized client reading `PUBLIC_INSTANTDB_APP_ID`, and a `writeEvent(type, { sessionId, actor, payload, correlationId? }, projectionTxns)` helper that, in a single `db.transact()`, appends a SPEC §7.2-compliant `sessionEvents` envelope **and** applies the caller's projection update(s) atomically. It also requires a documented deterministic `applyEvent`/fold function (sort by `occurredAt`, `receivedAt`, `id` per SPEC §17.1) and a scratch/dev harness React route that calls `writeEvent()` for ≥2 event types and renders the resulting event and projection rows live, to be verified by Playwright across two browser contexts. The repo currently contains only the InstantDB `todos` demo; no Blended schema, no `writeEvent()`, and no `src/lib/db.ts` exist yet — this is net-new foundational work, not a no-op.

## Current Codebase State

### Relevant Components
- InstantDB demo (the only existing Instant usage): defines an inline `i.schema` with a single `todos` entity, initializes a client, and performs direct `db.transact(db.tx.todos[...]...)` projection writes — `src/components/TodoApp.tsx:1-60`. This is the proven `init`/`i.schema` pattern the SPEC directs the cycle to reuse.
  - Imports: `import { id, i, init, type InstaQLEntity } from '@instantdb/react'` — `src/components/TodoApp.tsx:1`
  - App ID read: `const APP_ID = import.meta.env.PUBLIC_INSTANTDB_APP_ID` — `src/components/TodoApp.tsx:6`
  - Schema declaration: `i.schema({ entities: { todos: i.entity({ text: i.string(), done: i.boolean(), createdAt: i.number() }) } })` — `src/components/TodoApp.tsx:9-17`
  - Type derivation: `type Todo = InstaQLEntity<typeof schema, 'todos'>` — `src/components/TodoApp.tsx:19`
  - Client init: `const db = init({ appId: APP_ID, schema })` — `src/components/TodoApp.tsx:21`
  - Reactive read: `db.useQuery({ todos: {} })` returns `{ isLoading, error, data }` — `src/components/TodoApp.tsx:25-32`
  - Write functions use `db.transact(db.tx.todos[id()].update({...}))` and `Date.now()` for timestamps — `src/components/TodoApp.tsx:44-60`
- React island mount pattern: an `.astro` page wraps `Layout` and mounts the React component with the `client:only` directive — `src/pages/todo.astro:1-14` (`<TodoApp client:only />` at line 12). This is the pattern a scratch harness route would follow.
- Shared lib directory (`src/lib/`): currently holds only `theme.ts` and `utils.ts` (`cn()` Tailwind class merge helper) — `src/lib/utils.ts:1-7`. There is no `db.ts` yet; this is where the SPEC places the new shared module.

### Existing Patterns to Follow
- Schema/client init pattern: `init({ appId, schema })` with schema built from `i.schema({ entities: { ... } })` and field builders `i.string()`, `i.boolean()`, `i.number()` — `src/components/TodoApp.tsx:9-21`. The cycle must extend this to the eight entities and add an enum-style constraint on `actorRole` (`teacher | student | ai | system | unknown`) and an integer `schemaVersion`.
- Type export convention: schema-derived types via `InstaQLEntity<typeof schema, 'entity'>` — `src/components/TodoApp.tsx:19`.
- ID and timestamp generation: `id()` from `@instantdb/react` for row IDs; `Date.now()` for timestamps — `src/components/TodoApp.tsx:44-51`.
- Env access: `import.meta.env.PUBLIC_INSTANTDB_APP_ID`, with the var formally declared in Astro's typed env schema (`context: 'client', access: 'public'`) — `astro.config.mjs` env block; `src/components/TodoApp.tsx:6`.
- Coding style: TypeScript without semicolons, two-space indent, `.tsx` React islands for interactive widgets, `.astro` for composition — `AGENTS.md:9-13`; visible throughout `src/components/TodoApp.tsx`.
- Path alias: `@/*` → `./src/*` configured in `tsconfig.json` (`baseUrl: "."`, `paths`) — `tsconfig.json`.
- Failure handling (today): The only existing data-layer error handling is the reactive read guard — `if (error) return <div>Error querying data: {error.message}</div>` — `src/components/TodoApp.tsx:29-31`. There is **no** existing init-time env validation, no `writeEvent()` choke point, no transaction-rejection handling, no retry/timeout/fallback logic, and no idempotency/dedup guard in product code today. The SPEC's required failure behaviors (throw on missing `PUBLIC_INSTANTDB_APP_ID`; throw on invalid `writeEvent()` input before `transact()`; atomic single-`transact()` so neither row half-writes; surface unknown event types in `applyEvent`) are all net-new with no existing precedent in the codebase to mirror.
- Observability conventions: The cycle engine writes structured events to `.cycle/log.jsonl` (newline-delimited JSON objects with `ts`, `event`, `cycle_id`, `step`, etc.) — this is engine-level telemetry, not application logging. There is **no** application-level logging/metrics framework in the product code today; the SPEC's "observability" requirement is satisfied by the event-sourced `sessionEvents` log itself (ADR-0003), not by a logger.
- Idempotency / retry-safety: None present in product code. SPEC §17.2 references a `client_action_id` dedup concept and §15 lists a "Duplicate message submit" failure class, but these are out of scope for this cycle (only the envelope and atomic single-`transact()` are required here).

### Dependencies & Integration Points
- `@instantdb/react` `^1.0.43` — already a dependency; provides `id`, `i`, `init`, `InstaQLEntity`, `db.transact`, `db.tx`, `db.useQuery` — `package.json` dependencies; used at `src/components/TodoApp.tsx:1`.
- Astro `^6.4.4` with `@astrojs/react` `^5.0.7` (React 19) and `@astrojs/vercel` adapter, `output: 'server'` — `astro.config.mjs`; `package.json`.
- Env var `PUBLIC_INSTANTDB_APP_ID`: declared as a typed client public field in `astro.config.mjs`; present in `.env` (`PUBLIC_INSTANTDB_APP_ID=9199c9db-...`). **Discrepancy to respect:** `.env.example` currently contains `INSTANTDB_APP_ID=instantdb.com` (wrong key name and placeholder), not `PUBLIC_INSTANTDB_APP_ID` — the SPEC's documentation-update task expects `.env.example` to reflect the correct public var.
- Normative design constraints (must be respected, not re-derived):
  - ADR-0001 (`docs/adr/0001-dual-write-events-and-projections-on-instantdb.md`): single `writeEvent()` helper; one `transact()` updates projection(s) AND appends the `SessionEvent`; *all* mutations route through it; no direct projection writes; drift is the primary risk. Server-side enforcement deferred per-slice.
  - ADR-0003 (`docs/adr/0003-global-admin-role-and-internal-observability.md`): global `User.adminLevel` (the `users.adminLevel` field), separate from `Participant.role`; observability built on the append-only event log; `writeEvent()` is the single choke point.
  - SPEC §5 entity field tables (`docs/SPEC.md:144-243`): Session (`id`, `title`, `status`, `teacherId`, `joinCode`, `joinSlug?`, `createdAt`, `startedAt?`, `endedAt?`, `activeResourceId`, `interactionMode`), SessionResource, Participant (`role` enum `teacher|student|assistant|ai`, private `email`), Message/Question fields.
  - SPEC §7.2 event envelope (`docs/SPEC.md:276-291`): `id`, `sessionId`, `type` (string), `schemaVersion` (integer), `actorId` (string/null), `actorRole` (`teacher|student|ai|system|unknown`), `occurredAt`, `receivedAt`, `correlationId?`, `payload` (object).
  - SPEC §7.3 required MVP event types (`docs/SPEC.md:293-304`): full catalog; only the harness-exercised types need concrete payload handling this cycle, but the schema must not preclude the rest.
  - SPEC §17.1 fold algorithm (`docs/SPEC.md:582-595`): load events, sort by `occurredAt, receivedAt, id`, validate envelope, fold via `apply_event`.
  - CONTEXT.md domain glossary (`CONTEXT.md`): canonical terms — Session (`draft → live → ended`), SessionResource/Active Resource, Participant, Message (teachers don't see chat), Question (Message ending in `?`), Endorsement (anonymous), SessionEvent, Projection.
- Project constitution (additional convention source): `.specify/memory/constitution.md:55` — "InstantDB integrations MUST read `PUBLIC_INSTANTDB_APP_ID` from `.env`; never commit populated secrets."

### Test Infrastructure
- Test framework: **None configured.** `package.json` has no test runner, no test script, and no Playwright/Vitest dependency. `AGENTS.md:12-13` states "No automated test harness is configured yet" and suggests Vitest for logic modules and `npm run astro check` plus manual route exercise as the minimum gate.
- Static gate: `astro check` (via `@astrojs/check` `^0.9.9`); `npm run build` runs `astro check && astro build` — `package.json` scripts; `AGENTS.md:7`.
- Test conventions (documented, not yet practiced): name scenario files after the component/page they validate (e.g. `TodoApp.spec.ts`) — `AGENTS.md:13`.
- Current coverage of the change area: zero. No existing tests for InstantDB usage, the todo demo, or any lib module.
- Failure-path test coverage: none exists. The SPEC requires net-new Playwright e2e (happy path ×2 event types, realtime two-context sync, invalid-input failure path with unchanged row counts, unset-env init failure) and lightweight unit tests for `applyEvent` determinism and unknown-type surfacing. Playwright is **not** currently installed or configured (no `playwright.config.*`, no `e2e/`/`tests/` directory) — the SPEC's Dependencies section anticipates adding it.

## Code References
- `src/components/TodoApp.tsx:1-21` — Canonical InstantDB init pattern (imports, `import.meta.env.PUBLIC_INSTANTDB_APP_ID`, `i.schema`, `InstaQLEntity`, `init`) to reuse for the shared db module.
- `src/components/TodoApp.tsx:44-60` — Direct `db.transact(db.tx.todos[...])` projection writes and `id()`/`Date.now()` usage; the demo `todos` entity is the only place direct projection writes occur (the SPEC requires that for Blended entities such writes appear only inside `writeEvent()`).
- `src/components/TodoApp.tsx:25-31` — Existing reactive read + error-guard pattern for live queries.
- `src/pages/todo.astro:1-14` — Astro page mounting a React island via `client:only`; template for the scratch harness route.
- `src/lib/utils.ts:1-7` — Existing `src/lib/` module style (no semicolons, two-space indent); sibling location for the new `db.ts`.
- `astro.config.mjs` (env block) — Typed declaration of `PUBLIC_INSTANTDB_APP_ID` as a client public field; any new env access should remain consistent.
- `tsconfig.json` — Strict config (`astro/tsconfigs/strict`), `jsx: react-jsx`, `@/*` path alias to `./src/*`.
- `docs/SPEC.md:276-291` — §7.2 event envelope field table (source of truth for `sessionEvents` columns).
- `docs/SPEC.md:293-304` — §7.3 required MVP event type catalog.
- `docs/SPEC.md:582-595` — §17.1 `rebuild_session_projection` / `apply_event` reference algorithm and sort order.
- `docs/SPEC.md:165-243` — §5.2–5.6 entity field tables for Session, SessionResource, Participant, Message/Question.
- `docs/adr/0001-dual-write-events-and-projections-on-instantdb.md:9-15` — Dual-write decision, single `writeEvent()` choke point, one-transaction atomicity, drift mitigation.
- `docs/adr/0003-global-admin-role-and-internal-observability.md:7-15` — Global `User.adminLevel` and event-log-based observability rationale.
- `CONTEXT.md` — Domain glossary fixing entity/term naming.
- `.env:2` — Working `PUBLIC_INSTANTDB_APP_ID` value (local dev).
- `.env.example:1` — Currently `INSTANTDB_APP_ID=instantdb.com` (mismatched key name; doc-update target).
- `.specify/memory/constitution.md:55` — Constitutional rule requiring `PUBLIC_INSTANTDB_APP_ID` from `.env`.
- `.cycle/log.jsonl` — Engine-level structured event log (`cycle.start`/`step.*` records); the engine reads `NOOP.md` after this research step.

## Open Questions
- Module placement and signature: SPEC names `src/lib/db.ts` as the canonical location and specifies `writeEvent(type, { sessionId, actor, payload, correlationId? }, projectionTxns)`; the planner must confirm the exact shape of `actor` (e.g. `{ id, role }`) and how `projectionTxns` are passed (array of `db.tx....` chains) to compose into one `db.transact([...])`.
- Enum representation in InstantDB schema: the existing demo uses only `i.string()`/`i.boolean()`/`i.number()`. The planner must determine how to express the SPEC-required constraints (`actorRole ∈ {teacher,student,ai,system,unknown}`, integer `schemaVersion`, structured `payload`) within the installed `@instantdb/react` `^1.0.43` schema builder (e.g. `i.string()` + runtime validation vs. a typed union), since no enum precedent exists in-repo.
- Scratch harness route: SPEC requires a "non-product dev route"; the planner must choose the route path and decide whether/how to gate it from production, and which two §7.3 event types to exercise.
- Playwright introduction: the SPEC's testing strategy mandates Playwright with two browser contexts, but no test tooling is installed. The planner must decide how Playwright is added (dependency, config, scripts) and how the unset-`PUBLIC_INSTANTDB_APP_ID` init-failure case is exercised given the value is build-time/client public.
- `.env.example` correction: the example file's key name (`INSTANTDB_APP_ID`) diverges from the required `PUBLIC_INSTANTDB_APP_ID`; the planner should confirm this is corrected as part of the documentation updates the SPEC calls for.
- Existing `todos` demo: whether it remains untouched (the no-direct-projection-write rule applies to Blended projection entities, not the demo `todos`); the planner should confirm the demo is out of scope and left intact.
