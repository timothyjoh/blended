---
id: refl-0008-query-error-surfacing-and-not-loaded-dro
title: Cover student-chat query-error surfacing + not-loaded drop in tokenless CI
workflow: feature
depends_on: []
triaged_at: 2026-06-07T07:27:35.458Z
source: triage
priority: medium
---
The cycle-0008 MUST-FIX — surfacing `db.useQuery` errors inline via `student-chat-error` and rejecting a non-blank submit while the stream is not loaded instead of silently dropping it — lives entirely in `StudentChat.tsx` (around `:74`, `:104-116`, `:160-164`). That `.tsx` island is outside Vitest scope (`include: ['src/lib/**/*.ts']`) and is only exercised by the admin-gated Playwright spec, which loud-skips without `INSTANT_ADMIN_TOKEN`. The result: the just-fixed critical failure path has **no test that runs in default token-less CI** and can silently regress.

The pure `shouldSubmitChatMessage` gate is already well covered; what is uncovered is the UI wiring that maps a gate-rejection reason or a query error into a visible alert.

Close the gap so the surfacing behavior runs in token-less CI. Suggested direction (pick whichever is the cleaner fit):

- Extract the error-message-derivation logic — which gate-rejection reason or query-error maps to which user-facing string — into a pure helper in `sessions.ts` and unit-test it under the existing `src/lib/**/*.ts` Vitest scope; or
- Add a lightweight component test for `StudentChat` that asserts the visible alert on query error and on a non-blank submit while the stream is not loaded.

Done when: the error-surfacing and not-loaded-drop behavior is verified by a test that runs in default token-less CI (no `INSTANT_ADMIN_TOKEN`), and a deliberate regression of that path fails the suite. Do not expand scope beyond covering the existing behavior — no new surfacing rules.
