---
id: refl-0020-admin-console-unscoped-queries-have-no-i
source: reflection
title: admin-console-unscoped-queries-have-no-index-or-pagination
added_at: 2026-06-07T13:25:47.525Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0020"
---

`AdminSessionList` issues three UNSCOPED live `db.useQuery` calls over the entire `sessions`, `participants`, and `questions` projections on every `/admin` load (`src/components/AdminSessionList.tsx:30-32`), then folds them client-side via `buildAdminSessionRows`. BUILD.md and REVIEW.md both call this out as an accepted MVP trade-off — full-table scans with no server-side index or pagination — and it is documented in AGENTS.md/README.md, but it has not been filed as a tracked issue.

This is a real scaling cliff: client-side aggregation of every participant and question row in the system grows linearly with total platform activity, not with what the admin views, and there is no bound on result size. A future cycle that adds load (or an admin opening the console against a populated prod dataset) will trip over it.

Suggested direction: file the deferred work so it is tracked — introduce server-side scoping/pagination (or a precomputed admin projection) for the three unscoped reads before the platform accumulates non-trivial session volume. Related to the owner-scoping index gap in `refl-0012-sessions-teacherid-unindexed-for-owner-s`.
