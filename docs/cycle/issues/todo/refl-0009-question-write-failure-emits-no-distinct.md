---
id: refl-0009-question-write-failure-emits-no-distinct
title: Emit a distinct log when question promotion fails after the chat message
  persists
workflow: feature
depends_on: []
triaged_at: 2026-06-07T08:00:29.742Z
source: triage
priority: medium
---
The `await write('QuestionCreated', …)` branch in `src/lib/sessions.ts` (around line 655) has no dedicated failure signal. When the question promotion rejects, the only thing an operator sees is `StudentChat`'s generic `console.error('[StudentChat] submit failed', err)` (`src/components/StudentChat.tsx:79`) — the exact same line emitted when the underlying *message* write fails.

That collision hides a materially important distinction in the logs:

- **Nothing persisted** — the message write itself failed; no chat row, no question.
- **Message persisted, question promotion failed** — the chat message survived but never got promoted to a Question. This is the dangerous state: a recoverable, teacher-invisible message sits in the data with no greppable trace of why it was never promoted.

The SPEC's failure-behavior text even called for a distinct `console.error('[StudentChat] …')` on this path, implying a separate signal that was never actually wired.

## Scope

Log a distinct line at the promotion site in `src/lib/sessions.ts`, before the rejection propagates, so the chat-only-survivor state is greppable — e.g.:

```
console.error('[submitChatMessage] question promotion failed; message <id> persisted chat-only', err)
```

Include the persisted message id so the orphaned-but-recoverable row can be located. Then re-throw / propagate as before so existing caller behavior is unchanged.

## Done when

- A failure in the `QuestionCreated` write emits its own log line distinct from a message-write failure, and includes the persisted message id.
- The successful path is unaffected; the rejection still propagates to the caller exactly as it does today.
- A test exercises the promotion-failure-after-message-persisted path and asserts the distinct signal fires (message persisted, question not).

Low-risk and confined to `sessions.ts`, which was already touched in cycle 0009. This gives the recovery story in the sibling sharp edge something concrete to key off.
