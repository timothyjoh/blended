---
id: refl-0010-teacher-question-queue-query-error-rende
title: Surface teacher question-queue query failure instead of rendering a blank
  empty state
workflow: feature
depends_on: []
triaged_at: 2026-06-07T08:27:03.548Z
source: triage
priority: medium
---
In `src/components/SessionLifecycle.tsx`, a failure of the `questions` live query (`qq.error`) is only `console.error`'d. Because `openQuestions` derives from `qq.data?.questions ?? []`, a failed query yields an empty array and the UI falls through to the `teacher-question-queue-empty` state ("No open questions yet…"). The inline `qError`/`role="alert"` surface is currently wired only to `markAnswered`, never to `qq.error`.

The net effect: a broken realtime questions query is visually indistinguishable from a session that genuinely has zero open questions. A teacher whose query is failing sees a calm empty state and assumes no student has asked anything — a silent user-facing failure, even though it is logged to the console. REVIEW.md finding #4 counted the `console.error` as sufficient observability, but the rendered surface is silent.

## Direction

- When `qq.error` is set, render the existing `role="alert"` error surface (reuse the `surfaceQuestion` / `qError` pattern) so a query failure is announced to the teacher.
- Suppress the `teacher-question-queue-empty` copy when `qq.error` is set, so a failing query is visually distinct from an empty queue.
- Keep the existing `console.error` for console-level observability; this change is about the rendered surface.

## Acceptance

- A `qq.error` renders a visible, `role="alert"` error surface in the teacher question queue.
- The empty-state ("No open questions yet…") copy does not render while `qq.error` is set.
- A successful-but-empty query still shows the empty state as before.
- The `markAnswered` error path continues to surface its own error and is not regressed by sharing the surface.
- Covered by a test that distinguishes the query-error state from the genuine empty state.
