---
id: txt-20260606-213645-admin-event-log-inspector
title: Admin event-log inspector (internal observability)
workflow: feature
depends_on:
  - txt-20260606-213643-admin-role-uber-admin-promotion
  - txt-20260606-213624-schema-write-event-foundation
triaged_at: 2026-06-06T21:57:44.557Z
source: triage
priority: medium
---
## Problem

Internal observability tool, uber-admin only: a read-only, chronological view of a session's `SessionEvent` stream so operators can verify that a given series of user interactions produced the correct data. This is the core reason the event log records every interaction (see ADR-0003). The view shows the envelope fields (type, actorRole, occurredAt, payload) in order, with live updates as new events arrive.

This is a single vertical slice: build the inspector UI, wire it to the realtime `SessionEvent` stream, and gate access to uber admins. Testing and access-control verification are steps within this cycle.

## Acceptance Criteria

- [ ] Uber admin can open a session's event stream in chronological order.
- [ ] Each entry shows type, actor role, timestamp, and payload.
- [ ] The view updates in realtime as new events are appended.
- [ ] Accessible only to uber admins.

## Verification (Playwright)

- [ ] Drive a short flow in other contexts (create → start → join → activate → chat "hi?"); as uber admin assert the inspector shows the expected event sequence in order (`SessionCreated`, `SessionStarted`, `ParticipantJoined`, `ResourceActivated`, `ChatMessageSubmitted`, `QuestionCreated`).
- [ ] Assert a non-admin cannot access the inspector.

## Dependencies

- Uber-admin role + promotion (`txt-20260606-213643-admin-role-uber-admin-promotion`) gates access.
- Schema + `writeEvent()` foundation (`txt-20260606-213624-schema-write-event-foundation`) provides the `SessionEvent` stream this inspector reads.

## Out of Scope

- Replay reconstruction UI / time-travel projections (deferred).
- Export tooling.
