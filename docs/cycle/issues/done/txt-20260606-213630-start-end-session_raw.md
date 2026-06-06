---
id: txt-20260606-213630-start-end-session
source: text
title: "Teacher starts / ends a session (lifecycle state machine)"
added_at: 2026-06-06T21:36:30Z
triage_attempts: 0
priority: critical
---

## Problem

The Teacher transitions a session `draft → live` (start) and `live → ended` (end), enforcing the legal transitions in spec §6.2. Starting appends `SessionStarted` and enables the join flow; ending appends `SessionEnded` and closes live participation. Illegal transitions fail with an actionable error and do not partially mutate state.

## Acceptance Criteria

- [ ] Teacher can start a `draft` session → `live` (`SessionStarted` appended); join is enabled only once live.
- [ ] Teacher can end a `live` session → `ended` (`SessionEnded` appended).
- [ ] Illegal transitions (e.g. end a `draft`, start an `ended`) are rejected without mutating state.
- [ ] Only the owning Teacher can start/end.

## Verification (Playwright)

- [ ] Teacher starts a session; in a SECOND context a student join attempt is allowed only after it is live.
- [ ] Teacher ends the session; assert live participation is closed and `SessionStarted`/`SessionEnded` events both exist in order.

## Blocked by

- txt-20260606-213628-create-session-draft

## Out of Scope

- Archive state and replay (deferred). Join flow itself (separate issue).
