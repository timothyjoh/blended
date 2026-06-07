# Must-Fix Items: Cycle 0008

## Summary
1 critical issue (query-error / load-state submits silently dropped, contrary to
SPEC failure-behavior requirement and PLAN Task 3), 0 minor issues.

## Tasks

- [x] ### Task 1: Surface `db.useQuery` errors inline and stop silently dropping non-blank submits
  **Status:** ✅ Fixed
  **What was done:** Added `const queryError = sessionQ.error || partsQ.error || messagesQ.error` after the three `console.error` calls (`StudentChat.tsx:74`), keeping the existing logging intact. Wired it into the existing `student-chat-error` alert: the block now renders when `error || queryError` is truthy and falls back to a non-blank message (`'Chat is temporarily unavailable — please retry.'`) when only a query error is present, preserving `role="alert"` (`StudentChat.tsx:160-164`). In `onSubmit`, the blank-only feedback branch was replaced so a gate rejection for a **non-blank** reason (e.g. stream not yet loaded — `existingForActionId === 0`) now sets a visible `'Chat isn’t ready yet — please retry.'` instead of returning silently; a non-zero `existingForActionId` (a genuine duplicate) still stays a silent storage no-op (`StudentChat.tsx:104-111`). Verify: `npm run astro check` → 0 errors, 0 warnings (35 pre-existing hints); `npm test` → 193 passed; `grep -n "queryError" src/components/StudentChat.tsx` returns the new wiring at lines 74 and 160.
  **Priority:** Critical
  **Files:** `src/components/StudentChat.tsx`
  **Problem:**
  - SPEC §Requirements/Failure behavior: *"a failed `writeEvent` transaction or a
    `db.useQuery` error is surfaced (`role="alert"` inline + `console.error`),
    never swallowed"*, and PLAN Task 3 specifies *"query error →
    `console.error('[StudentChat] …')` + `role="alert"` (`student-chat-error`)"*.
    The implementation only `console.error`s the three query errors at
    `StudentChat.tsx:69-71`; it never writes them into the `error` state, so the
    inline `student-chat-error` alert (`StudentChat.tsx:152-156`) is never shown
    for a query failure. A student whose stream fails to load sees an empty stream
    with no inline indication.
  - Silent-drop path: `messagesLoaded` is `false` when `messagesQ.error` is set
    (`StudentChat.tsx:56`). On submit with that error and **non-blank** text and an
    eligible participant, the gate `shouldSubmitChatMessage(...)` returns `false`
    (`StudentChat.tsx:94-108`); the only feedback branch is
    `if (text.trim() === '') setError(...)` (`StudentChat.tsx:106`), so a non-blank
    submit returns at line 107 with **no error state set and nothing written** —
    a silent drop, contrary to SPEC's *"rejected, not silently dropped"*.
  **Fix:**
  1. Derive a single query-error value and surface it inline. After line 71 add a
     value such as
     `const queryError = sessionQ.error || partsQ.error || messagesQ.error` and
     render it through the existing `student-chat-error` alert when the submit
     `error` state is empty (e.g. show `error ?? (queryError ? 'Chat is
     temporarily unavailable — please retry.' : null)` in the alert block at
     `StudentChat.tsx:152-156`), keeping `role="alert"`. The `console.error` calls
     at lines 69-71 stay.
  2. In `onSubmit`, replace the blank-only feedback branch (`StudentChat.tsx:106`)
     so a gate rejection for a **non-blank** reason is also surfaced rather than
     dropped: when `shouldSubmitChatMessage(...)` returns `false` and
     `text.trim() !== ''`, set a non-blank message (e.g. `setError('Chat isn’t
     ready yet — please retry.')`) before returning, instead of falling through
     to a silent `return`.
  **Verify:**
  - `npm run astro check` → 0 errors, 0 new warnings.
  - `npm test` still green (193+).
  - Manual/asserted: with a forced `messagesQ.error`, the `student-chat-error`
    alert (`role="alert"`) is visible and non-empty, and a non-blank submit in
    that state sets a visible, non-blank error (no silent return). Grep check:
    `grep -n "queryError" src/components/StudentChat.tsx` returns the new
    surfacing wiring.
