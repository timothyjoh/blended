---
id: refl-0012-sessions-teacherid-unindexed-for-owner-s
title: Add a server-side index on sessions.teacherId for the owner-scoped
  dashboard query
workflow: feature
depends_on: []
triaged_at: 2026-06-07T09:15:35.094Z
source: triage
priority: low
---
## Context

The teacher dashboard's owner-scoped live query filters `sessions` by `where: { teacherId: user.id }` server-side, but `sessions.teacherId` is currently un-indexed (`src/lib/db.ts:48-59`). BUILD.md and PLAN.md both note this is acceptable at MVP scale under open-read rules and explicitly defer a server-side index to a separate cycle 'if query performance ever matters' — but the deferral has only lived in cycle docs, never as a tracked issue. This files it.

## Why it matters

Low urgency today (small data, open reads), but the dashboard is now a per-teacher hot path. As session counts grow, the owner-scoped query will scan `sessions` unindexed. This is a concrete, foreseeable performance trip-hazard worth tracking so the deferred index work doesn't get lost.

## Scope

- Add a server-side index on `sessions.teacherId` in the schema (`src/lib/db.ts:48-59`) so the owner-scoped dashboard live query can be served from the index rather than a full scan.
- Confirm the index is reflected in the schema that gets pushed to the live Instant app, and that the existing owner-scoped dashboard query continues to return the correct per-teacher results.
- Cover/verify the query path so the indexed lookup is exercised.
- Update BUILD.md / PLAN.md to mark the previously-deferred index as delivered (remove or amend the 'defer to a separate cycle' note).

## Out of scope

Do not broaden to indexing other entities or revisiting the open-read permission model — this slice is specifically the `sessions.teacherId` index that the dashboard query needs.
