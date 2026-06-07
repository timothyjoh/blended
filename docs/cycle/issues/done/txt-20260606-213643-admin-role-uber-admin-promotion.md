---
id: txt-20260606-213643-admin-role-uber-admin-promotion
title: Global admin role + uber-admin bootstrap & promotion
workflow: feature
depends_on:
  - txt-20260606-213624-schema-write-event-foundation
  - txt-20260606-213626-magic-code-auth
  - txt-20260606-213627-route-guarding-role-routing
triaged_at: 2026-06-06T21:57:03.077Z
source: triage
priority: high
---
## Problem

Introduce a global `adminLevel` on the User, separate from the session-scoped teacher/student roles (see `docs/adr/0003-global-admin-role-and-internal-observability.md`). Admins authenticate with the same email magic-code flow used everywhere else. The first and only level for now is **uber admin**, which can observe all sessions. The first uber admin is bootstrapped from an env allowlist of admin emails (`ADMIN_EMAILS`), and an existing uber admin can promote another user to uber admin.

This is a single vertical slice: schema field, sign-in bootstrap, promotion action (event-logged), and route authorization, end to end with tests.

## Acceptance Criteria

- [ ] `users.adminLevel` exists with `none` as the default and `uber` as the elevated value.
- [ ] A user whose email is in the `ADMIN_EMAILS` bootstrap allowlist becomes `uber` on sign-in.
- [ ] An existing uber admin can promote another user to `uber`, and the change is recorded via the `writeEvent()` event log.
- [ ] Non-admins cannot promote anyone and cannot reach admin-only routes (e.g. `/admin`).

## Verification (Playwright)

- [ ] Sign in as an allowlisted email and assert uber-admin capability (e.g. `/admin` is reachable).
- [ ] As an uber admin, promote a second user; in that second user's context assert they gain admin access. As a normal (non-allowlisted, unpromoted) user, assert both promotion and `/admin` are denied.

## Dependencies

- Blocked by `txt-20260606-213626-magic-code-auth` — bootstrap and promotion ride on the shared magic-code sign-in flow.
- Builds on `txt-20260606-213624-schema-write-event-foundation` for the `adminLevel` field and the `writeEvent()` dual-write helper used to log promotions.
- Builds on `txt-20260606-213627-route-guarding-role-routing` for enforcing admin-only route access and denial.

## Out of Scope

- Organization/group-scoped admins (future, noted in ADR-0003).
- Admin console screens — these are tracked as separate issues.
