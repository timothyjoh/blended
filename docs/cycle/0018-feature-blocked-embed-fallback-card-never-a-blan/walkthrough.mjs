// Cycle 0018 walkthrough — Blocked-embed fallback card (never a blank pane).
//
// This cycle ships observable UI: the shared `ResourcePane` (mounted in BOTH the
// teacher facilitation view /dashboard/sessions/:id and the student view
// /s/:joinCode) now detects a blocked/failed embed and renders a fallback card —
// the resource title, the URL as text, and an "Open externally" action — IN PLACE
// of a blank/broken iframe. An embeddable URL still renders inline. The walkthrough
// drives the REAL new surfaces (never the home page). Because the capture harness
// screenshots a single page, it switches that page's route to evidence each
// surface in turn:
//   01 — teacher facilitation view, the session live, a non-embeddable resource
//        queued and ready to activate.
//   02 — the teacher activates the non-embeddable resource.
//   03 — the teacher's `resource-pane-fallback` card (title + URL + "Open
//        externally"), no iframe.
//   04 — the same fallback card in the joined student view (/s/:joinCode).
//   05 — the teacher activates an EMBEDDABLE fixture; `resource-pane-frame`
//        renders inline with no card.
//
// Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin` (both
// already in node_modules; no project `.ts` imports). Auth uses the deterministic
// admin magic-code seam (never a real inbox). When the admin env is unset, the
// walkthrough DEGRADES LOUDLY — capturing the login surface with a one-line
// diagnostic — never silently falling back to the home page. Waits on explicit
// testids, never `networkidle` (InstantDB keeps the realtime socket busy). The
// fallback card's appearance is bounded by the pane's load timeout (~4s), so the
// waits for 03/04 allow generously for that delay.

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

/** Queue a resource via the add form; returns the resolved resource id. */
async function queueResource(page, url, title) {
  await page.getByTestId('add-resource-url').fill(url)
  await page.getByTestId('add-resource-title').fill(title)
  await page.getByTestId('add-resource-submit').click()
  const row = page.getByTestId('resource-item').filter({ hasText: title }).first()
  await row.waitFor({ state: 'visible', timeout: 30_000 })
  return row.getAttribute('data-resource-id')
}

async function activate(page, resourceId) {
  await page
    .locator(`[data-testid="resource-item"][data-resource-id="${resourceId}"] [data-testid="activate-resource"]`)
    .click()
}

export default async ({ page, baseURL, capture }) => {
  if (!APP_ID || !ADMIN_TOKEN) {
    process.stderr.write(
      '[walkthrough-0018] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot sign in to drive the real ResourcePane fallback card; ' +
        'capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  // The non-embeddable fixture (delays past the pane's load timeout → the card
  // appears) and the cleanly-embeddable fixture, both dev-served on baseURL.
  const hangUrl = `${baseURL}/e2e/hang`
  const okUrl = `${baseURL}/e2e/embed-ok.html`

  // --- Teacher: sign in, create + start a session ---------------------------
  await signIn(page, baseURL)
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(`Embed ${crypto.randomUUID().slice(0, 8)}`)
  await page.getByTestId('new-session-submit').click()
  await page.getByTestId('created-session').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('created-session-link').click()
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 30_000 })

  await page.getByTestId('session-start').click()
  await page
    .getByTestId('session-status')
    .filter({ hasText: 'live' })
    .waitFor({ state: 'visible', timeout: 30_000 })
  const joinCode = (await page.getByTestId('session-joincode').textContent())?.trim()

  // Queue the non-embeddable resource and an embeddable one.
  const blockedTitle = `Blocked deck ${crypto.randomUUID().slice(0, 6)}`
  const okTitle = `Embeddable deck ${crypto.randomUUID().slice(0, 6)}`
  const blockedId = await queueResource(page, hangUrl, blockedTitle)
  const okId = await queueResource(page, okUrl, okTitle)

  // 01 — teacher facilitation view: session live, resource queued, pane empty.
  await page.getByTestId('resource-pane-empty').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('01-teacher-session-live')

  // 02 — activate the non-embeddable resource.
  await activate(page, blockedId)
  await capture('02-teacher-activate-blocked')

  // 03 — the fallback card replaces the blank pane (bounded by the ~4s timeout).
  await page.getByTestId('resource-pane-fallback').waitFor({ state: 'visible', timeout: 30_000 })
  await page
    .getByTestId('resource-pane-open-external')
    .waitFor({ state: 'visible', timeout: 30_000 })
  await capture('03-teacher-fallback-card')

  // 04 — the same fallback card in the joined student view.
  await page.goto(`${baseURL}/s/${joinCode}`, { waitUntil: 'load' })
  await page.getByTestId('student-session-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('resource-pane-fallback').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('04-student-fallback-card')

  // 05 — the teacher activates the embeddable fixture; the inline frame renders.
  await page.goBack({ waitUntil: 'load' })
  await page.getByTestId('session-status').waitFor({ state: 'visible', timeout: 30_000 })
  await activate(page, okId)
  await page.waitForFunction(
    (id) =>
      document.querySelector('[data-testid="resource-pane-frame"]')?.getAttribute('data-resource-id') ===
      id,
    okId,
    { timeout: 30_000 }
  )
  await capture('05-teacher-embeddable-inline')
}
