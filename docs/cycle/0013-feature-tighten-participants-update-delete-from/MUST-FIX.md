# Must-Fix Items: Cycle 0013

## Summary
0 critical issues, 1 minor issue found in review. The data-layer change,
structural guard, probe/e2e leg, and SPEC→PLAN traceability are correct and
complete; the only gap is two stale historical doc references that now
contradict the shipped code and were missed by the SPEC-mandated doc sweep.

## Tasks

- [x] ### Task 1: Fix stale "permissive `$default`" prose in AGENTS.md historical notes
  **Status:** ✅ Fixed
  **What was done:** Rewrote both stale present-tense references using the
    suggested replacements. `AGENTS.md:43` (cycle 0009 note) now reads
    "**`messages`/`questions` were left at the open default this cycle** … (as
    of cycle 0013 they carry their own explicit `allow: { $default: 'true' }`
    block; the global `$default` now denies by default — see the Data Layer note
    above; …)" and `AGENTS.md:45` (cycle 0010 note) now reads "`questions` was
    left open this cycle … (cycle 0013 gave it an explicit open block; the global
    `$default` now denies by default)". The "no `perms:push` this cycle" clauses
    were kept intact. Verify passes: `grep -n 'permissive `$default` rule'
    AGENTS.md` returns no matches, and `grep -n 'denies by default' AGENTS.md`
    shows both corrected lines; cross-checked against `src/lib/perms.ts:37`
    (`$default: { allow: { $default: 'false' } }`) and `src/lib/perms.ts:135-137`
    (explicit `messages`/`questions` open blocks). `npm run test:coverage` green
    (267 tests).
  **Priority:** Minor
  **Files:** `AGENTS.md`
  **Problem:** The SPEC's `## Documentation Updates` requires updating *any*
    reference to the permissive `$default`. Two present-tense references were
    missed and now factually contradict the shipped code (the global `$default`
    is `'false'` as of this cycle; `messages`/`questions` carry their own
    explicit open blocks):
    - `AGENTS.md:43` (cycle 0009 note): "**`messages`/`questions` stay under
      the permissive `$default` rule**".
    - `AGENTS.md:45` (cycle 0010 note): "`questions` stays under the permissive
      `$default` rule".
    A reader is told these entities run under a permissive default that no
    longer exists.
  **Fix:** Edit both phrases so they describe the post-0013 posture without
    asserting a permissive global default. Suggested replacements (keep the
    "no `perms:push` this cycle" clause intact, since it was true for those
    cycles — or phrase historically):
    - Line 43: change "**`messages`/`questions` stay under the permissive
      `$default` rule** — **no `perms:push` this cycle**" to
      "**`messages`/`questions` were left at the open default this cycle** —
      **no `perms:push` this cycle** (as of cycle 0013 they carry their own
      explicit `allow: { $default: 'true' }` block; the global `$default` now
      denies by default — see the Data Layer note above)".
    - Line 45: change "`questions` stays under the permissive `$default` rule —
      **no `perms:push` this cycle**" to "`questions` was left open this cycle —
      **no `perms:push` this cycle** (cycle 0013 gave it an explicit open block;
      the global `$default` now denies by default)".
  **Verify:** `grep -n "permissive \`\$default\` rule" AGENTS.md` returns no
    matches; `grep -n "denies by default" AGENTS.md` shows the corrected lines;
    cross-check the corrected prose against `src/lib/perms.ts:37` (`$default`
    is `'false'`) and `src/lib/perms.ts:135-136` (explicit `messages`/`questions`
    blocks). `npm test` still green.
