---
id: txt-20260606-213626-magic-code-auth
source: text
title: "Email magic-code authentication (teacher + student + admin)"
added_at: 2026-06-06T21:36:26Z
triage_attempts: 0
priority: critical
---

## Problem

Every actor authenticates the same way: enter email → receive a magic code → verify → signed in. Build the shared auth flow on InstantDB's `auth.sendMagicCode` / `auth.signInWithMagicCode`, exposed through one reusable login UI + hook, with sign-out. This is the single identity gate for teachers, students, and admins (role/authz is layered on separately).

## Acceptance Criteria

- [ ] A user can request a code by email and complete sign-in with that code.
- [ ] Auth state persists across reload and is readable app-wide via a shared hook.
- [ ] Sign-out clears the session.
- [ ] On first sign-in a `users` row exists (id keyed to the auth user) for later role/admin layering.

## Verification (Playwright)

- [ ] Drive the login form, submit email, supply the code (use InstantDB's test/dev code mechanism or a seeded user), assert signed-in state.
- [ ] Reload the page and assert the session persists; sign out and assert the gate returns.

## Blocked by

- txt-20260606-213624-schema-write-event-foundation

## Out of Scope

- Route guarding/role routing (separate). Admin promotion (separate).
