---
id: txt-20260606-213644-admin-console-all-sessions
title: "Admin console: observe all sessions + live system state (uber-admin only)"
workflow: feature
depends_on:
  - txt-20260606-213643-admin-role-uber-admin-promotion
  - txt-20260606-213630-start-end-session
triaged_at: 2026-06-06T21:57:24.281Z
source: triage
priority: high
---
## Problem

An internal `/admin` console (uber-admin only) for system observability: list **all** sessions regardless of owner or status, with key live state — status, teacher/owner, participant count, active resource / current URL, and open-question count. This is the operator "backdoor" used to check system state during demos and debugging. It is strictly read-only and must never be exposed to teachers or students.

## Scope

Full vertical slice: the `/admin` route, the uber-admin-only access guard, the all-sessions list query (across every owner and status), realtime live-state binding, and drill-in links to a session's event log. Reuse the existing role/route-guarding and session lifecycle work this depends on — do not re-implement auth or session state here.

## Acceptance Criteria

- [ ] `/admin` is reachable only by uber admins; all other users (teachers, students, unauthenticated) are denied.
- [ ] Lists **all** sessions regardless of owner or status, each showing: status, owner/teacher, participant count, active resource, and current URL. Include open-question count per the problem statement.
- [ ] Live state updates in realtime (participant count, active resource, current URL change without reload).
- [ ] Each row has a drill-in link to that session's event log (the inspector issue) — wire the link target even though the inspector view itself is tracked separately.

## Verification (Playwright)

- [ ] As an uber admin, with a live session running in other browser contexts, assert `/admin` shows that session with the correct participant count and active resource, and that both update in realtime as the other contexts change state.
- [ ] As a non-admin user (teacher or student), assert `/admin` is denied.

## Out of Scope

- Org-scoped views (future).
- Mutating session state from admin — this console is read-only.
