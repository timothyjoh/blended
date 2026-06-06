---
id: txt-20260606-213642-student-answered-section
source: text
title: "Student answered-questions section"
added_at: 2026-06-06T21:36:42Z
triage_attempts: 0
priority: low
---

## Problem

For late, distracted, or reviewing students (spec goal #10), surface answered Questions (and any answer summary) in a student-visible "answered" section, separate from the live chat. Read-only.

## Acceptance Criteria

- [ ] Students see an answered section listing questions the teacher marked answered, with summary if present.
- [ ] The section updates in realtime when a question is answered.
- [ ] It is visually separate from the live chat stream.

## Verification (Playwright)

- [ ] Teacher (A) answers a question with a summary; Students (B, C) see it appear in their answered section without reload.
- [ ] A late context D shows the answered section already populated.

## Blocked by

- txt-20260606-213640-teacher-question-queue-mark-answered

## Out of Scope

- Full replay timeline (deferred). Student "still unresolved" re-open (Batch 2).
