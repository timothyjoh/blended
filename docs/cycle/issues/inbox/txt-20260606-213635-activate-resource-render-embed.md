---
id: txt-20260606-213635-activate-resource-render-embed
source: text
title: "Activate a resource and render it for teacher + students"
added_at: 2026-06-06T21:36:35Z
triage_attempts: 0
priority: critical
---

## Problem

The Teacher activates a queued Resource, making it the session's active resource. Append `ResourceActivated`, setting `activeResourceId` and the initial `currentUrl`. Both the teacher facilitation view and every student view render the active resource in a controlled iframe pane, in realtime. This is the core "students see what the teacher chose" slice (URL-following is the next issue).

## Acceptance Criteria

- [ ] Teacher activates a queued resource; `activeResourceId` + `currentUrl` are set and `ResourceActivated` is appended.
- [ ] Teacher and all student views render the active resource in a controlled iframe.
- [ ] Switching the active resource updates everyone in realtime.

## Verification (Playwright)

- [ ] Teacher (context A) activates resource R1; Students (contexts B, C) show R1 without reload.
- [ ] Teacher activates R2; assert B and C both switch to R2. A late-joining context D immediately shows the current active resource.

## Blocked by

- txt-20260606-213630-start-end-session
- txt-20260606-213633-queue-a-resource
- txt-20260606-213631-join-via-link-participant

## Out of Scope

- Teacher-driven URL stepping (next issue), blocked-embed fallback (separate).
