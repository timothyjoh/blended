// Cycle 0012 walkthrough — Teacher dashboard: session list + open.
//
// Drives the REAL teacher dashboard (/dashboard) and its new owner-scoped
// SessionList island + the click-through into facilitation, in order:
//   01 — /login island after submitting the email (auth seam, code field visible)
//   02 — /dashboard showing the explicit `session-list-empty` state (fresh teacher)
//   03 — /dashboard after creating a session: the new row in `session-list`
//   04 — the populated list, title + `draft` status on the row
//   05 — the facilitation view at /dashboard/sessions/<id> (`session-root`)
//
// Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin`
// (both already in node_modules; no project `.ts` imports). Auth uses the
// deterministic admin magic-code seam (never a real inbox). When the admin env
// is unset we cannot sign in, so we capture the login surface and emit a loud
// diagnostic rather than silently falling back to the home page.

import { init } from '@instantdb/admin'

const APP_ID = process.env.PUBLIC_INSTANTDB_APP_ID
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN

const freshEmail = () => `walk+${crypto.randomUUID()}@blended.test`

async function mintCode(email) {
  const admin = init({ appId: APP_ID, adminToken: ADMIN_TOKEN })
  const { code } = await admin.auth.generateMagicCode(email)
  return code
}

/** Drive the real /login island to a signed-in state via an admin-minted code. */
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
    process.stderr.write(
      '[walkthrough-0012] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  // --- Teacher: sign in -----------------------------------------------------
  const email = freshEmail()
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('auth-email-input').fill(email)
  await page.getByTestId('auth-send').click()
  await page.getByTestId('auth-code-input').waitFor({ state: 'visible', timeout: 30_000 })
  // 01 — the /login island with the code field visible (auth seam).
  await capture('01-login')
  const code = await mintCode(email)
  await page.getByTestId('auth-code-input').fill(code)
  await page.getByTestId('auth-verify').click()
  await page.getByTestId('auth-signed-in').waitFor({ state: 'visible', timeout: 30_000 })

  // --- Dashboard: fresh teacher, empty owner-scoped list --------------------
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('session-list').waitFor({ state: 'visible', timeout: 30_000 })
  // 02 — explicit empty-state element (no blank region) for a teacher with none.
  await page.getByTestId('session-list-empty').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('02-dashboard-empty')

  // --- Create a session via the real NewSession control ---------------------
  const title = 'Cycle 0012 — Session list'
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(title)
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session').waitFor({ state: 'visible', timeout: 30_000 })

  // 03 — the new row appears live in the owner-scoped SessionList (no reload).
  const row = page.getByTestId('session-list-item').filter({ hasText: title })
  await row.waitFor({ state: 'visible', timeout: 30_000 })
  await capture('03-session-created')

  // 04 — the populated list: title + `draft` status on the row.
  await row.getByTestId('session-list-item-status').filter({ hasText: 'draft' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  })
  await row.scrollIntoViewIfNeeded()
  await capture('04-session-list-populated')

  // --- Click the row → land in the facilitation view ------------------------
  await row.click()
  await page.getByTestId('session-root').waitFor({ state: 'visible', timeout: 30_000 })
  // 05 — the facilitation view at /dashboard/sessions/<id>.
  await capture('05-facilitation-view')
}
