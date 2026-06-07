# Review: Cycle 0021

## Overall Verdict
PASS — no fixes needed

This cycle replicates the proven `perms:push` triplet for the schema verb with exacting symmetry. All eight SPEC acceptance criteria are satisfied, the SPEC→PLAN traceability section is present and complete, every modified doc claim is backed by real code at HEAD, the full test suite is green (467/467), coverage holds at the base level with the new pure seam at 100%, and `astro check` reports 0 errors / 0 warnings. No swallowed errors, no fail-open defaults, idempotent-by-design runner.

## Code Quality Review

### Summary
Clean, correct, and faithful to the existing `perms:push` pattern. The runner fails loud before any network call, forwards CLI non-zero exits, and never collapses to exit 0 on failure. The root adapter is a single re-export with no second schema declaration. Documentation lands the ordered runbook with a real ordering rationale.

### Findings
1. **Correctness (verified)**: Runner resolves app id before spawning; missing/empty/whitespace id → `console.error` + `process.exit(1)` with no spawn — confirmed by direct run (`exit=1`, message to stderr) — `scripts/push-schema.mjs:33-40`.
2. **Fail-safe (verified)**: Three distinct non-zero branches (resolve-throw, `result.error`, `result.status !== 0`); CLI status forwarded via `process.exit(result.status || 1)` — `scripts/push-schema.mjs:46-60`. No path returns 0 on failure; no swallowed catch.
3. **Single source of truth (verified)**: Adapter re-exports the canonical named `schema` as both default and named with no `i.schema(` call — `instant.schema.ts:7`; `schema` is the named export at `src/lib/db.ts:39`.
4. **Idempotency (verified)**: Runner performs no local mutation; declarative `instant-cli push schema` makes re-runs safe — documented in header `scripts/push-schema.mjs:13-14`.
5. **Pattern adherence**: `src/lib/pushSchema.ts` mirrors `src/lib/pushPerms.ts` exactly, distinct `push-schema:` prefix; `scripts/push-schema.mjs` mirrors `scripts/push-perms.mjs` line-for-line modulo the verb.
6. **Live push not executed this environment**: The actual push to the live app is gated on `instant-cli login` + `PUBLIC_INSTANTDB_APP_ID`, absent here. This is the SPEC's documented skip-loudly convention (SPEC §Dependencies), not a defect — the fix agent cannot remediate a credential gap.

### Spec Compliance Checklist
- [x] AC#1 — `npm run schema:push` defined, resolves to runner shelling out to `instant-cli push schema` (`package.json:16`, `scripts/push-schema.mjs:42`)
- [x] AC#2 — Root `instant.schema.ts` re-exports canonical `schema`, no `i.schema({…})` call (`instant.schema.ts:7`)
- [x] AC#3 — User-observable benefit: `e2e/schema-push.spec.ts` runs the push then drives a `writeEvent()`-backed createSession and polls `queryAdmin` for the `sessions` projection row + `SessionCreated` envelope; skips loudly without admin env (`e2e/schema-push.spec.ts:22-77`)
- [x] AC#4 — Missing/empty app id: exits non-zero, clear "set it in .env" message, no network call (verified directly; `scripts/push-schema.mjs:33-40`, test `src/lib/pushSchema.test.ts:23-34`)
- [x] AC#5 — CLI/auth/network rejection forwards non-zero with auth/connectivity message (`scripts/push-schema.mjs:54-60`)
- [x] AC#6 — AGENTS.md documents `schema:push` before `perms:push` with ordering rationale (`AGENTS.md:20-28`)
- [x] AC#7 — All existing tests pass (`npm run test` → 467 passed)
- [x] AC#8 — `npm run astro check` → 0 errors, 0 warnings (only pre-existing `ts(6385)` hints in `src/components/ui/tabs.tsx`, not new files)
- [x] SPEC has a populated `## Acceptance Criteria` section with testable bullets (`SPEC.md:43-51`)
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting every AC bullet (`PLAN.md:251-262`)
- [x] Out-of-scope honored: no schema change in `src/lib/db.ts`, no perms-rule edits, no meta-runner

## Adversarial Test Review

### Summary
Strong. The unit suite exercises the pure seam at its boundaries (present / missing / empty / whitespace) and spawns the *real* runner with no `child_process` mock — anti-mock bias intact. The live e2e uses specific assertions (`.toBe(1)`, `.toHaveLength(1)`, exact title match), gates loudly, and reuses the established acceptance-proof pattern.

### Findings
1. **No mock abuse**: The runner failure-path test spawns the real `scripts/push-schema.mjs` process; zero mocking — `src/lib/pushSchema.test.ts:29-30`.
2. **Boundary coverage**: Empty string and whitespace-only inputs both asserted to throw, not just absent key — `src/lib/pushSchema.test.ts:17-20`.
3. **Assertion quality**: e2e asserts exact projection count (`.toBe(1)`), exact title, and exactly one `SessionCreated` envelope — not weak truthiness — `e2e/schema-push.spec.ts:67-76`. The push-status assertion includes stderr in its failure message for diagnosability (`e2e/schema-push.spec.ts:37-40`).
4. **Loud skip (no false green)**: `test.skip(!adminAvailable(), …)` gates the live spec; `adminAvailable()` requires both token and app id — `e2e/schema-push.spec.ts:22-25`, `e2e/support/auth.ts:14-16`.
5. **Test independence**: `freshEmail()` per run prevents cross-run collisions against the shared live app — `e2e/support/auth.ts:33-35`.
6. **Acknowledged coverage split**: The CLI-rejection forwarded-non-zero leg is operationally exercised (live push), not unit-tested in isolation — consistent with the documented `pushPerms.test.ts` split; acceptable given a hermetic CLI-rejection unit test would require mocking `child_process`, which the suite deliberately avoids.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 92.9% lines / 85.98% branches / 87.5% functions (statements 91.46%)
- Regressions vs base (per-file): none — all additions are net-new; the new `src/lib/pushSchema.ts` is at 100% on every metric (hidden from the v8 text table, which omits all-100% files, exactly as `src/lib/pushPerms.ts` is)
- New code without tests: `instant.schema.ts` and `scripts/push-schema.mjs` fall outside the `src/lib/**/*.ts` coverage include scope (identical to `instant.perms.ts` / `push-perms.mjs`); the runner's missing-credentials branch is covered by the spawn-the-real-runner integration test
- Specific scenarios missing tests: none required by SPEC — happy-path push acceptance (live e2e), missing-credentials (unit + spawn), CLI-rejection (live), idempotency (design) all addressed

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `npm run schema:push` exists as a runner | `README.md:44`, `AGENTS.md:23` | `package.json:16` | OK |
| Runner shells out to `instant-cli push schema` | `README.md:59`, `AGENTS.md:17` | `scripts/push-schema.mjs:42` | OK |
| Fail-loud: non-zero on missing app id, no network call | `AGENTS.md:28`, `.env.example:1-4` | `scripts/push-schema.mjs:33-40` (verified `exit=1`) | OK |
| Forwards non-zero on CLI auth/network rejection | `AGENTS.md:28` | `scripts/push-schema.mjs:54-60` | OK |
| Idempotent / declarative, safe to re-run | `README.md:55-60`, `AGENTS.md:28` | `scripts/push-schema.mjs:13-14` (no local mutation) | OK |
| Order rationale: perms ref `data.ref('session.teacherId')` | `AGENTS.md:28` | `src/lib/perms.ts:92,127,158` | OK |
| Order rationale: perms ref `data.ref('participant.userId')` | `AGENTS.md:28` | `src/lib/perms.ts:156` | OK |
| Live schema-verification e2e needs `INSTANT_ADMIN_TOKEN`, skips loudly | `.env.example:4-5`, `AGENTS.md:79` | `e2e/schema-push.spec.ts:22-25`, `e2e/support/auth.ts:14-16` | OK |
| `PUBLIC_INSTANTDB_APP_ID` consumed by `schema:push` before any network call | `AGENTS.md:79`, `.env.example:1-4` | `scripts/push-schema.mjs:33-40` | OK |

All enumerated doc claims are backed. No unbacked claims.
