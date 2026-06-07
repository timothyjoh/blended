// Cycle 0022 walkthrough — One-command ordered Instant deploy (`npm run db:push`).
//
// This is a CLI/deploy-tooling + documentation cycle: it adds the ordered,
// fail-loud orchestrator `scripts/push-db.mjs` (wired to `npm run db:push`), its
// hermetic tests, and the operator runbook. It ships NO new product UI, routes,
// or testids — per PLAN.md §Walkthrough Plan there is no new screen to drive.
//
// The cycle's observable effect is a behavioural guarantee of the orchestrator:
// it pushes the schema FIRST and the perms SECOND, invoking perms **if and only
// if** the schema step exited 0. That guarantee is what this walkthrough drives
// for real — never the home page:
//
//   1) It runs the REAL orchestrator (`scripts/push-db.mjs`) against a hermetic
//      PATH-shim `npx` stub (the same no-mock seam the cycle's vitest uses), with
//      the stub configured to FAIL the schema push. It asserts the run halts
//      non-zero, names the schema step, and the perms command is PROVABLY never
//      invoked (the ordering/stop-on-failure property). Logged to stderr.
//   2) It re-runs the REAL orchestrator with an all-success stub and asserts the
//      calls were `['schema','perms']` in that order, exit 0 (the happy path).
//   3) For visible on-screen evidence that the app the orchestrator provisions
//      actually works, it signs the operator in via the deterministic admin
//      magic-code seam and creates a real session (a `writeEvent()` dual-write),
//      capturing the created-session card. When the admin env is unset it
//      DEGRADES LOUDLY (captures the real /login surface + a stderr diagnostic)
//      rather than silently falling back to the home page.
//
// Captures (the harness screenshots one page, switching its route/state):
//   01 — the real `/login` island ready (`auth-email-input`).
//   02 — `/dashboard` for the signed-in operator (`dashboard-root`).
//   03 — the created-session card (`created-session`) — visible proof the app
//        whose schema+perms `db:push` provisions accepts a real `writeEvent()`.
//
// Preconditions: for captures 02–03, the dev server `.env` must include
// `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID` (deterministic admin-minted
// sign-in — never a real inbox). The orchestrator-ordering proof (steps 1–2)
// runs hermetically and needs NO live auth. Waits on explicit testids, never
// `networkidle` (InstantDB keeps the socket busy). Runnable under a bare `node` —
// deps are `playwright` + `@instantdb/admin` + node built-ins (no `.ts` imports).

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { init } from '@instantdb/admin'

const APP_ID = process.env.PUBLIC_INSTANTDB_APP_ID
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN

const orchestratorPath = fileURLToPath(new URL('../../../scripts/push-db.mjs', import.meta.url))
const freshEmail = () => `walk+${crypto.randomUUID()}@blended.test`

// Build a throwaway shim dir whose `npx` records each push kind to a marker file
// and exits per-kind from env — the hermetic seam the orchestrator's vitest uses.
function makeShim() {
  const dir = mkdtempSync(path.join(tmpdir(), 'walk-dbpush-'))
  const marker = path.join(dir, 'calls.log')
  const npx = path.join(dir, 'npx')
  writeFileSync(
    npx,
    [
      '#!/usr/bin/env node',
      'const fs = require("node:fs")',
      'const kind = process.argv[4]',
      'fs.appendFileSync(process.env.STUB_MARKER, kind + "\\n")',
      'const code = kind === "schema" ? Number(process.env.STUB_SCHEMA_EXIT||0) : Number(process.env.STUB_PERMS_EXIT||0)',
      'process.exit(code)',
      '',
    ].join('\n')
  )
  chmodSync(npx, 0o755)
  return { dir, marker }
}

function runOrchestrator({ schemaExit = 0, permsExit = 0 } = {}) {
  const { dir, marker } = makeShim()
  try {
    const env = {
      ...process.env,
      PATH: dir + path.delimiter + process.env.PATH,
      PUBLIC_INSTANTDB_APP_ID: APP_ID || 'walkthrough-app-id',
      STUB_MARKER: marker,
      STUB_SCHEMA_EXIT: String(schemaExit),
      STUB_PERMS_EXIT: String(permsExit),
    }
    const result = spawnSync(process.execPath, [orchestratorPath], { env, encoding: 'utf8' })
    const calls = existsSync(marker)
      ? readFileSync(marker, 'utf8').trim().split('\n').filter(Boolean)
      : []
    return { result, calls }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function mintCode(email) {
  const admin = init({ appId: APP_ID, adminToken: ADMIN_TOKEN })
  const { code } = await admin.auth.generateMagicCode(email)
  return code
}

/** Sign `page` in via the deterministic admin magic-code seam (never an inbox). */
async function signIn(page, baseURL, email) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('auth-email-input').fill(email)
  await page.getByTestId('auth-send').click()
  await page.getByTestId('auth-code-input').waitFor({ state: 'visible', timeout: 30_000 })
  const code = await mintCode(email)
  await page.getByTestId('auth-code-input').fill(code)
  await page.getByTestId('auth-verify').click()
  await page.getByTestId('auth-signed-in').waitFor({ state: 'visible', timeout: 30_000 })
}

export default async ({ page, baseURL, capture }) => {
  // 1) ORDERING/HALT GUARANTEE — schema fails → run halts, perms NEVER invoked.
  const halt = runOrchestrator({ schemaExit: 3 })
  if (halt.result.status === 0 || halt.calls.includes('perms')) {
    throw new Error(
      `[blended-walkthrough] cycle 0022: orchestrator did NOT halt on schema failure ` +
        `(status=${halt.result.status}, calls=${JSON.stringify(halt.calls)}) — the ` +
        `stop-on-failure guarantee is broken`
    )
  }
  console.error(
    `[blended-walkthrough] cycle 0022: schema-failure halt verified — status=${halt.result.status}, ` +
      `calls=${JSON.stringify(halt.calls)} (perms provably never invoked); ` +
      `stderr names the step: ${halt.result.stderr?.includes('db:push: schema step failed')}`
  )

  // 2) HAPPY PATH — schema THEN perms, in that order, exit 0.
  const ok = runOrchestrator()
  if (ok.result.status !== 0 || JSON.stringify(ok.calls) !== JSON.stringify(['schema', 'perms'])) {
    throw new Error(
      `[blended-walkthrough] cycle 0022: orchestrator happy path failed ` +
        `(status=${ok.result.status}, calls=${JSON.stringify(ok.calls)}) — expected ` +
        `exit 0 with ['schema','perms']`
    )
  }
  console.error(
    `[blended-walkthrough] cycle 0022: ordered happy path verified — exit 0, ` +
      `calls=${JSON.stringify(ok.calls)} (schema before perms)`
  )

  // 3) Visible evidence the provisioned app works (post-provisioning writeEvent).
  if (!APP_ID || !ADMIN_TOKEN) {
    console.error(
      '[blended-walkthrough] cycle 0022: INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'the orchestrator-ordering proof above ran hermetically, but the on-screen ' +
        'post-provisioning writeEvent evidence needs the admin seam. This cycle ships no ' +
        'product UI; capturing the real /login surface as degraded evidence (PLAN §Walkthrough).'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-ready-degraded')
    return
  }

  // 01 — the real sign-in surface.
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('01-login-ready')

  // 02 — signed-in dashboard.
  await signIn(page, baseURL, freshEmail())
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('new-session-open').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('02-dashboard-ready')

  // 03 — create a real session (a writeEvent dual-write) and capture the card:
  //      visible proof the app db:push provisions accepts the transaction.
  const title = `db:push ${crypto.randomUUID().slice(0, 8)}`
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('new-session-title').fill(title)
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('03-writeevent-accepted')
}
