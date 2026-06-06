---
id: txt-20260606-213643-admin-role-uber-admin-promotion
source: text
title: "Global admin role + uber-admin bootstrap & promotion"
added_at: 2026-06-06T21:36:43Z
triage_attempts: 0
priority: high
---

## Problem

Introduce a global `adminLevel` on the User (separate from session-scoped teacher/student roles — see `docs/adr/0003-global-admin-role-and-internal-observability.md`). Admins authenticate with the same email magic-code flow. The first level is **uber admin** (can observe all sessions). Bootstrap the first uber admin from an env allowlist of admin emails (`ADMIN_EMAILS`, For Review), and let an existing uber admin promote another user to uber admin.

## Acceptance Criteria

- [ ] `users.adminLevel` exists (`none` default, `uber`).
- [ ] A user whose email is in the bootstrap allowlist becomes `uber` on sign-in.
- [ ] An existing uber admin can promote another user to `uber`; the change is event-logged.
- [ ] Non-admins cannot promote anyone and cannot reach admin-only routes.

## Verification (Playwright)

- [ ] Sign in as an allowlisted email → assert uber-admin capability (e.g. `/admin` reachable).
- [ ] As uber admin, promote a second user; in that second user's context assert they gain admin access. As a normal user, assert promotion + `/admin` are denied.

## Blocked by

- txt-20260606-213626-magic-code-auth

## Out of Scope

- Organization/group-scoped admins (future, noted in ADR-0003). Admin console screens (separate issues).
