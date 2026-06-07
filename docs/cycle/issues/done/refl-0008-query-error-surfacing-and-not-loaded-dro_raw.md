---
id: refl-0008-query-error-surfacing-and-not-loaded-dro
source: reflection
title: query-error-surfacing-and-not-loaded-drop-untested-in-tokenless-ci
added_at: 2026-06-07T07:23:08.653Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0008"
---

The cycle's single MUST-FIX (surfacing `db.useQuery` errors inline via `student-chat-error` and rejecting a non-blank submit while the stream is not loaded, rather than silently dropping it) lives entirely in `StudentChat.tsx:74,104-116,160-164`. That `.tsx` island is excluded from Vitest scope (`include: ['src/lib/**/*.ts']`) and is only exercised by the admin-gated Playwright spec, which loud-skips without `INSTANT_ADMIN_TOKEN`. So the just-fixed critical failure path has no test that runs in default token-less CI and can silently regress.

The pure `shouldSubmitChatMessage` gate is well tested, but the UI wiring that maps a gate-rejection / query-error into a visible alert is not. Suggested direction: extract the error-message-derivation (which gate-rejection reason or query-error maps to which user-facing string) into a pure helper in `sessions.ts` and unit-test it, or add a lightweight component test so the surfacing behavior is covered without the admin token.
