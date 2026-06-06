---
id: txt-20260606-213632-participant-list-presence
source: text
title: "Teacher participant roster + basic presence"
added_at: 2026-06-06T21:36:32Z
triage_attempts: 0
priority: medium
---

## Problem

The Teacher facilitation view shows a live roster of session participants by `username` only (never email, per privacy rules), with basic presence (joined / last-seen). The roster updates in realtime as students join, leave, or reconnect.

## Acceptance Criteria

- [ ] Roster lists participants by username; no email is ever rendered.
- [ ] Roster updates in realtime on join/leave.
- [ ] A basic presence/last-seen signal is shown (heartbeat or last-activity).
- [ ] `ParticipantPresenceUpdated` (and/or `ParticipantLeft`/`ParticipantReconnected`) events are recorded.

## Verification (Playwright)

- [ ] Teacher (context A) watches the roster; Students (contexts B, C) join and appear without reload.
- [ ] A student context closes; assert the roster reflects the presence change. Assert no email text appears anywhere in the teacher DOM.

## Blocked by

- txt-20260606-213631-join-via-link-participant

## Out of Scope

- Rich presence (typing indicators, cursors — Batch 2).
