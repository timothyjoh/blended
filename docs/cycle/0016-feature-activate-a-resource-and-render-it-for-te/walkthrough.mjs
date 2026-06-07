// Cycle 0016 walkthrough — Activate a resource and render it for teacher + students.
//
// This cycle ships observable UI: a per-row **Activate** control in
// `SessionLifecycle` and the shared `ResourcePane` (sandboxed iframe) mounted in
// BOTH the teacher facilitation view (/dashboard/sessions/:id) and the student
// view (/s/:joinCode). The walkthrough drives the REAL new surfaces (never the
// home page). Because the capture harness screenshots a single page, it switches
// that page's route to show each surface in turn:
//   01 — teacher facilitation view with the queued resources and the
//        `resource-pane-empty` state (nothing active yet).
//   02 — after clicking Activate on R1: the `resource-item` marked
//        `data-active="true"`, its button reading "Active", and the teacher's
//        `resource-pane-frame` showing R1.
//   03 — the student view at /s/:joinCode showing `resource-pane-frame` with the
//        active resource (cross-route render from the session row's currentUrl).
//   04 — after the teacher activates R2: the student `resource-pane-frame`
//        switched to R2.
//
// Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin` (both
// already in node_modules; no project `.ts` imports). Auth uses the deterministic
// admin magic-code seam (never a real inbox). When the admin env is unset, the
// walkthrough DEGRADES LOUDLY — capturing the login surface with a one-line
// diagnostic — never silently falling back to the home page. Waits on explicit
// testids, never `networkidle` (InstantDB keeps the realtime socket busy).

import { init } from '@instantdb/admin'

const APP_ID = process.env.PUBLIC_INSTANTDB_APP_ID
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN

const freshEmail = () => `walk+${crypto.randomUUID()}@blended.test`

async function mintCode(email) {
  const admin = init({ appId: APP_ID, adminToken: ADMIN_TOKEN })
  const { code } = await admin.auth.generateMagicCode(email)
  return code
}

/** Sign `page` in via the deterministic admin magic-code seam (never an inbox). */
async function signIn(page, baseURL) {
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
  return email
}

export default async ({ page, baseURL, capture }) => {
  if (!APP_ID || !ADMIN_TOKEN) {
    process.stderr.write(
      '[walkthrough-0016] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot sign in to drive the real Activate control + ResourcePane; ' +
        'capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  // --- Teacher: sign in, create + start a session, queue two resources ------
  await signIn(page, baseURL)
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(`Activate ${crypto.randomUUID().slice(0, 8)}`)
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('created-session-link').click()
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 30_000 })

  // Start the session so students can join and the join code is visible.
  await page.getByTestId('session-start').click()
  await page
    .getByTestId('session-status')
    .filter({ hasText: 'live' })
    .waitFor({ state: 'visible', timeout: 30_000 })
  const joinCode = (await page.getByTestId('session-joincode').textContent())?.trim()
  const sessionUrl = page.url()

  // Queue R1 and R2 (embeddable example.com URLs).
  const title1 = `R1 slides ${crypto.randomUUID().slice(0, 6)}`
  await page.getByTestId('add-resource-url').fill('https://example.com/r1-slides')
  await page.getByTestId('add-resource-title').fill(title1)
  await page.getByTestId('add-resource-submit').click()
  const row1 = page.getByTestId('resource-item').filter({ hasText: title1 }).first()
  await row1.waitFor({ state: 'visible', timeout: 30_000 })
  const r1Id = await row1.getAttribute('data-resource-id')

  const title2 = `R2 handout ${crypto.randomUUID().slice(0, 6)}`
  await page.getByTestId('add-resource-url').fill('https://example.com/r2-handout')
  await page.getByTestId('add-resource-title').fill(title2)
  await page.getByTestId('add-resource-submit').click()
  const row2 = page.getByTestId('resource-item').filter({ hasText: title2 }).first()
  await row2.waitFor({ state: 'visible', timeout: 30_000 })
  const r2Id = await row2.getAttribute('data-resource-id')

  // 01 — teacher view: queued resources + the empty pane (nothing active yet).
  await page.getByTestId('resource-pane-empty').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('01-teacher-session')

  // 02 — activate R1 → the teacher pane renders R1 and the row is marked active.
  await page
    .locator(`[data-testid="resource-item"][data-resource-id="${r1Id}"] [data-testid="activate-resource"]`)
    .click()
  await page
    .getByTestId('resource-pane-frame')
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(
    (id) => document.querySelector('[data-testid="resource-pane-frame"]')?.getAttribute('data-resource-id') === id,
    r1Id,
    { timeout: 30_000 }
  )
  await capture('02-resource-activated')

  // 03 — student view: the active resource renders from the session row.
  await page.goto(`${baseURL}/s/${joinCode}`, { waitUntil: 'load' })
  await page.getByTestId('student-session-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(
    (id) => document.querySelector('[data-testid="resource-pane-frame"]')?.getAttribute('data-resource-id') === id,
    r1Id,
    { timeout: 30_000 }
  )
  await capture('03-student-active')

  // Teacher switches the active resource to R2 (back on the facilitation view).
  await page.goto(sessionUrl, { waitUntil: 'load' })
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 30_000 })
  await page
    .locator(`[data-testid="resource-item"][data-resource-id="${r2Id}"] [data-testid="activate-resource"]`)
    .click()
  await page.waitForFunction(
    (id) => document.querySelector('[data-testid="resource-pane-frame"]')?.getAttribute('data-resource-id') === id,
    r2Id,
    { timeout: 30_000 }
  )

  // 04 — student view now shows R2 (the switch propagated to the session row).
  await page.goto(`${baseURL}/s/${joinCode}`, { waitUntil: 'load' })
  await page.getByTestId('student-session-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(
    (id) => document.querySelector('[data-testid="resource-pane-frame"]')?.getAttribute('data-resource-id') === id,
    r2Id,
    { timeout: 30_000 }
  )
  await capture('04-switched-resource')
}
