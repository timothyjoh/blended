---
id: txt-20260606-213631-join-via-link-participant
source: text
title: "Student joins via link and becomes a participant"
added_at: 2026-06-06T21:36:31Z
triage_attempts: 0
priority: critical
---

## Problem

A Student opens `/join/:joinCode`, authenticates if needed (magic code), and joins the live Session: a `Participant` is created with `role = student` and `username` defaulted to the email local-part (spec §12.3), email stored privately. Append `ParticipantJoined` and route the student to `/s/:joinCode`. A late joiner lands in the session at its current state.

## Acceptance Criteria

- [ ] Opening a valid join link for a `live` session, after auth, creates a `Participant{role: student}` with `username` = email local-part.
- [ ] Email is stored but never exposed to other students (relies on the permission-rules issue).
- [ ] `ParticipantJoined` is appended; student is routed into `/s/:joinCode`.
- [ ] Joining a non-live or unknown session shows a clear, non-blank state.

## Verification (Playwright)

- [ ] Teacher (context A) starts a session; Student (context B) opens the join link, authenticates, and lands in the session.
- [ ] A THIRD context joins later and immediately sees the same current session state (active resource, chat) as the others — proving late-joiner sync.

## Blocked by

- txt-20260606-213626-magic-code-auth
- txt-20260606-213627-route-guarding-role-routing
- txt-20260606-213630-start-end-session

## Out of Scope

- Participant roster UI, chat, resources (their own issues).
