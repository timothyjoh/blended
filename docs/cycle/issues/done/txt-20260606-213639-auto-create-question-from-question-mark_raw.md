---
id: txt-20260606-213639-auto-create-question-from-question-mark
source: text
title: "Auto-create a Question from messages ending in '?'"
added_at: 2026-06-06T21:36:39Z
triage_attempts: 0
priority: critical
---

## Problem

Interim, AI-free classification: when a submitted chat Message's text ends with `?`, also create a `Question` (`QuestionCreated`) linked to the source message. Non-`?` messages stay chat-only. This heuristic is deliberately a single, isolated decision point so Batch 2 can replace it with AI classification with no other change (see `CONTEXT.md`). Questions are a flat list (no clustering this phase).

## Acceptance Criteria

- [ ] A message whose trimmed text ends with `?` creates a linked `Question` with `QuestionCreated` appended.
- [ ] A message not ending in `?` does not create a Question.
- [ ] The Question links back to its source Message/participant.
- [ ] The classification decision is isolated in one function/seam for later AI swap.

## Verification (Playwright)

- [ ] Student submits "what is mitosis?" → assert a Question is created; submits "ok thanks" → assert no Question.
- [ ] Assert the `QuestionCreated` event exists and references the message (observability).

## Blocked by

- txt-20260606-213638-student-chat-send-stream

## Out of Scope

- Clustering, ranking, AI classification (Batch 2). Teacher queue UI (next issue).
