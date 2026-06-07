---
id: refl-0003-tighten-participants-fail-open-update-an
title: Tighten participants update/delete from fail-open default to row-owner +
  owning teacher/admin
workflow: feature
depends_on:
  - txt-20260606-213631-join-via-link-participant
triaged_at: 2026-06-07T00:55:22.390Z
source: triage
priority: high
---
## Problem

The `participants` permission rule currently allows `update` and `delete` for any authenticated user (`auth.id != null`) — see `src/lib/perms.ts:86-93`. This is a fail-open default: any signed-in student can mutate or delete another student's participant row (username, role, chatStatus).

This is already acknowledged as a Batch-2 follow-up in `REVIEW.md` finding 4 and `MUST-FIX.md` Task 4, and was out of cycle 0003's SPEC scope because no participant rows are written yet. Participant creation lands with join-via-link (`txt-20260606-213631-join-via-link-participant`), so this fix must follow it so that the participant-join cycle does not silently inherit the open default.

## Scope

Restrict `participants` write authorization so the open default does not ship once participant rows exist:

- `update` and `delete` permitted only for the row owner — `auth.id == data.userId` — plus the owning teacher / admin of the session the participant belongs to.
- Apply the `$default` tightening already noted in `PLAN.md` alongside this change so no entity falls back to a permissive default.
- Keep `create` consistent with how join-via-link writes participant rows.

Full vertical slice: update `src/lib/perms.ts`, cover the new authorization paths (owner can edit own row; non-owner student is denied; owning teacher/admin allowed) with tests, and confirm against the live Instant app permissions behavior where applicable.

## References

- `src/lib/perms.ts:86-93` — current fail-open rule
- `REVIEW.md` finding 4
- `MUST-FIX.md` Task 4
- `PLAN.md` — `$default` tightening note
