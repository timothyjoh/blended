---
id: txt-20260606-213641-endorse-a-question
source: text
title: "Students endorse (upvote) a question"
added_at: 2026-06-06T21:36:41Z
triage_attempts: 0
priority: low
---

## Problem

So duplicate questions become support instead of noise (spec goal #8), Students can endorse an existing Question. Endorsements are anonymous and aggregated; the Teacher's question queue can order by endorsement count. One endorsement per participant per question.

## Acceptance Criteria

- [ ] A student can endorse a question; `MessageUpvoted`/endorsement event appended and `endorsementCount` increments.
- [ ] A participant cannot endorse the same question twice.
- [ ] Endorsement counts update in realtime; teacher queue can sort by count.
- [ ] Endorsements are anonymous (no endorser identity shown).

## Verification (Playwright)

- [ ] Students (B, C) endorse the same question; assert count = 2 and B cannot double-count.
- [ ] Teacher (A) sees the updated count in realtime and ordering reflects it.

## Blocked by

- txt-20260606-213639-auto-create-question-from-question-mark

## Out of Scope

- Clustering (Batch 2). Endorsing chat messages generally.
