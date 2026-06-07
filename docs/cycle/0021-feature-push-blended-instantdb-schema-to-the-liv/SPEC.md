# SPEC — Cycle 0021: Push the Blended schema to the live Instant app (one fail-loud command)

## WHY
The Blended `i.schema` (eight MVP entities, their links, and every additive field accreted across cycles 0008–0019) is defined and committed in `src/lib/db.ts`, but it has **never been pushed to the live Instant app**. The step exists only as prose: BUILD.md's "Deferred / follow-up" note and an incidental line in AGENTS.md ("if a deployment uses schema enforcement"). There is no root CLI adapter for the schema (only `instant.perms.ts` exists), no `npm run` wrapper paralleling `perms:push`, and no runbook step that names the push as a concrete deploy prerequisite.

The operational risk is concrete and observable: the moment a deployment runs against an Instant app with schema enforcement enabled, **every `writeEvent()` transaction is rejected** (the rejection correctly propagates to the caller rather than being swallowed — but the whole product stops working). The fix is a single command, yet today there is no sanctioned, fail-loud way to run it and no documentation telling an operator to.

## CONCRETE USER BENEFIT
An operator deploying Blended can run **one documented, fail-loud command — `npm run schema:push`** — and have the live Instant app's schema brought into agreement with the committed `src/lib/db.ts` schema. After it succeeds, a real product mutation (a `writeEvent()` transaction) is **accepted** by the schema-enforced live app instead of rejected — i.e. the deployed app actually works. If credentials are missing, the same command **fails loudly and non-zero** instead of silently leaving the live app unmigrated while reporting success.

## USABLE END-STATE
- `npm run schema:push` exists, mirrors `npm run perms:push`, and is the single sanctioned way to push the Blended schema. It is idempotent (re-running with an unchanged schema is a safe no-op) and exits non-zero with a clear message on missing app id, an un-spawnable CLI, or a CLI/auth/network failure.
- A root `instant.schema.ts` CLI adapter re-exports the canonical `schema` from `src/lib/db.ts` (exactly one schema definition, mirroring how `instant.perms.ts` re-exports `src/lib/perms.ts`).
- AGENTS.md records the schema push as a **concrete, ordered deploy-prerequisite runbook step** (push schema → then `perms:push`), not an incidental aside.
- The live app's schema reflects the entities/links/attrs `writeEvent()` writes; a representative `writeEvent()` transaction is accepted against it (proven end-to-end, gated on admin credentials, skipping loudly when they are absent — the established e2e convention).

## Objective
This cycle operationalizes the long-deferred schema push: it adds the missing root CLI adapter and a fail-loud, idempotent `schema:push` runner (the exact counterpart to the existing `perms:push` infrastructure), pushes the committed Blended schema to the live Instant app, documents the push as a concrete deploy-prerequisite step in the correct order relative to `perms:push`, and verifies end-to-end that a representative `writeEvent()` transaction is accepted by the now-migrated, schema-enforced live app. It closes a standing deployment hazard wherein an enforced live app would reject every product mutation with no sanctioned, discoverable remediation.

## Source Issue
`refl-0001-push-blended-schema-to-live-instant-app` — "Push Blended InstantDB schema to the live Instant app"

## Scope

### In Scope
- **Root `instant.schema.ts` CLI adapter** that re-exports `schema` from `src/lib/db.ts` (so `instant-cli push schema` loads the one canonical definition — no second schema), mirroring the `instant.perms.ts` adapter pattern.
- **`npm run schema:push`** — a fail-loud, idempotent runner (`scripts/push-schema.mjs`, mirroring `scripts/push-perms.mjs`): resolves `PUBLIC_INSTANTDB_APP_ID` before any network call, shells out to `instant-cli push schema --app <id>`, and exits non-zero with a clear message on every failure path. Push the live schema with it and verify a representative `writeEvent()` transaction is accepted.
- **AGENTS.md deploy-prerequisite runbook step**: document `npm run schema:push` as a concrete, ordered deploy step (schema push **before** `perms:push`, so perms rules referencing schema-defined links/attrs resolve), replacing the incidental "if a deployment uses schema enforcement" prose.

### Out of Scope
- Any **change to the schema itself** in `src/lib/db.ts` (no new entities, fields, or links — this cycle pushes the existing committed schema, it does not evolve it).
- Tightening the still-open Batch-2 permission rules (`questions` / `endorsements`) — a separate deferred follow-up.
- A combined "push schema + perms in one command" meta-runner, schema-diff previewing, or CI automation of the push — future work; this cycle delivers the single sanctioned command and the documented ordering.
- Any product UI change.

## Requirements
- The root `instant.schema.ts` MUST re-export the existing `schema` object from `src/lib/db.ts` — it MUST NOT redeclare or fork the schema (single source of truth, exactly as `instant.perms.ts` does for perms).
- `npm run schema:push` MUST resolve `PUBLIC_INSTANTDB_APP_ID` and fail **before** any network call when it is missing/empty; it MUST forward a non-zero exit on an un-spawnable CLI or a CLI rejection (auth/network/unreachable app), with a distinct, actionable message for each. It MUST perform no local mutation and MUST be safe to re-run (idempotent — pushing an unchanged schema is a no-op).
- The pushed live schema MUST reflect the entities, links, and attrs that `writeEvent()` and the projection writes use (in particular the accreted additive fields: `messages.clientActionId`, the `question*` / `message*` links, `sessions.currentUrl` / `currentUrlVersion`, `sessionResources.teacherId`, the `adminLevel` string field, etc.).
- AGENTS.md MUST present the push as an ordered runbook step (`schema:push` then `perms:push`) and explain the ordering rationale; the change MUST NOT contradict the existing `perms:push` documentation.
- **Failure behavior**: On missing/empty `PUBLIC_INSTANTDB_APP_ID`, `npm run schema:push` exits non-zero with a clear "set it in .env" message and makes **no** network call. On an un-spawnable `instant-cli` (npx/CLI unavailable) it exits non-zero naming the cause. On a CLI rejection (auth/network/unreachable app) it forwards the non-zero exit with a message pointing at `instant-cli login` / connectivity — the live app is **never** left unmigrated while the command reports success. Errors are surfaced (logged to stderr + non-zero exit), never swallowed. The live-verification e2e **skips loudly** (does not pass falsely) when admin credentials are absent.

## Acceptance Criteria
- [ ] `npm run schema:push` exists in `package.json` and resolves to a runner that shells out to `instant-cli push schema` for the configured app.
- [ ] Root `instant.schema.ts` re-exports the canonical `schema` from `src/lib/db.ts` with no second schema declaration (verifiable by reading the file: it contains a re-export, not an `i.schema({…})` call).
- [ ] **User-observable benefit**: after `npm run schema:push` succeeds against the live app, a representative `writeEvent()` transaction is **accepted** (not rejected) by the schema-enforced live app — proven by an e2e/integration check that exercises the dual-write path against the live app and asserts the event + projection rows land (skips loudly without admin credentials).
- [ ] **Failure path**: running the schema-push runner with `PUBLIC_INSTANTDB_APP_ID` unset/empty exits non-zero, prints a clear message instructing the operator to set it in `.env`, and makes no network call (mirrors `push-perms`'s integration test, which spawns the runner directly).
- [ ] **Failure path**: a CLI/auth/network rejection from `instant-cli push schema` causes the runner to exit non-zero forwarding the CLI's status, with a message pointing at auth/connectivity — never exit 0.
- [ ] AGENTS.md documents `npm run schema:push` as a concrete deploy-prerequisite step ordered **before** `npm run perms:push`, with the ordering rationale stated.
- [ ] All existing tests still pass (`npm run test`).
- [ ] `npm run astro check` reports no new errors; no compiler/linter warnings introduced.

## Testing Strategy
- **Vitest / Node integration**: a spec that spawns `scripts/push-schema.mjs` directly (mirroring the existing push-perms integration coverage) and asserts the missing-app-id branch exits non-zero with the expected message and issues no network call. If an `src/lib/pushSchema.ts`-style pure `resolveAppId` seam is introduced, unit-test it; otherwise assert the runner behavior directly.
- **Playwright e2e (live)**: a spec that (given admin credentials) runs the schema push and then drives a representative `writeEvent()` dual-write against the live schema-enforced app, asserting the `sessionEvents` envelope + the projection row are accepted via the existing admin read helper (`queryAdmin`). It MUST `test.skip` loudly when admin env (`INSTANT_ADMIN_TOKEN` / app id) is absent — never pass falsely. Reuse the `e2e/permissions.spec.ts` skip-and-admin-read conventions.
- **Idempotency**: assert (or document via the runner's design) that a second push of the unchanged schema is a no-op and exits 0.
- Key scenarios: happy path (push succeeds, write accepted); missing credentials (fail-loud, no network); CLI rejection (forwarded non-zero); re-run idempotency. No UI changed, so no new component e2e is required.

## Documentation Updates
- **AGENTS.md**: replace the incidental "if a deployment uses schema enforcement" note with a concrete **deploy runbook step** — run `npm run schema:push` (new), then `npm run perms:push`, in that order, with the rationale (perms rules reference schema-defined links/attrs, so the schema must be live first). Update the existing `## Data Layer` / `## Environment & Secrets` notes that mention `npx instant-cli push schema` to point at the new wrapper.
- **README.md**: surface `npm run schema:push` alongside `npm run perms:push` as a deploy prerequisite for any schema-enforced Instant app.
- **`.env.example`**: confirm `PUBLIC_INSTANTDB_APP_ID` is documented as required by the push runner (no new key expected; note it if the runner needs `INSTANT_ADMIN_TOKEN` for the live-verification e2e).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- The committed Blended `schema` in `src/lib/db.ts` and the `writeEvent()` dual-write helper (cycle 0001 Foundation) — already present.
- The `instant.perms.ts` adapter + `scripts/push-perms.mjs` + `perms:push` script — the pattern this cycle mirrors (already present).
- `@instantdb/react` (`init` with `schema`) and `instant-cli` (run via `npx`) — already in the dependency tree.
- **Live-app push** requires an authenticated `instant-cli` session (`instant-cli login`) and a valid `PUBLIC_INSTANTDB_APP_ID`; the **live-verification e2e** additionally requires `INSTANT_ADMIN_TOKEN`. Absent these, the runner fails loudly and the e2e skips loudly — neither passes falsely.
