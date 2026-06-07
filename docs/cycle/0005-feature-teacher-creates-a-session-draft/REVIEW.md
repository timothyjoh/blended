# Review: Cycle 0005

## Overall Verdict
PASS — no fixes needed

All NEEDS-FIX triggers were checked and none fired: code quality is clean, the unit suite covers happy and failure paths, coverage rose on every metric with no per-file regression, every SPEC acceptance bullet is implemented, the user benefit is realizable end-to-end (verified by the e2e happy-path/observability specs, which skip loudly only when admin env is absent), SPEC.md has a populated `## Acceptance Criteria` section, PLAN.md carries a complete `## SPEC Acceptance Traceability` table, all in-scope doc-prose claims are backed by code, there are no swallowed/silent errors, failure defaults are fail-safe (validate-before-write + atomic dual-write), and the one non-idempotent operation is non-idempotent by design (a distinct session per call) with a double-submit guard and is documented as such.

## Code Quality Review

### Summary
A clean, well-factored vertical slice that faithfully follows the `auth.ts` pure-core pattern from RESEARCH.md. Pure cores (`generateJoinCode`, `buildSessionCreate`) are db-free and dependency-injectable; the only impure step (`createSession`) is a thin `writeEvent`-routed wrapper. Failure handling is fail-safe throughout: input is totally validated before any transaction, the dual-write is atomic, and errors are surfaced (inline `role="alert"` + `console.error`), never swallowed.

### Findings
1. **Cryptography (minor, non-blocking)**: `generateJoinCode` reduces each random byte with `bytes[i] % JOIN_CODE_ALPHABET.length` (`256 % 31 = 8`), introducing a slight modulo bias — alphabet indices 0–7 are marginally more likely than 8–30 — `src/lib/sessions.ts:39`. The entropy loss is a tiny fraction of a bit over a 10-char code (~49 bits); the source is still a CSPRNG and the code remains unguessable, so SPEC §16.2 ("cryptographically strong source", "unguessable") is satisfied. Rejection sampling would eliminate the bias if a future cycle wants a fully uniform distribution.
2. **Dead UI branch (cosmetic)**: `errorEl` is rendered in the collapsed (`!open`) branch — `src/components/NewSession.tsx:69` — but `error` can only be set from `onSubmit`, which is reachable only when the form is open. The branch never displays an error in practice. Harmless; no action needed.
3. **Coverage of the production txn path**: the single uncovered line is `defaultBuildTxn`'s real `db.tx.sessions[...].update(...)` — `src/lib/sessions.ts:106` — deliberately injected away in unit tests and exercised only by the (env-gated) e2e suite. This matches the project's established pattern of keeping live `db.transact` out of node-env unit tests; acceptable.

### Spec Compliance Checklist
- [x] `createSession` action module with pure `generateJoinCode` + `buildSessionCreate` cores and a thin `writeEvent`-routed wrapper — `src/lib/sessions.ts:35,75,125`
- [x] Sets `status:'draft'`, `teacherId` = creating user, generated `joinCode`, trimmed `title`, `createdAt`, `interactionMode:'none'` — `src/lib/sessions.ts:82-90`
- [x] Single write path: one `writeEvent('SessionCreated', …, [sessions txn])`, no `db.tx.sessions` write outside it — `src/lib/sessions.ts:132`
- [x] `actor` is `{ id: user.id, role: 'teacher' }`; `sessionId === payload.id`; payload `{ id, title, teacherId }` folds through `applyEvent` — `src/lib/sessions.ts:91-95`, `src/lib/db.ts:210`
- [x] `sessionId` generated with `id()` (UUID) and is the `sessions` row id — `src/lib/sessions.ts:81`
- [x] Unguessable crypto-backed join code, injectable RNG, pinned length/charset — `src/lib/sessions.ts:18-19,28-42`
- [x] Title required; empty/whitespace rejected before any txn; trimmed before storage — `src/lib/sessions.ts:76-77`
- [x] Any signed-in user can create; no account-type gate (enforced by surrounding `RouteGuard`) — `src/pages/dashboard/index.astro:17-20`
- [x] Identity read via `useAuth`, never `db.useAuth()` — `src/components/NewSession.tsx:21`
- [x] `NewSession` rendered inside `RouteGuard`; reuses `Button`/`Input`/`Card`; shows title/status/joinCode, never raw email — `src/components/NewSession.tsx:1-6,94-117`
- [x] Failure behavior: blank title → inline `new-session-error`, no write; `writeEvent` rejection propagated + logged + inline; missing auth id refused — `src/components/NewSession.tsx:38-41,47-54`; `src/lib/sessions.ts:77-79`
- [x] `dashboard-root` testid preserved — `src/pages/dashboard/index.astro:18`
- [x] Docs updated: AGENTS.md, README.md, release-notes.md
- [x] `npm run astro check` clean — 0 errors, 0 warnings (34 pre-existing hints in unrelated `ui/tabs.tsx`)

## Adversarial Test Review

### Summary
Strong. Tests assert against real implementations with specific, structural assertions; mocking is limited to injecting `write`/`buildTxn` stubs solely to exercise the rejection/propagation path. Both failure paths (validation pre-txn, rejected write) and a meaningful boundary (byte exactly equal to alphabet length wrapping to index 0) are covered.

### Findings
1. **Mock discipline (positive)**: only the two impure deps of `createSession` are stubbed; the pure cores use no mocks — `src/lib/sessions.test.ts:86-92`. No mock-abuse.
2. **Specific assertions (positive)**: full-record `toEqual`, `meta.actor`/`payload` `toEqual`, `calls[0][0]).toBe('SessionCreated')` and arg-shape checks — `src/lib/sessions.test.ts:44-59,99-100`. Not weak truthiness.
3. **Boundary coverage (positive)**: determinism under injected RNG and modulo-wrap-to-zero are both pinned — `src/lib/sessions.test.ts:20-32`.
4. **Weak assertion (minor)**: the e2e join-code check uses `expect(joinCode).toBeTruthy()` — `e2e/create-session.spec.ts:34`. Could be tightened to assert length `10` and charset membership; non-blocking since the unit suite already pins length/charset.
5. **Component not unit-tested (by design)**: `NewSession.tsx` is outside the vitest `src/**/*.test.ts` node-env scope and is covered by Playwright instead, consistent with the project's split (RESEARCH §Test Infrastructure). Acceptable.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`)
- Line / branch / function: 76.99% lines / 70.67% branches / 72% functions / 75.53% statements (all files)
- `sessions.ts` specifically: 96.15% lines / 83.33% branches / 80% functions / 96.55% statements
- Regressions vs base (per-file): none — every aggregate metric rose vs the BUILD-reported base (lines 71.26→76.99, branches 68.69→70.67, functions 70→72, statements 70→75.53); no per-file drop
- New code without tests: none at unit level; `defaultBuildTxn` (live `db.transact` path) is e2e-only by design
- Specific scenarios missing tests (non-blocking): join-code length/charset not re-asserted in e2e; the e2e happy-path + observability assertions execute only when `INSTANT_ADMIN_TOKEN`/`PUBLIC_INSTANTDB_APP_ID` are set (skips loudly otherwise, matching `auth.spec.ts`/`route-guarding.spec.ts`) — so the live dual-write is not exercised in an env without admin credentials

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Sessions created via `createSession` (`src/lib/sessions.ts`) | `AGENTS.md:34` | `src/lib/sessions.ts:125` | OK |
| Routes dual-write through `writeEvent('SessionCreated', …)` in one transaction | `AGENTS.md:34` | `src/lib/sessions.ts:132`; `src/lib/db.ts:339` | OK |
| `generateJoinCode` length `JOIN_CODE_LENGTH` = 10 over charset `JOIN_CODE_ALPHABET`, crypto-backed, injectable RNG | `AGENTS.md:34` | `src/lib/sessions.ts:18-19,30,35` | OK |
| `buildSessionCreate` rejects blank/whitespace title and missing `teacherId` before producing any txn | `AGENTS.md:34` | `src/lib/sessions.ts:76-79` | OK |
| `actor.role: 'teacher'`, `sessionId === payload.id` | `AGENTS.md:34` | `src/lib/sessions.ts:91-95` | OK |
| `createSession` NOT idempotent (fresh `sessionId`/`joinCode` per call) | `AGENTS.md:34` | `src/lib/sessions.ts:81,87` | OK |
| Dashboard control `NewSession` (`src/components/NewSession.tsx`) nested inside `RouteGuard`, reads identity via `useAuth` | `AGENTS.md:34` | `src/components/NewSession.tsx:21`; `src/pages/dashboard/index.astro:17-20` | OK |
| Testids `new-session-open/-title/-submit/-error`, `created-session`, `created-session-title/-status/-joincode` | `AGENTS.md:34` | `src/components/NewSession.tsx:66,82,88,58,95,97,102,108` | OK |
| Node-side admin read helper `queryAdmin` (`e2e/support/auth.ts`) | `AGENTS.md:34` | `e2e/support/auth.ts:43-49` | OK |
| `/dashboard` → **New session** → enter title → submit → real `draft` session, owned by you | `README.md:127-131` | `src/components/NewSession.tsx:44`; `src/lib/sessions.ts:85,93` | OK |
| Generated, hard-to-guess **join code** shown back on screen immediately, no navigation away | `README.md:130-131` | `src/components/NewSession.tsx:108`; `src/lib/sessions.ts:87` | OK |
| Creating a session is what makes you its teacher; no account type, any signed-in user can create | `README.md:131-133` | `src/lib/sessions.ts:93`; `src/pages/dashboard/index.astro:17` | OK |
| Blank/whitespace-only title rejected inline and creates nothing | `README.md:133-134` | `src/components/NewSession.tsx:58`; `src/lib/sessions.ts:77` | OK |
