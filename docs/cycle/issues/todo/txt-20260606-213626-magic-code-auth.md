---
id: txt-20260606-213626-magic-code-auth
title: Email magic-code authentication (shared flow for teacher, student, admin)
workflow: feature
depends_on:
  - txt-20260606-213624-schema-write-event-foundation
triaged_at: 2026-06-06T21:51:44.121Z
source: triage
priority: critical
---
## Problem

Every actor authenticates the same way: enter email → receive a magic code → verify → signed in. Build the single shared auth flow on InstantDB's `auth.sendMagicCode` / `auth.signInWithMagicCode`, exposed through one reusable login UI plus a shared auth hook, with sign-out. This is the single identity gate for teachers, students, and admins — role and authorization are layered on separately and are out of scope here.

This is one coherent vertical slice: the login UI, the shared hook, session persistence, sign-out, and the first-sign-in `users` row all ship together as a single PR.

## Acceptance Criteria

- [ ] A user can request a code by email and complete sign-in with that code.
- [ ] Auth state persists across reload and is readable app-wide via a shared hook (e.g. `useAuth`).
- [ ] Sign-out clears the session and returns the user to the login gate.
- [ ] On first sign-in a `users` row exists, keyed to the InstantDB auth user id, so role/admin layering can attach later.

## Verification (Playwright)

- [ ] Drive the login form: submit an email, supply the code (use InstantDB's test/dev magic-code mechanism or a seeded user), and assert the signed-in state renders.
- [ ] Reload the page and assert the session persists; then sign out and assert the login gate returns.

## Out of Scope

- Route guarding / role-based routing (handled separately).
- Admin promotion (handled separately).

## Notes

Depends on the foundation schema + `writeEvent()` helper (`txt-20260606-213624-schema-write-event-foundation`) for the `users` entity definition and the dual-write convention used when creating the first-sign-in `users` row.
