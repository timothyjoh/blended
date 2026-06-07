// Cycle 0021 walkthrough — Push the Blended schema to the live Instant app
// (one fail-loud command: `npm run schema:push`).
//
// This is a CLI/deploy-tooling + documentation cycle: it adds the root
// `instant.schema.ts` adapter, the fail-loud `scripts/push-schema.mjs` runner,
// the `npm run schema:push` wrapper, and the deploy-order docs. It ships NO new
// product UI, routes, or testids. Per PLAN.md §Walkthrough Plan there is no new
// screen to drive; the cycle's observable effect is that, AFTER the schema is
// pushed, a real `writeEvent()` transaction is ACCEPTED by the schema-enforced
// live app. The walkthrough drives THAT real effect (never the home page):
//   1) it runs the REAL push runner (`scripts/push-schema.mjs`) against the live
//      app and asserts it exits 0 (the fail-loud command, exercised for real);
//   2) it signs the operator in via the deterministic admin magic-code seam and
//      creates a real session — a `writeEvent('SessionCreated', …)` dual-write —
//      and captures the on-screen created-session card, proving the transaction
//      was accepted post-push.
//
// Captures (the harness screenshots one page, switching its route/state):
//   01 — the real `/login` island ready (`auth-email-input`).
//   02 — `/dashboard` for the signed-in operator (`dashboard-root`), the new
//        session control visible (`new-session-open`).
//   03 — the created-session card (`created-session`) with its draft status +
//        generated join code — visible proof the post-push `writeEvent()` write
//        was ACCEPTED by the schema-enforced live app.
//
// Preconditions: the dev server `.env` must include `INSTANT_ADMIN_TOKEN` +
// `PUBLIC_INSTANTDB_APP_ID` (for deterministic admin-minted sign-in — never a
// real inbox) and an authenticated `instant-cli login` session (so the push
// succeeds). When the admin env is unset OR the push fails, the walkthrough
// DEGRADES LOUDLY (captures whatever is observable + a one-line stderr
// diagnostic) rather than silently falling back to the home page. Waits on
// explicit testids, never `networkidle` (InstantDB keeps the socket busy).
// Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin` +
// node built-ins (no project `.ts` imports).

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { init } from '@instantdb/admin'

const APP_ID = process.env.PUBLIC_INSTANTDB_APP_ID
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN

const runnerPath = fileURLToPath(new URL('../../../scripts/push-schema.mjs', import.meta.url))
const freshEmail = () => `walk+${crypto.randomUUID()}@blended.test`

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
  if (!APP_ID || !ADMIN_TOKEN) {
    console.error(
      '[blended-walkthrough] cycle 0021: INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot drive the post-push writeEvent acceptance. This cycle ships no product UI; ' +
        'capturing the real /login surface as degraded evidence (see PLAN §Walkthrough Plan).'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-ready-degraded')
    return
  }

  // 1) Run the REAL fail-loud push runner against the live app. A non-zero exit
  //    (e.g. unauthenticated `instant-cli login`) degrades loudly — we never
  //    pretend the schema is migrated when it is not.
  const push = spawnSync(process.execPath, [runnerPath], { env: process.env, encoding: 'utf8' })
  if (push.status !== 0) {
    console.error(
      `[blended-walkthrough] cycle 0021: schema:push exited ${push.status} ` +
        `(is \`instant-cli login\` authenticated?) — stderr: ${push.stderr ?? ''}. ` +
        'Capturing the /login surface as degraded evidence.'
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

  // 02 — signed-in dashboard with the new-session control.
  await signIn(page, baseURL, freshEmail())
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('new-session-open').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('02-dashboard-ready')

  // 03 — create a real session (a post-push writeEvent dual-write) and capture
  //      the created-session card: visible proof the transaction was ACCEPTED.
  const title = `Schema-push ${crypto.randomUUID().slice(0, 8)}`
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('new-session-title').fill(title)
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('created-session-joincode').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('03-writeevent-accepted')
}
