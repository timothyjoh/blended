All checks complete. The implementation is clean and complete: unit tests pass (39), `astro check` is clean (0 errors/warnings), coverage rose with `auth.ts` at 100% (json-summary confirms — the text reporter merely omitted it), all doc claims are backed by real code references, and the grep gates confirm `db.useAuth()` and `db.tx.users` appear only inside `useAuth.ts`. The traceability section is present and complete.

# Review: Cycle 0002

## Overall Verdict
PASS — no fixes needed

The implementation delivers the SPEC's shared email magic-code sign-in gate completely and cleanly: a single `useAuth` seam, one reusable island, a gate page, idempotent first-sign-in `users`-row creation through `writeEvent()`, and honest failure handling. Unit tests pass, type-check is clean, coverage rose, every documentation claim is backed, and the SPEC→PLAN traceability section is complete. The only non-blocking limitation is environmental: the Playwright auth suite **skips loudly** (no `INSTANT_ADMIN_TOKEN` / live schema in this environment) rather than running green — this is an explicitly SPEC-anticipated dependency and risk, handled honestly, not a defect introduced by the build.

## Code Quality Review

### Summary
Clean, idiomatic, follows established RESEARCH.md patterns (`setError` + `console.error('[Tag] …')` + `role="alert"`, `client:only="react"` island, `writeEvent`-routed projection writes). Pure logic is correctly extracted to a db-free module; the hook is a thin, single seam. No swallowed errors, no fail-open defaults, idempotent creation keyed to the auth id.

### Findings
1. **Verification gap (informational, non-blocking)**: `useAuth.ts`'s runtime logic — the idempotent `writeEvent` creation effect, the `.catch`/`.finally` retry path, the `db.useQuery` guard — is exercised **only** by the Playwright suite, which is skipped here. So the integration path (island → hook → InstantDB auth → keyed upsert) is currently unverified by any runnable gate. This is by SPEC design (deterministic code requires the admin token + a pushed live schema) and is handled honestly via a loud `test.skip`. No fix is actionable without the documented prerequisites — `src/lib/useAuth.ts:45-86`.
2. **Minor — query-error degradation is silent to the user**: when `usersQ.error` is set, `usersLoaded` is `false`, so `shouldCreateUserRow` returns `false` and the `users` row is never created, with no surfaced indication. This is fail-safe (no duplicate/partial write) and not a swallowed exception, but a persistent query error would silently leave a signed-in user without a projection row. Acceptable for this cycle; worth noting for a later hardening pass — `src/lib/useAuth.ts:41-42`.
3. **Intentional deviation from SPEC §47 wording (acceptable)**: SPEC §47 says the `writeEvent` rejection "propagates and is logged"; the implementation catches + logs (`console.error('[useAuth] users row creation failed:', err)`) + resets `inFlight` for retry, deliberately **not** rethrowing (PLAN §42). This satisfies the no-silent-failure invariant (observable, with cause) and the "rather than crashing the app" clause; the literal "propagates" is reconciled in PLAN's resolved interpretation — `src/lib/useAuth.ts:77-85`.

### Spec Compliance Checklist
- [x] Shared `useAuth` hook wrapping `db.useAuth()` + magic-code namespace, exposing `{ user, isLoading, error, username, sendCode, verifyCode, signOut }` — `src/lib/useAuth.ts:32-98`
- [x] Auth state app-wide through one hook; no direct `db.useAuth()` in product code (grep confirms only `useAuth.ts:33`)
- [x] Single reusable island: email → code → signed-in view with sign-out — `src/components/AuthGate.tsx`
- [x] Astro gate page renders the island via `client:only="react"` — `src/pages/login.astro`
- [x] First-sign-in `users` row keyed to auth id, `username` = local-part, `adminLevel: 0`, via `writeEvent()` under `IDENTITY_SCOPE`, actor `{ id, role: 'unknown' }`, `UserSignedIn`, guarded idempotent — `src/lib/useAuth.ts:56-86`
- [x] Signed-in view shows derived username, never raw email — `src/components/AuthGate.tsx:106-119`
- [x] Invalid/empty email surfaces validation message, issues no `sendMagicCode` — `src/components/AuthGate.tsx:36-39`
- [x] Wrong code caught + surfaced inline, user stays on code step — `src/components/AuthGate.tsx:52-66`
- [x] Tailwind utilities, `.tsx` island + `.astro` page — confirmed
- [x] `IDENTITY_SCOPE` event intentionally outside the fold; `applyEvent` throws `UnknownEventTypeError` — `src/lib/db.ts:218-225`, locked by test `src/lib/db.test.ts:90-105`
- [x] `npm run astro check` passes with no new type errors (0 errors, 0 warnings, 33 hints)
- [x] SPEC has a populated `## Acceptance Criteria` section (9 testable bullets) — `SPEC.md:49-58`
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting all 9 bullets verbatim — `PLAN.md:303-315`
- [x] Docs updated: AGENTS.md, README.md, .env.example, release-notes.md
- [~] **(Pending environment)** AC bullets requiring "verified by Playwright" and `npm run test:e2e` passing — the suite is present and correct but **skips** without `INSTANT_ADMIN_TOKEN` + a pushed live schema (documented SPEC Dependency/risk). Not green in this environment.

## Adversarial Test Review

### Summary
Strong for the in-scope unit surface. The unit specs are mock-free pure-function tests with specific, exhaustive assertions (full reject tables, complete truth table). The e2e suite is well-designed and deliberately mock-light (drives the real island + real InstantDB; only code *retrieval* is replaced by the admin minting seam, which is unavoidable). The honest weakness is that the e2e gate cannot run green here, so the integration is asserted-but-unrun.

### Findings
1. **Assertion quality — strong**: unit assertions are specific (`toBe('jane.doe')`, exact boolean truth table, `toThrow(UnknownEventTypeError)`), not weak truthiness — `src/lib/auth.test.ts:46-93`.
2. **Boundary coverage — strong**: `isValidEmail` rejects `''`, `'   '`, `'foo'`, `'foo@'`, `'@bar.com'`, `'a b@c.com'`, `'a@b'`, `null`, `undefined`; `deriveUsername` covers no-`@` and empty; `shouldCreateUserRow` covers each disqualifying condition individually — `src/lib/auth.test.ts:32-92`.
3. **Failure-path tests present (not happy-path only)**: e2e covers invalid email (no advance) and wrong code (stays on code step), with assertions on both the rendered error and the unchanged step — `e2e/auth.spec.ts:63-88`.
4. **Mock abuse — none**: no over-mocked unit tests; the e2e seam mocks only the inbox-read (mandated by SPEC §67), not the code under test — `e2e/support/auth.ts`.
5. **Test independence — good**: each e2e test mints a unique `e2e+${crypto.randomUUID()}@blended.test`, so reruns never collide; unit tests are pure and order-independent — `e2e/auth.spec.ts:17-19`.
6. **Integration gap (the one real weakness)**: no runnable test exercises `useAuth`'s creation/retry/guard logic in this environment — it is reachable only via the skipped e2e suite. Adding a React-mocked unit test would, however, be the mock-abuse the SPEC's pure-logic-only unit strategy explicitly avoids, so this is a known, accepted trade-off rather than a fixable omission.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function / statement: **64.28%** (45/70) / **59.55%** (53/89) / **62.5%** (10/16) / **61.62%** (53/86)
- Per-file: `auth.ts` 100% lines/branch/func/stmt (json-summary; the v8 text table omits it but the summary confirms 11/11 lines), `db.ts` 89.47% lines / 69.49% branch (unchanged — only a non-executable comment was added), `theme.ts` 0% (pre-existing), `utils.ts` 0% (pre-existing)
- Regressions vs base (per-file): **none** — `db.ts` is unchanged in coverage; aggregate rose (BUILD baseline ~57.6% → 64.28% lines) driven by the new fully-covered `auth.ts`
- New code without unit tests: `src/lib/useAuth.ts` (excluded from unit scope by documented decision — React-hook seam, pure logic extracted to `auth.ts`, behavior covered by e2e), consistent with `.tsx` islands already outside scope; `src/components/AuthGate.tsx` and `src/pages/login.astro` (UI, e2e-scoped)
- Specific scenarios missing tests: end-to-end happy path / reload-persistence / sign-out are written but **unrun** in this environment (e2e skipped); `useAuth` query-error degradation (Finding 2) has no test

## Doc-vs-Code Claim Verification

The diff touches in-scope doc paths `README.md` and `AGENTS.md` (`docs/cycle/*` changes are out of scope). Every introduced claim is backed.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Sign-in gate lives at `/login` | `README.md:67` | `src/pages/login.astro:1` | OK |
| All auth state flows through `useAuth`; product code never calls `db.useAuth()` directly | `README.md:80-82`, `AGENTS.md:19` | only `src/lib/useAuth.ts:33` (grep: no other callers) | OK |
| `useAuth` exposes `{ user, isLoading, error, username, sendCode, verifyCode, signOut }` | `AGENTS.md:19` | `src/lib/useAuth.ts:19-30` | OK |
| Signed-in view shows derived username, never raw email | `README.md:73-74`, `AGENTS.md:19` | `src/components/AuthGate.tsx:110-113` | OK |
| First sign-in creates one `users` row via `writeEvent()` under `IDENTITY_SCOPE`, actor role `'unknown'`, `UserSignedIn`, idempotent | `README.md:74-77`, `AGENTS.md:19` | `src/lib/useAuth.ts:61-86`; `IDENTITY_SCOPE`/`USER_SIGNED_IN` `src/lib/auth.ts:14,17` | OK |
| `username` = email local-part, `adminLevel: 0` | `README.md:74-76` | `src/lib/useAuth.ts:69-74` | OK |
| `applyEvent` throws `UnknownEventTypeError` on `UserSignedIn` (outside the fold) | `AGENTS.md:19` | `src/lib/db.ts:218-225` | OK |
| Playwright auth suite mints codes via admin `generateMagicCode` (no email sent) | `README.md:84-86`, `AGENTS.md:28` | `e2e/support/auth.ts:27` | OK |
| `INSTANT_ADMIN_TOKEN` is e2e-only; when unset `e2e/auth.spec.ts` skips loudly | `README.md:86-89`, `AGENTS.md:28`, `.env.example:3-7` | `e2e/support/auth.ts:13-14`, `e2e/auth.spec.ts:10-13` | OK |
| Exercise locally: set `PUBLIC_INSTANTDB_APP_ID`, push schema, `npm run dev`, visit `/login` | `README.md:82-83` | `src/pages/login.astro:1`; `npm run dev` → `package.json:6` | OK |
| Run `npm run test:e2e` after setting the token | `README.md:88-89` | `package.json:14` | OK |

No unbacked claims.
