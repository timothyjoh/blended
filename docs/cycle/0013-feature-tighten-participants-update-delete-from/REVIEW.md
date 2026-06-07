# Review: Cycle 0013

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

One minor doc finding: two pre-existing historical notes in `AGENTS.md` (lines 43 and 45) still assert in the present tense that `messages`/`questions` "stay under the permissive `$default` rule". That claim now contradicts the shipped code (`$default` is `'false'`; both entities carry their own explicit open blocks), and the SPEC's `## Documentation Updates` explicitly required updating *any* reference to the permissive `$default`. Everything else — the data-layer flip, the schema-driven structural guard, the probe/e2e leg, coverage, type-check, and full SPEC→PLAN traceability — is correct and complete.

## Code Quality Review

### Summary
A clean, tightly-scoped data-layer hardening. The global `$default` is flipped from world-open to deny-by-default, all eight schema entities now have explicit `allow` blocks, and the structural guard is rewritten to iterate `schema.entities` so any future un-ruled entity fails loudly. This cycle *removes* a fail-open default rather than introducing one — the opposite of the failure-handling smells the review hunts for. The only defect is an incomplete documentation sweep.

### Findings
1. **Doc accuracy (SPEC doc requirement unmet)**: Two historical cycle notes still describe the now-removed permissive default in the present tense, contradicting the code — `AGENTS.md:43` ("`messages`/`questions` stay under the permissive `$default` rule") and `AGENTS.md:45` ("`questions` stays under the permissive `$default` rule"). The Task 5 sweep updated `AGENTS.md:27` and `:41` but missed these. → see MUST-FIX Task 1.
2. **Deferred live push (operator action, environment-blocked, SPEC-anticipated)**: Task 4 (`npm run perms:push`) was not run — `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are absent and pushing to the shared live app is an outward-facing action requiring credentials. Consequently the live `e2e/permissions.spec.ts` deny-by-default leg and the four preserve-behavior flow specs were not executed against the live rules; they skip loudly. The SPEC's `## Requirements` failure model explicitly designates the in-repo source object + structural guard as the authority when the push cannot reach the app, so this is a documented operator follow-up, not a code defect. Not the fix agent's to resolve (no credentials in this environment). — `docs/cycle/0013-feature-tighten-participants-update-delete-from/BUILD.md:28-29`
3. **`todos` is an inert rule (intentional, documented)**: `todos` has an explicit open block (`src/lib/perms.ts:129`) but is not a schema entity, so it is inert under schema enforcement. This is deliberate — it satisfies SPEC Acceptance bullet #2 verbatim and makes the "demo stays open" intent visible; the schema-coverage guard iterates `schema.entities` and never requires it. No action needed.

### Spec Compliance Checklist
- [x] `rules.$default.allow.$default === 'false'` — `src/lib/perms.ts:37`; pinned by `src/lib/perms.test.ts:76-79`.
- [x] Each of `todos`, `messages`, `questions`, `endorsements` has an explicit `allow` block, none resolving through the global catch-all — `src/lib/perms.ts:129,135-137`; asserted at `src/lib/perms.test.ts:88-92`.
- [x] User-benefit / failure-path exercised in `e2e/permissions.spec.ts:110-127` (unauthorized write → `error:`). *In-repo present; live execution deferred with push — see Finding 2.*
- [x] `participants` owner-scoped invariant from cycle 0007 holds — `src/lib/perms.test.ts:55-73` unchanged.
- [x] Chat / question-queue / endorsements flows preserved — explicit `allow: { $default: 'true' }` is behavior-identical to the prior global catch-all for those entities; existing specs unchanged.
- [x] `instant.perms.ts` still re-exports the exact `src/lib/perms.ts` object — root-adapter identity test unchanged (`src/lib/perms.test.ts`).
- [x] All existing tests pass — 267/267 (see Test Coverage).
- [x] No compiler/linter warnings introduced — `npx astro check` → 0 errors, 0 warnings (the `ts(6385)` ElementRef lines in `src/components/ui/tabs.tsx` are pre-existing hints, untouched).
- [ ] Documentation updated per SPEC — incomplete: two `AGENTS.md` references to the permissive `$default` remain (Finding 1 / MUST-FIX Task 1).
- [x] SPEC `## Acceptance Criteria` section present with testable bullets (SPEC.md:97-114).
- [x] PLAN `## SPEC Acceptance Traceability` present, all 8 SPEC AC bullets re-quoted verbatim and paired with covering tasks (PLAN.md:215-227).

## Adversarial Test Review

### Summary
Adequate. The structural guard is genuinely strong — schema-driven, no mocks, asserts over the real imported literals, and fails loudly on the two named regression modes (loosened `$default`, un-ruled future entity). The one weakness is that the new live e2e leg cannot, by construction, distinguish the permission change from schema enforcement.

### Findings
1. **Deny-test proof ambiguity**: `e2e/permissions.spec.ts:110-127` targets an *undeclared* namespace (`forbiddenProbe`). A write to an undeclared entity may be rejected by InstantDB schema enforcement rather than the `$default: 'false'` rule — so the test would also pass under the old permissive `$default: 'true'`. It therefore proves "the undeclared write is rejected" (the SPEC's stated observable invariant, which it satisfies) but does not isolate the deny-by-default permission change itself. There is no declared-but-default-governed entity to target, because every schema entity now has an explicit rule — so this ambiguity is inherent to the design, not a fixable test bug. The PLAN Risk Assessment acknowledges this (PLAN.md:255). Noted, not blocking.
2. **No "row unchanged" read-back**: SPEC AC #3 phrases the check as "unauthorized write fails and leaves the row unchanged"; the test asserts only the `error:` verdict, not a subsequent read proving non-persistence. Moot for an undeclared entity (nothing to read back) and acceptable, but a stricter assertion would read back to confirm no row.
3. **Error handling in the probe is sound**: `writeUndeclared` (`src/components/PermsProbe.tsx:134-148`) routes both the async `.catch` and the synchronous `try/catch` to `surface()` (rendered testid + `console.error`) — no swallowed error, mirroring the existing handlers. Idempotent: a denied write persists nothing, and a hypothetical accept writes a fresh `id()`-keyed throwaway row mutating no shared state.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`)
- Line / branch / function: Lines 88.37% (228/258), Branches 82.1% (257/313), Functions 77.55% (38/49), Statements 86.09% (260/302)
- Regressions vs base (per-file): none — figures match the BUILD.md baseline exactly. `src/lib/perms.ts` is a pure declarative literal with no executable lines, so it does not appear in the per-file table; `perms.test.ts` is test code; `PermsProbe.tsx` (`.tsx` island) and `e2e/` are outside the unit-coverage scope.
- New code without tests: `PermsProbe.writeUndeclared` and the new e2e leg are exercised only by Playwright (live env), which skips without admin credentials; the structural guard covers the perms-object change directly. No new unit-coverable `src/lib` logic was added.
- Specific scenarios missing tests: a unit/e2e assertion that isolates deny-by-default from schema-rejection (see Adversarial Finding 1); a read-back proving non-persistence (Finding 2). Both are minor and non-blocking.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| global `$default` rule "denies every op (`allow: { $default: 'false' }`)" | `AGENTS.md:27` | `src/lib/perms.ts:37` | OK |
| four namespaces carry explicit intentionally-open blocks `allow: { $default: 'true' }` (`todos`/`messages`/`questions`/`endorsements`) | `AGENTS.md:27` | `src/lib/perms.ts:129,135-137` | OK |
| structural guard iterates `schema.entities` and fails if any lacks a rule, or if `$default` loosened to `'true'` | `AGENTS.md:27` | `src/lib/perms.test.ts:81-92` (and :76-79) | OK |
| `messages` "now carries its OWN explicit open block (`allow: { $default: 'true' }`)" | `AGENTS.md:41` | `src/lib/perms.ts:135` | OK |
| global `$default` "denies by default (`allow: { $default: 'false' }`)" | `README.md:308-310` | `src/lib/perms.ts:37` | OK |
| `messages` (with `questions`, `endorsements`, `todos`) "now carries its own explicit `allow: { $default: 'true' }` block" | `README.md:313-314` | `src/lib/perms.ts:129,135-137` | OK |
| `messages`/`questions` "stay under the permissive `$default` rule" (present tense) | `AGENTS.md:43`, `AGENTS.md:45` | `src/lib/perms.ts:37` (`$default` is `'false'`), `:135-136` (explicit blocks) | UNBACKED — contradicted by code |

The two UNBACKED rows are pre-existing prose (not introduced/modified in this diff, so strictly outside Pass 3's diff scope), but they directly contradict HEAD and the SPEC required the sweep to cover them — captured as MUST-FIX Task 1 under Pass 1.
