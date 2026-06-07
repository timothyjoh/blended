# SPEC — Cycle 0020: Admin console — observe all sessions + live system state (uber-admin only)

## WHY
The uber-admin role and the `/admin` landing exist (cycle 0019), but `/admin` is an empty placeholder ("Observability surfaces arrive in a later cycle"). An operator who signs in as an uber admin still has no way to see what the system is doing — they cannot answer "which sessions exist right now, who owns them, who's in them, and what's on screen?" during a demo or a debugging session. ADR-0003 names internal observability as the entire reason the admin role exists; today that promise is unfulfilled.

## CONCRETE USER BENEFIT
An uber admin opens `/admin` and sees a live, system-wide list of **every** session — across all owners and all statuses (`draft`/`live`/`ended`/`archived`) — each row showing its status, owning teacher, participant count, active resource / current URL, and open-question count. When a student joins or a teacher activates a resource in another browser, the matching row's counts and active-resource cell update **without a reload**. No teacher or student (or unauthenticated visitor) can reach this view.

## USABLE END-STATE
A signed-in uber admin visiting `/admin` gets a populated, realtime operator console instead of a placeholder paragraph. They can scan all sessions at a glance, watch live state change as activity happens elsewhere, and click any row to drill into that session's event log. A non-admin who navigates to `/admin` is denied exactly as before.

## Objective
This cycle replaces the `/admin` placeholder with a read-only, realtime, system-wide session console: a single nested island inside the existing `AdminRouteGuard` that runs unscoped live queries over `sessions`, `participants`, and `questions`, folds them through a pure total helper into per-session rows (status, owner, participant count, active resource + current URL, open-question count), and renders each row as a drill-in link to the (separately-tracked) event-log inspector. It reuses the cycle-0019 admin role/route-guard and the existing session/participant/question projections verbatim — no new auth, no new schema, no mutations.

## Source Issue
`txt-20260606-213644-admin-console-all-sessions` — "Admin console: observe all sessions + live system state (uber-admin only)"

## Scope

### In Scope
- A pure, total, unit-tested aggregation helper `buildAdminSessionRows(sessions, participants, questions)` (in `src/lib/admin.ts`) that joins the three projection lists into ordered rows carrying `{ id, title, status, teacherId, participantCount, activeResourceId, currentUrl, openQuestionCount }` — defensive against missing/partial rows, never throwing, deterministically ordered.
- An `AdminSessionList` island mounted inside the existing `AdminRouteGuard` on `/admin`, running unscoped realtime `db.useQuery` over `sessions`, `participants`, and `questions`, rendering the helper's rows with mutually-exclusive loading / error / empty / populated states, each row a drill-in link to `/admin/sessions/:id`.

### Out of Scope
- The event-log inspector view itself (`txt-20260606-213645-admin-event-log-inspector`) — this cycle only wires the `/admin/sessions/:id` link target; the destination page is a sibling cycle.
- Any mutation of session state from the console — strictly read-only (no start/end, no activate, no promote).
- Org/group-scoped admin views (deferred per ADR-0003).
- Showing any teacher/student email — privacy is structural; the owner is identified by `teacherId` only.
- Server-side indexing or pagination of the unscoped queries (MVP-scale scan is accepted; note it as a deferred follow-up).

## Requirements
- The console renders only inside `AdminRouteGuard` (cycle 0019): an uber admin sees the list; a teacher/student gets `route-guard-denied`; an unauthenticated visitor bounces to `/login?next=%2Fadmin`. No new access-control logic is written — reuse the existing guard.
- Lists **all** sessions regardless of owner or status. Each row shows: status, owning `teacherId`, participant count, active resource (the `activeResourceId`/`currentUrl` from the session row), current URL, and open-question count (`questions` for that session with `status !== 'answered'`).
- Counts and active-resource/current-URL cells update in **realtime** (driven by `db.useQuery` re-render, not polling) as other contexts join participants, activate resources, broadcast URLs, or create/answer questions.
- Each row is an `<a href="/admin/sessions/:id">` carrying `data-session-id`, so the drill-in target is wired even though the inspector page lands separately.
- Rows are ordered deterministically by the pure helper (createdAt asc, tie-broken by id) so the list never reorders nondeterministically between renders.
- No email is read or rendered anywhere in the console or the helper. No mutation, no `writeEvent`, no `instant-cli push schema`, no `perms:push` this cycle (the `sessions`/`participants`/`questions` open-read rules and all consumed fields already exist).
- Style follows the existing dashboard surfaces (`SessionList`): Tailwind utility classes + the shared `Card` primitives, two-space indent, no semicolons.
- **Failure behavior**: A query error on any of the three live queries is surfaced inline (`role="alert"`) and `console.error('[AdminSessionList] …')`-logged — never swallowed — and the error state is checked BEFORE the empty state so an errored query never renders as falsely-empty. When the system genuinely has zero sessions, an explicit empty-state element renders (never a blank region). The aggregation helper tolerates a session with no participants/questions (counts default to 0), a participant/question row referencing an unknown `sessionId` (ignored, not crashed), and absent optional fields (`activeResourceId`/`currentUrl` render as an explicit "none" affordance) without throwing. Loading renders an explicit element, never a flash of empty. Access denial is delegated to `AdminRouteGuard` (a non-admin sees `route-guard-denied`, never the list shell).

## Acceptance Criteria
- [ ] As an uber admin, `/admin` renders a list containing every session in the system regardless of owner or status, each row showing status, owner `teacherId`, participant count, active resource, current URL, and open-question count. *(user-observable benefit)*
- [ ] With a live session running in other browser contexts, the matching `/admin` row's participant count and active-resource cell update in realtime (no reload) as those contexts join and activate a resource.
- [ ] Each session row is a link to `/admin/sessions/:id` carrying `data-session-id` (the inspector drill-in target is wired).
- [ ] `buildAdminSessionRows` is a pure total function with unit coverage proving: correct participant/open-question tallies, sessions with zero participants/questions yield count 0, a participant/question with an unknown `sessionId` is ignored, and deterministic ordering (createdAt asc, id tie-break).
- [ ] **Failure path:** when a live query errors, `/admin` renders an inline `role="alert"` error (checked before the empty state) and logs `[AdminSessionList] …`; when zero sessions exist it renders an explicit empty-state element — neither case renders a blank region or a falsely-empty list.
- [ ] **Failure path:** a non-admin user (teacher or student) navigating to `/admin` is denied (`route-guard-denied`) and never sees the session list shell; an unauthenticated visitor bounces to `/login?next=%2Fadmin`.
- [ ] No email string appears in the rendered console or in `buildAdminSessionRows` output (owner shown as `teacherId`).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run astro check` clean).

## Testing Strategy
- **Unit (Vitest)**: `src/lib/admin.test.ts` covers `buildAdminSessionRows` — happy-path joins, zero-count sessions, orphan participant/question rows referencing unknown sessions, missing optional fields, open-question filtering (`status !== 'answered'`), and deterministic ordering. Pure function, no mocks.
- **E2E (Playwright)**: extend the admin suite (e.g. `e2e/admin-console.spec.ts`) — happy path: as the allowlisted uber admin, with sessions created/started/joined/activated in other browser contexts, assert `/admin` shows those sessions with correct participant counts and active resource, and that both update in realtime as the other contexts change state. Failure path: as a non-admin (teacher or student) assert `/admin` is denied (`route-guard-denied`); assert an unauthenticated visitor bounces to `/login`. Skip loudly (not silently pass) without the admin env (`INSTANT_ADMIN_TOKEN`/`ADMIN_EMAILS`), mirroring `e2e/admin-route.spec.ts`.
- Key scenarios: realtime cross-context update, all-status/all-owner coverage, query-error inline surfacing, empty-state, access denial for each non-admin role.
- Fixed testids to introduce for downstream cycles: `admin-session-list` (container), `admin-session-list-loading`, `admin-session-list-error`, `admin-session-list-empty`, `admin-session-item` (per row, with `data-session-id`), `admin-session-status`, `admin-session-owner`, `admin-session-participant-count`, `admin-session-active-resource`, `admin-session-current-url`, `admin-session-open-questions`.

## Documentation Updates
- **AGENTS.md**: add a cycle 0020 paragraph documenting `AdminSessionList`, the `buildAdminSessionRows` pure seam in `src/lib/admin.ts`, the unscoped realtime queries over `sessions`/`participants`/`questions`, the no-schema/no-perms-push fact, the read-only/no-email invariants, the `/admin/sessions/:id` drill-in target reserved for the inspector cycle, the deferred unindexed-scan trade-off, and the fixed testids above.
- **README.md**: surface that uber admins now have a live system-wide session console at `/admin` (read-only, internal observability).
- **docs/adr/0003**: no change required (this cycle realizes, not revises, the documented decision); note in the cycle docs that it fulfills ADR-0003's observability intent.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Uber-admin role + `/admin` route guard (`txt-20260606-213643-admin-role-uber-admin-promotion`, cycle 0019): `AdminRouteGuard`, `authorizeAdmin`, the server-only `ADMIN_EMAILS` bootstrap. Reused as-is.
- Session lifecycle + projections (`txt-20260606-213630-start-end-session` and cycles 0005/0006/0007/0015/0016/0017): the `sessions` (status, `teacherId`, `activeResourceId`, `currentUrl`), `participants` (`sessionId`), and `questions` (`sessionId`, `status`) projection rows this console reads.
- Open-read permission rules on `sessions`/`participants`/`questions` (cycle 0003/0013) already permit the unscoped client reads — no `perms:push` this cycle.
- No new schema fields, no new env vars. E2E requires the existing `INSTANT_ADMIN_TOKEN` + `ADMIN_EMAILS` admin env (skips loudly when unset).
