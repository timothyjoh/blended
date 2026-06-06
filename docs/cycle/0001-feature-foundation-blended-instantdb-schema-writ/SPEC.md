# SPEC — Cycle 0001: Blended Event Spine — Schema + `writeEvent()` Dual-Write Helper

## WHY
Blended is event-sourced: every meaningful interaction must become a replayable `SessionEvent` so the team can later reconstruct, audit, and observe any session (ADR-0001, ADR-0003). Today the repo has only the `todos` demo schema in `src/components/TodoApp.tsx` — there is no Blended domain schema and no enforced choke point for writes. Without a shared schema and a single `writeEvent()` helper that appends an event AND updates the matching projection in one transaction, every later slice would invent its own ad-hoc projection writes, creating observability blind spots and projection-vs-log drift (the primary risk flagged in ADR-0001 and SPEC §15). This is the data spine every other cycle builds on.

## CONCRETE USER BENEFIT
After this cycle, a developer (the caller) can open a scratch harness page in two separate browser windows pointed at the same InstantDB app, click an action in one window, and **watch both the new `sessionEvents` row and its matching projection row appear live in the second window with no reload** — proving the dual-write event spine and InstantDB realtime sync work end-to-end. This is the observable foundation the teacher/student product flows depend on.

## USABLE END-STATE
A shared db module exposes the typed Blended schema and an initialized InstantDB client. Calling `writeEvent(...)` from anywhere in the app appends a spec-§7.2-compliant `SessionEvent` and applies the caller's projection update(s) atomically. A documented `applyEvent` fold function exists so the log remains the source of truth. A scratch/dev harness route demonstrates this working, with realtime propagation visible across two browser contexts.

## SCAFFOLDING ESCAPE HATCH
This round is genuinely foundational: it ships no teacher- or student-facing product flow. It is intentionally enrich-only — schema + the dual-write helper are one coherent change everything else needs. The user benefit it unlocks is **every subsequent product mutation being a complete, replayable, realtime-synced interaction record**. The first product-facing benefit (creating and listing sessions) is delivered by the sibling cycles for `create-session-draft` and `dashboard-session-list`, which build directly on the schema and `writeEvent()` defined here. The scratch harness in this cycle exists solely to make the foundation observable and testable now, not as a shipped product surface.

## Objective
This cycle defines the Blended InstantDB schema in a shared module (reusing the proven `init`/`i.schema` pattern and `PUBLIC_INSTANTDB_APP_ID` from `src/components/TodoApp.tsx`) and implements `writeEvent()`, the single choke point through which all product mutations append a `SessionEvent` envelope and apply their projection update(s) inside one `transact()`. It also provides a documented `applyEvent` fold so the event log remains reconstructable, and a scratch harness that proves dual-write plus realtime cross-client sync end-to-end. It matters because correct, drift-free observability (ADR-0001, ADR-0003) is impossible to retrofit; establishing the choke point now keeps the event log a complete interaction record from day one.

## Source Issue
`txt-20260606-213624-schema-write-event-foundation` — "Foundation: Blended InstantDB schema + writeEvent() dual-write helper"

## Scope

### In Scope
- A shared db module (e.g. `src/lib/db.ts`) exporting a typed `i.schema` defining the Blended entities and an initialized client using `PUBLIC_INSTANTDB_APP_ID`. Entities: `users` (incl. global `adminLevel`), `sessions`, `sessionResources`, `participants`, `sessionEvents`, `messages`, `questions`, `endorsements` — fields per SPEC §5 and the §7.2 envelope, using `CONTEXT.md` domain language.
- `writeEvent(type, { sessionId, actor, payload, correlationId? }, projectionTxns)` that, in one `db.transact()`, appends a `sessionEvents` row carrying the full §7.2 envelope (`id`, `sessionId`, `type`, `schemaVersion`, `actorId`, `actorRole`, `occurredAt`, `receivedAt`, `correlationId?`, `payload`) **and** applies the caller-supplied projection transaction(s); plus a documented `applyEvent`/fold function that reduces an ordered event list into a session projection (per SPEC §17.1).
- A scratch/dev harness (a React component mounted on a non-product dev route) that calls `writeEvent()` for at least two distinct event types and renders the resulting `sessionEvents` and projection rows live, serving as the Playwright verification surface.

### Out of Scope
- Replay UI, AI classification/moderation, cursor-voting, and any specific teacher/student product flow (each is its own issue).
- Server-side projection enforcement and InstantDB permission rules (admin SDK trust boundary) — deferred to slices where trust is actually required (per ADR-0001).
- Authoring every MVP event type from SPEC §7.3; only the event types exercised by the harness need concrete payload handling. The schema and helper must not preclude the others.
- Entities not required by the listed eight (`questionClusters`, `cursorVote*`, `moderationDecisions`, `transcriptSegments`).

## Requirements
- The schema module MUST be the single source of the InstantDB schema and client for Blended product code, mirroring the working `init({ appId, schema })` pattern; it MUST read `PUBLIC_INSTANTDB_APP_ID` from `import.meta.env`.
- `sessionEvents` MUST persist all SPEC §7.2 envelope fields; `actorRole` MUST be constrained to `teacher | student | ai | system | unknown`; `schemaVersion` MUST be an integer; `payload` MUST be stored as structured data.
- `writeEvent()` MUST append the event and apply the projection update(s) in a single `transact()` so they land together (ADR-0001). It MUST stamp `id`, `occurredAt`, and `receivedAt` if not supplied by the caller.
- No product code path MAY write a projection row except through `writeEvent()`. The helper's signature MUST require both the event metadata and the projection transactions so projection-only writes are not the easy default.
- `applyEvent` MUST be deterministic and order-stable (sort by `occurredAt`, then `receivedAt`, then `id`, per §17.1) so a projection can be rebuilt from the log.
- TypeScript: schema-derived types MUST be exported (e.g. via `InstaQLEntity`) and `astro check` MUST pass with no new errors/warnings.
- **Failure behavior**:
  - On missing/empty `PUBLIC_INSTANTDB_APP_ID`, the db module MUST throw at initialization with a clear message rather than silently initializing a broken client.
  - On invalid input to `writeEvent()` (missing `type`, missing `sessionId`, missing `actor`, or empty `projectionTxns`), it MUST throw a descriptive error before calling `transact()` and MUST NOT append a partial event — leaving stored state unchanged.
  - Because event append and projection update share one `transact()`, a rejected transaction MUST fail atomically: neither the `sessionEvents` row nor the projection row is written (no half-applied dual-write). The rejection MUST surface to the caller (thrown/rejected promise), never be swallowed.
  - `applyEvent` MUST surface an unknown event `type` (raise or record it) rather than silently dropping it, so log/projection divergence is detectable.

## Acceptance Criteria
- [ ] Opening the scratch harness in two browser contexts against the same app: an action triggered in context A causes the new `sessionEvents` row **and** its matching projection row to appear in context B in realtime with no reload (user-observable benefit — proves the dual-write spine and InstantDB live sync end-to-end).
- [ ] `src/lib/db.ts` (or equivalent shared module) exports a typed `i.schema` containing `users`, `sessions`, `sessionResources`, `participants`, `sessionEvents`, `messages`, `questions`, `endorsements`, and an initialized client using `PUBLIC_INSTANTDB_APP_ID`.
- [ ] A `sessionEvents` row written by `writeEvent()` contains every §7.2 envelope field (`id`, `sessionId`, `type`, `schemaVersion`, `actorId`, `actorRole`, `occurredAt`, `receivedAt`, optional `correlationId`, `payload`).
- [ ] Calling `writeEvent()` twice in the harness yields exactly two `sessionEvents` rows and the two corresponding projection rows (verified via Playwright assertions).
- [ ] A documented `applyEvent`/fold function exists and, given an ordered list of events, reduces them to a projection consistent with the dual-written rows.
- [ ] **Failure path:** calling `writeEvent()` with invalid input (e.g. omitted `sessionId` or empty `projectionTxns`) throws a descriptive error and writes neither a `sessionEvents` row nor a projection row — verified by asserting row counts are unchanged after the rejected call.
- [ ] **Failure path:** with `PUBLIC_INSTANTDB_APP_ID` unset, importing/initializing the db module throws a clear error rather than producing a silently broken client.
- [ ] No product code path writes a projection row except through `writeEvent()` (verified by code review / grep that `db.tx.<entity>...update/delete` for projection entities appears only inside the helper).
- [ ] `astro check` passes with no new errors or warnings.
- [ ] All existing tests still pass.

## Testing Strategy
- **E2E (Playwright, required — there is a UI/dev surface):**
  - Scratch harness happy path: trigger `writeEvent()` twice; assert a `sessionEvents` row and its matching projection row exist after each call.
  - Realtime sync: open a second browser context on the same data; assert it observes the same rows appear live without reload (proves InstantDB live sync end-to-end).
  - Failure path: invoke an invalid `writeEvent()` from the harness; assert an error is surfaced and that `sessionEvents`/projection row counts are unchanged.
- **Unit-level (lightweight, where practical):** `applyEvent` determinism — feed an out-of-order event list and assert the folded projection equals the in-order fold; assert an unknown event type is surfaced rather than dropped.
- **Type check:** `astro check` as the static gate; confirm exported schema types resolve.
- Use a disposable/scratch `sessionId` per test run so assertions are not polluted by prior data.

## Documentation Updates
- **AGENTS.md / CLAUDE.md**: document that the shared db module (`src/lib/db.ts`) is the only place to initialize the InstantDB client and define schema, and that **all** product mutations MUST route through `writeEvent()` (no direct projection writes), referencing ADR-0001 and ADR-0003. Note the scratch harness route and how to run its Playwright check.
- **README.md**: note the new shared db module and the `writeEvent()` dual-write convention as the foundation for session features; confirm `PUBLIC_INSTANTDB_APP_ID` remains the required env var (already documented for the Todo demo).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `@instantdb/react` (already a dependency) and the proven `init`/`i.schema` pattern in `src/components/TodoApp.tsx`.
- `PUBLIC_INSTANTDB_APP_ID` env var (present in `.env`; documented in `.env.example` and AGENTS.md).
- ADR-0001 (dual-write events + projections) and ADR-0003 (global admin role; observability via the event log) as normative design constraints.
- SPEC §5 (entity fields), §7.2 (event envelope), and §17.1 (projection fold) as the field- and behavior-level source of truth.
- A Playwright setup capable of opening two browser contexts against the dev server (add to dev/test tooling if not already present).
