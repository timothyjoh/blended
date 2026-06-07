/**
 * Cycle 0006 walkthrough — "Teacher starts / ends a session (lifecycle)".
 *
 * Drives the REAL cycle routes (never the home page): deterministic test-code
 * sign-in → /dashboard → create a session → follow the post-create link to
 * /dashboard/sessions/[id] → observe `draft` + join disabled → Start (→ `live`,
 * join enabled) → End (→ `ended`, join closed) → a forced illegal transition that
 * surfaces the inline lifecycle error. The detail page is the subject — it is
 * what this cycle built.
 *
 * Runnable under a bare `node`: deps are `playwright` + node built-ins, plus the
 * installed `@instantdb/admin` package (NOT a project `.ts` import) to mint the
 * deterministic magic code — exactly the e2e seam, reimplemented inline so this
 * file imports nothing from the project source. Honors the e2e preconditions:
 * test-code auth via an admin-minted code (never a real inbox), a freshly created
 * session (no pre-seeding). When `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID`
 * are unset it degrades LOUDLY to capturing the observable login page (it does not
 * fall back to the home page). Realtime waits are on explicit testid elements,
 * never `networkidle` (InstantDB keeps the socket busy).
 */

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LOG = (msg) => process.stderr.write(`[cycle-0006-walkthrough] ${msg}\n`)

/** Minimal .env reader so the bare-node process picks up the same keys the dev server uses. */
async function loadEnvFile() {
  try {
    const raw = await readFile(join(REPO_ROOT, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = val
    }
  } catch {
    // No .env — rely on whatever is already in process.env.
  }
}

const freshEmail = () => `e2e+${crypto.randomUUID()}@blended.test`

/** Mint a server-valid magic code via the admin SDK (no email sent). */
async function mintCode(email) {
  const { init } = await import('@instantdb/admin')
  const admin = init({
    appId: process.env.PUBLIC_INSTANTDB_APP_ID,
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  })
  const { code } = await admin.auth.generateMagicCode(email)
  return code
}

/** Drive the real /login island to a signed-in state, swapping only code retrieval. */
async function signIn(page, baseURL, email) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'load', timeout: 30_000 })
  await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByTestId('auth-email-input').fill(email)
  await page.getByTestId('auth-send').click()
  await page.getByTestId('auth-code-input').waitFor({ state: 'visible', timeout: 15_000 })
  const code = await mintCode(email)
  await page.getByTestId('auth-code-input').fill(code)
  await page.getByTestId('auth-verify').click()
  await page.getByTestId('auth-signed-in').waitFor({ state: 'visible', timeout: 15_000 })
}

export default async ({ page, baseURL, capture }) => {
  await loadEnvFile()

  const adminAvailable = !!process.env.INSTANT_ADMIN_TOKEN && !!process.env.PUBLIC_INSTANTDB_APP_ID
  if (!adminAvailable) {
    LOG(
      'INSTANT_ADMIN_TOKEN / PUBLIC_INSTANTDB_APP_ID unset — cannot mint a deterministic ' +
        'sign-in code; capturing the observable /login page instead of the lifecycle flow.'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load', timeout: 30_000 })
    await page
      .getByTestId('auth-email-input')
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => {})
    await capture('00-login-admin-env-unset')
    return
  }

  // --- Sign in and reach the dashboard. ---
  await signIn(page, baseURL, freshEmail())
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load', timeout: 30_000 })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByTestId('new-session-open').waitFor({ state: 'visible', timeout: 15_000 })
  await capture('01-signed-in-dashboard')

  // --- Create a session (cycle-0005 flow). ---
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(`Algebra — Lesson ${crypto.randomUUID().slice(0, 6)}`)
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session').waitFor({ state: 'visible', timeout: 20_000 })
  await page.getByTestId('created-session-link').waitFor({ state: 'visible', timeout: 15_000 })
  await capture('02-session-created')

  // --- Open the detail page: draft + join disabled. ---
  await page.getByTestId('created-session-link').click()
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 20_000 })
  await page
    .getByTestId('session-status')
    .filter({ hasText: /^draft$/ })
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {})
  await capture('03-session-detail-draft')

  // --- Start → live + join enabled. ---
  await page.getByTestId('session-start').click()
  await page
    .getByTestId('session-status')
    .filter({ hasText: /^live$/ })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('04-session-live-join-enabled')

  // --- End → ended + join closed. ---
  await page.getByTestId('session-end').click()
  await page
    .getByTestId('session-status')
    .filter({ hasText: /^ended$/ })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('05-session-ended-join-closed')

  // --- Forced illegal transition: End again on an ended session → inline error. ---
  await page.getByTestId('session-end').click()
  await page.getByTestId('session-lifecycle-error').waitFor({ state: 'visible', timeout: 15_000 })
  await capture('06-lifecycle-error')

  LOG('done: 6 capture points across the draft → live → ended lifecycle flow')
}
