// Cycle 0015 walkthrough — Teacher queues a resource (with URL validation).
//
// This cycle ships observable UI: the add-resource control + live queue list
// inside `SessionLifecycle` on /dashboard/sessions/:id. The walkthrough drives the
// REAL new Card (never the home page):
//   01 — the session facilitation page with the EMPTY resource queue
//        (`resource-queue-empty`) and the add-resource control.
//   02 — the add-resource form filled with a valid https:// URL + title +
//        selected type, before submit.
//   03 — the resource visible as a `resource-item` after a successful add (form
//        cleared) — the live query rendered it with no reload.
//   04 — a second resource added, rendering last with a higher `data-sort-order`
//        (end-of-queue ordering).
//   05 — a `javascript:` URL entered and submitted, showing the inline
//        `add-resource-error` with the queue count unchanged (rejected before any
//        write by the single `validateResourceUrl` seam).
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
      '[walkthrough-0015] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot sign in to drive the real add-resource control + live queue; ' +
        'capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  // --- Teacher: sign in, create a session, land on the facilitation view ----
  await signIn(page, baseURL)
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(`Resources ${crypto.randomUUID().slice(0, 8)}`)
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('created-session-link').click()
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 30_000 })

  // 01 — empty queue + add-resource control (queueing works on a draft session).
  await page.getByTestId('resource-queue').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('resource-queue-empty').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('01-session-detail')

  // 02 — fill the form with a valid https:// URL + title + type, before submit.
  const title1 = `Intro slides ${crypto.randomUUID().slice(0, 8)}`
  await page.getByTestId('add-resource-url').fill('https://example.com/intro-slides')
  await page.getByTestId('add-resource-title').fill(title1)
  await page.getByTestId('add-resource-type').selectOption('google_slides')
  await capture('02-resource-form-filled')

  // 03 — submit → the resource appears in the live queue with no reload.
  await page.getByTestId('add-resource-submit').click()
  await page
    .getByTestId('resource-item')
    .filter({ hasText: title1 })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await capture('03-resource-queued')

  // 04 — add a second resource → it renders last with a higher sort order.
  const title2 = `Handout ${crypto.randomUUID().slice(0, 8)}`
  await page.getByTestId('add-resource-url').fill('https://example.com/handout.pdf')
  await page.getByTestId('add-resource-title').fill(title2)
  await page.getByTestId('add-resource-type').selectOption('pdf')
  await page.getByTestId('add-resource-submit').click()
  await page
    .getByTestId('resource-item')
    .filter({ hasText: title2 })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await capture('04-second-resource-ordered')

  // 05 — an unsafe-scheme URL is rejected inline; nothing is written.
  await page.getByTestId('add-resource-url').fill('javascript:alert(1)')
  await page.getByTestId('add-resource-title').fill('Should not be stored')
  await page.getByTestId('add-resource-submit').click()
  await page.getByTestId('add-resource-error').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('05-unsafe-rejected')
}
