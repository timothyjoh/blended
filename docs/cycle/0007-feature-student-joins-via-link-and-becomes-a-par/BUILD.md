All slices landed and verified. Producing the build summary.

## Summary

This cycle delivered the student-join vertical slice end-to-end across all six PLAN.md tasks, security-first.

**Task 1 — owner-scoped `participants` rules + ownership link (complete).** Added the `participantSession` link to `src/lib/db.ts` (+11 lines, mirroring `sessionResourceSession`) so teacher ownership is checkable against the real parent session. Replaced the fail-open `participants` block in `src/lib/perms.ts` (+13 lines) with `bind: [isOwnRow=auth.id == data.userId, isSessionOwner=auth.id in data.ref('session.teacherId'), isAdmin=false]` and `create/update/delete = isOwnRow || isSessionOwner || isAdmin`; reads stay open. Rewrote the structural test in `src/lib/perms.test.ts` (+16/-4) to pin the tightened semantics and regress against any reversion to `'true'`/`'auth.id != null'`.

**Task 2 — pure core (complete).** Appended `buildParticipantJoin`, `shouldCreateParticipant`, and `joinSession` to `src/lib/sessions.ts` (+135 lines), following the existing pure-core/thin-wrapper doctrine. `buildParticipantJoin` totally validates (present `sessionId`/`userId`, non-blank trimmed `username`) before producing any plan; `participantId === record.id === payload.participantId` for clean folding; the record carries no `email` key. `joinSession` dual-writes the `ParticipantJoined` envelope + `participants` projection (incl. the `session` link) in one `writeEvent` transaction. Added 25 unit tests to `src/lib/sessions.test.ts` (+186 lines) covering the record/envelope shape, no-email assertion, local-part derivation (incl. `a.b+tag@x.io`), all builder rejections, the idempotency gate's false branches, and the wrapper's single-call/rejection-propagation paths.

**Tasks 3 & 4 — islands + routes (complete).** New `src/components/JoinSession.tsx` (151 lines) and `src/pages/join/[joinCode].astro` (21 lines): auth-gated via `RouteGuard`, resolves the session by `joinCode`, gates on `isJoinEnabled`, creates the participant once via `shouldCreateParticipant` + `inFlight` latch, routes to `/s/<code>`. New `src/components/StudentSession.tsx` (84 lines) and `src/pages/s/[joinCode].astro` (20 lines): read-only live-syncing presence/status surface.

**Task 5 — e2e (complete).** New `e2e/join-via-link.spec.ts` (159 lines): multi-context A/B/C late-joiner happy path with `queryAdmin` observability (one student row per user, local-part username, absent email, per-join `ParticipantJoined`), idempotent reload, unknown-code and non-live failure legs. Skips loudly without admin env; `retries: 3` already set.

**Task 6 — docs (complete).** `AGENTS.md` (+2 edits): rewrote the fail-open warning into the resolved owner-scoped note and added a "Student join (cycle 0007)" architecture entry. `release-notes.md` and `README.md` gained user-facing sections plus two new known-limitations entries.

**Task 8 — walkthrough (complete).** `docs/cycle/0007-…/walkthrough.mjs` (210 lines): `export default async ({ page, baseURL, capture })`, bare-node runnable (playwright + `@instantdb/admin` only), driving teacher-start → B-join → C-late-join → both failure legs with six capture points (`01-teacher-session-live` … `06-join-not-open`); degrades loudly to `/login` capture when admin env is unset.

**Test commands & results.** `npm test` (= `vitest run`) → **6 files, 155 tests passed** (was 130). `npm run astro check` → **0 errors, 0 warnings, 34 hints** (hints pre-existing in `ui/`). `npx tsc --noEmit` on the new e2e spec → clean.

**Coverage** (`npm run test:coverage`, vs base branch): Statements **79.77→81.59%**, Branches **73.74→75.5%**, Functions **75→75%**, Lines **82→83.52%** — no axis regressed. `sessions.ts` held at 95%+ (only line 392, the `db.tx` default txn builder, uncovered — consistent with the existing `defaultBuildTxn`/`defaultTransitionTxn` exclusions, which are not unit-testable without a network).

**Failure modes handled.** Input validation (`buildParticipantJoin` sync-throws on missing `sessionId`/`userId`/blank `username` — tested); write rejection propagated, never swallowed (`joinSession` propagation test); idempotency via `shouldCreateParticipant` precheck + `inFlight` latch (unit-tested false branches + e2e count-stays-1); non-blank observable UI states for unknown/non-live/query-error/joining (`join-not-found`, `join-not-open`, `join-error`, all `console.error`-logged); single-transaction guarantee leaves no partial participant row on rejection. Owner-scoped perms rejection pinned by the structural test.

**Deviations from PLAN.md.** None material. The join island uses two effects (an `alreadyJoined` route-in effect and a gated create effect) rather than one inline block, to keep navigation idempotent across re-renders. The e2e membership-count poll queries all session participants and filters by username in JS rather than adding a `userId` filter clause (avoids depending on unverified `$isNull` query syntax).

**Deferred / follow-up.** The schema/perms push (`npx instant-cli push schema` then `npm run perms:push`) could **not** be run here: `.env` contains `PUBLIC_INSTANTDB_APP_ID` but no `INSTANT_ADMIN_TOKEN`, and pushing mutates the shared live Instant app. The push is declarative/idempotent (the link is additive) and must be run once credentials are provisioned; until then the `e2e/join-via-link.spec.ts` gate skips loudly (matching every prior cycle), and the new `participantSession` link + tightened rules are not yet live. Out-of-scope items (roster UI, `ParticipantLeft`/presence-heartbeat, `lastSeenAt` updates, manual display names, a not-a-participant gate on `/s/:joinCode`) remain their own future issues, as SPEC specifies.

## Touched Files
- src/lib/db.ts
- src/lib/perms.ts
- src/lib/perms.test.ts
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- src/components/JoinSession.tsx
- src/components/StudentSession.tsx
- src/pages/join/[joinCode].astro
- src/pages/s/[joinCode].astro
- e2e/join-via-link.spec.ts
- AGENTS.md
- README.md
- release-notes.md
- docs/cycle/0007-feature-student-joins-via-link-and-becomes-a-par/walkthrough.mjs
