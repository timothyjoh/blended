import { test, expect, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, mintCode, signInViaUi } from './support/auth'

// Cycle-0004 gate: route guarding + role-aware routing is only observable in a
// hydrated browser against live auth (the guard reads client-held identity via
// `useAuth`) and live cycle-0003 perms (open `sessions` reads for the ownership
// query). Without the admin token there is no deterministic sign-in, so the suite
// SKIPS LOUDLY rather than passing falsely (mirrors auth.spec / permissions.spec).
test.describe('route guarding + role-aware routing', () => {
  test.skip(
    !adminAvailable(),
    'INSTANTDB_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — route-guard e2e requires admin code minting against the live app'
  )

  function freshSessionId(): string {
    return crypto.randomUUID()
  }

  // Sign in WITHOUT re-navigating to /login, so a preserved `?next=` survives the
  // round-trip. (`signInViaUi` re-`goto`s /login and would drop the param.) Drives
  // the same email→code island; mints the code after "send" so it is latest-valid.
  async function signInOnCurrentLoginPage(page: Page, email: string): Promise<void> {
    await expect(page.getByTestId('auth-email-input')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('auth-email-input').fill(email)
    await page.getByTestId('auth-send').click()
    await expect(page.getByTestId('auth-code-input')).toBeVisible({ timeout: 15_000 })
    const code = await mintCode(email)
    await page.getByTestId('auth-code-input').fill(code)
    await page.getByTestId('auth-verify').click()
  }

  test('signed-out /dashboard bounces to /login with next, returns after sign-in', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    // Guard bounce: unauthenticated → /login?next=%2Fdashboard (destination kept).
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/, { timeout: 15_000 })
    await signInOnCurrentLoginPage(page, freshEmail())
    // AuthGate returns to the preserved destination after sign-in.
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
  })

  test('deep-link round-trip to an ownership-scoped session path keeps the id', async ({
    page,
  }) => {
    const sessionId = freshSessionId()
    const dest = `/dashboard/sessions/${sessionId}`
    await page.goto(dest)
    // Bounce preserves the full id-bearing deep link in `next`.
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=%2Fdashboard%2Fsessions%2F${sessionId}`),
      { timeout: 15_000 }
    )
    await signInOnCurrentLoginPage(page, freshEmail())
    // After sign-in the browser lands back on the exact deep link, id intact.
    await expect(page).toHaveURL(new RegExp(`/dashboard/sessions/${sessionId}$`), {
      timeout: 15_000,
    })
  })

  test('bare authenticated /login lands on /dashboard', async ({ page }) => {
    await signInViaUi(page, freshEmail())
    await page.goto('/login')
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
  })

  test('ownership denial: a different user sees route-guard-denied, not session-root', async ({
    browser,
  }) => {
    const sessionId = freshSessionId()

    // --- Owner context: sign in and create a session they own via the dev probe. ---
    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    await signInViaUi(ownerPage, freshEmail())
    await ownerPage.goto(`/dev/perms-probe?targetSessionId=${sessionId}`)
    await expect(ownerPage.getByTestId('perms-probe')).toBeVisible({ timeout: 15_000 })
    await ownerPage.getByTestId('probe-create-owned-session').click()
    await expect(ownerPage.getByTestId('probe-write-result')).toHaveText('ok', { timeout: 20_000 })

    // Owner opening their own session sees the protected shell.
    await ownerPage.goto(`/dashboard/sessions/${sessionId}`)
    await expect(ownerPage.getByTestId('session-root')).toBeVisible({ timeout: 20_000 })

    // --- Other context: a DIFFERENT signed-in user opens the owner's session. ---
    const otherCtx = await browser.newContext()
    const otherPage = await otherCtx.newPage()
    await signInViaUi(otherPage, freshEmail())
    await otherPage.goto(`/dashboard/sessions/${sessionId}`)
    // Authorization denial: the denial state shows and the protected shell never does.
    await expect(otherPage.getByTestId('route-guard-denied')).toBeVisible({ timeout: 20_000 })
    await expect(otherPage.getByTestId('session-root')).toHaveCount(0)

    await ownerCtx.close()
    await otherCtx.close()
  })
})
