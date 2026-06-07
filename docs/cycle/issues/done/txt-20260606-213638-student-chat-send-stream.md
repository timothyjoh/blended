---
id: txt-20260606-213638-student-chat-send-stream
title: "Student chat: send + realtime stream (teachers excluded)"
workflow: feature
depends_on:
  - txt-20260606-213630-start-end-session
  - txt-20260606-213631-join-via-link-participant
triaged_at: 2026-06-06T21:55:15.949Z
source: triage
priority: critical
---
## Problem

Students participate through a single natural-text input — there is no message-type choice (spec §9.1). Submitting a message appends a `ChatMessageSubmitted` event plus a `Message` projection (via the `writeEvent()` dual-write helper), and the message appears in the realtime chat stream visible to **students**. The **Teacher does not see the chat stream** (the Teacher sees only Questions, handled in a later issue). Submission is idempotent: a client action id de-dups double-submits (spec §15).

This is a single vertical slice — the student-facing input, the dual-write on submit, the realtime stream rendering for students, the teacher-side exclusion, and late-joiner history sync all ship together as one change.

## Acceptance Criteria

- [ ] A student submits text and it appears in the student chat stream in realtime for all students.
- [ ] No message-type selector exists; there is exactly one input box.
- [ ] The teacher facilitation view does NOT render the chat stream.
- [ ] Double-submitting the same client action id does not create duplicate messages or projections.
- [ ] Each submit writes both a `ChatMessageSubmitted` event and a `Message` projection through `writeEvent()`.

## Verification (Playwright)

- [ ] Students (contexts B and C) both see B's message appear without reload.
- [ ] A late context D joins and sees prior chat history (late-joiner sync).
- [ ] In the Teacher context A, assert the raw chat stream is not present in the DOM.
- [ ] Submit the same client action id twice and assert only one message renders.

## Dependencies

- Requires an active session lifecycle (start/end) — `txt-20260606-213630-start-end-session`.
- Requires students to be joined participants — `txt-20260606-213631-join-via-link-participant`.
- Builds on the schema + `writeEvent()` foundation already queued upstream of those.

## Out of Scope

- Question derivation from chat (next issue).
- Moderation / visibility controls (Batch 2).
