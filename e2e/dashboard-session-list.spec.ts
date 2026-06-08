import { test, expect, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0012 — "Teacher dashboard: session list + open".
// Proves the realtime, owner-scoped session list on `/dashboard` end-to-end
// against the live app:
//   - Empty: a freshly signed-in teacher with zero owned sessions sees the
//     explicit `session-list-empty` element, never a blank region.
//   - Happy path: after creating a session, a `session-list-item` with its
//     title + status appears in the list.
//   - Realtime: with `/dashboard` open, creating a SECOND session for the SAME
//     user in a second context makes a new row appear with NO reload.
//   - Navigation: clicking a row lands on `/dashboard/sessions/:id` and the
//     facilitation view (`session-root`) renders.
//   - Scoping: a session owned by a DIFFERENT teacher is not listed.
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake. Explicit testid waits,
// never `networkidle` (InstantDB keeps the socket busy).
// ---------------------------------------------------------------------------

test.describe('teacher dashboard session list + open', () => {
  test.skip(
    !adminAvailable(),
    'INSTANTDB_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — dashboard-session-list e2e requires admin code minting + live-app realtime'
  )

  /** Open `/dashboard` (already signed in) and wait for the shell + list to hydrate. */
  async function openDashboard(page: Page): Promise<void> {
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('session-list')).toBeVisible({ timeout: 20_000 })
  }

  /**
   * Create a session via the real `NewSession` control from `/dashboard`,
   * returning its title. Leaves the page on `/dashboard` (does not navigate into
   * the created session).
   */
  async function createSession(page: Page, title: string): Promise<string> {
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()
    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })
    return title
  }

  test('empty state: a fresh teacher with no sessions sees the explicit empty element', async ({
    page,
  }) => {
    await signInViaUi(page, freshEmail())
    await openDashboard(page)
    await expect(page.getByTestId('session-list-empty')).toBeVisible({ timeout: 20_000 })
    // The empty element is explicit, not a blank region: it carries copy.
    await expect(page.getByTestId('session-list-empty')).not.toBeEmpty()
    // And no rows are present.
    await expect(page.getByTestId('session-list-item')).toHaveCount(0)
  })

  test('happy path: a created session is listed with its title and status', async ({ page }) => {
    await signInViaUi(page, freshEmail())
    await openDashboard(page)
    const title = await createSession(page, `List ${crypto.randomUUID().slice(0, 8)}`)

    const row = page.getByTestId('session-list-item').filter({ hasText: title })
    await expect(row).toBeVisible({ timeout: 20_000 })
    await expect(row.getByTestId('session-list-item-title')).toHaveText(title)
    // A freshly created session is a `draft`.
    await expect(row.getByTestId('session-list-item-status')).toHaveText('draft')
  })

  test('realtime: a session created in a second context (same user) appears with no reload', async ({
    page,
    browser,
  }) => {
    const email = freshEmail()
    await signInViaUi(page, email)
    await openDashboard(page)

    // Sit on the open dashboard; capture the initial row count.
    const initialCount = await page.getByTestId('session-list-item').count()

    // Second context, SAME user — create another session there.
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await signInViaUi(pageB, email)
    await pageB.goto('/dashboard')
    await expect(pageB.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const rtTitle = `RT ${crypto.randomUUID().slice(0, 8)}`
    await createSession(pageB, rtTitle)

    // Back in context A — the new row appears live, with NO page.reload().
    await expect(
      page.getByTestId('session-list-item').filter({ hasText: rtTitle })
    ).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => page.getByTestId('session-list-item').count(), { timeout: 20_000 })
      .toBeGreaterThan(initialCount)

    await ctxB.close()
  })

  test('navigation: clicking a row opens the facilitation view for that session', async ({
    page,
  }) => {
    await signInViaUi(page, freshEmail())
    await openDashboard(page)
    const title = await createSession(page, `Nav ${crypto.randomUUID().slice(0, 8)}`)

    const row = page.getByTestId('session-list-item').filter({ hasText: title })
    await expect(row).toBeVisible({ timeout: 20_000 })
    const sessionId = await row.getAttribute('data-session-id')
    expect(sessionId, 'a listed row carries its session id').toBeTruthy()

    await row.click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/sessions/${sessionId}$`), {
      timeout: 20_000,
    })
    await expect(page.getByTestId('session-root')).toBeVisible({ timeout: 20_000 })
  })

  test('scoping: a session owned by another teacher is not listed', async ({ page, browser }) => {
    // Teacher A creates a session and notes its id from the list row.
    await signInViaUi(page, freshEmail())
    await openDashboard(page)
    const titleA = await createSession(page, `Scope-A ${crypto.randomUUID().slice(0, 8)}`)
    const rowA = page.getByTestId('session-list-item').filter({ hasText: titleA })
    await expect(rowA).toBeVisible({ timeout: 20_000 })
    const idA = await rowA.getAttribute('data-session-id')
    expect(idA).toBeTruthy()

    // Teacher B (fresh email, second context) opens their OWN dashboard.
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await signInViaUi(pageB, freshEmail())
    await pageB.goto('/dashboard')
    await expect(pageB.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    await expect(pageB.getByTestId('session-list')).toBeVisible({ timeout: 20_000 })
    // Teacher A's session must NOT appear in Teacher B's owner-scoped list.
    await expect(
      pageB.locator(`[data-testid="session-list-item"][data-session-id="${idA}"]`)
    ).toHaveCount(0)

    await ctxB.close()
  })
})
