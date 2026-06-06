---
id: txt-20260606-213634-reorder-remove-resources
source: text
title: "Teacher reorders / removes queued resources"
added_at: 2026-06-06T21:36:34Z
triage_attempts: 0
priority: medium
---

## Problem

The Teacher can reorder the resource queue (change `sortOrder`) and remove a queued resource. Append `ResourceReordered` and `ResourceRemoved`. Removing the currently active resource is handled gracefully (clears active state or is disallowed — choose and document).

## Acceptance Criteria

- [ ] Teacher can reorder resources; new order persists and is reflected in realtime.
- [ ] Teacher can remove a queued resource; `ResourceRemoved` appended.
- [ ] `ResourceReordered` appended on reorder.
- [ ] Removing the active resource has defined, non-broken behavior.

## Verification (Playwright)

- [ ] Teacher reorders the queue; in a SECOND context (another teacher view of the same session, or reload) assert the new order.
- [ ] Teacher removes a resource; assert it disappears and the corresponding event exists.

## Blocked by

- txt-20260606-213633-queue-a-resource

## Out of Scope

- Activation/sync/embedding (separate issues).
