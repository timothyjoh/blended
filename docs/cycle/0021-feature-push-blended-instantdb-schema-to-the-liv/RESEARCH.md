# Research: Cycle 0021

## Cycle Context
SPEC.md operationalizes a long-deferred deployment step: pushing the committed Blended `i.schema` (defined in `src/lib/db.ts`) to the live Instant app. Today this step exists only as prose in docs; there is no root `instant.schema.ts` CLI adapter, no `npm run schema:push` wrapper, and no concrete runbook step. This cycle adds (1) a root `instant.schema.ts` that re-exports the canonical `schema` from `src/lib/db.ts` (mirroring how `instant.perms.ts` re-exports `src/lib/perms.ts`), (2) a fail-loud, idempotent `scripts/push-schema.mjs` runner wired to `npm run schema:push` (the exact counterpart of `scripts/push-perms.mjs` / `perms:push`), (3) AGENTS.md/README.md/.env.example documentation recording the schema push as an ordered deploy prerequisite (schema push **before** `perms:push`), and (4) end-to-end verification that a representative `writeEvent()` transaction is accepted against the now-migrated, schema-enforced live app. The schema itself in `src/lib/db.ts` is explicitly **out of scope** (no new entities/fields/links).

## Current Codebase State

### Relevant Components
- **Canonical schema definition**: `export const schema = i.schema({ entities: {…}, links: {…} })` — the eight MVP entities and seven links — `src/lib/db.ts:39-214`. This is the single source the new `instant.schema.ts` must re-export.
- **Client init from schema**: `export const db = init({ appId: APP_ID, schema })` — `src/lib/db.ts:216`.
- **App-id init guard**: `requireAppId(value)` throws on missing/empty id; `const APP_ID = requireAppId(import.meta.env.PUBLIC_INSTANTDB_APP_ID)` — `src/lib/db.ts:18-27`.
- **`writeEvent()` dual-write choke point**: validates input synchronously, then commits a `sessionEvents` envelope + projection txns in one `db.transact([...])`; rejection propagates to caller (not swallowed) — `src/lib/db.ts:675-703`.
- **`buildEventEnvelope()`** (pure §7.2 envelope shape) — `src/lib/db.ts:715-731`.
- **Existing perms CLI adapter** (the pattern to mirror): re-exports `default` from `src/lib/perms` — `instant.perms.ts:1-5`.
- **Existing perms push runner** (the pattern to mirror): `scripts/push-perms.mjs:1-56`.
- **Pure precondition seam for perms** (`resolveAppId`): `src/lib/pushPerms.ts:15-23`.
- **No `instant.schema.ts`, no `scripts/push-schema.mjs`, no `src/lib/pushSchema.ts`, no `schema:push` npm script exist today** (confirmed: root listing has only `instant.perms.ts`; `scripts/` has only `push-perms.mjs`, `walkthrough-capture.mjs`, `walkthrough-capture.test.mjs`; `package.json:5-17` defines `perms:push` but no `schema:push`).

### Existing Patterns to Follow
- **CLI adapter re-export pattern**: `instant.perms.ts:5` is `export { default } from './src/lib/perms'`. The header comment (`instant.perms.ts:1-4`) explains the adapter exists only because `instant-cli` loads a root file, and that re-exporting keeps exactly one definition. `src/lib/perms.ts` exports `default` (an object); `src/lib/db.ts` exports `schema` as a **named** export (`src/lib/db.ts:39`), so a schema adapter mirrors the structure but matches the named export shape `instant-cli push schema` expects.
- **Fail-loud runner pattern** (`scripts/push-perms.mjs`):
  - `resolveAppId(env)` reads `PUBLIC_INSTANTDB_APP_ID`, throws if missing/empty/whitespace BEFORE any network call — `scripts/push-perms.mjs:19-27`.
  - Resolution wrapped in try/catch: on throw, `console.error(message)` + `process.exit(1)` — `scripts/push-perms.mjs:29-36`.
  - Shells out via `spawnSync('npx', ['instant-cli', 'push', 'perms', '--app', appId], { stdio: 'inherit' })` — `scripts/push-perms.mjs:38-40`.
  - Three distinct non-zero exit branches: spawn error (`result.error`, `scripts/push-perms.mjs:42-48`), CLI non-zero rejection (forwards `result.status`, `scripts/push-perms.mjs:50-56`).
  - The runner replicates the one-line app-id check rather than importing the `.ts` (a `.mjs` cannot import `.ts` without a loader) — documented at `scripts/push-perms.mjs:11-15`.
  - Message prefix convention: every error string is prefixed `push-perms:` — `scripts/push-perms.mjs:23,45,53`.
- **Idempotency convention**: `instant-cli push` is declarative, so pushing identical rules/schema is a no-op; the runner performs no local mutation — documented `scripts/push-perms.mjs:9-10`.
- **Pure precondition seam** (optional, for unit testing): `src/lib/pushPerms.ts:15-23` is a db-free `resolveAppId(env)` that throws a clear message; the runner mirrors the exact same one-line spec and error string.
- **npm script wiring**: `"perms:push": "node scripts/push-perms.mjs"` — `package.json:16` (the new `schema:push` would sit alongside it).
- **Failure handling (existing approach to replicate)**: errors are surfaced to stderr + non-zero exit, never swallowed; the precondition failure happens before any network call; the CLI's non-zero status is forwarded (never collapsed to 0) — `scripts/push-perms.mjs:32-56`.
- **Observability conventions**: structured cycle events go to `.cycle/log.jsonl` (engine-managed; the `cycle.start` event drives this cycle). Runtime/product logging is `console.error` to stderr for runners and `console.error('[Component] …')` in product/e2e code (e.g. `src/components/AdminSessionList.tsx` per AGENTS.md:59). The push runners use plain `console.error(message)` (no JSON) — `scripts/push-perms.mjs:34,44,52`.
- **Idempotency / retry-safety**: the perms runner is safe to re-run because the CLI push is declarative and the runner makes no local mutation (`scripts/push-perms.mjs:9-10`); `writeEvent()` is explicitly **not** idempotent by design (`src/lib/db.ts:669-671`), but atomic so a rejected call leaves no partial state.

### Dependencies & Integration Points
- **`@instantdb/react`** (`init`, `i.schema`, `id`) — `src/lib/db.ts:1`; `package.json:36` (`^1.0.43`).
- **`@instantdb/admin`** (`init`, `admin.query`, `generateMagicCode`) — used Node-side in e2e support only — `e2e/support/auth.ts:1`; `package.json:35`.
- **`instant-cli`** — invoked via `npx instant-cli push <perms|schema> --app <id>`; not a listed dependency, run through `npx` (documented `scripts/push-perms.mjs:5`).
- **`PUBLIC_INSTANTDB_APP_ID`** — the only required env key; consumed by `requireAppId` (`src/lib/db.ts:27`), the perms runner (`scripts/push-perms.mjs:20`), and gating `adminAvailable()` (`e2e/support/auth.ts:15`). Documented `.env.example:1`, AGENTS.md:71.
- **`INSTANT_ADMIN_TOKEN`** — e2e-only key for admin code minting + admin reads; gates the live e2e skip. `.env.example:7`, `e2e/support/auth.ts:14-16`.
- **e2e admin read helper `queryAdmin(query)`** — Node-side admin SDK read for observability assertions; throws on failure (never swallowed) — `e2e/support/auth.ts:43-49`.
- **e2e sign-in helpers** `adminAvailable()`, `freshEmail()`, `mintCode()`, `signInViaUi()` — `e2e/support/auth.ts:14-71`.

### Test Infrastructure
- **Unit/integration: Vitest** (`npm run test` → `vitest run`) — `package.json:11`. Config `vitest.config.ts`: `environment: 'node'`, `include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs']` (so a `scripts/*.test.mjs` is also picked up), `env.PUBLIC_INSTANTDB_APP_ID: 'test-app-id'` so importing `src/lib/db.ts` passes the init guard — `vitest.config.ts:8-27`. Coverage scope is `src/lib/**/*.ts` (`vitest.config.ts:15-25`).
- **e2e: Playwright** (`npm run test:e2e` → `playwright test`) — `package.json:14`. Config `playwright.config.ts`: `testDir: 'e2e'`, `timeout: 60_000`, `retries: 3`, dev server on port 4399 — `playwright.config.ts:7-31`.
- **Test conventions**: unit specs are co-located `*.test.ts` next to source in `src/lib/`; e2e specs are `e2e/*.spec.ts` with shared helpers in `e2e/support/auth.ts`.
- **Failure-path test coverage (existing, the model for this cycle)**: `src/lib/pushPerms.test.ts` covers both the pure `resolveAppId` (returns id; throws on missing; throws on empty/whitespace — `:8-21`) AND **spawns the real runner** `scripts/push-perms.mjs` with an empty app id, asserting non-zero exit + stderr containing `push-perms:` and `PUBLIC_INSTANTDB_APP_ID`, proving the no-network failure path deterministically — `src/lib/pushPerms.test.ts:23-34` (runner path resolved via `fileURLToPath(new URL('../../scripts/push-perms.mjs', import.meta.url))` at `:6`).
- **Live e2e skip convention** (the model for the live-verification spec): each live spec begins with `test.skip(!adminAvailable(), '…INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset…')` — `e2e/permissions.spec.ts:11-14`, `e2e/create-session.spec.ts:16-17`, plus all other admin-gated specs.
- **writeEvent acceptance proof pattern** (the model for proving a transaction lands against the live app): `e2e/create-session.spec.ts:38-60` signs in, drives a real mutation, then `expect.poll` over `queryAdmin({ sessions: { $: { where: {…} } } })` until the projection row appears and asserts a matching `sessionEvents` row of the expected `type` exists.

## Code References
- `src/lib/db.ts:39-214` — canonical `schema = i.schema({...})`: eight entities (`users`, `sessions`, `sessionResources`, `participants`, `sessionEvents`, `messages`, `questions`, `endorsements`) + seven links; named export.
- `src/lib/db.ts:216` — `db = init({ appId: APP_ID, schema })`.
- `src/lib/db.ts:675-703` — `writeEvent()` dual-write (atomic, fail-propagating, not swallowed).
- `instant.perms.ts:1-5` — root CLI adapter re-exporting `src/lib/perms` default (pattern to mirror for `instant.schema.ts`, adjusting for the named `schema` export).
- `scripts/push-perms.mjs:1-56` — fail-loud, idempotent perms runner (pattern to mirror for `scripts/push-schema.mjs`).
- `src/lib/pushPerms.ts:15-23` — pure `resolveAppId(env)` seam (optional pattern for `src/lib/pushSchema.ts`).
- `src/lib/pushPerms.test.ts:1-34` — unit + spawn-the-runner failure-path test (pattern to mirror).
- `package.json:16` — `"perms:push": "node scripts/push-perms.mjs"` (where `schema:push` is added).
- `e2e/support/auth.ts:14-49` — `adminAvailable()`, `mintCode()`, `queryAdmin()`, `signInViaUi()` (live e2e seam).
- `e2e/create-session.spec.ts:38-60` — `queryAdmin` poll-and-assert that a `writeEvent` projection + event landed (acceptance-proof model).
- `e2e/permissions.spec.ts:11-14` — loud-skip gate convention.
- `AGENTS.md:13,17` — Data Layer note; the incidental "push the schema … once with `npx instant-cli push schema`" prose (`:17`) to be replaced with a concrete runbook step.
- `AGENTS.md:29` — ordering note: push rules with `npm run perms:push` **after** `npx instant-cli push schema` (the ordering rationale the runbook must state).
- `AGENTS.md:70-71` — Environment & Secrets section documenting `PUBLIC_INSTANTDB_APP_ID` (required) and `INSTANT_ADMIN_TOKEN` (e2e-only).
- `README.md:44` — commands table (where `npm run schema:push` should be surfaced beside `perms:push`).
- `README.md:56-59,72-85` — "Before deploying … push the schema once with `npx instant-cli push schema`" and the "Not yet live" note referencing the manual push.
- `.env.example:1-17` — `PUBLIC_INSTANTDB_APP_ID`, `INSTANT_ADMIN_TOKEN`, `ADMIN_EMAILS` documentation.
- `docs/cycle/0001-feature-foundation-blended-instantdb-schema-writ/BUILD.md:3` — the original "Deferred / follow-up" note that `npx instant-cli push schema` must be run before any schema-enforcing deployment (source of this cycle's issue).
- `.cycle/log.jsonl` (last `cycle.start`) — `cycle_id: 0021`, `workflow: feature`, `issue_id: refl-0001-push-blended-schema-to-live-instant-app`.

## Open Questions
- **Schema export shape for the adapter**: `instant.perms.ts` re-exports a `default`, but `src/lib/db.ts` exports `schema` as a **named** export (`src/lib/db.ts:39`). The plan must confirm the exact re-export form `instant-cli push schema` expects from a root `instant.schema.ts` (named `schema` re-export vs. default) — to be resolved at plan time against `instant-cli` conventions.
- **Whether to introduce a `src/lib/pushSchema.ts` `resolveAppId` seam**: SPEC offers this as optional ("If an `src/lib/pushSchema.ts`-style pure `resolveAppId` seam is introduced, unit-test it; otherwise assert the runner behavior directly"). The error-message prefix (`push-schema:` vs reusing `push-perms`'s wording) is a plan-time decision.
- **Live push execution**: the actual `npm run schema:push` against the live app requires an authenticated `instant-cli login` session and a real `PUBLIC_INSTANTDB_APP_ID`; whether these credentials are available in the build environment determines whether the push and live-verification e2e run or skip loudly.
- **Idempotency assertion**: whether the cycle asserts the re-run no-op behavior programmatically or documents it via the runner's design (the SPEC permits either) — to be decided in the plan.
