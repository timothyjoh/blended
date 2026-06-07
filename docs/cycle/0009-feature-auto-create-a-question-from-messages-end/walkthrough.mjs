/**
 * Cycle 0009 walkthrough — "Auto-create a Question from messages ending in '?'".
 *
 * Drives the REAL cycle-0009 flow (never the home page): a teacher signs in,
 * creates a session, opens /dashboard/sessions/[id], Starts it (→ `live`) and
 * reads the join code; a student (own context) opens /join/<code>, lands on the
 * real /s/<code> chat surface, sends "what is mitosis?" (the message that becomes
 * a Question), then sends "ok thanks" (which stays chat-only).
 *
 * This cycle adds NO teacher-facing Question UI, so the `Question` object itself
 * is not screenshot-able. The walkthrough captures the student flow that TRIGGERS
 * Question creation over the real /s/<code> route; the promoted `questions` row +
 * the `QuestionCreated` event are verified by an `@instantdb/admin` query logged
 * to stderr (the observability signal), not a screenshot. When the admin env is
 * unset the script degrades LOUDLY to capturing the observable /login page — it
 * never falls back to the home page.
 *
 * Runnable under a bare `node`: deps are `playwright` + node built-ins, plus the
 * installed `@instantdb/admin` package (NOT a project `.ts` import) to mint the
 * deterministic magic code and run the observability read. Realtime waits are on
 * explicit testid elements, never `networkidle` (InstantDB keeps the socket busy).
 */

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LOG = (msg) => process.stderr.write(`[cycle-0009-walkthrough] ${msg}\n`)

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

/** Run an admin read for the observability assertions (the dual-write signal). */
async function queryAdmin(query) {
  const { init } = await import('@instantdb/admin')
  const admin = init({
    appId: process.env.PUBLIC_INSTANTDB_APP_ID,
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  })
  return admin.query(query)
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

/** Sign a fresh student into its OWN context and return the page + context. */
async function newStudent(browser, baseURL) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, baseURL, freshEmail())
  return { page, context }
}

export default async ({ page, baseURL, capture }) => {
  await loadEnvFile()

  const adminAvailable = !!process.env.INSTANT_ADMIN_TOKEN && !!process.env.PUBLIC_INSTANTDB_APP_ID
  if (!adminAvailable) {
    LOG(
      'INSTANT_ADMIN_TOKEN / PUBLIC_INSTANTDB_APP_ID unset — cannot mint a deterministic ' +
        'sign-in code; capturing the observable /login page instead of the question flow.'
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
  const title = `Questions — Lesson ${crypto.randomUUID().slice(0, 6)}`
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(title)
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
  await capture('01-session-live')
  LOG(`session live with join code ${code}`)

  const sessRes = await queryAdmin({ sessions: { $: { where: { title } } } })
  const sessionId = sessRes.sessions[0].id

  // --- Student: open /join/<code> → land on /s/<code> with the empty chat input. ---
  const s = await newStudent(browser, baseURL)
  await s.page.goto(`${baseURL}/join/${code}`, { waitUntil: 'load', timeout: 30_000 })
  await s.page.getByTestId('student-chat-root').waitFor({ state: 'visible', timeout: 30_000 })
  await s.page.getByTestId('student-chat-input').waitFor({ state: 'visible', timeout: 20_000 })
  await capture('02-student-chat-open')

  // --- Question-like message: "what is mitosis?" → becomes a Question. ---
  const question = `what is mitosis ${crypto.randomUUID().slice(0, 6)}?`
  await s.page.getByTestId('student-chat-input').fill(question)
  await s.page.getByTestId('student-chat-send').click()
  await s.page
    .getByTestId('student-chat-message-item')
    .filter({ hasText: question })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('03-question-message')

  // --- Casual message: "ok thanks" → stays chat-only. ---
  const casual = `ok thanks ${crypto.randomUUID().slice(0, 6)}`
  await s.page.getByTestId('student-chat-input').fill(casual)
  await s.page.getByTestId('student-chat-send').click()
  await s.page
    .getByTestId('student-chat-message-item')
    .filter({ hasText: casual })
    .waitFor({ state: 'visible', timeout: 20_000 })
  await capture('04-casual-message')

  // --- Observability (no UI for it this cycle): log the promoted Question + event. ---
  const qRes = await queryAdmin({
    questions: { $: { where: { sessionId } }, message: {}, participant: {} },
  })
  const qEvents = await queryAdmin({
    sessionEvents: { $: { where: { sessionId, type: 'QuestionCreated' } } },
  })
  LOG(
    `questions for session = ${qRes.questions?.length ?? 0} (expected 1); ` +
      `QuestionCreated events = ${qEvents.sessionEvents?.length ?? 0} (expected 1); ` +
      `linked message text = ${JSON.stringify(qRes.questions?.[0]?.message?.text)}`
  )

  await s.context.close()
  LOG('done: 4 capture points across the question-promotion flow (live, chat-open, question, casual)')
}
