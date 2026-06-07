## Summary

This cycle flips the InstantDB global `$default` permission catch-all from world-open (`allow.$default: 'true'`) to deny-by-default (`'false'`) and gives the four entities that previously inherited the permissive default explicit, behavior-preserving `allow` blocks, so no present or future schema entity silently inherits world-writable permissions.

### Files modified / created
- **`src/lib/perms.ts`** (+25/−7): flipped the global `$default` to `{ allow: { $default: 'false' } }`; rewrote the catch-all rationale comment + the module header to state the deny-by-default posture and the every-new-entity-needs-an-explicit-rule invariant; added explicit `allow: { $default: 'true' }` blocks for `todos` (demo), `messages`, `questions`, `endorsements` (entity-local opens, preserving today's fully-open behavior — not the global default).
- **`src/lib/perms.test.ts`** (+24/−3): added `import { schema } from './db'`; replaced the `$default stays open` assertion with three guards — `$default` denies by default (and is not `'true'`); every key in `Object.keys(schema.entities)` has an explicit rule (fails loudly for any future un-ruled entity); the four formerly-default-governed namespaces are each explicitly open. Participants regression guards and the root-adapter identity test left unchanged.
- **`src/components/PermsProbe.tsx`** (+18): added a `writeUndeclared()` handler issuing a raw `db.transact` to an undeclared `forbiddenProbe` namespace (mirrors the existing handlers' surface/console.error error handling — nothing swallowed) plus a `probe-write-undeclared` button.
- **`e2e/permissions.spec.ts`** (+18): added a `deny-by-default` test asserting a signed-in client's raw write to the undeclared entity is rejected (`error:`); skips loudly without admin env via the existing describe-level `test.skip`.
- **`AGENTS.md`** (+2/−2): replaced the "permissive `$default`" line with a deny-by-default bullet (every new schema entity must ship an explicit rule, enforced by the structural guard); updated the cycle-0008 `messages` note to say `messages` is now explicitly open via its own block, not the global default.
- **`README.md`** (+5/−3): updated the chat-messages known-limitation note — `messages` now carries an explicit `allow: { $default: 'true' }` block (openness explicit, not inherited); global default denies by default; the participant/owner-scoped tightening remains the deferred Batch-2 follow-up.
- **`docs/cycle/0013-feature-tighten-participants-update-delete-from/walkthrough.mjs`** (created, 97 lines): drives the real dev `/dev/perms-probe` route — signs in via the admin magic-code seam, captures `01-probe-loaded` (signed-in self id), clicks the undeclared-write probe and captures `02-undeclared-write-denied` (the `error:` verdict), then runs an existing owner flow and captures `03-open-flow-intact` (no regression). Degrades loudly to the login surface (not the home page) when admin env is absent.

### PLAN.md tasks complete
Task 1 (deny-by-default + explicit blocks), Task 2 (rewritten structural guard with schema-driven coverage), Task 3 (undeclared-entity probe + e2e rejection leg), and Task 5 (docs) are complete. **Task 4 (`npm run perms:push`) is deferred** — see Deviations below.

### Tests
- Full suite: `npm run test:coverage` (`vitest run --coverage`) → **8 files, 267 tests, all passing**.
- Type/lint gate: `npx astro check` → **0 errors, 0 warnings** (the `ts(6385)` ElementRef-deprecation lines in `src/components/ui/tabs.tsx` are pre-existing and untouched by this cycle).
- Coverage (scope `src/lib/**/*.ts`): **Statements 86.09% (260/302), Branches 82.1% (257/313), Functions 77.55% (38/49), Lines 88.37% (228/258)** — unchanged vs base. The only in-scope file touched is `perms.ts`, a pure declarative literal with no executable lines to cover (it does not appear in the per-file table, i.e. fully covered/inert); `perms.test.ts` is test code (excluded), `PermsProbe.tsx` is a `.tsx` island (outside the unit-coverage scope), and `e2e/` is the Playwright suite. No per-file regression.

### Failure modes handled
- **Deny-by-default rejection (the cycle's core failure path):** any client write to an undeclared/default-governed entity is rejected by the live rules — covered by the new `e2e/permissions.spec.ts` deny-by-default test (asserts the `error:` verdict) and the `PermsProbe.writeUndeclared` handler, which surfaces the rejection to `probe-write-result` + `console.error('[PermsProbe] …')` and never swallows it (both the `.catch` and the synchronous `try/catch` route to `surface()`).
- **Structural guard fails loudly, never silently:** the schema-driven test iterates `Object.keys(schema.entities)` so a future entity added without a rule surfaces as a concrete failing expectation; the `$default` test fails if it is ever loosened back to `'true'`. These are the SPEC-named failure-path unit tests.
- **Idempotency:** rules are declarative — re-pushing identical rules is a no-op; the probe write never persists a row (deny) and on any hypothetical accept writes a fresh `id()`-keyed throwaway row, mutating no shared state.
- **Walkthrough degradation:** when admin env is absent the walkthrough emits a loud `[walkthrough-0013] …` stderr diagnostic and captures the login surface rather than silently falling back to the home page.

### Deviations from PLAN.md
- **Task 4 (`npm run perms:push`) deferred to the operator.** `INSTANT_ADMIN_TOKEN` and an exported `PUBLIC_INSTANTDB_APP_ID` are not present in this build environment, and pushing rules to the live shared Instant app is an outward-facing action requiring credentials. Per the SPEC failure model and PLAN Risk Assessment, the structural guard is the authoritative in-repo proof of the invariant; without the push the live-rule e2e leg and the walkthrough skip/degrade loudly rather than passing falsely. The push (and re-running the live `e2e/permissions.spec.ts` deny leg + the four preserve-behavior flow specs against the pushed rules) is the remaining operator step before later cycles rely on the live deny-by-default posture.

### Deferred / follow-up
- Run `npm run perms:push` with admin credentials and verify the live deny-by-default e2e leg (Task 4).
- The real participant/owner-scoped read+write policy for `messages` / `questions` / `endorsements` remains the explicitly out-of-scope Batch-2 follow-up; this cycle only makes their current openness explicit.

## Touched Files
- src/lib/perms.ts
- src/lib/perms.test.ts
- src/components/PermsProbe.tsx
- e2e/permissions.spec.ts
- AGENTS.md
- README.md
- docs/cycle/0013-feature-tighten-participants-update-delete-from/walkthrough.mjs
