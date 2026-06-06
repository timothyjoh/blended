---
id: txt-20260606-213642-student-answered-section
title: Student answered-questions section
workflow: feature
depends_on:
  - txt-20260606-213640-teacher-question-queue-mark-answered
triaged_at: 2026-06-06T21:56:34.516Z
source: triage
priority: low
---
## Problem

For late, distracted, or reviewing students (spec goal #10), surface answered Questions (and any answer summary) in a student-visible "answered" section, kept separate from the live chat stream. The section is read-only and exists so students who missed the live moment can catch up on what has already been resolved.

This builds on the teacher question queue + mark-answered flow: once a teacher marks a question answered (optionally with a summary), that question should flow into the student-facing answered section in realtime.

## Acceptance Criteria

- [ ] Students see an answered section listing questions the teacher marked answered, including the answer summary when one is present.
- [ ] The section updates in realtime (InstantDB subscription) when a question is marked answered — no reload required.
- [ ] It is visually separate from the live chat stream (distinct region/panel), so answered content does not get lost in chat scroll.
- [ ] The section is read-only for students in this slice.

## Verification (Playwright)

- [ ] Teacher (A) answers a question with a summary; Students (B, C) see it appear in their answered section without reload.
- [ ] A late-joining context (D) loads the session and shows the answered section already populated with previously-answered questions.

## Blocked by

- txt-20260606-213640-teacher-question-queue-mark-answered

## Out of Scope

- Full replay timeline (deferred).
- Student "still unresolved" / re-open flow (Batch 2).
