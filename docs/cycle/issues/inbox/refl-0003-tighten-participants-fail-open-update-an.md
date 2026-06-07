---
id: refl-0003-tighten-participants-fail-open-update-an
source: reflection
title: tighten participants fail-open update and delete before join cycle
added_at: 2026-06-07T00:51:58.749Z
triage_attempts: 0
priority: high
origin_cycle_id: "0003"
---

The `participants` rule allows `update` and `delete` to any `auth.id != null` (`src/lib/perms.ts:86-93`), so any signed-in student can mutate or delete another student's participant row (username, role, chatStatus). It is a fail-open default. This is out of this cycle's SPEC scope (no participant rows are written yet; join-via-link lands later) and is acknowledged in `REVIEW.md` finding 4 and `MUST-FIX.md` Task 4 as a Batch-2 follow-up — but it has not been filed as a discrete issue.

File it so the participant-join cycle does not silently inherit the open default: when participant creation lands, restrict update/delete to the row owner (`auth.id == data.userId`) plus the owning teacher/admin, alongside the `$default` tightening already noted in PLAN.md.
