---
id: txt-20260606-213629-dashboard-session-list
source: text
title: "Teacher dashboard: session list + open"
added_at: 2026-06-06T21:36:29Z
triage_attempts: 0
priority: high
---

## Problem

The Teacher's `/dashboard` shows the sessions they own as a live (realtime) list with title and status (`draft`/`live`/`ended`), and lets them open one into the facilitation view (`/dashboard/sessions/:id`). The list reflects InstantDB changes without reload.

## Acceptance Criteria

- [ ] `/dashboard` lists only the current user's owned sessions with title + status.
- [ ] The list updates in realtime when a session is created or changes status.
- [ ] Selecting a session opens its teacher facilitation view.

## Verification (Playwright)

- [ ] With the dashboard open, create a session in a SECOND context (or via the same user) and assert it appears in the list without reload.
- [ ] Click a session and assert navigation to its facilitation view.

## Blocked by

- txt-20260606-213628-create-session-draft

## Out of Scope

- Start/end controls and in-session panels (their own issues).
