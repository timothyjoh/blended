---
id: txt-20260606-213634-reorder-remove-resources
title: Teacher reorders / removes queued resources
workflow: feature
depends_on:
  - txt-20260606-213633-queue-a-resource
triaged_at: 2026-06-06T21:53:58.566Z
source: triage
priority: medium
---
## Problem

The Teacher can reorder the resource queue (change `sortOrder`) and remove a queued resource. Append `ResourceReordered` and `ResourceRemoved` events via the `writeEvent()` dual-write helper. Removing the currently active resource must have defined, non-broken behavior — either clear active state or disallow removal; choose one and document the decision in the issue body and code.

This is one vertical slice building on the existing resource queue: reorder + remove, with realtime persistence and event sourcing. Activation, sync, and embedding are explicitly out of scope (separate issues).

## Acceptance Criteria

- [ ] Teacher can reorder resources; new `sortOrder` persists and is reflected in realtime for other viewers.
- [ ] Teacher can remove a queued resource; `ResourceRemoved` appended.
- [ ] `ResourceReordered` appended on reorder.
- [ ] Removing the active resource has defined, documented behavior (clears active state OR is disallowed) — pick one and document it.

## Verification (Playwright)

- [ ] Teacher reorders the queue; in a SECOND context (another teacher view of the same session, or a reload) assert the new order is reflected.
- [ ] Teacher removes a resource; assert it disappears from the queue and the corresponding `ResourceRemoved` event exists.
- [ ] Exercise the active-resource removal path and assert the documented behavior holds (no broken state).

## Blocked by

- txt-20260606-213633-queue-a-resource (the queue and `ResourceQueued` event must exist first).

## Out of Scope

- Activation / sync / embedding (separate issues).
