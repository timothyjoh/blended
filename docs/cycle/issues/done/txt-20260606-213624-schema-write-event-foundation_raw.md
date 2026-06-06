---
id: txt-20260606-213624-schema-write-event-foundation
source: text
title: "Foundation: Blended InstantDB schema + writeEvent() dual-write helper"
added_at: 2026-06-06T21:36:24Z
triage_attempts: 0
priority: critical
---

## Problem

Establish the data spine every other slice builds on. Define the Blended InstantDB schema (reusing the working `init`/`i.schema` pattern already proven in `src/components/TodoApp.tsx` and `PUBLIC_INSTANTDB_APP_ID`) in a shared module, plus a `writeEvent()` helper that, in a single InstantDB `transact()`, appends a `SessionEvent` envelope AND applies the corresponding projection update(s). All product mutations MUST route through `writeEvent()` so the event log is a complete, replayable interaction record (see `docs/adr/0001-dual-write-events-and-projections-on-instantdb.md` and `0003`).

Entities to define: `users` (incl. global `adminLevel`), `sessions`, `sessionResources`, `participants`, `sessionEvents`, `messages`, `questions`, `endorsements`. Use the domain language in `CONTEXT.md`.

## Acceptance Criteria

- [ ] A shared db module exports a typed `i.schema` and an initialized client using `PUBLIC_INSTANTDB_APP_ID`.
- [ ] `SessionEvent` carries the envelope fields from spec §7.2 (`id`, `sessionId`, `type`, `schemaVersion`, `actorId`, `actorRole`, `occurredAt`, `receivedAt`, `correlationId?`, `payload`).
- [ ] `writeEvent(type, { sessionId, actor, payload }, projectionTxns)` appends the event and applies the projection update(s) in ONE `transact()`.
- [ ] No product code writes a projection row except through `writeEvent()`.
- [ ] A documented (even if minimal) `applyEvent`/fold path exists so the log remains the source of truth (replay UI itself is out of scope).

## Verification (Playwright)

- [ ] A dev/scratch harness calls `writeEvent()` twice; assert both a `sessionEvents` row and the matching projection row exist after each call.
- [ ] Open a SECOND browser context pointed at the same data; assert it sees the same rows appear in realtime (no reload), proving InstantDB live sync end-to-end.

## Blocked by

- None - can start immediately.

## Out of Scope

- Replay UI, AI classification, and any specific product flow (each is its own issue).
