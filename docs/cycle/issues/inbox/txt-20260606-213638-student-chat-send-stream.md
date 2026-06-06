---
id: txt-20260606-213638-student-chat-send-stream
source: text
title: "Student chat: send + realtime stream (teachers excluded)"
added_at: 2026-06-06T21:36:38Z
triage_attempts: 0
priority: critical
---

## Problem

Students participate through a single natural-text input — no message-type choice (spec §9.1). Submitting appends `ChatMessageSubmitted` + a `Message` projection and the message appears in the realtime chat stream visible to **students**. The **Teacher does not see the chat stream** (only Questions, in a later issue). Submission is idempotent (a client action id de-dups double-submits, spec §15).

## Acceptance Criteria

- [ ] A student submits text and it appears in the student chat stream in realtime for all students.
- [ ] No message-type selector exists; one input box.
- [ ] The teacher facilitation view does NOT render the chat stream.
- [ ] Double-submitting the same client action does not create duplicates.

## Verification (Playwright)

- [ ] Students (contexts B, C) both see B's message appear without reload.
- [ ] A late context D joins and sees prior chat history (late-joiner sync).
- [ ] In the Teacher context A, assert the raw chat stream is not present.

## Blocked by

- txt-20260606-213630-start-end-session
- txt-20260606-213631-join-via-link-participant

## Out of Scope

- Question derivation (next issue), moderation/visibility (Batch 2).
