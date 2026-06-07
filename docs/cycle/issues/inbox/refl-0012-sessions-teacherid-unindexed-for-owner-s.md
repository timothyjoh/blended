---
id: refl-0012-sessions-teacherid-unindexed-for-owner-s
source: reflection
title: sessions-teacherid-unindexed-for-owner-scoped-live-query
added_at: 2026-06-07T09:12:02.019Z
triage_attempts: 0
priority: low
origin_cycle_id: "0012"
---

The new owner-scoped live query filters `sessions` by `where: { teacherId: user.id }` server-side, but `sessions.teacherId` is un-indexed (`src/lib/db.ts:48-59`). BUILD.md and PLAN.md both flag this as fine at MVP scale under open-read rules and explicitly defer a server-side index to a separate cycle 'if query performance ever matters' — but it is not yet filed as a tracked issue.

Low urgency today (small data, open reads), but it is a concrete future trip-hazard: the dashboard is now a per-teacher hot path that will scan unindexed as session counts grow. Filing it ensures the deferred index work is tracked rather than living only in cycle docs.
