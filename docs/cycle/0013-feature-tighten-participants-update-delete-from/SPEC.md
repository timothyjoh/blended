# SPEC — Cycle 0013: Close the fail-open `$default` so no entity inherits world-writable permissions

## WHY
The InstantDB permission object in `src/lib/perms.ts` ends with a catch-all
`$default: { allow: { $default: 'true' } }`. Every entity that lacks an explicit
rule block — today `todos`, `messages`, `questions`, `endorsements` — falls
through to this rule and is fully world-writable: any signed-in client can
create, update, or delete those rows. Worse, the failure mode is silent and
forward-looking: any *new* entity added to the schema is automatically
world-open until someone remembers to write a rule for it. This is the exact
"so no entity falls back to a permissive default" hardening called for in source
issue `refl-0003`. The participant-specific write restriction the issue's title
references is already shipped (cycle 0007, `participants` block at
`src/lib/perms.ts:102-114`, guarded by `perms.test.ts`); the remaining,
un-shipped half of the issue is removing the permissive global catch-all that
still leaves four entities fail-open.

## CONCRETE USER BENEFIT
After this cycle, a malicious authenticated user wielding a hand-crafted Instant
client can no longer write to (or, for unknown entities, read) any namespace that
has no explicit permission rule — the live app rejects the operation. Concretely:
a signed-in student can no longer delete or rewrite another user's `messages`,
`questions`, or `endorsements` rows through a future tightening gap, and the next
entity added to the schema is locked by default instead of silently open. The
openness that legitimately remains (the `todos` demo and the still-deferred
Batch-2 read flows) is now an explicit, reviewable decision in the rules object
rather than an invisible inheritance.

## USABLE END-STATE
The permission rules deny by default. Every entity in the schema either has an
explicit `allow` block stating its policy, or is denied. The entities that must
keep working today (`todos`, `messages`, `questions`, `endorsements`) carry
explicit rules preserving their current behavior, so the teacher question queue,
student chat, and endorsements flows are unaffected. A reviewer reading
`src/lib/perms.ts` can see exactly which namespaces are open and why, with no
silent fall-through. The structural guard test fails loudly if any future schema
entity is added without an explicit rule.

## Objective
This cycle finishes the authorization hardening described in `refl-0003` by
flipping the permissive global `$default` catch-all (`allow.$default: 'true'`) to
deny-by-default (`'false'`) and giving the four entities that currently rely on
that catch-all explicit, behavior-preserving rules. The participant write
restriction the issue is titled for already shipped in cycle 0007 and is only
regression-verified here; the new value is eliminating the world-open default so
no present or future entity silently inherits permissive permissions.

## Source Issue
`refl-0003-tighten-participants-fail-open-update-an` — "Tighten participants
update/delete from fail-open default to row-owner + owning teacher/admin"

## Scope

### In Scope
- Change the global catch-all `$default` from `{ allow: { $default: 'true' } }`
  to deny-by-default `{ allow: { $default: 'false' } }` in `src/lib/perms.ts`.
- Add explicit `allow` blocks for the four entities currently governed only by
  the permissive default — `todos` (demo, stays open) and the Batch-2 namespaces
  `messages`, `questions`, `endorsements` (preserve today's open behavior so no
  functional regression) — making their openness intentional and visible rather
  than inherited.
- Update the structural guard test (`src/lib/perms.test.ts`) and the
  `perms.ts` header comment to assert deny-by-default and that every schema
  entity has an explicit rule (no silent fall-through), replacing the existing
  `$default stays open` assertion.

### Out of Scope
- Designing the real read-visibility / write-authorization policy for
  `messages`, `questions`, and `endorsements` (e.g. restricting reads to session
  participants, restricting edits to row authors). That remains a deferred
  Batch-2 follow-up; this cycle only preserves their current behavior explicitly.
- Re-implementing the `participants` owner-scoped write rule, which already
  shipped in cycle 0007. This cycle only regression-verifies that invariant.
- Any UI change. This is a data-layer authorization change only.

## Requirements
- The global `$default` rule must deny by default, so any schema entity lacking
  an explicit `allow` block is non-readable and non-writable by a client.
- The four currently-open entities (`todos`, `messages`, `questions`,
  `endorsements`) must retain their present runtime behavior — the teacher
  question queue, student chat send/stream, and endorsements flows continue to
  function unchanged after the change.
- `src/lib/perms.ts` remains the single source of the rules; the root
  `instant.perms.ts` adapter must continue to re-export it unchanged.
- The rules object stays a plain inferred literal (no `InstantRules<…>`
  annotation) so the structural guard retains precise, non-optional access, per
  the existing module contract.
- **Failure behavior**: On an unauthorized client write to a default-governed or
  unknown entity, InstantDB rejects the transaction (the operation fails and
  state is unchanged) rather than silently permitting it. If `npm run perms:push`
  cannot reach the live app, the push fails loudly and the live rules retain
  their prior state — the source-of-truth object and its test are the authority,
  and the structural guard test must fail (not pass silently) if any schema
  entity lacks an explicit rule or if `$default` is ever loosened back to
  `'true'`.

## Acceptance Criteria
- [ ] `rules.$default.allow.$default === 'false'` — verified by the structural
      guard test in `src/lib/perms.test.ts`.
- [ ] Each of `todos`, `messages`, `questions`, `endorsements` has an explicit
      `allow` block in `rules`, and none of them resolves its write/read policy
      through the global `$default` catch-all.
- [ ] **User-benefit / failure-path**: a crafted authenticated client attempting
      to write to a default-governed or undeclared entity is rejected by the live
      permission rules — exercised in `e2e/permissions.spec.ts` (unauthorized
      write fails and leaves the row unchanged).
- [ ] The `participants` owner-scoped write invariant from cycle 0007 still holds
      (existing `perms.test.ts` participants assertions pass unchanged).
- [ ] The teacher question queue, student chat send/stream, and endorsements
      flows still function — covered by their existing e2e specs passing.
- [ ] `instant.perms.ts` still re-exports the exact `src/lib/perms.ts` object
      (existing root-adapter identity test passes).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run astro check` clean).

## Testing Strategy
- **Framework**: Vitest for the structural guard (`src/lib/perms.test.ts`);
  Playwright for the live-rule end-to-end behavior (`e2e/permissions.spec.ts`).
- **Happy path**: assert `$default` denies by default and each of the four
  formerly-default-governed entities carries an explicit rule preserving its
  current behavior; assert the four product flows (chat, question queue,
  endorsements) still read/write successfully.
- **Failure paths**: e2e assertion that an unauthorized write to a
  default-governed entity (and/or an entity with no explicit rule) is rejected
  and the data is unchanged; structural-test assertion that the guard fails if
  `$default` is reverted to `'true'` or if a schema entity is left without an
  explicit rule.
- **Regression**: existing `users` / `sessions` / `sessionResources` /
  `sessionEvents` / `participants` structural assertions and existing e2e specs
  for chat, question auto-creation, and the teacher queue must continue to pass.
- **E2E required**: this cycle touches no UI, but the live-rule behavior change
  is verified through the existing `e2e/permissions.spec.ts` harness; extend it
  with the unauthorized-write rejection case rather than adding UI tests.

## Documentation Updates
- **AGENTS.md**: update any reference to the permissive `$default` so the
  documented invariant reflects deny-by-default and the requirement that every
  new schema entity ships with an explicit permission rule.
- **`src/lib/perms.ts` header comment**: replace the "Permissive default
  preserves today's behavior…" note with the deny-by-default rationale and the
  explicit list of intentionally-open entities.
- **README.md**: no user-facing change to surface (security hardening only);
  note the deny-by-default rule posture if a security/permissions section exists.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/lib/perms.ts` and its root adapter `instant.perms.ts` (exist).
- `src/lib/db.ts` schema entities `todos`, `messages`, `questions`,
  `endorsements`, `participants`, `sessionEvents`, `sessions`,
  `sessionResources`, `users` (exist).
- The `participants` owner-scoped rule from cycle 0007 (already shipped; this
  cycle depends on it being present, not on re-creating it).
- `npm run perms:push` (`scripts/push-perms.mjs` → `instant-cli push perms`) and
  the live Instant app for end-to-end verification; `PUBLIC_INSTANTDB_APP_ID`
  must be set for the e2e run.
