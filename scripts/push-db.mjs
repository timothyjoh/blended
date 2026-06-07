#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Ordered, fail-loud, idempotent deploy orchestrator (cycle 0022).
// `npm run db:push` pushes the live Instant app's schema and permission rules in
// the ONE correct order: schema FIRST, perms second — and perms is invoked **if
// and only if** the schema step exited 0.
//
// Why the order is a hard property, not a convention: the perms rules reference
// schema-defined links/attrs (e.g. `data.ref('participant.userId')`,
// `data.ref('session.teacherId')`), which only resolve once the schema delta is
// live (AGENTS.md). Pushing perms against an unmigrated schema can be rejected,
// or — worse — leave the operator believing enforcement is provisioned when the
// schema half never landed. This orchestrator makes "schema first, then perms,
// and never perms if schema failed" an executable, observable guarantee.
//
// Reuse, not reimplementation: this spawns the existing `push-schema.mjs` then
// `push-perms.mjs` runners (each the single source of truth for its own push
// behavior, including the `PUBLIC_INSTANTDB_APP_ID` precondition that exits
// non-zero before any network call). The orchestrator adds no duplicated CLI
// invocation and no duplicated `resolveAppId` logic.
//
// Fail-loud: the first non-zero exit is FORWARDED, never collapsed to 0. A
// schema-step failure halts the run with a message naming the schema step and
// the perms push is provably never attempted. A perms-step failure surfaces a
// message naming the perms step. No error is swallowed.
//
// Idempotent: performs no local mutation; each underlying `instant-cli push` is
// declarative, so re-running against an unchanged schema + ruleset is a safe
// no-op and an interrupted run leaves the repo unchanged.
// ---------------------------------------------------------------------------
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Spawn a sibling runner as a child process. Returns 0 on success, otherwise a
// non-zero exit code (never collapsed to 0). An un-spawnable child is a hard
// failure: report it with the step name and exit 1 — never swallowed.
function runStep(runnerPath, label) {
  const result = spawnSync(process.execPath, [runnerPath], { stdio: 'inherit' })
  if (result.error) {
    console.error(
      `db:push: ${label} step failed (could not spawn runner: ${result.error.message})`
    )
    process.exit(1)
  }
  if (result.status !== 0) return result.status || 1
  return 0
}

const schemaPath = fileURLToPath(new URL('./push-schema.mjs', import.meta.url))
const permsPath = fileURLToPath(new URL('./push-perms.mjs', import.meta.url))

const schemaExit = runStep(schemaPath, 'schema')
if (schemaExit !== 0) {
  console.error(
    `db:push: schema step failed (exit ${schemaExit}) — halting; perms NOT pushed (schema must be live before perms refs resolve)`
  )
  process.exit(schemaExit)
}

console.log('db:push: schema pushed — pushing perms…')

const permsExit = runStep(permsPath, 'perms')
if (permsExit !== 0) {
  console.error(`db:push: perms step failed (exit ${permsExit})`)
  process.exit(permsExit)
}

console.log('db:push: schema + perms pushed — deploy provisioning complete')
