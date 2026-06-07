---
id: txt-20260606-213639-auto-create-question-from-question-mark
title: Auto-create a Question from messages ending in '?'
workflow: feature
depends_on:
  - txt-20260606-213638-student-chat-send-stream
triaged_at: 2026-06-06T21:55:34.700Z
source: triage
priority: critical
---
## Problem

Interim, AI-free classification: when a submitted chat `Message`'s text ends with `?`, also create a `Question` (emitting `QuestionCreated`) linked to the source message. Non-`?` messages stay chat-only. This heuristic is deliberately a single, isolated decision point so Batch 2 can replace it with AI classification with no other change (see `CONTEXT.md`). Questions are a flat list (no clustering this phase).

The key design constraint: the classification decision must live behind **one** function/seam (e.g. `classifyMessage(text) -> { isQuestion: boolean }`) so that swapping the trailing-`?` heuristic for an AI call in Batch 2 touches nothing else.

## Acceptance Criteria

- [ ] A message whose trimmed text ends with `?` creates a linked `Question` with `QuestionCreated` appended.
- [ ] A message not ending in `?` does not create a Question.
- [ ] The `Question` links back to its source `Message` and the originating participant.
- [ ] The classification decision is isolated in a single function/seam, ready for an AI swap with no other change.
- [ ] Question creation reuses the established `writeEvent()` dual-write helper for `QuestionCreated`.

## Verification (Playwright)

- [ ] Student submits "what is mitosis?" → assert a `Question` is created and links back to the message.
- [ ] Student submits "ok thanks" → assert no `Question` is created.
- [ ] Assert the `QuestionCreated` event exists and references the source message (observability).

## Blocked by

- txt-20260606-213638-student-chat-send-stream (Question creation hooks into the chat message submit path)

## Out of Scope

- Clustering, ranking, AI classification (Batch 2).
- Teacher question queue UI (subsequent issue).
