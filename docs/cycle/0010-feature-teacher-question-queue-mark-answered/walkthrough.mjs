// Cycle 0010 walkthrough — Teacher question queue + mark answered.
//
// Drives the REAL teacher facilitation route (/dashboard/sessions/<id>) and the
// student chat surface (/s/<code>) to show, in order:
//   01 — teacher on a live session with an empty question queue (empty-state)
//   02 — student chat after asking a `?` question
//   03 — teacher queue showing the Question live (no reload); non-`?` absent
//   04 — teacher typing an answer summary, mark-answered control in view
//   05 — teacher queue drained to the empty-state after answering
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
      '[walkthrough-0010] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  // --- Teacher: sign in, create + start a session ---------------------------
  await signIn(page, baseURL, freshEmail())
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })

  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill('Cycle 0010 — Question queue')
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('created-session-link').click()
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 30_000 })

  await page.getByTestId('session-start').click()
  await page.getByTestId('session-status').filter({ hasText: 'live' }).waitFor({ timeout: 30_000 })
  const code = (await page.getByTestId('session-joincode').textContent())?.trim()

  // 01 — teacher facilitation view, queue empty (explicit empty-state).
  await page.getByTestId('teacher-question-queue-empty').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('01-teacher-session-live')

  // --- Student: join in a second context and ask a `?` question -------------
  const browser = page.context().browser()
  const studentCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const studentPage = await studentCtx.newPage()
  await signIn(studentPage, baseURL, freshEmail())
  await studentPage.goto(`${baseURL}/join/${code}`, { waitUntil: 'load' })
  await studentPage.getByTestId('student-chat-root').waitFor({ state: 'visible', timeout: 30_000 })

  const question = 'What is mitosis?'
  await studentPage.getByTestId('student-chat-input').fill(question)
  await studentPage.getByTestId('student-chat-send').click()
  await studentPage
    .getByTestId('student-chat-message-item')
    .filter({ hasText: question })
    .waitFor({ state: 'visible', timeout: 30_000 })
  // A casual (non-`?`) message that must NEVER enter the teacher queue.
  await studentPage.getByTestId('student-chat-input').fill('ok thanks')
  await studentPage.getByTestId('student-chat-send').click()
  // 02 — student chat after asking the question.
  await capture('02-student-asks-question')

  // 03 — teacher sees the Question live in the queue (no reload).
  await page
    .getByTestId('teacher-question-item')
    .filter({ hasText: question })
    .waitFor({ state: 'visible', timeout: 30_000 })
  await capture('03-question-in-queue')

  // 04 — teacher types an optional summary; mark-answered control in view.
  const row = page.getByTestId('teacher-question-item').filter({ hasText: question })
  await row.getByTestId('question-answer-summary').fill('Cell division into two identical cells.')
  await row.getByTestId('question-mark-answered').scrollIntoViewIfNeeded()
  await capture('04-mark-answered-summary')

  // Resolve it → it leaves the queue and the empty-state returns.
  await row.getByTestId('question-mark-answered').click()
  await page.getByTestId('teacher-question-queue-empty').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('05-queue-empty-after-answer')

  await studentCtx.close()
}
