---
id: refl-0012-adopt-shared-session-comparator-in-sessi
source: reflection
title: adopt-shared-session-comparator-in-sessionlifecycle-and-studentchat
added_at: 2026-06-07T09:12:02.019Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0012"
---

Cycle 0012 extracted a pure, unit-tested `compareSessionsForList` (createdAt asc, tie-break by id) into `src/lib/sessions.ts:781-786`, but deliberately left the two pre-existing inline copies of the same comparator untouched — `src/components/SessionLifecycle.tsx:67` and `src/components/StudentChat.tsx:58` (`if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt; …`). There are now three copies of one ordering rule, and the inline pair lacks the new helper's NaN/missing-`createdAt` totality guard, so they can silently diverge.

The SPEC intentionally scoped the extraction to SessionList only, which is why this is a follow-up rather than an in-cycle fix. A future cycle should point SessionLifecycle and StudentChat at the shared, tested helper (adapting for their row shapes) and delete the inline copies, consolidating the rule in one place. No design ambiguity — mechanical adoption of an already-tested helper.
