// Cycle 0017 walkthrough — Teacher-driven URL broadcast + student follow / re-sync.
//
// This cycle ships observable UI: a `broadcast-url-control` (URL field +
// Broadcast action) in `SessionLifecycle`, enabled once a resource is active, and
// a version-keyed shared `ResourcePane` iframe (mounted in BOTH the teacher
// facilitation view /dashboard/sessions/:id and the student view /s/:joinCode)
// that re-mounts on every broadcast. The walkthrough drives the REAL new surfaces
// (never the home page). Because the capture harness screenshots a single page,
// it switches that page's route to evidence each surface in turn:
//   01 — teacher facilitation view, a resource active, the broadcast control
//        enabled and the pane rendering the active resource.
//   02 — the broadcast control with a slide-3 URL typed into `broadcast-url-input`.
//   03 — after Broadcast: the teacher's `resource-pane-frame` `src` pointed at the
//        broadcast URL.
//   04 — the student view at /s/:joinCode: its `resource-pane-frame` snapped to
//        the same broadcast URL (re-sync, no page reload).
//   05 — a freshly joined late student context landing directly on the current
//        broadcast URL (slide-4) — not the resource's origin.
//
// Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin` (both
// already in node_modules; no project `.ts` imports). Auth uses the deterministic
// admin magic-code seam (never a real inbox). When the admin env is unset, the
// walkthrough DEGRADES LOUDLY — capturing the login surface with a one-line
// diagnostic — never silently falling back to the home page. Waits on explicit
// testids/attributes, never `networkidle` (InstantDB keeps the realtime socket busy).

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

/** Wait until the shared pane's iframe `src` equals `url` (the Blended-owned state). */
async function waitForFrameSrc(page, url) {
  await page.waitForFunction(
    (u) => document.querySelector('[data-testid="resource-pane-frame"]')?.getAttribute('src') === u,
    url,
    { timeout: 30_000 }
  )
}

export default async ({ page, baseURL, capture }) => {
  if (!APP_ID || !ADMIN_TOKEN) {
    process.stderr.write(
      '[walkthrough-0017] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot sign in to drive the real broadcast control + ResourcePane re-sync; ' +
        'capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  // --- Teacher: sign in, create + start a session, queue + activate a resource -
  await signIn(page, baseURL)
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await page.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('new-session-open').click()
  await page.getByTestId('new-session-title').fill(`Broadcast ${crypto.randomUUID().slice(0, 8)}`)
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
  const sessionUrl = page.url()

  const base = `https://example.com/deck-${crypto.randomUUID().slice(0, 8)}`
  const title1 = `Deck ${crypto.randomUUID().slice(0, 6)}`
  await page.getByTestId('add-resource-url').fill(`${base}/1`)
  await page.getByTestId('add-resource-title').fill(title1)
  await page.getByTestId('add-resource-submit').click()
  const row1 = page.getByTestId('resource-item').filter({ hasText: title1 }).first()
  await row1.waitFor({ state: 'visible', timeout: 30_000 })
  const r1Id = await row1.getAttribute('data-resource-id')

  await page
    .locator(`[data-testid="resource-item"][data-resource-id="${r1Id}"] [data-testid="activate-resource"]`)
    .click()
  await waitForFrameSrc(page, `${base}/1`)

  // 01 — teacher facilitation view: resource active, broadcast control enabled.
  await page.getByTestId('broadcast-url-submit').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('01-teacher-session-live')

  // 02 — type the next slide URL into the broadcast control.
  const slide3 = `${base}/3`
  await page.getByTestId('broadcast-url-input').fill(slide3)
  await capture('02-broadcast-control')

  // 03 — Broadcast → the teacher's frame points at the broadcast URL.
  await page.getByTestId('broadcast-url-submit').click()
  await waitForFrameSrc(page, slide3)
  await capture('03-teacher-after-broadcast')

  // 04 — student view: the frame snapped to the same broadcast URL (re-sync).
  await page.goto(`${baseURL}/s/${joinCode}`, { waitUntil: 'load' })
  await page.getByTestId('student-session-root').waitFor({ state: 'visible', timeout: 30_000 })
  await waitForFrameSrc(page, slide3)
  await capture('04-student-followed')

  // Teacher broadcasts slide-4 (back on the facilitation view).
  const slide4 = `${base}/4`
  await page.goto(sessionUrl, { waitUntil: 'load' })
  await page.getByTestId('broadcast-url-submit').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('broadcast-url-input').fill(slide4)
  await page.getByTestId('broadcast-url-submit').click()
  await waitForFrameSrc(page, slide4)

  // 05 — a late-joining student context lands directly on the current URL (slide-4).
  await page.goto(`${baseURL}/s/${joinCode}`, { waitUntil: 'load' })
  await page.getByTestId('student-session-root').waitFor({ state: 'visible', timeout: 30_000 })
  await waitForFrameSrc(page, slide4)
  await capture('05-late-joiner')
}
