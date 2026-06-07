---
id: refl-0009-question-write-failure-emits-no-distinct
source: reflection
title: question-write-failure-emits-no-distinct-observable-signal
added_at: 2026-06-07T07:57:01.145Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0009"
---

The new `await write('QuestionCreated', …)` branch (`src/lib/sessions.ts:655`) has no dedicated log. On failure the only signal is `StudentChat`'s generic `console.error('[StudentChat] submit failed', err)` (`src/components/StudentChat.tsx:79`) — the identical line emitted when the *message* write fails. So an operator reading logs cannot distinguish "nothing persisted" from "message persisted, only the Question promotion failed" — two materially different states (the latter leaves a recoverable, teacher-invisible message). The SPEC's failure-behavior text even specified a `console.error('[StudentChat] …')` for this path, implying a distinct signal that wasn't wired.

Suggested direction: log a distinct line at the promotion site before the rejection propagates, e.g. `console.error('[submitChatMessage] question promotion failed; message <id> persisted chat-only', err)`, so the chat-only-survivor state is greppable. Low-risk, confined to `sessions.ts` (already touched this cycle), and gives the recovery story in the sibling sharp edge something to key off.
