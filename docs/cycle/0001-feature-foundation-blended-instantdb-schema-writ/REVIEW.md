All verification commands run. Assembling the review.

```markdown
# Review: Cycle 0001

## Overall Verdict
PASS — no fixes needed

All nine SPEC Acceptance Criteria are met, the PLAN carries a complete
`## SPEC Acceptance Traceability` section re-quoting every SPEC AC bullet, every
in-scope documentation claim is backed by real `file:line` references, failure
handling is fail-safe with no swallowed/silent errors, and coverage strictly
increases over a base that had zero test infrastructure. The dual-write spine,
realtime cross-context sync, and failure path all pass under Playwright. No
NEEDS-FIX trigger fired.

## Code Quality Review

### Summary
A clean, well-factored foundation. `src/lib/db.ts` is a single coherent module:
typed schema for all eight MVP entities, an init-time env guard, a deterministic
pure fold, and a `writeEvent()` choke point that validates all input before a
single atomic `db.transact()`. The code mirrors the existing `TodoApp` InstantDB
pattern, uses domain language, and documents its invariants in JSDoc. No
swallowed errors, no fail-open defaults.

### Findings
1. **Failure handling (correct)**: `requireAppId` throws at module init on
   missing/empty/whitespace app id rather than building a broken client —
   `src/lib/db.ts:17-26`.
2. **Atomicity (correct)**: event append and projection update share one
   `db.transact([eventTx, ...projectionTxns])`; the returned promise is not
   caught, so rejection propagates all-or-nothing — `src/lib/db.ts:299-312`.
3. **Choke-point enforced (correct)**: all input validated before any
   transaction; empty/non-array `projectionTxns` is rejected so projection-only
   writes cannot be the easy default — `src/lib/db.ts:280-296`.
4. **Unknown-type surfacing (correct)**: `applyEvent` throws
   `UnknownEventTypeError` instead of silently dropping — `src/lib/db.ts:220-221`.
5. **Minor — null `actorId` is omitted, not stored as null**: `actorId:
   meta.actor.id ?? undefined` drops the key when the actor id is null
   (`src/lib/db.ts:303`). The §7.2 envelope lists `actorId` as a field; for
   null-actor (system/ai) events the field will be absent rather than explicitly
   null. This matches the PLAN's documented `i.string().optional()` + omit-on-null
   modeling decision and is an acceptable InstantDB convention; noted for
   awareness, not a defect (the harness only writes non-null actor ids).
6. **Minor — e2e harness-visibility check uses the 5s default timeout**: the
   `gotoHarness` helper asserts `event-spine-harness` visible with no explicit
   timeout (`e2e/event-spine.spec.ts:12`). The `client:only="react"` island's
   cold-start hydration can exceed 5s; in this review the "writeEvent twice" spec
   failed its first attempt on exactly this check and passed on retry (`1 flaky,
   2 passed`). `retries: 3` is intentional and the suite is green, so this is not
   a blocker — but raising the initial-visibility timeout (e.g. to 15s) would
   remove a known flake rather than relying on a retry.

### Spec Compliance Checklist
- [x] Shared `src/lib/db.ts` exports a typed `i.schema` with all eight entities
  (`users`, `sessions`, `sessionResources`, `participants`, `sessionEvents`,
  `messages`, `questions`, `endorsements`) and an initialized client using
  `PUBLIC_INSTANTDB_APP_ID` — `src/lib/db.ts:38-120`.
- [x] `sessionEvents` persists every §7.2 envelope field; `actorRole` is the
  five-member union, `schemaVersion` is `i.number()` (integer enforced at
  runtime), `payload` is `i.json` — `src/lib/db.ts:83-94`, `285-290`.
- [x] `writeEvent()` appends event + projection in one `transact()` and stamps
  `id`/`occurredAt`/`receivedAt`/`schemaVersion` when unsupplied —
  `src/lib/db.ts:298-312`.
- [x] No product path writes a projection except via `writeEvent()` (grep
  confirms `db.tx.sessions`/`db.tx.participants` appear only as
  `projectionTxns` passed into the helper; `db.tx.sessionEvents` only inside
  it; `todos` demo is the exempt legacy surface).
- [x] `applyEvent` is order-stable (occurredAt → receivedAt → id) and
  reconstructable via `rebuildSessionProjection` — `src/lib/db.ts:172-235`.
- [x] Schema-derived types exported via `InstaQLEntity` — `src/lib/db.ts:127-134`.
- [x] Failure: invalid `writeEvent()` input throws descriptively before any
  transact, writing nothing — `src/lib/db.ts:280-296`.
- [x] Failure: missing `PUBLIC_INSTANTDB_APP_ID` throws at init —
  `src/lib/db.ts:26`.
- [x] `astro check` passes: **0 errors, 0 warnings** (31 pre-existing `ts(6385)`
  deprecation hints in unrelated `src/components/ui/*`).
- [x] All existing tests still pass (base had no tests; new suites green).
- [x] CONCRETE USER BENEFIT delivered: the realtime two-context e2e
  (`e2e/event-spine.spec.ts:32-56`) passes — a write in context A surfaces the
  new `sessionEvents` row and its projection row in context B with no reload.
- [x] Scaffolding escape hatch is honest: this cycle ships only the dev harness
  (`/dev/event-spine`, prod-gated) and the schema/helper that sibling cycles
  build on; the flag's claim ("every subsequent mutation is a replayable record")
  is genuinely unlocked by the enforced choke point.
- [x] Docs updated: `AGENTS.md` Data Layer + Testing sections, `README.md` Data
  Layer & Event Spine section, `.env.example` corrected to
  `PUBLIC_INSTANTDB_APP_ID`.

## Adversarial Test Review

### Summary
Strong. Unit tests target the pure, deterministic logic directly (no InstantDB
mocking — fixtures are plain objects), assertions are specific (`toEqual` on full
projection shapes, exact sort order, regex error matching), and each
`writeEvent` validation branch has its own throwing test. E2E covers the happy
path with exact counts, the realtime benefit across two real browser contexts,
and the failure path asserting counts stay unchanged. No mock abuse, no
happy-path-only gap, no order dependence (each e2e mints a fresh UUID session).

### Findings
1. **Determinism proven**: out-of-order vs in-order folds asserted equal, plus an
   explicit `compareEvents` ordering test (`['d','c','a','b']`) exercising all
   three tie-break levels — `src/lib/db.test.ts:92-110`.
2. **Failure paths first-class**: seven `writeEvent` validation throws and two
   unknown-type surfacing tests (single-event and rebuild) — `src/lib/db.test.ts:73-83,112-168`.
3. **Specific assertions**: `toHaveText('2')`, `toHaveCount(1)`,
   `toContainText('projectionTxns')` rather than weak truthiness —
   `e2e/event-spine.spec.ts:27-29,68`.
4. **Minor — branch coverage gap on defaults**: `db.ts` branch coverage is
   69.49%; the uncovered branches are the `?? ''` / `typeof === 'string'`
   fallbacks in `applyEvent` and the `actorId`/`correlationId`/`occurredAt`
   default branches in `writeEvent`. These are low-risk defaulting paths and the
   happy `transact` path is exercised by e2e; adding a unit test that folds a
   `SessionCreated`/`ParticipantJoined` event with a sparse payload would close
   the gap. Not a blocker.
5. **Minor — no unit coverage of the successful `writeEvent` transact path**
   (lines 298-299 uncovered at unit level by design); it is covered by the e2e
   happy-path test. Acceptable given the dual-write requires a live client.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`, v8)
- `src/lib/db.ts`: **88.63% stmts / 69.49% branch / 100% funcs / 89.47% lines**
  (uncovered: 176-177 `compareEvents` id tie-break return; 298-299 the
  `db.transact()` call — covered by e2e).
- Aggregate `src/lib`: 54.16% stmts / 53.24% branch / 53.84% funcs / 57.62%
  lines — diluted by pre-existing untested `theme.ts` (0%) and `utils.ts` (0%)
  that the `src/lib/**` glob includes; these are not part of this cycle.
- Regressions vs base (per-file): **none** — base branch (`main`) had no test
  scripts and zero coverage, so every figure is a strict increase.
- New code without tests: none for `db.ts` logic (the only untested lines are the
  live-client `transact` path, covered by e2e). The `EventSpineHarness.tsx` /
  `.astro` UI surface is covered by e2e, not unit coverage (expected for a dev
  harness).
- Additional gate run: `npm run test:e2e` → `1 flaky, 2 passed` — all three specs
  ultimately green (the flake was the cold-start harness-visibility check noted
  above, absorbed by `retries: 3`).
- Specific scenarios missing tests: none required by SPEC. Optional hardening —
  a unit test for sparse-payload folds (branch coverage) and a higher initial
  visibility timeout in the e2e helper (flake removal).

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `src/lib/db.ts` is the single module initializing the client and defining schema | `README.md:46`, `AGENTS.md:13` | `src/lib/db.ts:38,120` | OK |
| `writeEvent()` appends a `sessionEvents` envelope AND applies the projection in one transaction | `README.md:49`, `AGENTS.md:15` | `src/lib/db.ts:299-312` | OK |
| Throws at module init if `PUBLIC_INSTANTDB_APP_ID` is missing | `AGENTS.md:13` | `src/lib/db.ts:26`, `17-22` | OK |
| Entities `users, sessions, sessionResources, participants, sessionEvents, messages, questions, endorsements` | `AGENTS.md:13` | `src/lib/db.ts:40-116` | OK |
| No projection write outside the helper (todos exempt) | `AGENTS.md:15` | grep: `db.tx.sessions/participants` only as `projectionTxns`; `TodoApp.tsx` exempt | OK |
| `applyEvent` / `rebuildSessionProjection` fold an ordered list and surface unknown types | `AGENTS.md:15` | `src/lib/db.ts:185,229,220-221` | OK |
| Entity ids must be UUIDs; use `id()` re-exported from `@/lib/db` | `AGENTS.md:15` | `src/lib/db.ts:124` | OK |
| `/dev/event-spine` harness disabled in production builds | `README.md:53`, `AGENTS.md:17` | `src/pages/dev/event-spine.astro:6,13-19` | OK |
| Playwright starts its own dev server on port 4399 | `AGENTS.md:21` | `playwright.config.ts` webServer `--port 4399` | OK |
| `playwright.config.ts` sets `retries: 3` | `AGENTS.md:21` | `playwright.config.ts` `retries: 3` | OK |
| `npm run test` / `test:watch` / `test:coverage` / `test:e2e` / `test:e2e:install` | `README.md:41-43`, `AGENTS.md:21` | `package.json:11-15` | OK |
| `PUBLIC_INSTANTDB_APP_ID` is the only required env var | `README.md:55`, `AGENTS.md:24` | `src/lib/db.ts:26`; `.env.example` | OK |
| References ADR-0001 and ADR-0003 | `README.md:50`, `AGENTS.md:15` | `docs/adr/0001-…md`, `docs/adr/0003-…md` exist | OK |

No unbacked documentation claims found.
```
