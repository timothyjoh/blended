// Cycle 0019 walkthrough — Global uber-admin role: allowlist bootstrap + /admin
// authorization.
//
// This cycle ships an observable new route, `/admin`, reachable ONLY by a global
// uber admin. Elevation to `uber` happens server-side on sign-in: useAuth POSTs
// the caller's InstantDB token to `/api/admin/bootstrap`, which — only for an
// email present in the server-only `ADMIN_EMAILS` allowlist — elevates the user
// via the admin SDK (recorded as an `AdminBootstrapped` event). The walkthrough
// drives the REAL flow (never the home page); because the capture harness
// screenshots a single page, it switches that page's route to evidence each
// surface in turn:
//   01 — the real `/login` island ready (`auth-email-input`).
//   02 — `/admin` rendered for the allowlisted operator (`admin-root`).
//   03 — `/admin` for a NON-allowlisted signed-in user (`route-guard-denied`).
//   04 — `/dev/perms-probe`: a raw client write of `adminLevel: 'uber'` on the
//        user's OWN row is REJECTED by the tightened `users` rule (the data-layer
//        guard that makes admin status unforgeable).
//
// Preconditions: the dev server `.env` must include `ADMIN_EMAILS=admin@blended.test`
// for capture 02 to elevate (and `INSTANT_ADMIN_TOKEN` + `PUBLIC_INSTANTDB_APP_ID`
// for deterministic admin-minted sign-in — never a real inbox). When the admin env
// is unset the walkthrough DEGRADES LOUDLY (captures the login surface with a
// one-line diagnostic) rather than silently falling back to the home page. Waits
// on explicit testids, never `networkidle` (InstantDB keeps the realtime socket
// busy). Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin`
// (both in node_modules; no project `.ts` imports).

import { init } from '@instantdb/admin'

const APP_ID = process.env.PUBLIC_INSTANTDB_APP_ID
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN
const ALLOWLISTED = 'admin@blended.test'

const freshEmail = () => `walk+${crypto.randomUUID()}@blended.test`

async function mintCode(email) {
  const admin = init({ appId: APP_ID, adminToken: ADMIN_TOKEN })
  const { code } = await admin.auth.generateMagicCode(email)
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

export default async ({ page, baseURL, capture }) => {
  if (!APP_ID || !ADMIN_TOKEN) {
    process.stderr.write(
      '[walkthrough-0019] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot drive the real admin bootstrap + /admin authorization; ' +
        'capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  // 01 — the real /login island ready.
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
  await capture('01-login')

  // 02 — allowlisted operator signs in and reaches /admin. The server bootstrap
  // (fired by useAuth on sign-in) elevates the row; the live users query in
  // AdminRouteGuard then renders the protected landing. Requires the dev server's
  // ADMIN_EMAILS to include admin@blended.test.
  await signIn(page, baseURL, ALLOWLISTED)
  await page.goto(`${baseURL}/admin`, { waitUntil: 'load' })
  try {
    await page.getByTestId('admin-root').waitFor({ state: 'visible', timeout: 25_000 })
    await capture('02-admin-root')
  } catch {
    process.stderr.write(
      '[walkthrough-0019] admin-root did not render for ' +
        ALLOWLISTED +
        ' — is ADMIN_EMAILS set on the dev server? capturing the denied state instead\n'
    )
    await capture('02-admin-not-elevated')
  }

  // 03 — a NON-allowlisted signed-in user is denied /admin.
  await signIn(page, baseURL, freshEmail())
  await page.goto(`${baseURL}/admin`, { waitUntil: 'load' })
  await page.getByTestId('route-guard-denied').waitFor({ state: 'visible', timeout: 25_000 })
  await capture('03-admin-denied')

  // 04 — the data-layer guard: a raw client self-elevation to 'uber' is rejected.
  await page.goto(`${baseURL}/dev/perms-probe`, { waitUntil: 'load' })
  await page.getByTestId('perms-probe').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('probe-self-elevate').click()
  await page
    .getByTestId('probe-write-result')
    .filter({ hasText: 'error' })
    .waitFor({ state: 'visible', timeout: 25_000 })
  await capture('04-self-elevation-rejected')
}
