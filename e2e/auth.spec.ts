import { test, expect, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi } from './support/auth'

// The auth flow drives the REAL sign-in island against real InstantDB auth on
// the port-4399 dev server. Only code RETRIEVAL is replaced by the admin-SDK
// minting seam (reading a real inbox is infeasible and forbidden by SPEC §67).
// Without an admin token there is no deterministic code, so the suite skips
// loudly rather than passing falsely.
test.describe('email magic-code authentication', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — auth e2e requires admin code minting'
  )

  async function gotoLogin(page: Page) {
    await page.goto('/login')
    // `client:only="react"` island — cold-start hydration can exceed Playwright's
    // 5s default, so give the first assertion a 15s budget.
    await expect(page.getByTestId('auth-email-input')).toBeVisible({ timeout: 15_000 })
  }

  // The full email → code → signed-in drive is the shared `signInViaUi` seam
  // (e2e/support/auth.ts), reused by the permissions and event-spine specs so
  // the sign-in flow never diverges across suites.
  const signIn = signInViaUi

  test('happy path: email → code → signed-in view shows derived username', async ({ page }) => {
    const email = freshEmail()
    await signIn(page, email)
    const localPart = email.slice(0, email.indexOf('@'))
    await expect(page.getByTestId('auth-username')).toHaveText(localPart)
  })

  test('persistence: a full page reload keeps the user signed in', async ({ page }) => {
    const email = freshEmail()
    await signIn(page, email)
    await page.reload()
    await expect(page.getByTestId('auth-signed-in')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('auth-code-input')).toHaveCount(0)
  })

  test('sign-out: clears the session and returns to the email gate', async ({ page }) => {
    const email = freshEmail()
    await signIn(page, email)
    await page.getByTestId('auth-signout').click()
    await expect(page.getByTestId('auth-email-input')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('auth-signed-in')).toHaveCount(0)
  })

  test('failure path: invalid email shows a validation error and does not advance', async ({
    page,
  }) => {
    await gotoLogin(page)
    await page.getByTestId('auth-email-input').fill('not-an-email')
    await page.getByTestId('auth-send').click()
    // Validation error rendered, and NO advance to the code step (no sendMagicCode).
    await expect(page.getByTestId('auth-error')).toBeVisible()
    await expect(page.getByTestId('auth-code-input')).toHaveCount(0)
  })

  test('failure path: a wrong code shows an inline error and stays on the code step', async ({
    page,
  }) => {
    const email = freshEmail()
    await gotoLogin(page)
    await page.getByTestId('auth-email-input').fill(email)
    await page.getByTestId('auth-send').click()
    await expect(page.getByTestId('auth-code-input')).toBeVisible({ timeout: 15_000 })
    // Deliberately type a wrong code (no minting).
    await page.getByTestId('auth-code-input').fill('000000')
    await page.getByTestId('auth-verify').click()
    await expect(page.getByTestId('auth-error')).toBeVisible({ timeout: 15_000 })
    // Still on the code step — able to retry.
    await expect(page.getByTestId('auth-code-input')).toBeVisible()
  })
})
