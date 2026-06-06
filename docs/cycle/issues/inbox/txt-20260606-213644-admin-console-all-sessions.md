---
id: txt-20260606-213644-admin-console-all-sessions
source: text
title: "Admin console: observe all sessions + system state"
added_at: 2026-06-06T21:36:44Z
triage_attempts: 0
priority: high
---

## Problem

An internal `/admin` console (uber-admin only) for system observability: list **all** sessions regardless of owner/status, with key live state — status, teacher, participant count, active resource/current URL, open-question count. This is the operator "backdoor" to check the state of the system during demos and debugging. Read-only; never exposed to teachers/students.

## Acceptance Criteria

- [ ] `/admin` is reachable only by uber admins (others denied).
- [ ] Lists all sessions with status, owner, participant count, active resource, current URL.
- [ ] Live state updates in realtime.
- [ ] Drill-in links to a session's event log (the inspector issue).

## Verification (Playwright)

- [ ] As uber admin, with a live session running in other contexts, assert `/admin` shows that session with correct participant count + active resource, updating in realtime.
- [ ] As a non-admin user, assert `/admin` is denied.

## Blocked by

- txt-20260606-213643-admin-role-uber-admin-promotion
- txt-20260606-213630-start-end-session

## Out of Scope

- Org-scoped views (future). Mutating session state from admin (read-only here).
