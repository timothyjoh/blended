---
id: txt-20260606-213635-activate-resource-render-embed
title: Activate a resource and render it for teacher + students
workflow: feature
depends_on:
  - txt-20260606-213630-start-end-session
  - txt-20260606-213633-queue-a-resource
  - txt-20260606-213631-join-via-link-participant
triaged_at: 2026-06-06T21:54:17.834Z
source: triage
priority: critical
---
## Problem

The Teacher activates a queued Resource, making it the session's active resource. This is the core "students see what the teacher chose" slice — URL-following comes in a later issue.

When the teacher activates a queued resource, append a `ResourceActivated` event and set the session's `activeResourceId` and the initial `currentUrl` (derived from the resource). Both the teacher facilitation view and every student view then render the active resource in a controlled iframe pane, updating in realtime as the active resource changes.

This is a single vertical slice: the activation write (event + state) plus the realtime-rendered iframe pane shared by teacher and student views. Ship it as one cycle — the event append, the state mutation, and the rendering surfaces are not independently valuable on their own.

## Acceptance Criteria

- [ ] Teacher activates a queued resource; `activeResourceId` + `currentUrl` are set and a `ResourceActivated` event is appended (dual-write via the foundation `writeEvent()` helper).
- [ ] Teacher and all student views render the active resource in a controlled iframe pane.
- [ ] Switching the active resource updates everyone in realtime (no reload).
- [ ] A context that joins after activation immediately shows the current active resource.

## Verification (Playwright)

- [ ] Teacher (context A) activates resource R1; Students (contexts B, C) show R1 without reload.
- [ ] Teacher activates R2; assert B and C both switch to R2.
- [ ] A late-joining context D immediately shows the current active resource.

## Out of Scope

- Teacher-driven URL stepping (next issue).
- Blocked-embed fallback for resources that refuse to render in an iframe (separate issue).

## Notes

- Builds on the started-session lifecycle, the queued-resource list, and participant join — all three are prerequisites since activation operates on a queued resource within a live session that participants have joined.
