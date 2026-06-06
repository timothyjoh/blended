---
id: txt-20260606-213632-participant-list-presence
title: Teacher participant roster + basic presence
workflow: feature
depends_on:
  - txt-20260606-213631-join-via-link-participant
triaged_at: 2026-06-06T21:53:26.651Z
source: triage
priority: medium
---
## Problem

The Teacher facilitation view shows a live roster of session participants by `username` only (never email, per privacy rules), with basic presence (joined / last-seen). The roster updates in realtime as students join, leave, or reconnect.

This is a single vertical slice: realtime roster query, presence/last-seen signal, presence event recording, and the privacy guarantee that no email is ever rendered — built and tested together as one cycle.

## Acceptance Criteria

- [ ] Roster lists participants by username; no email is ever rendered.
- [ ] Roster updates in realtime on join/leave.
- [ ] A basic presence/last-seen signal is shown (heartbeat or last-activity).
- [ ] `ParticipantPresenceUpdated` (and/or `ParticipantLeft`/`ParticipantReconnected`) events are recorded via the `writeEvent()` dual-write helper.

## Verification (Playwright)

- [ ] Teacher (context A) watches the roster; Students (contexts B, C) join and appear without reload.
- [ ] A student context closes; assert the roster reflects the presence change.
- [ ] Assert no email text appears anywhere in the teacher DOM (privacy invariant).

## Notes / Dependencies

- Builds on the participant join flow (`txt-20260606-213631-join-via-link-participant`), which establishes participants and session membership.
- Presence event recording should use the established `writeEvent()` dual-write helper and respect the email-privacy permission rules already in the pipeline.

## Out of Scope

- Rich presence (typing indicators, cursors — Batch 2).
