---
id: refl-0020-admin-console-unscoped-queries-have-no-i
title: Scope/paginate the admin console's unscoped
  sessions/participants/questions reads
workflow: feature
depends_on: []
triaged_at: 2026-06-07T13:29:29.219Z
source: triage
priority: medium
---
`AdminSessionList` issues three UNSCOPED live `db.useQuery` calls over the entire `sessions`, `participants`, and `questions` projections on every `/admin` load (`src/components/AdminSessionList.tsx:30-32`), then folds them client-side via `buildAdminSessionRows`. BUILD.md and REVIEW.md both call this out as an accepted MVP trade-off — full-table scans with no server-side index or pagination — and it is documented in AGENTS.md/README.md, but it has never been filed as a tracked issue. This child files and fixes that deferred work.

## Why it matters

Client-side aggregation of every participant and question row in the system grows linearly with total platform activity, not with what the admin actually views, and there is no bound on result size. A future cycle that adds load — or an admin opening the console against a populated prod dataset — will trip over this scaling cliff.

## Scope

- Introduce server-side scoping/pagination (or a precomputed admin projection) for the three unscoped reads in `AdminSessionList`, so the console no longer fetches the entire `sessions`, `participants`, and `questions` tables on every load.
- Bound the result size returned to the client and keep `buildAdminSessionRows` working against the scoped/paginated shape.
- Update the AGENTS.md/README.md notes that currently document this as an accepted full-table-scan trade-off to reflect the new behavior.
- Cover the scoped/paginated read path with a test.

## Notes

Stay within the existing ask — track and remove the unbounded scan; do not add unrelated admin features. Related to the owner-scoping index gap in `refl-0012-sessions-teacherid-unindexed-for-owner-s`; coordinate the indexing approach if both land near each other, but neither blocks the other.
