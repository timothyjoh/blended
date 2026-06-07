---
id: refl-0010-teacher-question-queue-query-error-rende
source: reflection
title: teacher-question-queue-query-error-renders-as-blank-empty-state
added_at: 2026-06-07T08:23:59.248Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0010"
---

In `src/components/SessionLifecycle.tsx`, a failure of the new `questions` live query (`qq.error`) is only `console.error`'d. Because `openQuestions` derives from `qq.data?.questions ?? []`, a failed query yields an empty array and the UI falls through to the `teacher-question-queue-empty` state ("No open questions yet…"). The inline `qError`/`role="alert"` surface is wired only to `markAnswered`, never to `qq.error`.

The net effect: a broken realtime questions query is visually indistinguishable from a session that genuinely has zero open questions. A teacher whose query is failing sees a calm empty state and assumes no student has asked anything — a silent user-facing failure, even though it is logged to the console. REVIEW.md finding #4 counted the `console.error` as sufficient observability, but the rendered surface is silent.

Suggested direction: when `qq.error` is set, render the existing `role="alert"` error surface (reuse the `surfaceQuestion` pattern) and suppress the empty-state copy, so a query failure is distinct from an empty queue.
