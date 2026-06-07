# Review: Cycle 0007

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

One minor failure-handling deviation from PLAN Task 3 (a `participants`-query error in `JoinSession` is logged but never rendered, stranding the user on the joining shell). Everything else is strong and SPEC-compliant. A separate, non-code **deployment dependency** — the schema/perms push was not run — is the most material risk to the live user benefit and is documented below; it is credential-gated and not actionable by the fix step, so it is not a MUST-FIX task.

## Code Quality Review

### Summary
A clean, well-scoped vertical slice that follows the established pure-core/thin-wrapper doctrine precisely. The pure join core (`buildParticipantJoin`, `shouldCreateParticipant`, `joinSession`) is total-validating, email-free by construction, and heavily unit-tested; the islands reuse the existing `RouteGuard` / `db.useQuery` / `surface(err)` patterns. SPEC acceptance criteria and the PLAN→SPEC traceability section are both present and complete.

### Findings
1. **Failure handling (minor)**: A `partsQ.error` (membership probe) is `console.error`'d but never rendered; control falls through to the "Joining the session…" shell, leaving the user on a perpetual spinner for an error condition — deviates from PLAN Task 3's "render error state" — `src/components/JoinSession.tsx:46`, fall-through at `:148`-`:154` (contrast the handled `sessionQ.error` at `:106`-`:114`). Not a silent failure (it is logged) and the create path correctly no-ops (`partsLoaded` is false), so it is non-destructive. See MUST-FIX Task 1.
2. **Deployment dependency (risk, not a code defect)**: `npx instant-cli push schema` + `npm run perms:push` were not run (no `INSTANT_ADMIN_TOKEN` in env; the push mutates the shared live app). Until pushed, the new `participantSession` link and the owner-scoped `participants` rules are **not live**. Because `joinSession`'s default txn calls `.link({ session })` (`src/lib/sessions.ts:404`) against the not-yet-pushed link, a live join could be rejected with an unknown-link schema error (surfacing as `join-error`) — i.e. the end-to-end user benefit is not realizable against the live app until the push runs. This matches every prior cycle's posture and is documented honestly in BUILD.md and README's known-limitations. It is not fixable by the fix step (credential-gated).
3. **Fail-safe ordering (positive)**: Security-first task ordering is honored — perms tightening + ownership link land before any participant write path. Builder throws-before-write; single `writeEvent` transaction guarantees no partial participant row on rejection; `inFlight` ref + `shouldCreateParticipant` precheck guard the double-fire within a mount. The residual cross-reload double-submit race is documented and accepted for MVP.
4. **Privacy (positive)**: Email is absent from `ParticipantRecord` by construction (`src/lib/sessions.ts:311`-`:320`), the projection txn writes no email (`:391`-`:404`), and `StudentSession` renders only `username` (`src/components/StudentSession.tsx:73`). Structural, not rule-masked.

### Spec Compliance Checklist
- [x] `/join/:joinCode` route, auth-gated via `RouteGuard`, `?next` round-trip — `src/pages/join/[joinCode].astro`
- [x] Sole sanctioned create path `joinSession` → `writeEvent('ParticipantJoined', …)`, single transaction — `src/lib/sessions.ts:417`-`:426`
- [x] `username` = email local-part; no email on row — `src/lib/useAuth.ts:92`, `src/lib/sessions.ts:341`-`:367`
- [x] Eligibility derived solely from `isJoinEnabled` — `src/components/JoinSession.tsx:68`, `:136`
- [x] Idempotent per (user, session) — `shouldCreateParticipant` + `inFlight` — `src/lib/sessions.ts:376`-`:384`, `src/components/JoinSession.tsx:66`-`:92`
- [x] `participants` rules owner-scoped (no longer fail-open) — `src/lib/perms.ts:99`-`:113`
- [x] `participantSession` ownership link added — `src/lib/db.ts:140`-`:150`
- [x] `/s/:joinCode` live-syncing presence/status view — `src/components/StudentSession.tsx:15`-`:79`
- [x] Failure states: not-found / not-open / loading / error are non-blank — `src/components/JoinSession.tsx:116`-`:154`
- [x] SPEC `## Acceptance Criteria` present with testable bullets; PLAN `## SPEC Acceptance Traceability` re-quotes all 9 bullets with covering tasks
- [x] Docs updated (AGENTS.md, README.md, release-notes.md)
- [ ] Schema/perms pushed to live app — **not done** (credential-gated; see Finding 2)
- [~] All `db.useQuery` error paths render an error state — session query yes; participants query no (Finding 1 / MUST-FIX Task 1)

## Adversarial Test Review

### Summary
Strong. The pure core has 25 focused unit tests with specific, value-level assertions, exhaustive rejection coverage via `it.each`, and proper injected-seam tests for the wrapper (no over-mocking — the only injected deps are the established `write`/`buildTxn` seams). The e2e suite covers the multi-context late-joiner benefit and both failure legs with admin-query observability.

### Findings
1. **Assertion quality (positive)**: Unit assertions are exact (`expect(record).toEqual({…})`, `expect(meta.actor).toEqual({ id: 'u1', role: 'student' })`), not weak truthiness — `src/lib/sessions.test.ts:323`-`:347`.
2. **Boundary/failure coverage (positive)**: Missing `sessionId`/`userId`/blank-and-whitespace `username` all exercised, incl. `'\t\n'`; multi-dot/`+tag` local-part derivation pinned — `src/lib/sessions.test.ts:362`-`:399`. `joinSession` write-rejection-propagation and throw-before-write are both asserted — `:475`-`:496`.
3. **Mock discipline (positive)**: `joinSession` tests inject trivial `write`/`buildTxn` stubs only; no DOM/network mocking. Well under the 50% mock-setup threshold.
4. **Islands tested via e2e only (acceptable)**: `JoinSession.tsx` / `StudentSession.tsx` have no unit tests; coverage config scopes unit coverage to `src/lib/**` (`vitest.config.ts:17`) and islands are validated by `e2e/join-via-link.spec.ts` — consistent with the project's existing convention. Note the e2e gate **skips** without `INSTANT_ADMIN_TOKEN`, so the live join/late-joiner/perms paths have no runnable gate in CI until admin env is provisioned (disclosed in README known-limitations).
5. **Missing scenario (minor)**: No test exercises the `partsQ.error` UI branch (the gap in Finding 1) — expected, since the branch does not yet render a distinct state.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`)
- Line / branch / function: All files **83.52% lines / 75.5% branch / 75% func / 81.59% stmts**; `sessions.ts` **96.1% lines / 85.33% branch** (uncovered: `:106`, `:248`, `:392` — the network-only default txn builders, consistent with existing `defaultBuildTxn`/`defaultTransitionTxn` exclusions); `db.ts` **90.9% lines**.
- Regressions vs base (per-file): none — BUILD reports statements 79.77→81.59, branches 73.74→75.5, lines 82→83.52, functions held at 75; no axis regressed.
- New code without tests: `src/components/JoinSession.tsx`, `src/components/StudentSession.tsx` — outside the `src/lib/**` unit-coverage scope by config; e2e-covered (admin-gated). New `src/lib` code (`buildParticipantJoin`/`shouldCreateParticipant`/`joinSession`) is fully unit-covered.
- Specific scenarios missing tests: `partsQ.error` rendered state (does not exist yet — Finding 1).

## Doc-vs-Code Claim Verification

In-scope doc paths changed: `README.md`, `AGENTS.md`. (`release-notes.md` is out of scope — not under `docs/**` and not a named file.) Every enumerated claim pairs to a backing reference at HEAD; no unbacked claims.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `participants create/update/delete = isOwnRow \|\| isSessionOwner \|\| isAdmin` | `AGENTS.md:25` | `src/lib/perms.ts:109`-`:112` | OK |
| `isOwnRow = auth.id == data.userId` | `AGENTS.md:25` | `src/lib/perms.ts:100` | OK |
| `isSessionOwner = auth.id in data.ref('session.teacherId')` | `AGENTS.md:25` | `src/lib/perms.ts:101` | OK |
| New `participantSession` link (forgery-proof teacher ownership) | `AGENTS.md:25`, `README.md:235` | `src/lib/db.ts:146`-`:149` | OK |
| `joinSession`/`buildParticipantJoin` are the sole sanctioned participant-create path via `writeEvent('ParticipantJoined', …)` | `AGENTS.md:38` | `src/lib/sessions.ts:417`-`:425` | OK |
| `username` is email local-part via `deriveUsername` | `AGENTS.md:38`, `README.md:172` | `src/lib/useAuth.ts:92`, `src/lib/auth.ts:35` | OK |
| Idempotent per (user, session) via `shouldCreateParticipant` + `inFlight` latch | `AGENTS.md:38`, `README.md:175` | `src/lib/sessions.ts:376`-`:384`, `src/components/JoinSession.tsx:66`-`:92` | OK |
| `JoinSession` mounted in `RouteGuard` on `/join/[joinCode]`; unauthenticated bounce to `/login?next=/join/<code>` | `AGENTS.md:38`, `README.md:165` | `src/pages/join/[joinCode].astro:17`-`:19`, `src/components/RouteGuard.tsx` (auth gate) | OK |
| Routed to `/s/<joinCode>` on success | `AGENTS.md:38`, `README.md:168` | `src/components/JoinSession.tsx:48`-`:50`, `:83` | OK |
| `/s/:joinCode` read-only live-sync via `db.useQuery` over session + participants | `AGENTS.md:38`, `README.md:169` | `src/components/StudentSession.tsx:16`-`:22` | OK |
| Unknown link → non-blank "session not found"; non-live → "isn't open"; neither creates a participant | `README.md:178`-`:182` | `src/components/JoinSession.tsx:126`-`:144` | OK |
| Testids `join-root`/`join-loading`/`join-not-found`/`join-not-open`/`join-error` | `AGENTS.md:38` | `src/components/JoinSession.tsx:98`,`119`,`129`,`139`,`99` | OK |
| Testids `student-session-root`/`-status`/`-presence`/`-presence-item` | `AGENTS.md:38` | `src/components/StudentSession.tsx:57`,`60`,`66`,`70` | OK |
| e2e suite `e2e/join-via-link.spec.ts` (multi-context + failure legs; skips loudly) | `AGENTS.md:38`, `README.md:236` | `e2e/join-via-link.spec.ts:24`-`:27` | OK |
