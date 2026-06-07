# Must-Fix Items: Cycle 0007

## Summary
0 critical issues, 1 minor issue found in review. The implementation is strong
and SPEC-compliant; the single item is a failure-handling deviation from the
PLAN's own Task 3 spec. A separate non-code deployment dependency (schema/perms
push) is documented in REVIEW.md as a risk — it is credential-gated and not
actionable by the fix step, so it is intentionally NOT a task here.

## Tasks

- [x] ### Task 1: Render an observable error state for a `participants` query failure in `JoinSession`
  **Status:** ✅ Fixed
  **What was done:** Added a `partsQ.error` render branch in
    `src/components/JoinSession.tsx` immediately after the existing `sessionQ.error`
    branch, returning the same `data-testid="join-error"` `role="alert"` shell
    ("Could not load this session. Please try again."). A `partsQ.error` now renders
    an observable error state instead of falling through to the perpetual
    "Joining the session…" shell. The existing `console.error('[JoinSession]
    participants query error:', …)` log was retained (cause still surfaced; no write
    path changed). `npm run astro check` → 0 errors / 0 warnings; `npm test` → 155
    passed; coverage unchanged (component is outside the `src/lib/**` coverage scope,
    mirroring the already-untested `sessionQ.error` branch — exercised by the
    `e2e/join-via-link.spec.ts` failure legs).
  **Priority:** Minor
  **Files:** `src/components/JoinSession.tsx`
  **Problem:** The session query error is rendered as a visible `join-error`
    state (`src/components/JoinSession.tsx:106`-`:114`), but a `partsQ` (the
    per-(user,session) membership probe) error is only `console.error`'d
    (`src/components/JoinSession.tsx:46`) and never rendered. When `partsQ.error`
    is set and `sessionQ` is fine, `partsLoaded` is `false`
    (`src/components/JoinSession.tsx:42`), so `shouldCreateParticipant` returns
    false (no write — correct), but control falls through to the final
    "Joining the session…" shell (`src/components/JoinSession.tsx:148`-`:154`).
    The user is left on a perpetual joining spinner for an error condition. PLAN
    Task 3's failure-modes line specifies "`db.useQuery` error (surface, render
    error state, no write)" for the island's queries; the participants query does
    not get a rendered error state, only a log.
  **Fix:** Add an error branch for `partsQ.error` alongside the existing
    `sessionQ.error` branch. After the `if (sessionQ.error)` block (around
    `src/components/JoinSession.tsx:114`), add:
    ```tsx
    if (partsQ.error) {
      return (
        <div data-testid="join-root">
          <p data-testid="join-error" role="alert" className="text-sm text-destructive">
            Could not load this session. Please try again.
          </p>
        </div>
      )
    }
    ```
    The existing `console.error('[JoinSession] participants query error:', …)` at
    `src/components/JoinSession.tsx:46` stays (it already satisfies the
    log-the-cause requirement). No write path changes — the create effect already
    no-ops when `partsLoaded` is false.
  **Verify:** `npm run astro check` passes with 0 errors/0 warnings; `npm run
    test` stays green (155 tests). Code review confirms a `partsQ.error` now
    renders the `join-error` `role="alert"` state rather than the
    "Joining the session…" shell, matching the `sessionQ.error` handling.
