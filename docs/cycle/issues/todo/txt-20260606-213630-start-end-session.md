---
id: txt-20260606-213630-start-end-session
title: Teacher starts / ends a session (lifecycle state machine)
workflow: feature
depends_on:
  - txt-20260606-213628-create-session-draft
triaged_at: 2026-06-06T21:52:48.843Z
source: triage
priority: critical
---
## Problem

The Teacher transitions a session `draft → live` (start) and `live → ended` (end), enforcing the legal transitions in spec §6.2. Starting appends `SessionStarted` and enables the join flow; ending appends `SessionEnded` and closes live participation. Illegal transitions fail with an actionable error and do not partially mutate state.

This is a single vertical slice: the lifecycle state machine plus its event appends and authorization, landed as one cycle. The transition guard, the two events, owner-only enforcement, and the join-enablement gate all belong together — splitting them would leave half a state machine.

## Acceptance Criteria

- [ ] Teacher can start a `draft` session → `live` (`SessionStarted` appended); join is enabled only once live.
- [ ] Teacher can end a `live` session → `ended` (`SessionEnded` appended).
- [ ] Illegal transitions (e.g. end a `draft`, start an `ended`) are rejected without mutating state.
- [ ] Only the owning Teacher can start/end.

## Verification (Playwright)

- [ ] Teacher starts a session; in a SECOND context a student join attempt is allowed only after it is live.
- [ ] Teacher ends the session; assert live participation is closed and `SessionStarted`/`SessionEnded` events both exist in order.

## Dependencies

Builds on the session-draft creation flow (`txt-20260606-213628-create-session-draft`), which establishes the `draft` session and the `writeEvent()` append path this state machine drives.

## Out of Scope

- Archive state and replay (deferred).
- The join flow itself (separate issue) — this slice only gates its enablement on `live`.
