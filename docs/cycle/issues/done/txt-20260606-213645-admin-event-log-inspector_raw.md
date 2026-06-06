---
id: txt-20260606-213645-admin-event-log-inspector
source: text
title: "Admin event-log inspector (internal observability)"
added_at: 2026-06-06T21:36:45Z
triage_attempts: 0
priority: medium
---

## Problem

Internal observability tool (uber-admin only): a read-only, chronological view of a session's `SessionEvent` stream so operators can verify that a given series of user interactions produced the correct data (the core reason the event log records every interaction — see ADR-0003). Show envelope fields (type, actorRole, occurredAt, payload) in order, with live updates as new events arrive.

## Acceptance Criteria

- [ ] Uber admin can open a session's event stream in chronological order.
- [ ] Each entry shows type, actor role, timestamp, and payload.
- [ ] The view updates in realtime as new events are appended.
- [ ] Accessible only to uber admins.

## Verification (Playwright)

- [ ] Drive a short flow in other contexts (create → start → join → activate → chat "hi?"); as uber admin assert the inspector shows the expected event sequence in order (`SessionCreated`, `SessionStarted`, `ParticipantJoined`, `ResourceActivated`, `ChatMessageSubmitted`, `QuestionCreated`).
- [ ] Assert a non-admin cannot access the inspector.

## Blocked by

- txt-20260606-213643-admin-role-uber-admin-promotion
- txt-20260606-213624-schema-write-event-foundation

## Out of Scope

- Replay reconstruction UI / time-travel projections (deferred). Export tooling.
