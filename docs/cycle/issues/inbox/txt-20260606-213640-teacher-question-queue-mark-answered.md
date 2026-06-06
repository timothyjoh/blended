---
id: txt-20260606-213640-teacher-question-queue-mark-answered
source: text
title: "Teacher question queue + mark answered"
added_at: 2026-06-06T21:36:40Z
triage_attempts: 0
priority: critical
---

## Problem

The Teacher facilitation view shows the open Questions for the session (Questions only — never the raw chat) as a live queue. The Teacher can mark a Question answered (with an optional answer summary), which appends an answer event and dismisses it from the Teacher's active queue. This is the core teacher value: see what's being asked, resolve it, move on.

## Acceptance Criteria

- [ ] Teacher sees a realtime list of open Questions (not chat messages).
- [ ] Teacher can mark a Question answered, optionally with a summary; an answer event is appended.
- [ ] An answered Question is removed from the Teacher's active queue.
- [ ] New Questions appear in the queue in realtime as students ask them.

## Verification (Playwright)

- [ ] Student (context B) asks a question; Teacher (context A) sees it appear in the queue without reload.
- [ ] Teacher marks it answered; assert it leaves the teacher queue and an answered event exists.
- [ ] Confirm the teacher queue contains only `?`-derived questions, not ordinary chat.

## Blocked by

- txt-20260606-213639-auto-create-question-from-question-mark

## Out of Scope

- Student-facing answered section (separate), endorsements (separate), clustering/AI (Batch 2).
