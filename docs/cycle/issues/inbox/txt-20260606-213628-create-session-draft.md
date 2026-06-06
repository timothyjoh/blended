---
id: txt-20260606-213628-create-session-draft
source: text
title: "Teacher creates a session (draft)"
added_at: 2026-06-06T21:36:28Z
triage_attempts: 0
priority: critical
---

## Problem

A Teacher can create a new Session. From the dashboard, "New session" collects a title and creates a `Session` in `draft` with an unguessable `joinCode` (spec §16.2), setting `teacherId` to the creator. Append `SessionCreated` via `writeEvent()`. Creating a session is what makes a User the Teacher of it (session-scoped role).

## Acceptance Criteria

- [ ] Teacher can create a session with a title; row is created in `draft` with a generated, hard-to-guess `joinCode`.
- [ ] `teacherId` is the creating user.
- [ ] A `SessionCreated` event is appended in the same transaction as the projection.
- [ ] Any authenticated user can create a session (no special account type).

## Verification (Playwright)

- [ ] Logged-in user creates a session; assert it appears with `draft` status and a join code.
- [ ] Assert a `SessionCreated` event row exists for that session (observability check).

## Blocked by

- txt-20260606-213624-schema-write-event-foundation
- txt-20260606-213627-route-guarding-role-routing

## Out of Scope

- Listing sessions, start/end, resources (separate issues).
