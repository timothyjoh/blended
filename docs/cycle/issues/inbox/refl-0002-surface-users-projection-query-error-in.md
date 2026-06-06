---
id: refl-0002-surface-users-projection-query-error-in
source: reflection
title: surface-users-projection-query-error-in-useauth
added_at: 2026-06-06T23:27:11.351Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0002"
---

In `src/lib/useAuth.ts:41-42`, when `usersQ.error` is set, `usersLoaded` collapses to `false`, so `shouldCreateUserRow` returns `false` and the first-sign-in `users` row is never created — with no `console.error`, no `role="alert"`, and no other observable signal (unlike the creation `.catch` path, which does log). A persistent projection-query failure would therefore silently leave a signed-in user with no `users` row, breaking downstream username/role/adminLevel reads in later cycles (route guarding, sessions, admin promotion) with no trace of why.

This is fail-safe (no partial/duplicate write) and was explicitly flagged as acceptable-for-now in REVIEW.md Finding 2, but the silence is the sharp edge: it is a new failure branch that emits no log/observable signal. Suggested direction: at minimum log the query error from the hook so the gap is observable; then decide whether to surface a recoverable error to the user or retry on the next resolution. The handling choice (log-only vs. user-facing vs. retry) is a small design decision, so deferring rather than mechanically patching.
