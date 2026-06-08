# Runbook — Deploy the live Instant app (`npm run db:push`)

Operator procedure for provisioning the live, schema-enforced shared Instant app:
push the committed **schema** and **permission rules**, in the one correct order,
then prove the rules with the credentialed permissions e2e suite.

This is an **operator action**. It requires an authenticated `instant-cli` session
and secrets against shared infrastructure, so it is intentionally gated out of the
tokenless automated build. The orchestrator and its ordering/stop-on-failure
guarantee are covered by hermetic tests (`scripts/push-db.test.mjs`) that run in CI;
the live push itself is performed here, by hand.

## Why one command, and why the order is a hard property

`npm run db:push` runs `npm run schema:push` first and `npm run perms:push` second,
invoking perms **if and only if** the schema step exited 0. The order is not a
convention you must remember — it is enforced by the orchestrator.

The perms rules reference schema-defined links/attrs (e.g.
`data.ref('participant.userId')`, `data.ref('session.teacherId')`). Those refs only
resolve once the schema delta is live. So:

- **Schema first.** Until the schema is pushed, a schema-enforced app rejects every
  `writeEvent()` transaction and the product stops working.
- **Perms only on schema success.** If the schema push fails, perms is **never**
  attempted — the live app is never left with perms pushed against an unmigrated
  schema, and you are never misled into believing enforcement is provisioned when
  the schema half never landed.

The run is **idempotent**: each underlying `instant-cli push` is declarative, so
re-running against an unchanged schema + ruleset is a safe no-op. The orchestrator
performs no local mutation, so an interrupted run leaves the repo unchanged — just
re-run it.

## Procedure

### 1. Authenticate `instant-cli`

```sh
npx instant-cli login
```

Complete the browser auth flow. Without an authenticated session the pushes fail
loudly (non-zero, with an actionable message) rather than reporting false success.

### 2. Set the required environment

```sh
export PUBLIC_INSTANTDB_APP_ID=<the live app id>
export INSTANTDB_ADMIN_TOKEN=<the live app admin token>
```

- `PUBLIC_INSTANTDB_APP_ID` — consumed by both pushes. If missing or empty, the run
  exits non-zero **before any network call** and never reaches the perms step.
- `INSTANTDB_ADMIN_TOKEN` — required by the permissions e2e suite in step 4 (not by the
  pushes themselves).

### 3. Push schema + perms in one command

```sh
npm run db:push
```

Expected success output, in order:

```
db:push: schema pushed — pushing perms…
db:push: schema + perms pushed — deploy provisioning complete
```

(Plus each underlying runner's and `instant-cli`'s own streamed output.)

**Failure messages to expect** (each names the failed step and forwards a non-zero
exit code — nothing is swallowed):

- Missing/empty app id: `push-schema: PUBLIC_INSTANTDB_APP_ID is missing or empty …`
  — the run halts here; perms is not reached.
- Schema push rejected:
  `db:push: schema step failed (exit N) — halting; perms NOT pushed (schema must be live before perms refs resolve)`
  — perms is **never** attempted.
- Perms push rejected (after schema succeeded): `db:push: perms step failed (exit N)`.

If any of these appear, fix the underlying cause (auth, network, app id, or a
schema/ruleset rejection) and **re-run `npm run db:push`** — it is safe to re-run.

### 4. Prove the permission rules end-to-end

With `INSTANTDB_ADMIN_TOKEN` (and `PUBLIC_INSTANTDB_APP_ID`) still set, run the
credentialed permissions suite:

```sh
npm run test:e2e -- e2e/permissions.spec.ts
```

This suite **skips loudly** when `INSTANTDB_ADMIN_TOKEN` is absent. The deploy is only
verified when:

- **0 tests are skipped** (i.e. it actually ran against the live app, not skipped), and
- **every denial / propagation case passes** — private-email reads are denied to
  non-owners, only the owning teacher may mutate session state, and authenticated
  participants may append to the event log.

A skipped or failing run means the rules are **not** proven live. Do not consider the
deploy complete until this step is green with 0 skipped.

## Building blocks

`npm run db:push` is the canonical entrypoint. The two underlying commands remain
available and are run by the orchestrator in this order:

| Command | Role |
|---|---|
| `npm run schema:push` | Push the committed schema (`src/lib/db.ts`). Run **first**. |
| `npm run perms:push`  | Push the permission rules (`src/lib/perms.ts`). Run **only after** a successful schema push. |

Run them individually only for debugging a single half; for a real deploy use
`npm run db:push` so the ordering and stop-on-failure guarantee are enforced for you.
