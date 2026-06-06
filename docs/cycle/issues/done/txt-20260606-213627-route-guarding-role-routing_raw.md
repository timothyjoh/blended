---
id: txt-20260606-213627-route-guarding-role-routing
source: text
title: "Route guarding + role-aware routing"
added_at: 2026-06-06T21:36:27Z
triage_attempts: 0
priority: high
---

## Problem

Gate the app by auth and route users to the right place. Unauthenticated visits to protected routes (`/dashboard`, `/dashboard/sessions/:id`, `/s/:joinCode`, `/admin`) redirect to login; after login the user returns to their intended destination. A plain authenticated user lands on `/dashboard`; a user arriving via a join link lands in the target session after auth. Roles are session-scoped (see `CONTEXT.md`), so guarding is about auth + intended-destination, not a global teacher/student flag (admin is the exception, handled in its own issue).

## Acceptance Criteria

- [ ] Visiting a protected route while unauthenticated redirects to login and preserves the intended destination.
- [ ] After login the user is returned to the intended destination (including a `/join/:joinCode` deep link).
- [ ] A bare authenticated visit routes to `/dashboard`.
- [ ] Routes the user is not authorized for (e.g. a non-owner opening another teacher's `/dashboard/sessions/:id`) are denied gracefully.

## Verification (Playwright)

- [ ] Hit a protected route logged out → redirected to login; complete login → landed on the originally requested route.
- [ ] In a second context, a different user opening the first user's teacher session route is denied.

## Blocked by

- txt-20260606-213626-magic-code-auth

## Out of Scope

- The dashboard/session/admin screens themselves (their own issues).
