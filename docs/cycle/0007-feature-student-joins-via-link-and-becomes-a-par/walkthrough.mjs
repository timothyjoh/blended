/**
 * Cycle 0007 walkthrough — "Student joins via link and becomes a participant".
 *
 * Drives the REAL cycle-0007 routes (never the home page): a teacher signs in,
 * creates a session, opens /dashboard/sessions/[id], Starts it (→ `live`) and
 * reads the join code; then two students in their OWN browser contexts open
 * /join/<code>, authenticate, and land on /s/<code> — the live presence/status
 * view. The late joiner (C) immediately reflects the same `live` status and the
 * expanded present-participants set (proving real-time late-joiner sync). Two
 * failure legs follow: /join/<unknownCode> (→ join-not-found) and the link for a
 * still-draft session (→ join-not-open).
 *
 * Runnable under a bare `node`: deps are `playwright` + node built-ins, plus the
 * installed `@instantdb/admin` package (NOT a project `.ts` import) to mint the
 * deterministic magic code — the e2e seam reimplemented inline so this file
 * imports nothing from project source. Honors the e2e preconditions: test-code
 * auth via admin-minted codes (never a real inbox), a freshly created + started
 * session (no pre-seeding), multiple browser contexts. When INSTANT_ADMIN_TOKEN /
 * PUBLIC_INSTANTDB_APP_ID are unset it degrades LOUDLY to capturing the observable
 * /login page (it does not fall back to the home page). Realtime waits are on
 * explicit testid elements, never `networkidle` (InstantDB keeps the socket busy).
 */

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LOG = (msg) => process.stderr.write(`[cycle-0007-walkthrough] ${msg}\n`)

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

/** Sign a fresh student into its OWN context and return the page + email local-part. */
async function newStudent(browser, baseURL) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = freshEmail()
  await signIn(page, baseURL, email)
  return { page, context, local: email.split('@')[0] }
}

export default async ({ page, baseURL, capture }) => {
  await loadEnvFile()

  const adminAvailable = !!process.env.INSTANT_ADMIN_TOKEN && !!process.env.PUBLIC_INSTANTDB_APP_ID
  if (!adminAvailable) {
    LOG(
      'INSTANT_ADMIN_TOKEN / PUBLIC_INSTANTDB_APP_ID unset — cannot mint a deterministic ' +
        'sign-in code; capturing the observable /login page instead of the join flow.'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load', timeout: 30_000 })
    await page
      .getByTestId('auth-email-input')
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => {})
    await capture('00-login-admin-env-unset')
    return
  }

  const browser = page.context().browser()

  // --- Teacher: sign in, create + start a session, read the join code. ---
  await signIn(page, baseURL, freshEmail())
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load', timeout: 30_000 })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(`Algebra — Lesson ${crypto.randomUUID().slice(0, 6)}`)
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session-link').waitFor({ state: 'visible', timeout: 20_000 })
  await page.getByTestId('created-session-link').click()
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 20_000 })

  await page.getByTestId('session-start').click()
  await page
    .getByTestId('session-status')
    .filter({ hasText: /^live$/ })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await page.getByTestId('session-joincode').waitFor({ state: 'visible', timeout: 20_000 })
  const code = (await page.getByTestId('session-joincode').textContent())?.trim()
  await capture('01-teacher-session-live')
  LOG(`session live with join code ${code}`)

  // --- Student B: open /join/<code> → land on /s/<code>. ---
  const b = await newStudent(browser, baseURL)
  await b.page.goto(`${baseURL}/join/${code}`, { waitUntil: 'load', timeout: 30_000 })
  await b.page.getByTestId('student-session-root').waitFor({ state: 'visible', timeout: 30_000 })
  await b.page
    .getByTestId('student-session-status')
    .filter({ hasText: /^live$/ })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('02-student-join-landing')

  // B's presence surface lists the present username(s).
  await b.page
    .getByTestId('student-session-presence-item')
    .filter({ hasText: b.local })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('03-student-session-live')

  // --- Student C: late join → immediately reflects the shared state (B + C). ---
  const c = await newStudent(browser, baseURL)
  await c.page.goto(`${baseURL}/join/${code}`, { waitUntil: 'load', timeout: 30_000 })
  await c.page.getByTestId('student-session-root').waitFor({ state: 'visible', timeout: 30_000 })
  await c.page
    .getByTestId('student-session-status')
    .filter({ hasText: /^live$/ })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await c.page
    .getByTestId('student-session-presence-item')
    .filter({ hasText: b.local })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await c.page
    .getByTestId('student-session-presence-item')
    .filter({ hasText: c.local })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('04-late-joiner-presence')

  // --- Failure leg 1: unknown code → join-not-found. ---
  const unknown = `ZZZ${crypto.randomUUID().slice(0, 7).toUpperCase()}`
  await c.page.goto(`${baseURL}/join/${unknown}`, { waitUntil: 'load', timeout: 30_000 })
  await c.page.getByTestId('join-not-found').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('05-join-not-found')

  // --- Failure leg 2: a still-draft session's link → join-not-open. ---
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load', timeout: 30_000 })
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(`Draft — Lesson ${crypto.randomUUID().slice(0, 6)}`)
  await page.getByTestId('new-session-submit').click()
  const draftCode = (
    await page.getByTestId('created-session-joincode').textContent()
  )?.trim()
  await b.page.goto(`${baseURL}/join/${draftCode}`, { waitUntil: 'load', timeout: 30_000 })
  await b.page.getByTestId('join-not-open').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('06-join-not-open')

  await b.context.close()
  await c.context.close()
  LOG('done: 6 capture points across the student-join flow (live join, late-joiner sync, failure legs)')
}
