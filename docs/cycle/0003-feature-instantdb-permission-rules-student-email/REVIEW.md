# Review: Cycle 0003

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

NEEDS-FIX triggers: (1) the SPEC's stated user benefit is not actually deliverable in the current state — the rules were never pushed to the live Instant app, so no enforcement exists and no acceptance criterion was proven against a live app; (2) the `sessionResources` create rule does not enforce the SPEC MUST "owns the parent session," leaving a resource-injection hole.

## Code Quality Review

### Summary
The artifacts are clean, well-commented, and idiomatic — the rules module, fail-loud push wrapper, structural guard, authenticated harness, probe, and two-user e2e spec are all built to a high standard and match RESEARCH/PLAN. Two substantive problems remain: the live push (the central deliverable) was deferred, and the `sessionResources` create rule is checkable only against a client-supplied `teacherId`, not actual parent-session ownership.

### Findings
1. **Undeliverable benefit**: rules committed but never pushed to the live app; `npx instant-cli push schema` + `npm run perms:push` deferred — `docs/cycle/0003-feature-instantdb-permission-rules-student-email/BUILD.md:11,25,27`. Until pushed, every protection in this cycle is inert on the running app and `e2e/permissions.spec.ts` has never executed against it.
2. **Authorization gap (create-time)**: `sessionResources` create allows `auth.id == data.teacherId` where `teacherId` is a client-supplied denormalized field and there is no link to `sessions` — a student can inject a resource into a foreign teacher's session by setting `teacherId` to their own id and `sessionId` to the victim's — `src/lib/perms.ts:61-67`, `src/lib/db.ts:60-67`. SPEC line 39 requires "the requester owns the parent session."
3. **Accepted-by-SPEC, worth noting**: `sessionEvents.create = 'auth.id != null'` lets any authenticated user append an event with an arbitrary `actor.id`/`type` to any `sessionId` — `src/lib/perms.ts:74-81`. Projections stay protected, and the SPEC mandates append-by-any-participant, so this is by design; flagged for awareness of event-log integrity on replay.
4. **Fail-open default (out of scope, follow-up)**: `participants` update/delete open to any `auth.id != null` — `src/lib/perms.ts:86-93`. No rows are written yet; tracked as a Batch-2 follow-up.
5. **Failure handling — strong**: push wrapper exits non-zero before any network call on missing app id and forwards the CLI exit code with a clear message (`scripts/push-perms.mjs:29-56`); probe and harness surface every rejection to a testid + `console.error`, nothing swallowed (`src/components/PermsProbe.tsx:35-39`); push is idempotent (declarative).

### Spec Compliance Checklist
- [x] `users` own-row-only view protects private email — `src/lib/perms.ts:34-39`
- [x] `participants.email` removed (privacy structural) — `src/lib/db.ts:78-84`
- [x] `sessions` create/update/delete owner-only, reads open — `src/lib/perms.ts:49-56`
- [ ] `sessionResources` create restricted to **parent-session owner** — only a self-asserted `data.teacherId` is checked; create-time injection possible — `src/lib/perms.ts:61-67`
- [x] `sessionEvents` append-only by authenticated participant — `src/lib/perms.ts:74-81`
- [x] First-sign-in own-`users`-row creation remains permitted — `src/lib/perms.ts:36`
- [x] `$default` keeps `todos`/Batch-2 open — `src/lib/perms.ts:26`
- [x] Fail-loud, idempotent push wrapper + `perms:push` script — `scripts/push-perms.mjs`, `package.json:16`
- [x] e2e skips loudly without `INSTANT_ADMIN_TOKEN` — `e2e/permissions.spec.ts:11-14`
- [x] `instant.perms.ts` committed — `instant.perms.ts:5`
- [ ] Rules pushed to the live Instant app — deferred (BUILD.md:11)
- [x] `AGENTS.md` / `README.md` document the model and push command
- [x] SPEC has a populated `## Acceptance Criteria` section (SPEC.md:45-55)
- [x] PLAN has a `## SPEC Acceptance Traceability` section re-quoting every AC bullet (PLAN.md:295-309)

## Adversarial Test Review

### Summary
Adequate-to-strong. Unit tests are honest (real imports, real subprocess spawn, no mock abuse), assertions are specific, and the e2e spec covers denial, propagation, cross-teacher, and the unchanged-state failure path. The one real weakness: the resource-write test exercises only the already-denied vector and misses the create-time injection vector (own `teacherId`, foreign `sessionId`), giving false confidence on `sessionResources`.

### Findings
1. **Missing test case (matters)**: `probe-write-resource` always sets `teacherId: targetTeacherId` (the victim's id), so the rule denies it for the wrong reason; the dangerous `teacherId = own id`/`sessionId = victim` vector is never tested — `src/components/PermsProbe.tsx:68-89`, `e2e/permissions.spec.ts:90-94`.
2. **Assertion quality — good**: failure-path test re-reads `probe-active-resource` and asserts it equals the owner's last value, proving the write was neither dropped nor applied — `e2e/permissions.spec.ts:82-88`.
3. **Mock abuse — none**: `pushPerms.test.ts` spawns the real runner with an empty app id and asserts non-zero exit + clear stderr, no network — `src/lib/pushPerms.test.ts:23-34`.
4. **Test independence — good**: fresh disposable emails and `crypto.randomUUID()` session ids per test; no shared state or ordering dependence.
5. **Coverage blind spot (pre-existing config)**: `.tsx`/`.astro` files are outside the coverage glob, so `PermsProbe.tsx` and `EventSpineHarness.tsx` logic is verified only by e2e — which skip without the admin token, so in tokenless CI those components are unexercised.

### Test Coverage
- Command run: `npm run test:coverage` (vitest v8)
- Line / branch / function: 66.66% / 61.29% / 64.7% (aggregate)
- Regressions vs base (per-file): none. `db.ts` 89.47% lines / 69.49% branch / 100% func (schema delta is pure declaration); new `perms.ts` and `pushPerms.ts` are fully covered (omitted from the text reporter, which prints only non-100% files: `db.ts`, `theme.ts`, `utils.ts`). The only 0% files (`theme.ts`, `utils.ts`) are pre-existing and untouched.
- New code without tests: `PermsProbe.tsx`, `EventSpineHarness.tsx` changes (covered only by token-gated e2e); `perms.ts` and `pushPerms.ts` have unit tests.
- Specific scenarios missing tests: student creating a `sessionResources` row with own `teacherId` against a foreign `sessionId` (injection); live-app execution of `permissions.spec.ts` (skipped without `INSTANT_ADMIN_TOKEN`).
- Local gates: `npm run test` → 50 passed (4 files); `npm run astro check` → 0 errors, 0 warnings, 33 hints (pre-existing `ElementRef` deprecations in unrelated `ui/` components); `npm run test:e2e` not re-run live here (gated, per BUILD.md 1 passed / 10 skipped).

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `npm run perms:push` pushes InstantDB permission rules (fail-loud) | `README.md:44` | `package.json:16`, `scripts/push-perms.mjs:50-56` | OK |
| Rules live in `src/lib/perms.ts`; root `instant.perms.ts` is the CLI adapter | `README.md:64-65`, `AGENTS.md:19` | `src/lib/perms.ts:21`, `instant.perms.ts:5` | OK |
| Wrapper exits non-zero with a clear message if app id / auth is missing | `README.md:67-69` | `scripts/push-perms.mjs:29-36,50-55` | OK |
| Push is safe to re-run (declarative) | `README.md:69` | `scripts/push-perms.mjs:9-10` | OK |
| `users` own-row-only (`view/create/update = auth.id == data.id`, `delete = false`) | `AGENTS.md:21` | `src/lib/perms.ts:34-39` | OK |
| `sessions`/`sessionResources` owner-only writes (`auth.id == data.teacherId`), open reads | `AGENTS.md:22` | `src/lib/perms.ts:49-67` | OK |
| `sessionResources` carries denormalized `teacherId` | `AGENTS.md:22` | `src/lib/db.ts:66` | OK |
| `sessionEvents` append-only by any authenticated participant (`create = auth.id != null`, no update/delete) | `AGENTS.md:23` | `src/lib/perms.ts:74-81` | OK |
| `participants` carry no email; field removed from the entity | `AGENTS.md:24` | `src/lib/db.ts:78-84` | OK |
| System/admin via `@instantdb/admin` bypasses rules; `isAdmin` bind false today | `AGENTS.md:25` | `src/lib/perms.ts:49,61` | OK |
| Semantics pinned by `src/lib/perms.test.ts`; proven by `e2e/permissions.spec.ts` (skips without `INSTANT_ADMIN_TOKEN`) | `AGENTS.md:27` | `src/lib/perms.test.ts:10-66`, `e2e/permissions.spec.ts:11-14` | OK |
| Harness writes as the signed-in user; sign in at `/login` first | `AGENTS.md:17` | `src/components/EventSpineHarness.tsx:26-30,40-43` | OK |
| No new required env var introduced | `README.md:70-72` | (no new var in `.env`/parse paths) | OK |

No unbacked documentation claims found; all in-scope prose in `README.md` and `AGENTS.md` is backed at HEAD.
