// Cycle 0020 walkthrough — Admin console: observe all sessions + live system
// state (uber-admin only).
//
// This cycle replaces the empty `/admin` placeholder (cycle 0019) with a
// read-only, realtime, system-wide session console. The walkthrough drives the
// REAL flow (never the home page): using the deterministic admin magic-code seam
// (`@instantdb/admin`) it (1) admin-`transact`-seeds a session + one participant,
// (2) signs the allowlisted operator in and opens `/admin` to show the populated
// console, (3) admin-`transact`s a second participant AND sets an active resource
// on that session WHILE the page stays open to evidence the realtime row update,
// then (4) signs in a fresh non-allowlisted user to show the denial. The capture
// harness screenshots a single page, so it switches that page's route/state
// between captures:
//   01 — the real `/login` island ready (`auth-email-input`).
//   02 — `/admin` for the allowlisted operator, console populated with the seeded
//        session row (participant count 1, active resource `(none)`).
//   03 — same `/admin` page after an admin-`transact` adds a participant and sets
//        an active resource: the row's participant count is now 2 and the active
//        resource is populated — captured WITHOUT reload (waits on the element
//        text, never `networkidle`).
//   04 — `/admin` for a fresh NON-allowlisted signed-in user (`route-guard-denied`).
//
// Preconditions: the dev server `.env` must include `ADMIN_EMAILS=admin@blended.test`
// (so capture 02 elevates) plus `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID`
// (for deterministic admin-minted sign-in + the seed seam — never a real inbox).
// Seeds use `crypto.randomUUID()` ids so reruns never collide. When the admin env
// is unset the walkthrough DEGRADES LOUDLY (captures the login surface with a
// one-line stderr diagnostic) rather than silently falling back to the home page.
// Waits on explicit testids, never `networkidle` (InstantDB keeps the socket
// busy). Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin`
// (both in node_modules; no project `.ts` imports).

import { init, tx } from '@instantdb/admin'

const APP_ID = process.env.PUBLIC_INSTANTDB_APP_ID
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN
const ALLOWLISTED = 'admin@blended.test'

const freshEmail = () => `walk+${crypto.randomUUID()}@blended.test`

function adminDb() {
  return init({ appId: APP_ID, adminToken: ADMIN_TOKEN })
}

async function mintCode(email) {
  const { code } = await adminDb().auth.generateMagicCode(email)
  return code
}

/** Sign `page` in via the deterministic admin magic-code seam (never an inbox). */
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

const seedParticipant = (sessionId, ts) => ({
  sessionId,
  userId: crypto.randomUUID(),
  role: 'student',
  username: 'student',
  joinedAt: ts,
  lastSeenAt: ts,
  chatStatus: 'active',
})

export default async ({ page, baseURL, capture }) => {
  if (!APP_ID || !ADMIN_TOKEN) {
    process.stderr.write(
      '[walkthrough-0020] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot drive the real admin console (seed + /admin observability); ' +
        'capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  const admin = adminDb()
  const sessionId = crypto.randomUUID()
  const teacherId = crypto.randomUUID()
  const now = Date.now()

  // Seed a system-wide session + one participant via the rule-bypassing admin
  // token (as a teacher/student would in another context).
  await admin.transact([
    tx.sessions[sessionId].update({
      title: `walkthrough-session-${sessionId}`,
      status: 'live',
      teacherId,
      createdAt: now,
      joinCode: sessionId.slice(0, 8).toUpperCase(),
      interactionMode: 'none',
    }),
    tx.participants[crypto.randomUUID()].update(seedParticipant(sessionId, now)),
  ])

  // 01 — the real /login island ready.
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('01-login')

  // 02 — allowlisted operator signs in and opens the populated console. Requires
  // the dev server's ADMIN_EMAILS to include admin@blended.test.
  await signIn(page, baseURL, ALLOWLISTED)
  await page.goto(`${baseURL}/admin`, { waitUntil: 'load' })
  const row = page.locator(
    '[data-testid="admin-session-item"][data-session-id="' + sessionId + '"]'
  )
  try {
    await page.getByTestId('admin-session-list').waitFor({ state: 'visible', timeout: 25_000 })
    await row.waitFor({ state: 'visible', timeout: 25_000 })
    await row
      .getByTestId('admin-session-participant-count')
      .filter({ hasText: '1' })
      .waitFor({ state: 'visible', timeout: 25_000 })
    await capture('02-admin-console-populated')
  } catch {
    process.stderr.write(
      '[walkthrough-0020] admin console did not render the seeded row for ' +
        ALLOWLISTED +
        ' — is ADMIN_EMAILS set on the dev server? capturing whatever rendered\n'
    )
    await capture('02-admin-console-unavailable')
  }

  // 03 — realtime: add a 2nd participant AND set an active resource on the session
  // WHILE the page stays open. The row's count + active resource update via the
  // live query re-render — captured WITHOUT reload (waits on element text).
  await admin.transact([
    tx.participants[crypto.randomUUID()].update(seedParticipant(sessionId, now + 1)),
    tx.sessions[sessionId].update({
      activeResourceId: 'walkthrough-resource',
      currentUrl: 'https://example.test/walkthrough',
    }),
  ])
  try {
    await row
      .getByTestId('admin-session-participant-count')
      .filter({ hasText: '2' })
      .waitFor({ state: 'visible', timeout: 25_000 })
    await row
      .getByTestId('admin-session-active-resource')
      .filter({ hasText: 'walkthrough-resource' })
      .waitFor({ state: 'visible', timeout: 25_000 })
    await capture('03-admin-console-realtime-update')
  } catch {
    process.stderr.write(
      '[walkthrough-0020] realtime row update did not propagate in time — ' +
        'capturing current console state\n'
    )
    await capture('03-admin-console-realtime-pending')
  }

  // 04 — a fresh NON-allowlisted signed-in user is denied /admin (list shell absent).
  await signIn(page, baseURL, freshEmail())
  await page.goto(`${baseURL}/admin`, { waitUntil: 'load' })
  await page.getByTestId('route-guard-denied').waitFor({ state: 'visible', timeout: 25_000 })
  await capture('04-admin-console-denied')
}
