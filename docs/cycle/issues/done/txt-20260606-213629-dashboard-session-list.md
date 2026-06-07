---
id: txt-20260606-213629-dashboard-session-list
title: "Teacher dashboard: session list + open"
workflow: feature
depends_on:
  - txt-20260606-213628-create-session-draft
triaged_at: 2026-06-06T21:52:33.073Z
source: triage
priority: high
---
## Problem

The Teacher's `/dashboard` shows the sessions they own as a live (realtime) list with title and status (`draft`/`live`/`ended`), and lets them open one into the facilitation view (`/dashboard/sessions/:id`). The list reflects InstantDB changes without reload.

This is a single vertical slice: query the current user's owned sessions via InstantDB's realtime subscription, render them with title + status, and wire selection to navigate into the per-session facilitation view. No start/end controls or in-session panels here — those are separate issues.

## Acceptance Criteria

- [ ] `/dashboard` lists only the current user's owned sessions with title + status.
- [ ] The list updates in realtime when a session is created or changes status (InstantDB subscription, no manual reload).
- [ ] Selecting a session navigates to its teacher facilitation view at `/dashboard/sessions/:id`.

## Verification (Playwright)

- [ ] With the dashboard open, create a session in a SECOND context (or via the same user) and assert it appears in the list without reload.
- [ ] Click a session and assert navigation to its facilitation view.

## Out of Scope

- Start/end controls and in-session panels (their own issues).

## Notes

- Depends on session creation (`txt-20260606-213628-create-session-draft`) for the draft sessions this view lists, and transitively on the schema/auth/route-guarding foundations already in the queue.
- The realtime behavior must come from the InstantDB live query, not polling.
