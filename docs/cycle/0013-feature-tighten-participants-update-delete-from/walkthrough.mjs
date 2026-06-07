// Cycle 0013 walkthrough — Deny-by-default permission rules.
//
// This cycle ships NO product UI — it is a data-layer authorization change
// (flip the global InstantDB `$default` catch-all from world-open to
// deny-by-default). The only observable surface is the DEV-only `PermsProbe`
// harness at /dev/perms-probe, which renders the LIVE rules' verdict for raw
// reads/writes. The walkthrough drives THIS cycle's new deny-by-default
// behavior over that real (non-home) route, in order:
//   01 — /dev/perms-probe mounted, signed-in self id visible (`probe-self-id`)
//   02 — undeclared-entity raw write rejected (`probe-write-result` = `error:…`),
//        proving the global `$default: 'false'` locks any un-ruled namespace
//   03 — an EXISTING open/owner flow still resolves (`ok`), showing no flow
//        regressed (the four explicit-open blocks preserve today's behavior)
//
// Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin`
// (both already in node_modules; no project `.ts` imports). Auth uses the
// deterministic admin magic-code seam (never a real inbox). When the admin env
// is unset OR the live deny-by-default rules have not been pushed, the probe
// cannot demonstrate the rejection deterministically, so we DEGRADE LOUDLY —
// capturing the login/probe surface with a one-line diagnostic — rather than
// silently falling back to the home page.

import { init } from '@instantdb/admin'

const APP_ID = process.env.PUBLIC_INSTANTDB_APP_ID
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN

const freshEmail = () => `walk+${crypto.randomUUID()}@blended.test`
const freshSessionId = () => crypto.randomUUID()

async function mintCode(email) {
  const admin = init({ appId: APP_ID, adminToken: ADMIN_TOKEN })
  const { code } = await admin.auth.generateMagicCode(email)
  return code
}

export default async ({ page, baseURL, capture }) => {
  if (!APP_ID || !ADMIN_TOKEN) {
    process.stderr.write(
      '[walkthrough-0013] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot sign in or observe the live deny-by-default rules; capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  // --- Sign in via the deterministic admin magic-code seam ------------------
  const email = freshEmail()
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('auth-email-input').fill(email)
  await page.getByTestId('auth-send').click()
  await page.getByTestId('auth-code-input').waitFor({ state: 'visible', timeout: 30_000 })
  const code = await mintCode(email)
  await page.getByTestId('auth-code-input').fill(code)
  await page.getByTestId('auth-verify').click()
  await page.getByTestId('auth-signed-in').waitFor({ state: 'visible', timeout: 30_000 })

  // --- Navigate to the dev PermsProbe harness over a fresh target session ---
  const sessionId = freshSessionId()
  await page.goto(`${baseURL}/dev/perms-probe?targetSessionId=${sessionId}`, { waitUntil: 'load' })
  await page.getByTestId('perms-probe').waitFor({ state: 'visible', timeout: 30_000 })
  // Wait on the explicit signed-in self id (never `networkidle` — InstantDB
  // keeps the realtime socket busy).
  await page.getByTestId('probe-self-id').waitFor({ state: 'visible', timeout: 30_000 })
  // 01 — harness mounted, signed-in self id visible.
  await capture('01-probe-loaded')

  // --- Deny-by-default: a raw write to an UNDECLARED namespace is rejected ---
  await page.getByTestId('probe-write-undeclared').click()
  await page
    .getByTestId('probe-write-result')
    .filter({ hasText: 'error:' })
    .waitFor({ state: 'visible', timeout: 30_000 })
  // 02 — the rendered `error:` verdict proves the global `$default: 'false'`
  // rejected the write (the next entity is locked by default).
  await capture('02-undeclared-write-denied')

  // --- Contrast: an existing open/owner flow still resolves (no regression) --
  await page.getByTestId('probe-create-owned-session').click()
  await page
    .getByTestId('probe-write-result')
    .filter({ hasText: /^ok$/ })
    .waitFor({ state: 'visible', timeout: 30_000 })
  // The owner's session now exists and is readable (open reads preserved).
  await page
    .getByTestId('probe-active-resource')
    .waitFor({ state: 'visible', timeout: 30_000 })
  // 03 — an open/owner action still succeeds: the four explicit-open blocks and
  // the owner-scoped rules preserve today's behavior under deny-by-default.
  await capture('03-open-flow-intact')
}
