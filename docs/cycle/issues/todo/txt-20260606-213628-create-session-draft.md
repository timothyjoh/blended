---
id: txt-20260606-213628-create-session-draft
title: Teacher creates a session (draft)
workflow: feature
depends_on:
  - txt-20260606-213624-schema-write-event-foundation
  - txt-20260606-213627-route-guarding-role-routing
triaged_at: 2026-06-06T21:52:15.417Z
source: triage
priority: critical
---
## Problem

A Teacher can create a new Session. From the dashboard, "New session" collects a title and creates a `Session` in `draft` with an unguessable `joinCode` (spec §16.2), setting `teacherId` to the creator. Append `SessionCreated` via `writeEvent()`. Creating a session is what makes a User the Teacher of it (session-scoped role) — there is no special account type; any authenticated user can create one.

This is a single vertical slice: the "New session" UI control, the create action, the `draft`/`joinCode` projection, and the `SessionCreated` event dual-write, all landing together with tests.

## Acceptance Criteria

- [ ] Teacher can create a session with a title; row is created in `draft` with a generated, hard-to-guess `joinCode`.
- [ ] `teacherId` is the creating user.
- [ ] A `SessionCreated` event is appended in the same transaction as the projection (via `writeEvent()`).
- [ ] Any authenticated user can create a session (no special account type).

## Verification (Playwright)

- [ ] Logged-in user creates a session; assert it appears with `draft` status and a join code.
- [ ] Assert a `SessionCreated` event row exists for that session (observability check).

## Dependencies

- Blocked by `txt-20260606-213624-schema-write-event-foundation` (schema + `writeEvent()` dual-write helper).
- Blocked by `txt-20260606-213627-route-guarding-role-routing` (authenticated dashboard / role routing).

## Out of Scope

- Listing sessions, start/end, resources (separate issues).
