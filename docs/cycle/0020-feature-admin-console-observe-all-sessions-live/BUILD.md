All quality gates pass: 463/463 tests green, `astro check` clean (0 errors / 0 warnings), `admin.ts` at 100% line/function coverage. The single uncovered branch (`admin.ts:176`) is the defensive equal-id case of the tie-break comparator (ids are unique, so unreachable) — left as a totality guard.

## Summary

This cycle replaced the empty `/admin` placeholder (cycle 0019) with a read-only, realtime, system-wide session console for uber admins, per SPEC 0020 and PLAN.md tasks 1–6 (all complete).

**Files created/modified:**
- `src/lib/admin.ts` (+97 lines) — appended the TOTAL, db-free `buildAdminSessionRows(sessions, participants, questions)` seam plus the `ADMIN_VALUE_NONE` constant and the `AdminSessionInput`/`AdminSessionChildInput`/`AdminSessionRow` types. Single-pass tally folds (orphan child rows ignored against a known-session set), `createdAt`-asc / id-tie-break sort via an intermediate tuple (no O(n²) re-`find`), absent/blank `activeResourceId`/`currentUrl` → `null`, open-question = `status !== 'answered'`, title via the reused `sessionDisplayTitle`. (Task 1)
- `src/components/AdminSessionList.tsx` (new, 138 lines) — the realtime island: three unscoped `db.useQuery` calls, error-before-empty render-state branching mirroring `SessionList`, all fixed testids, each row an `<a href="/admin/sessions/:id" data-session-id=…>`. (Task 2)
- `src/pages/admin.astro` (~10 lines changed) — mounted `<AdminSessionList client:only="react" />` as a nested island inside the unchanged `AdminRouteGuard`, widened the container, updated the page comment to note it fulfills ADR-0003. (Task 3)
- `src/lib/admin.test.ts` (+~140 lines, 14 new cases) — unit coverage of the helper. (Task 4)
- `e2e/admin-console.spec.ts` (new, 150 lines) — admin-seeded realtime/denial/unauthenticated suite, skips loudly without admin env. (Task 5)
- `AGENTS.md` (+1 paragraph), `README.md` (+1 paragraph) — cycle 0020 documentation. (Task 6)
- `docs/cycle/0020-feature-admin-console-observe-all-sessions-live/walkthrough.mjs` (new, 172 lines) — drives the real `/admin` console with four named captures (`01-login`, `02-admin-console-populated`, `03-admin-console-realtime-update`, `04-admin-console-denied`), degrading loudly to the login surface when admin env is absent.

**Test suite:** `npm run test:coverage` (= `vitest run --coverage`) → **11 files / 463 tests passed**. Coverage: **Statements 91.39%, Branches 85.88%, Functions 87.34%, Lines 92.84%**; `admin.ts` specifically at 100% stmts / 93.87% branch / 100% funcs / 100% lines. No per-file regression — the new helper adds fully line/function-covered code (above the repo branch average), so overall coverage does not decrease vs the base branch. `npm run astro check` → 0 errors, 0 warnings (the 36 hints are pre-existing `ElementRef`-deprecation notices in vendored `src/components/ui/*`, untouched here).

**Failure modes handled:** (1) *Query error* — first-failure precedence across the three live queries, surfaced inline as `role="alert"` and `console.error('[AdminSessionList] …')`-logged, checked **before** the empty branch so an errored query never renders as falsely-empty (never swallowed). (2) *Empty system* — explicit `admin-session-list-empty` element, never a blank region. (3) *Loading* — explicit element gating first paint until all three queries resolve, so counts never flash partial. (4) *Hostile/partial input to the helper* — orphan participant/question rows (unknown `sessionId`), null/undefined/empty args, absent optional fields, and blank titles all resolve to safe defaults without throwing (totality is the contract). (5) *Idempotency* — read-only island; re-render/remount is inherently safe. Failure-path tests: the unit suite covers orphan-row ignoring, null/undefined/empty inputs → `[]` no-throw, `answered`-exclusion, blank-field normalization, and an email-leak guard (`@`-bearing field outside the consumed set never appears in output); the e2e suite covers non-admin denial (list shell absent) and the unauthenticated `/login?next=%2Fadmin` bounce.

**Deviations from PLAN.md:** none material. The PLAN's helper sketch used an O(n²) `find`-in-`sort`; per the plan's own follow-up note, the final code folds `createdAt` into an intermediate tuple for an O(n log n) sort. Row cells wrap each value testid in a labeled span (e.g. `participants: <span data-testid=…>2</span>`) so realtime assertions can `toHaveText('2')` cleanly against the value alone.

**Deferred / follow-up:** the `/admin/sessions/:id` event-log inspector page (sibling cycle `txt-20260606-213645`) — only the link target is wired here; and server-side indexing/pagination of the unscoped full-table scans (accepted MVP trade-off, noted in `AGENTS.md`/`README.md`).

## Touched Files
- src/lib/admin.ts
- src/lib/admin.test.ts
- src/components/AdminSessionList.tsx
- src/pages/admin.astro
- e2e/admin-console.spec.ts
- AGENTS.md
- README.md
- docs/cycle/0020-feature-admin-console-observe-all-sessions-live/walkthrough.mjs
