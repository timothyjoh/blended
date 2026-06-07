All passes complete. Every doc claim is backed, coverage matches base with no regression, tests are strong and adversarial, and all SPEC acceptance criteria are met. Producing the review artifact.

# Review: Cycle 0016

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, disciplined vertical slice that mirrors the established cycle-0015 queue path exactly: pure total builder → thin injectable wrapper → exported default txn → fold → shared component. All eight PLAN tasks are implemented as specified, `npm run astro check` is clean (0 errors / 0 warnings), the full suite passes (345 tests, 9 files), and coverage holds with no per-file regression. The SPEC's stated user benefit — a teacher action visibly driving what students see in realtime — is genuinely deliverable end-to-end through the wired Activate control, the dual-write path, and the shared session-row-driven pane.

### Findings
1. **Architecture (positive)**: Activation routes solely through `activateResource` → `writeEvent('ResourceActivated', …)`; the projection update is a single keyed `sessions[id].update` with no orphan-link op — `src/lib/sessions.ts:1011`, `src/lib/sessions.ts:1039`.
2. **Fail-safe (positive)**: `buildResourceActivate` is total — every invalid leg (non-teacher, missing `actor.id`/`sessionId`/`resourceId`, foreign/not-found resource, blank URL) throws synchronously before any plan, so nothing is written — `src/lib/sessions.ts:993`–`1001`.
3. **No silent failure (positive)**: the teacher handler surfaces failures inline (`role="alert"`) + `console.error('[SessionLifecycle] activate failed:', …)` and clears the pending latch in `finally`; the wrapper has no try/catch so a rejected `db.transact()` propagates to the caller — `src/components/SessionLifecycle.tsx:174`–`200`, `src/lib/sessions.ts:1035`.
4. **Idempotency (positive)**: not idempotent by design (each call appends a fresh event), but the projection write is convergent (keyed update re-sets identical values) and a failed dual-write leaves no partial state (single transaction) — documented and tested.
5. **Replay-safe fold (positive)**: `ResourceActivated` folds onto the session row, tolerates an absent prior session via a minimal-session build, never mutates input, and never reaches `default`/`UnknownEventTypeError` — `src/lib/db.ts:494`–`522`.
6. **Security (positive)**: the iframe is sandboxed `allow-scripts allow-popups allow-forms` with `referrerPolicy="no-referrer"`; `allow-same-origin` is deliberately omitted so it is never combined with `allow-scripts` — `src/components/ResourcePane.tsx:38`–`39`.
7. **Privacy (positive)**: the pane and activation surfaces render resource/session URL fields only; no email field is read or rendered.

### Spec Compliance Checklist
- [x] Single sanctioned path — `activateResource`/`buildResourceActivate` only; no stray `sessions[id].update({ activeResourceId | currentUrl })` in product code (`src/lib/sessions.ts:1011` is the sole projection write).
- [x] Pure, total builder — validates before any plan; throws on every invalid leg.
- [x] Atomic dual-write — envelope + projection update in one `writeEvent` transaction.
- [x] Ownership in depth — builder role/belonging check AND existing `sessions` owner-only-write rule; no perms change.
- [x] Replay-safe fold — `applyEvent('ResourceActivated', …)`; `SessionProjection.session` gains `activeResourceId?`/`currentUrl?`.
- [x] Shared render surface — single `ResourcePane` mounted in both `SessionLifecycle` and `StudentSession`, reading the live session row; controlled sandboxed iframe.
- [x] Realtime, not polling — propagation via existing `db.useQuery`; late-joiner reads `currentUrl` off the session row.
- [x] No email rendering.
- [x] Failure behavior — invalid input throws pre-write; UI surfaces inline + logs; empty state explicit; non-loading iframe does not crash.
- [x] Additive `sessions.currentUrl` schema field — `src/lib/db.ts:62`.
- [x] SPEC `## Acceptance Criteria` present with testable bullets; PLAN `## SPEC Acceptance Traceability` present and re-quotes every bullet verbatim with a covering task.
- [x] Docs updated (AGENTS.md, README.md, release-notes.md) including the `instant-cli push schema` / no-`perms:push` note.
- [x] `npm run astro check` clean.

## Adversarial Test Review

### Summary
Strong. Tests exercise real implementations (builder, fold, default txn) directly; the wrapper uses the existing injectable `write`/`buildTxn` deps rather than network mocks, and the assertions are specific (full `toEqual` on plan/envelope/payload, `__ops` shape inspection, per-leg `.toThrow(/…/)`). Failure legs, idempotency, switch-overwrite, no-mutation, and absent-prior-session tolerance are all covered.

### Findings
1. **Boundary coverage (positive)**: every builder rejection leg is individually asserted with a regex matching its specific message — `src/lib/sessions.test.ts:1287`–`1316`.
2. **Assertion quality (positive)**: `defaultResourceActivateTxn` is verified by inspecting `__ops` for the keyed `update` and asserting the absence of any `link` op — `src/lib/sessions.test.ts:1399`–`1416`.
3. **No-write-on-rejection (positive)**: the wrapper test proves no `write` is called when the builder rejects, and that a rejecting `write` propagates uncaught — `src/lib/sessions.test.ts:1355`–`1372`.
4. **Fold determinism (positive)**: `rebuildSessionProjection` is asserted order-independent (shuffled vs in-order `toEqual`) and reproduces the final state after an R1→R2 switch — `src/lib/db.test.ts:695`–`723`.
5. **Mock abuse**: none — no test is majority-mock; the only stubs are the documented injectable deps.
6. **Minor (non-blocking)**: `ResourcePane`'s render branches and the teacher Activate control are exercised only in `e2e/activate-resource.spec.ts`, which skips without `INSTANT_ADMIN_TOKEN`. This matches the SPEC Testing Strategy (pure logic in Vitest, observable UI in Playwright) and is not a regression — noted for awareness, not a fix.

### Test Coverage
- Command run: `npm run test:coverage` (`vitest run --coverage`, scope `src/lib/**`)
- Line / branch / function: 90.96% lines / 82.53% branches / 82.45% functions (overall); `sessions.ts` 97.88% / 85.78% / 88.23%; `db.ts` 93.54% / 81.74% / 100%
- Regressions vs base (per-file): none — uncovered lines in touched files (`sessions.ts:108,250,394,596`; `db.ts:297-298,606-607`) are pre-existing and outside this cycle's additions; the new fold (`db.ts:494-522`) and action path (`sessions.ts:993-1040`) are covered.
- New code without tests: `src/components/ResourcePane.tsx` and the `SessionLifecycle` Activate handler are outside the `src/lib/**` coverage scope; both are exercised by the e2e spec (empty-state, frame `data-resource-id`, switch, failure leg). Consistent with the SPEC's declared testing strategy.
- Specific scenarios missing tests: none beyond the SPEC's out-of-scope items (blocked-embed fallback, de-activation, reordering).

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `activateResource` / `buildResourceActivate` are the sole sanctioned activation path | `AGENTS.md:51` | `src/lib/sessions.ts:990`, `src/lib/sessions.ts:1036` | OK |
| Routes the dual-write through `writeEvent('ResourceActivated', …)` | `AGENTS.md:51` | `src/lib/sessions.ts:1039` | OK |
| `defaultResourceActivateTxn` is a plain `sessions[id].update({ activeResourceId, currentUrl })` with no `link` op | `AGENTS.md:51` | `src/lib/sessions.ts:1011`–`1014` | OK |
| `applyEvent` folds `ResourceActivated`; tolerates absent prior session | `AGENTS.md:51` | `src/lib/db.ts:494`–`522` | OK |
| `SessionProjection.session` gains optional `activeResourceId?`/`currentUrl?` | `AGENTS.md:51` | `src/lib/db.ts:240`–`241` | OK |
| Sandbox `allow-scripts allow-popups allow-forms` + `referrerPolicy="no-referrer"`, no `allow-same-origin` | `AGENTS.md:51`, `README.md` | `src/components/ResourcePane.tsx:38`–`39` | OK |
| Additive `sessions.currentUrl` field requires `instant-cli push schema` | `AGENTS.md:51`, `README.md` | `src/lib/db.ts:62` | OK |
| Testids `resource-pane`, `resource-pane-empty`, `resource-pane-frame` (carrying `data-resource-id`) | `AGENTS.md:51` | `src/components/ResourcePane.tsx:23`,`24`,`33`–`34` | OK |
| Testid `activate-resource`, `activate-resource-error`; active row carries `data-active="true"` | `AGENTS.md:51` | `src/components/SessionLifecycle.tsx:546`,`560`,`529` | OK |
| Failed activation surfaces inline + `console.error('[SessionLifecycle] activate failed:', …)` | `AGENTS.md:51` | `src/components/SessionLifecycle.tsx:191`–`195` | OK |
| Student view at `/s/<joinCode>` renders the active resource via the shared pane | `README.md` | `src/pages/s/[joinCode].astro:19`, `src/components/StudentSession.tsx:83`–`86` | OK |
| Each queued row has an **Activate** button that puts the resource in front of the room | `README.md` | `src/components/SessionLifecycle.tsx:544`–`552` | OK |
| Before activation, both panes show an explicit "no active resource yet" state | `README.md`, `AGENTS.md:51` | `src/components/ResourcePane.tsx:21`–`28` | OK |
| e2e suite is `e2e/activate-resource.spec.ts` | `AGENTS.md:51`, `README.md` | `e2e/activate-resource.spec.ts:1` | OK |

All enumerated doc claims introduced in the in-scope paths (AGENTS.md, README.md) are backed by a real `file:line` reference at HEAD. No unbacked claims.
