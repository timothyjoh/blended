---
id: txt-20260606-213640-teacher-question-queue-mark-answered
title: Teacher question queue + mark answered
workflow: feature
depends_on:
  - txt-20260606-213639-auto-create-question-from-question-mark
triaged_at: 2026-06-06T21:55:52.467Z
source: triage
priority: critical
---
## Problem

The Teacher facilitation view shows the open Questions for the session as a live queue — **Questions only, never the raw chat**. The Teacher can mark a Question answered (with an optional answer summary), which appends an answer event and dismisses it from the Teacher's active queue. This is the core teacher value: see what's being asked, resolve it, move on.

This builds directly on auto-created Questions (`?`-derived) from the student chat stream. The teacher queue is fed only by those Question entities, not by ordinary chat messages.

## Acceptance Criteria

- [ ] Teacher sees a realtime list of open Questions for the active session (not chat messages).
- [ ] Teacher can mark a Question answered, optionally attaching a short answer summary; an answer event is appended via the dual-write event helper.
- [ ] An answered Question is removed from the Teacher's active queue immediately.
- [ ] New Questions appear in the queue in realtime as students ask them — no reload.
- [ ] The queue is scoped to the current session and reflects open Questions only.

## Verification (Playwright)

- [ ] Student (context B) asks a question ending in `?`; Teacher (context A) sees it appear in the queue without reload.
- [ ] Teacher marks it answered (with and without a summary); assert it leaves the teacher queue and an answered event exists in the event log.
- [ ] Confirm the teacher queue contains only `?`-derived Questions, not ordinary chat messages.

## Out of Scope

- Student-facing answered section (separate work item).
- Endorsements (separate).
- Clustering / AI summarization (Batch 2).
