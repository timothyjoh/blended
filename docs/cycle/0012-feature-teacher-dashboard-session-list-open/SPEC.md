# SPEC — Cycle 0012: Teacher Dashboard — Session List + Open

## WHY
A teacher can create sessions (cycle 0005) and operate one if they already
hold its URL (cycle 0006), but the `/dashboard` shell shows only the
`NewSession` control. There is no way to see the sessions you own or to
return to one you created earlier — once a session scrolls out of the
just-created card, the only path back is a hand-typed
`/dashboard/sessions/<id>` URL. A teacher running a real class has no home
base: no roster of their own sessions, no live indication of which are
`draft`/`live`/`ended`, and no click-through into the facilitation view.

## CONCRETE USER BENEFIT
After this cycle, a signed-in teacher who opens `/dashboard` sees a live
list of the sessions they own — each with its title and current status —
and can click any one to land in its facilitation view
(`/dashboard/sessions/:id`). When they create a new session in another tab,
or a session's status changes, the list updates on screen with no reload.
They can now find and re-enter their own sessions, which was previously
impossible without manually reconstructing the URL.

## USABLE END-STATE
A teacher opens `/dashboard`, sees every session they own listed with title
and status (`draft`/`live`/`ended`), watches a newly-created session appear
in that list without refreshing, clicks one, and arrives at the existing
teacher facilitation view for that session.

## Objective
This cycle delivers a realtime, owner-scoped session list on the teacher
`/dashboard`. It adds one new island that subscribes — via InstantDB's live
query — to the `sessions` projection rows where `teacherId` equals the
signed-in user's id, renders each as a selectable row showing title and
status, and links each row to `/dashboard/sessions/:id`. The list reflects
InstantDB changes (new session created, status transition) without polling
or manual reload, giving the teacher a durable home for the sessions they
own and the navigation path into facilitation.

## Source Issue
`txt-20260606-213629-dashboard-session-list` — "Teacher dashboard: session list + open"

## Scope

### In Scope
- A new `SessionList` island mounted inside the existing `RouteGuard` on
  `/dashboard`, running a `db.useQuery` over `sessions` filtered to the
  signed-in user's owned rows (`where: { teacherId: user.id }`), rendering
  each session's title and status, ordered stably client-side.
- Each row links/navigates to that session's facilitation view at
  `/dashboard/sessions/:id` (reusing the existing route and
  `SessionRouteGuard`).
- Realtime reflection of `sessions` changes (creation, status transition)
  through the live query — visible empty, loading, and error states with no
  polling and no manual reload.

### Out of Scope
- Start/end lifecycle controls and any in-session panels — those live on the
  facilitation view (cycle 0006) and in their own issues.
- Creating sessions (cycle 0005 `NewSession` already owns this; it stays
  mounted alongside the new list).
- Schema changes, new permission rules, or any `instant-cli push` — the
  `sessions` entity, its `teacherId` field, and its open-read /
  owner-only-write rules already exist (cycle 0003).
- Sorting/filtering controls, pagination, search, archive, or delete.
- Surfacing sessions the user joined as a Student (this list is owned
  sessions only).

## Requirements
- The list renders only sessions where `session.teacherId === user.id`. The
  filter is applied in the InstantDB `where` clause (not merely client-side),
  so the query subscribes to the owner's rows; identity comes from `useAuth`
  (never `db.useAuth()` directly).
- Each rendered row shows the session title and its current status
  (`draft`/`live`/`ended`) and provides a navigation affordance to
  `/dashboard/sessions/:id`.
- The list updates in realtime from the InstantDB live query — a session
  created or transitioned in another context appears/updates without reload.
  No polling.
- The island is mounted as a nested `client:only="react"` island inside
  `RouteGuard` on `/dashboard`, hydrating only when authenticated, mirroring
  how `NewSession` is mounted today.
- Rows display title and status only — never any raw email (SPEC §40);
  `sessions` projection rows carry no email, so this is structural.
- Empty state: when the signed-in teacher owns no sessions, render an
  explicit, non-blank empty-state element (never a blank region).
- **Failure behavior**: On a live-query error, the island surfaces the error
  inline (`role="alert"`) and `console.error`s it (`[SessionList] …`) rather
  than rendering a silent blank or a falsely-empty list — the error is never
  swallowed. While the query is unresolved it shows an explicit loading
  state, never a flash of "no sessions". If the user id is unresolved (no
  auth), the island renders nothing actionable rather than issuing an
  unscoped query (pass `null` to `db.useQuery`, matching the
  `sessionId ? … : null` guard used in `SessionLifecycle`). A row whose
  projection is missing a title falls back to a non-blank placeholder rather
  than rendering an empty, unclickable row.

## Acceptance Criteria
- [ ] Opening `/dashboard` as a signed-in teacher renders a list of that
  user's owned sessions, each showing title and status — a session owned by a
  different user does not appear. *(user-observable benefit)*
- [ ] Creating a session in a second browser context (same user) makes a new
  row appear in the open dashboard list without a manual reload. *(realtime,
  user-observable benefit)*
- [ ] Clicking a session row navigates to `/dashboard/sessions/:id` and the
  facilitation view (`session-root`) renders for that session. *(navigation,
  user-observable benefit)*
- [ ] When the live query errors, the island renders an inline
  `role="alert"` error (`session-list-error`) and logs `[SessionList] …` via
  `console.error`; it does NOT render a falsely-empty or blank list.
  *(failure-path)*
- [ ] When the signed-in teacher owns no sessions, an explicit empty-state
  element (`session-list-empty`) is shown — not a blank region.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).
- [ ] `npm run astro check` reports no new errors; no compiler/linter
  warnings introduced.

## Testing Strategy
- **Vitest** for any pure logic extracted from the island (e.g. the stable
  client-side ordering comparator and any title/status display fallback),
  tested beside the module as `*.test.ts` — happy path plus hostile input
  (missing title, equal `createdAt`, empty list).
- **Playwright** e2e (`e2e/dashboard-session-list.spec.ts`, skips loudly
  without `INSTANT_ADMIN_TOKEN` like the sibling suites):
  - Happy path: signed-in teacher with ≥1 owned session sees it listed with
    title + status.
  - Realtime: with the dashboard open, create a session in a second context
    (or via admin write) and assert the new row appears with no reload.
  - Navigation: click a row and assert arrival at
    `/dashboard/sessions/:id` (`session-root` visible).
  - Scoping: a session owned by a different user is not listed.
  - Failure/edge: a user with zero owned sessions sees the explicit
    empty-state element rather than a blank region.
- E2E is required because this is a UI + realtime change; the suite must
  prove the live update, not just initial render.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Add a cycle-0012 Data Layer note describing the
  `SessionList` island — the owner-scoped `sessions` live query
  (`where: { teacherId }`), its mount inside `RouteGuard` on `/dashboard`
  beside `NewSession`, the realtime-not-polling guarantee, the
  loading/empty/error states, and the fixed testids it introduces
  (`session-list`, `session-list-item` with `data-session-id`,
  `session-list-item-title`, `session-list-item-status`, `session-list-empty`,
  `session-list-loading`, `session-list-error`) for downstream cycles to
  reuse.
- **README.md**: Surface that the teacher dashboard now lists the teacher's
  own sessions live and lets them open one into facilitation.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `db` client + `sessions` entity and schema, and `useAuth`
  (`src/lib/db.ts`, `src/lib/useAuth.ts`) — already present.
- `RouteGuard` (`src/components/RouteGuard.tsx`) and the existing
  `/dashboard` shell (`src/pages/dashboard/index.astro`) — already present.
- The facilitation route `/dashboard/sessions/[id].astro` guarded by
  `SessionRouteGuard` (cycle 0004/0006) — already present; this cycle only
  navigates into it.
- `sessions` open-read / owner-only-write permission rules (cycle 0003) —
  open reads make the owner-scoped query legal; no `perms:push` this cycle.
- shadcn/ui primitives (`Card`, `Button`) already used by sibling islands.
- `INSTANT_ADMIN_TOKEN` (e2e-only) for the realtime/scoping Playwright legs;
  `PUBLIC_INSTANTDB_APP_ID` for the app itself.
