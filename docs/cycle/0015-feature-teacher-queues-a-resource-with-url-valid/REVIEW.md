All three passes complete. Tests pass (322), coverage rose vs base with `resources.ts` at 100%, astro check clean, all doc claims backed, traceability section present. This is a PASS — no MUST-FIX.md will be written.

# Review: Cycle 0015

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, disciplined vertical slice that mirrors the established event-sourced create pattern (`buildSessionCreate`/`createSession`) exactly. URL safety is correctly isolated to a single pure, total seam; the dual-write is atomic; failure handling is fail-safe throughout; and every SPEC acceptance bullet is implemented and tested. Coverage rose on every metric versus the cycle base.

### Findings
1. **Architecture (positive)**: `validateResourceUrl` is the sole scheme-parsing site — builder, wrapper, component, and fold all route through it; no inline `new URL`/scheme parsing leaks elsewhere — `src/lib/resources.ts:26`.
2. **Fail-safe (positive)**: `buildResourceQueue` validates actor role, `actor.id`, `sessionId`, title, and URL and throws *before* producing any plan, so a rejected add writes nothing — `src/lib/sessions.ts:863`.
3. **Atomicity (positive)**: `queueResource` routes the `ResourceQueued` envelope + projection row through one `writeEvent` transaction and does not catch — a rejection propagates with no orphan event/row — `src/lib/sessions.ts:935`.
4. **Ownership in depth (positive)**: `defaultResourceTxn` sets denormalized `teacherId` *and* `.link({ session })`, so the existing `data.ref('session.teacherId')` rule admits only the real owner — `src/lib/sessions.ts:907`, `:920`.
5. **Defensive fold (positive)**: the `ResourceQueued` case reads payload with `typeof` guards, falls back to `event.id`/`occurredAt`/projection defaults, never mutates input, and re-folds idempotently — `src/lib/db.ts:446`.
6. **UI fail-safe (positive)**: query-error alert is checked *before* the empty state so an errored query never reads as falsely-empty; a `resPending` latch suppresses double-submit; write rejections surface inline (`role="alert"`) + `console.error`, retaining inputs — `src/components/SessionLifecycle.tsx:443`, `:108`/`addResource`.
7. **Minor (by design, not a defect)**: the builder accepts any non-blank `type` string (defaulting blank → `generic_url`); the closed `RESOURCE_TYPES` set constrains only the UI selector. This is the PLAN-resolved decision (no schema enum), documented in AGENTS.md — `src/lib/sessions.ts:879`.

### Spec Compliance Checklist
- [x] Owning teacher can enter valid `https://` URL + title + type, submit, and see it in the queue ordered by `sortOrder` without reload (UI wired to `queueResource`; live query render — `SessionLifecycle.tsx:440`; e2e §1)
- [x] Second resource gets `sortOrder` strictly greater and renders last (`max+1` builder + `currentMaxSortOrder` from live query; e2e §2 asserts `>` and `.last()`)
- [x] Successful add appends exactly one `ResourceQueued` event matching the row in the same transaction (single `writeEvent`; e2e admin read asserts one row + one event with matching payload)
- [x] Failure path: `javascript:` and `data:` rejected inline, nothing written (client gate + builder re-validation; e2e asserts counts unchanged for both schemes)
- [x] `validateResourceUrl` unit table: http/https accepted; `javascript:`/`data:`/`vbscript:`/`file:` rejected; blank/whitespace; unparseable/relative; never throws (`resources.test.ts:7-103`)
- [x] `applyEvent` folds `ResourceQueued`, no `UnknownEventTypeError`; `rebuildSessionProjection` reproduces the row (`db.test.ts` fold + order-independent rebuild tests)
- [x] All existing tests pass (`npm run test` → 322 passed)
- [x] `astro check` no new errors (0 errors, 0 warnings, 36 pre-existing `ElementRef` hints)
- [x] SPEC has a populated `## Acceptance Criteria` section (SPEC.md:48-57)
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting all 8 bullets (PLAN.md:360-371)
- [x] Docs updated: AGENTS.md cycle-0015 note, README.md capability section, release-notes.md entry

## Adversarial Test Review

### Summary
Strong. Tests exercise real implementations (pure builders/folds with real inputs); the only injected seam is the network (`writeEvent`) via the existing `deps` shape — no heavy mocking. Failure paths are first-class: every builder rejection asserts a spy `write` is never called, the wrapper's non-catching propagation is pinned, and the fold's partial/idempotent/no-mutate behavior is covered.

### Findings
1. **No mock abuse**: `queueResource` tests inject a thin spy `write`/`buildTxn` only; builder and fold tests use real values — `sessions.test.ts:1108`, `db.test.ts` fold block.
2. **Failure coverage (positive)**: non-teacher actor, missing `actor.id`/`sessionId`, blank title, `javascript:`/`data:`/unparseable URL each asserted to throw, and the wrapper's "no write on builder reject" + "propagates a rejecting write" both covered — `sessions.test.ts:1099-1149`.
3. **Boundary coverage (positive)**: `sortOrder` = 0 for `null` *and* `undefined` current-max, `max+1` for non-empty; partial-payload fold defaults; whitespace title/url trimming; non-string/null/undefined into the validator — all asserted.
4. **Assertion quality (positive)**: assertions are specific (`toEqual` on full record/entry shapes, `meta.payload.id === record.id`, exact `data-sort-order` comparison, `RESOURCE_TYPES` exact array) rather than truthiness.
5. **Integration (positive)**: `defaultResourceTxn` real-txn test inspects emitted ops to pin the `.link({ session })` and keyed update — closes the gap left by the stubbed-`buildTxn` wrapper tests; e2e ties UI → dual-write → admin observability together.
6. **Minor**: the e2e happy/ordering legs run only when `INSTANT_ADMIN_TOKEN` is provisioned (skips loudly otherwise) — consistent with all sibling suites; structural states (empty/loading/query-error) are covered via rendered branches and the walkthrough, not a live test. Acceptable per SPEC.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 90.13% lines / 82.92% branches / 81.13% functions (statements 88.04%)
- Regressions vs base (per-file): none — every metric rose vs cycle 0014 base (86.42 / 82.1 / 79.59 / 88.75 per BUILD.md); `resources.ts` 100/100/100, `sessions.ts` 95.81/86.2/86.66/97.6, `db.ts` 92.06/82.9/100/92.98
- New code without tests: none
- Specific scenarios missing tests: none material — empty-queue/loading/query-error UI states are structural-only (rendered branches), which is consistent with prior cycles

## Doc-vs-Code Claim Verification

In-scope doc paths changed: `AGENTS.md`, `README.md`. (`release-notes.md` is at repo root, not under `docs/**` nor a README/CLAUDE/AGENTS file — out of scope.)

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `validateResourceUrl(url) -> { ok: true, url } | { ok: false, reason }` | `AGENTS.md:49` | `src/lib/resources.ts:26` | OK |
| Routes dual-write through `writeEvent('ResourceQueued', …)` | `AGENTS.md:49` | `src/lib/sessions.ts:935` | OK |
| Create txn sets `.link({ session })` | `AGENTS.md:49` | `src/lib/sessions.ts:920` | OK |
| Defaults `embedMode: 'blocked'` / `embedStatus: 'unchecked'` | `AGENTS.md:49` | `src/lib/sessions.ts:883`–`884` | OK |
| `applyEvent` folds `ResourceQueued` into `SessionProjection.resources` | `AGENTS.md:49` | `src/lib/db.ts:446`, `:250` | OK |
| `RESOURCE_TYPES` = generic_url, google_slides, form, pdf, controlled_page, unknown | `AGENTS.md:49`, `README.md:264` | `src/lib/sessions.ts:807` | OK |
| Testids `add-resource-url/-title/-type/-submit/-error` | `AGENTS.md:49` | `src/components/SessionLifecycle.tsx:395,402,410,422,431` | OK |
| Testids `resource-queue/-error/-loading/-empty`, `resource-item`, `resource-title/-url/-type` | `AGENTS.md:49` | `src/components/SessionLifecycle.tsx:440,443,451,458,467,472,475,478` | OK |
| Resources card on `/dashboard/sessions/<id>`; unsafe schemes rejected inline, nothing written | `README.md:260,270` | `src/components/SessionLifecycle.tsx:388`(Card), `addResource` gate | OK |
| Successful add writes `ResourceQueued` + `sessionResources` row in one transaction | `README.md:273` | `src/lib/sessions.ts:935` | OK |
| e2e suite `e2e/queue-resource.spec.ts` | `AGENTS.md:49`, `README.md:279` | `e2e/queue-resource.spec.ts:1` | OK |

No unbacked claims.
