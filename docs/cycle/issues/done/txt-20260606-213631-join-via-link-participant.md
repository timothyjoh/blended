---
id: txt-20260606-213631-join-via-link-participant
title: Student joins via link and becomes a participant
workflow: feature
depends_on:
  - txt-20260606-213626-magic-code-auth
  - txt-20260606-213627-route-guarding-role-routing
  - txt-20260606-213630-start-end-session
  - txt-20260606-213625-instant-permission-rules-email-privacy
triaged_at: 2026-06-06T21:53:10.362Z
source: triage
priority: critical
---
## Problem

A Student opens `/join/:joinCode`, authenticates if needed (magic code), and joins the live Session: a `Participant` is created with `role = student` and `username` defaulted to the email local-part (spec §12.3), email stored privately. Append `ParticipantJoined` and route the student to `/s/:joinCode`. A late joiner lands in the session at its current state.

This is one vertical slice: the join route, auth gate, participant creation, event append, and routing land together as a single PR. Email privacy relies on the existing permission-rules issue; auth and role routing rely on the magic-code and route-guarding issues; the live-session lifecycle relies on the start/end-session issue.

## Acceptance Criteria

- [ ] Opening a valid join link for a `live` session, after auth, creates a `Participant{role: student}` with `username` = email local-part.
- [ ] Email is stored but never exposed to other students (relies on the permission-rules issue).
- [ ] `ParticipantJoined` is appended; student is routed into `/s/:joinCode`.
- [ ] Joining a non-live or unknown session shows a clear, non-blank state.

## Verification (Playwright)

- [ ] Teacher (context A) starts a session; Student (context B) opens the join link, authenticates, and lands in the session.
- [ ] A THIRD context joins later and immediately sees the same current session state (active resource, chat) as the others — proving late-joiner sync.

## Out of Scope

- Participant roster UI, chat, resources (their own issues).
