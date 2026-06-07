#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Fail-loud, idempotent schema-push runner (cycle 0021). `npm run schema:push`
// validates the app-id precondition, then shells out to `instant-cli push schema`
// (which loads the root `instant.schema.ts`). Every failure path exits NON-ZERO
// with a clear message — the live Instant app is never left silently unmigrated
// while the command reports success, which would make every `writeEvent()`
// transaction be rejected by a schema-enforced app.
//
// Deploy ordering: run this BEFORE `npm run perms:push` so the schema delta is
// live first and the perms rules' link/attr refs resolve (see AGENTS.md).
//
// Idempotent: `instant-cli push schema` is declarative, so pushing an unchanged
// schema is a no-op and re-runs are safe. This runner performs no local mutation.
//
// The app-id precondition mirrors `src/lib/pushSchema.ts#resolveAppId` (the
// canonical, unit-tested spec). A `.mjs` runner cannot import the `.ts` without a
// loader, so the one line is replicated here and the runner's missing-credentials
// behavior is covered by an integration test that spawns this file directly.
// ---------------------------------------------------------------------------
import { spawnSync } from 'node:child_process'

function resolveAppId(env) {
  const appId = env.PUBLIC_INSTANTDB_APP_ID
  if (!appId || appId.trim() === '') {
    throw new Error(
      'push-schema: PUBLIC_INSTANTDB_APP_ID is missing or empty — cannot push schema (set it in .env)'
    )
  }
  return appId
}

let appId
try {
  appId = resolveAppId(process.env)
} catch (err) {
  // Missing credentials: fail BEFORE any network call.
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

const result = spawnSync('npx', ['instant-cli', 'push', 'schema', '--app', appId], {
  stdio: 'inherit',
})

if (result.error) {
  // CLI could not be spawned at all (e.g. npx/instant-cli not installable).
  console.error(
    `push-schema: failed to run instant-cli (${result.error.message}) — is npx available and online?`
  )
  process.exit(1)
}

if (result.status !== 0) {
  // CLI ran but rejected (auth/network/unreachable app). Forward its exit code.
  console.error(
    `push-schema: instant-cli push schema failed (exit ${result.status}) — check \`instant-cli login\` auth and network`
  )
  process.exit(result.status || 1)
}
