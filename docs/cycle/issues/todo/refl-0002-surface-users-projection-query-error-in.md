---
id: refl-0002-surface-users-projection-query-error-in
title: Surface the users projection-query error in useAuth
workflow: feature
depends_on:
  - refl-0002-establish-runnable-gate-for-useauth-inte
triaged_at: 2026-06-06T23:29:59.886Z
source: triage
priority: medium
---
## Context

In `src/lib/useAuth.ts:41-42`, when `usersQ.error` is set, `usersLoaded` collapses to `false`, so `shouldCreateUserRow` returns `false` and the first-sign-in `users` row is never created. Today this happens with **no observable signal** — no `console.error`, no `role="alert"`, nothing — unlike the creation `.catch` path, which does log. A persistent projection-query failure would silently leave a signed-in user with no `users` row, breaking downstream username/role/adminLevel reads in later cycles (route guarding, sessions, admin promotion) with no trace of why.

This behaviour is fail-safe (no partial or duplicate write) and was explicitly flagged as acceptable-for-now in REVIEW.md Finding 2. The sharp edge is the **silence**: it is a new failure branch that emits no log or observable signal.

## Goal

Make the `usersQ.error` branch observable, and decide how far to surface it. The handling choice is a small design decision to make as part of this cycle:

- **At minimum:** log the projection-query error from the hook (mirroring the existing creation `.catch` logging) so the failure is observable in the console.
- **Then decide** whether to also surface a recoverable error to the user (e.g. a `role="alert"` message) and/or retry on the next query resolution, rather than silently leaving the user with no `users` row.

Do not expand scope beyond making this single failure branch observable and choosing an appropriate handling level — this is not a broad error-handling overhaul of `useAuth`.

## Acceptance

- When `usersQ.error` is set, the error is logged (at least) and no longer disappears silently.
- The chosen handling (log-only vs. user-facing alert vs. retry) is implemented consistently with the existing patterns in `useAuth.ts`.
- The fail-safe property is preserved: still no partial or duplicate `users` write on error.
- The error branch is covered by the useAuth verification gate established in `refl-0002-establish-runnable-gate-for-useauth-inte`.
