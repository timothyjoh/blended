import { test, expect } from '@playwright/test'
import { adminAvailable, freshEmail, queryAdmin, signInViaUi } from './support/auth'

// Cycle-0019 gate: the global uber-admin bootstrap + `/admin` authorization is
// only observable in a hydrated browser against live auth (the guard reads
// client-held identity via `useAuth`) AND the live admin SDK (the server endpoint
// verifies the caller token and performs the rule-bypassing elevation). Without
// the admin token there is no deterministic sign-in and no admin-query seam, so
// the suite SKIPS LOUDLY rather than passing falsely (mirrors the other admin
// specs). The dev server inherits `ADMIN_EMAILS` from `.env`; this spec uses the
// deterministic allowlisted email `admin@blended.test`, which MUST be present in
// `ADMIN_EMAILS` for the reachable case to elevate.
test.describe('global uber-admin: allowlist bootstrap + /admin authorization', () => {
  test.skip(
    !adminAvailable(),
    'INSTANTDB_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — admin-route e2e requires admin code minting + the admin query seam against the live app'
  )

  const ALLOWLISTED = 'admin@blended.test'

  /** Resolve a user's row by email via the rule-bypassing admin seam. */
  async function userRowByEmail(email: string): Promise<{ id: string; adminLevel?: unknown } | null> {
    const res = await queryAdmin({ users: { $: { where: { email } } } })
    return res.users?.[0] ?? null
  }

  /** Count `AdminBootstrapped` events attributed to `userId` (envelope actorId). */
  async function adminBootstrappedCount(userId: string): Promise<number> {
    const res = await queryAdmin({
      sessionEvents: { $: { where: { type: 'AdminBootstrapped', actorId: userId } } },
    })
    return res.sessionEvents?.length ?? 0
  }

  test('allowlisted email reaches /admin; row is uber with one AdminBootstrapped event (idempotent on reload)', async ({
    page,
  }) => {
    await signInViaUi(page, ALLOWLISTED)
    await page.goto('/admin')

    // The server bootstrap (fired by useAuth on sign-in) elevates the row; the
    // live users query in AdminRouteGuard then renders the protected landing.
    await expect(page.getByTestId('admin-root')).toBeVisible({ timeout: 20_000 })

    const row = await userRowByEmail(ALLOWLISTED)
    expect(row, 'allowlisted user row should exist').not.toBeNull()
    expect(row!.adminLevel).toBe('uber')
    const afterFirst = await adminBootstrappedCount(row!.id)
    expect(afterFirst).toBeGreaterThanOrEqual(1)

    // Idempotent re-bootstrap (delta): a reload re-fires the bootstrap POST (the
    // useAuth latch resets on reload), but the already-uber user is a no-op —
    // `decideBootstrap` returns { elevate: false }, so NO new event is appended.
    await page.reload()
    await expect(page.getByTestId('admin-root')).toBeVisible({ timeout: 20_000 })
    // Allow any in-flight POST to settle, then assert the count is unchanged.
    await page.waitForTimeout(2_000)
    const afterReload = await adminBootstrappedCount(row!.id)
    expect(afterReload).toBe(afterFirst)
  })

  test('non-allowlisted signed-in user is denied /admin; left none, no AdminBootstrapped event', async ({
    page,
  }) => {
    const email = freshEmail()
    await signInViaUi(page, email)
    await page.goto('/admin')

    await expect(page.getByTestId('route-guard-denied')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('admin-root')).toHaveCount(0)

    const row = await userRowByEmail(email)
    expect(row, 'signed-in user row should exist').not.toBeNull()
    // adminLevel is the non-elevated value (or a legacy/absent value that
    // normalizes to none — never 'uber').
    expect(row!.adminLevel).not.toBe('uber')
    expect(await adminBootstrappedCount(row!.id)).toBe(0)
  })

  test('unauthenticated /admin bounces to /login with next', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/, { timeout: 15_000 })
  })

  test('failure path: a bad/garbage caller token returns 401 and writes nothing', async ({
    page,
  }) => {
    // The endpoint is wired and the unauthorized branch is exercised against the
    // live dev server: an unverifiable token is rejected with 401 (no elevation).
    const res = await page.request.post('/api/admin/bootstrap', {
      data: { token: 'not-a-real-instant-token' },
    })
    expect(res.status()).toBe(401)
    const empty = await page.request.post('/api/admin/bootstrap', { data: {} })
    expect(empty.status()).toBe(401)
  })

  test('failure path: a client cannot self-elevate its own users.adminLevel to uber', async ({
    page,
  }) => {
    const email = freshEmail()
    await signInViaUi(page, email)
    // The probe issues a RAW client write of `adminLevel: 'uber'` on the user's
    // own row; the tightened `users` rule rejects it.
    await page.goto('/dev/perms-probe')
    await expect(page.getByTestId('perms-probe')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('probe-self-elevate').click()
    // The rejection surfaces as a permission error (never swallowed), never 'ok'.
    await expect(page.getByTestId('probe-write-result')).toContainText('error', {
      timeout: 20_000,
    })
    await expect(page.getByTestId('probe-write-result')).not.toHaveText('ok')

    // The persisted row is unchanged — still not uber.
    const row = await userRowByEmail(email)
    expect(row, 'signed-in user row should exist').not.toBeNull()
    expect(row!.adminLevel).not.toBe('uber')
  })
})
