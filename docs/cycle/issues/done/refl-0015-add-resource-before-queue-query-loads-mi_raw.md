---
id: refl-0015-add-resource-before-queue-query-loads-mi
source: reflection
title: add-resource-before-queue-query-loads-mis-computes-sortorder
added_at: 2026-06-07T10:41:51.760Z
triage_attempts: 1
priority: medium
origin_cycle_id: "0015"
---

The add-resource control in `SessionLifecycle.tsx` is always rendered and its submit button is gated only on `resPending` — not on the `sessionResources` live query (`rq`) being loaded. `currentMaxSortOrder` is derived from `resources`, which is `[]` whenever `rq.isLoading` or `rq.error` is true. So a teacher who submits during the load window (or while the queue query is errored) computes `currentMaxSortOrder == null` → `sortOrder = 0`, colliding with already-queued rows instead of landing at `max+1`.

This violates the SPEC acceptance guarantee that a new resource gets a strictly-greater `sortOrder` and renders last. The id tie-break keeps the final order deterministic, so it isn't data corruption, but the new resource can silently jump ahead of existing ones. Review credited `currentMaxSortOrder` from the live query without addressing the not-loaded/errored state, and there is no test for an add issued before the queue query resolves — consistent with the not-loaded gap class filed in earlier cycles (refl-0008).

Suggested direction: disable the add control (or block `addResource`) until `rq` is loaded and error-free, or derive end-of-queue `sortOrder` from a source that does not read as empty mid-load. Add a failure-path test that submits while the resource query is unresolved and asserts the new row still lands last.
