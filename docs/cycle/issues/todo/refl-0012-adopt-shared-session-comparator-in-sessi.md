---
id: refl-0012-adopt-shared-session-comparator-in-sessi
title: Adopt shared compareSessionsForList in SessionLifecycle and StudentChat
workflow: feature
depends_on: []
triaged_at: 2026-06-07T09:15:08.593Z
source: triage
priority: medium
---
Cycle 0012 extracted a pure, unit-tested `compareSessionsForList` (createdAt asc, tie-break by id, with a NaN/missing-`createdAt` totality guard) into `src/lib/sessions.ts:781-786`, but deliberately scoped the extraction to SessionList only. Two pre-existing inline copies of the same ordering rule remain untouched:

- `src/components/SessionLifecycle.tsx:67`
- `src/components/StudentChat.tsx:58`

Both read roughly `if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt; …` and lack the helper's totality guard, so the three copies can silently diverge.

## Scope

Point `SessionLifecycle` and `StudentChat` at the shared `compareSessionsForList` helper, adapting for each component's row shape, and delete the two inline comparator copies. Consolidate the ordering rule in one tested place.

This is a mechanical adoption of an already-tested helper — no design ambiguity. Keep the scope to these two call sites; do not change ordering semantics. Confirm existing tests still pass and that the helper covers the row shapes used by both components (add a small adapter or unit coverage if a shape difference requires it).
