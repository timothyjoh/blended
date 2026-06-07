---
id: txt-20260606-213627-route-guarding-role-routing
title: Route guarding + role-aware routing
workflow: feature
depends_on:
  - txt-20260606-213626-magic-code-auth
triaged_at: 2026-06-06T21:52:00.139Z
source: triage
priority: high
---
## Problem

Gate the app by auth and route users to the right place. Unauthenticated visits to protected routes (`/dashboard`, `/dashboard/sessions/:id`, `/s/:joinCode`, `/admin`) must redirect to login; after login the user returns to their intended destination. A plain authenticated user lands on `/dashboard`; a user arriving via a join link lands in the target session after auth.

Roles are session-scoped (see `CONTEXT.md`), so guarding is about **auth + intended-destination**, not a global teacher/student flag. Admin is the exception and is handled in its own issue — this slice covers the auth gate, intended-destination preservation, and graceful denial for routes the authenticated user is not authorized for.

This builds on the magic-code authentication flow (the blocking dependency), which establishes the authenticated session this guard reads from.

## Acceptance Criteria

- [ ] Visiting a protected route while unauthenticated redirects to login and preserves the intended destination.
- [ ] After login the user is returned to the intended destination (including a `/join/:joinCode` deep link).
- [ ] A bare authenticated visit routes to `/dashboard`.
- [ ] Routes the user is not authorized for (e.g. a non-owner opening another teacher's `/dashboard/sessions/:id`) are denied gracefully.

## Verification (Playwright)

- [ ] Hit a protected route logged out → redirected to login; complete login → landed on the originally requested route.
- [ ] In a second context, a different user opening the first user's teacher session route is denied.

## Out of Scope

- The dashboard/session/admin screens themselves (their own issues).
- Admin role gating (handled in its own issue).
