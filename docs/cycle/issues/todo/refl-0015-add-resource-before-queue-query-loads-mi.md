---
id: refl-0015-add-resource-before-queue-query-loads-mi
title: Block add-resource until the queue query loads so sortOrder lands at max+1
workflow: feature
depends_on: []
triaged_at: 2026-06-07T10:45:29.253Z
source: triage
priority: medium
---
The add-resource control in `SessionLifecycle.tsx` is always rendered and its submit button is gated only on `resPending` — not on the `sessionResources` live query (`rq`) being loaded. `currentMaxSortOrder` is derived from `resources`, which is `[]` whenever `rq.isLoading` or `rq.error` is true. A teacher who submits during the load window (or while the queue query is errored) computes `currentMaxSortOrder == null` → `sortOrder = 0`, colliding with already-queued rows instead of landing at `max+1`.

This violates the SPEC acceptance guarantee that a new resource gets a strictly-greater `sortOrder` and renders last. The id tie-break keeps the final order deterministic, so it isn't data corruption, but the new resource can silently jump ahead of existing ones. The original review credited `currentMaxSortOrder` from the live query without addressing the not-loaded/errored state, and there is no test for an add issued before the queue query resolves — the same not-loaded gap class flagged in refl-0008.

Fix direction: disable the add control (or block `addResource`) until `rq` is loaded and error-free, or derive end-of-queue `sortOrder` from a source that does not read as empty mid-load. Cover the failure path with a test that submits while the resource query is unresolved (loading and errored) and asserts the new row still lands strictly last.
