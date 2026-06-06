---
id: txt-20260606-213641-endorse-a-question
title: Students endorse (upvote) a question
workflow: feature
depends_on:
  - txt-20260606-213639-auto-create-question-from-question-mark
triaged_at: 2026-06-06T21:56:17.176Z
source: triage
priority: low
---
## Problem

Duplicate questions should become a signal of support, not noise (spec goal #8). Let a Student endorse (upvote) an existing Question. Endorsements are anonymous and aggregated into an `endorsementCount`, which the Teacher's question queue can sort by. Exactly one endorsement per participant per question, enforced server-side.

This builds directly on the auto-created Question entity (`txt-20260606-213639-auto-create-question-from-question-mark`) and feeds the Teacher question queue (`txt-20260606-213640-teacher-question-queue-mark-answered`), which can order by endorsement count.

## Scope

- Endorse action available to Students on any existing Question in the active session.
- Append an endorsement event (`MessageUpvoted` / endorsement) and increment `endorsementCount` via the existing `writeEvent()` dual-write path.
- Enforce one endorsement per participant per question (idempotent — a second endorse from the same participant is a no-op, no double-count). Consider modelling this as a uniqueness constraint or a participant→question endorsement link rather than a raw counter increment.
- Counts propagate in realtime to all session clients; the Teacher queue can sort by count.
- Endorsements are anonymous: no endorser identity is shown or derivable in the UI.

## Acceptance Criteria

- [ ] A student can endorse a question; an endorsement event is appended and `endorsementCount` increments.
- [ ] A participant cannot endorse the same question twice (second attempt is a no-op).
- [ ] Endorsement counts update in realtime; the teacher queue can sort by count.
- [ ] Endorsements are anonymous — no endorser identity is shown.

## Verification (Playwright)

- [ ] Students B and C endorse the same question; assert count = 2 and that B cannot double-count (repeat endorse keeps count at 2).
- [ ] Teacher A sees the updated count in realtime and queue ordering reflects it.

## Out of Scope

- Question clustering (Batch 2).
- Endorsing chat messages generally (only Questions are endorsable here).
