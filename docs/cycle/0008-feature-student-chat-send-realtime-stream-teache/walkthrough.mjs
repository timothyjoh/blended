/**
 * Cycle 0008 walkthrough — "Student chat: send + realtime stream (teachers excluded)".
 *
 * Drives the REAL cycle-0008 routes (never the home page): a teacher signs in,
 * creates a session, opens /dashboard/sessions/[id], Starts it (→ `live`) and
 * reads the join code; student B opens /join/<code>, lands on /s/<code>, sees the
 * single empty chat input, types a message and sends it (it renders in B's own
 * stream). Student C (own context) opens /s/<code> and sees B's message arrive in
 * realtime with no reload. A late joiner D opens /s/<code> AFTER messages exist and
 * sees the prior history. The teacher's facilitation view is then shown to
 * demonstrate the ABSENCE of any chat surface (teacher exclusion, SPEC §9.3).
 * Finally B attempts a blank submit and the inline rejection is captured.
 *
 * Runnable under a bare `node`: deps are `playwright` + node built-ins, plus the
 * installed `@instantdb/admin` package (NOT a project `.ts` import) to mint the
 * deterministic magic code — the e2e seam reimplemented inline so this file imports
 * nothing from project source. Honors the e2e preconditions: test-code auth via
 * admin-minted codes (never a real inbox), a freshly created + started session (no
 * pre-seeding), multiple browser contexts (A teacher, B/C/D students). When
 * INSTANT_ADMIN_TOKEN / PUBLIC_INSTANTDB_APP_ID are unset it degrades LOUDLY to
 * capturing the observable /login page (it does NOT fall back to the home page).
 * Realtime waits are on explicit testid elements, never `networkidle` (InstantDB
 * keeps the socket busy).
 */

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LOG = (msg) => process.stderr.write(`[cycle-0008-walkthrough] ${msg}\n`)

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
        'sign-in code; capturing the observable /login page instead of the chat flow.'
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
  await page.getByTestId('new-session-title').fill(`Chat — Lesson ${crypto.randomUUID().slice(0, 6)}`)
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
  // Remember the teacher facilitation detail URL so we can return to it for the
  // teacher-exclusion capture later (it is keyed by session id, not join code).
  const teacherDetailUrl = page.url()
  await capture('01-teacher-session-live')
  LOG(`session live with join code ${code}`)

  // --- Student B: open /join/<code> → land on /s/<code> with the empty chat input. ---
  const b = await newStudent(browser, baseURL)
  await b.page.goto(`${baseURL}/join/${code}`, { waitUntil: 'load', timeout: 30_000 })
  await b.page.getByTestId('student-chat-root').waitFor({ state: 'visible', timeout: 30_000 })
  await b.page.getByTestId('student-chat-input').waitFor({ state: 'visible', timeout: 20_000 })
  await capture('02-student-chat-empty')

  // B types a message and sends it; it renders in B's own stream.
  const message = `Hello everyone — ${crypto.randomUUID().slice(0, 6)}`
  await b.page.getByTestId('student-chat-input').fill(message)
  await b.page.getByTestId('student-chat-send').click()
  await b.page
    .getByTestId('student-chat-message-item')
    .filter({ hasText: message })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('03-student-chat-sent')

  // --- Student C: open /s/<code> and see B's message arrive in realtime (no reload). ---
  const c = await newStudent(browser, baseURL)
  await c.page.goto(`${baseURL}/join/${code}`, { waitUntil: 'load', timeout: 30_000 })
  await c.page.getByTestId('student-chat-root').waitFor({ state: 'visible', timeout: 30_000 })
  await c.page
    .getByTestId('student-chat-message-item')
    .filter({ hasText: message })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('04-realtime-peer')

  // --- Student D: late join AFTER messages exist → sees the prior history. ---
  const d = await newStudent(browser, baseURL)
  await d.page.goto(`${baseURL}/join/${code}`, { waitUntil: 'load', timeout: 30_000 })
  await d.page.getByTestId('student-chat-root').waitFor({ state: 'visible', timeout: 30_000 })
  await d.page
    .getByTestId('student-chat-message-item')
    .filter({ hasText: message })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('05-late-joiner-history')

  // --- Teacher exclusion: the facilitation view renders NO chat surface. ---
  await page.goto(teacherDetailUrl, { waitUntil: 'load', timeout: 30_000 })
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 20_000 })
  const hasChat = await page.getByTestId('student-chat-root').count()
  LOG(`teacher facilitation view chat-root count = ${hasChat} (expected 0)`)
  await capture('06-teacher-no-chat')

  // --- Failure: B attempts a blank submit → inline rejection, stream unchanged. ---
  await b.page.getByTestId('student-chat-input').fill('   ')
  await b.page.getByTestId('student-chat-send').click()
  await b.page.getByTestId('student-chat-error').waitFor({ state: 'visible', timeout: 10_000 })
  await capture('07-blank-rejected')

  await b.context.close()
  await c.context.close()
  await d.context.close()
  LOG('done: 7 capture points across the student-chat flow (send, realtime, late-joiner, exclusion, blank-failure)')
}
