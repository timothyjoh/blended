import { test, expect } from '@playwright/test'
import { init } from '@instantdb/admin'
import { adminAvailable, freshEmail, signInViaUi } from './support/auth'

// Cycle-0020 gate: the uber-admin session console at `/admin` is only observable
// in a hydrated browser against live auth (the guard reads client-held identity)
// AND the live admin SDK (to deterministically sign in the allowlisted operator
// and to SEED system-wide data via the rule-bypassing admin token). Without the
// admin env there is no deterministic sign-in and no seam to seed/observe, so the
// suite SKIPS LOUDLY rather than passing falsely (mirrors `admin-route.spec.ts`).
// The dev server inherits `ADMIN_EMAILS` from `.env`; this spec uses the
// allowlisted `admin@blended.test`, which MUST be present in `ADMIN_EMAILS`.
test.describe('admin console: system-wide realtime session list (/admin)', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — admin-console e2e requires admin code minting + the admin seed/query seam against the live app'
  )

  const ALLOWLISTED = 'admin@blended.test'

  /** Rule-bypassing admin client for deterministic seeding (e2e-only, Node-side). */
  function adminDb() {
    return init({
      appId: process.env.PUBLIC_INSTANTDB_APP_ID as string,
      adminToken: process.env.INSTANT_ADMIN_TOKEN as string,
    })
  }

  test('lists every seeded session (all owners/statuses) and updates a row in realtime with no reload', async ({
    page,
  }) => {
    const admin = adminDb()
    const { tx } = await import('@instantdb/admin')

    // Seed deterministic, collision-free system-wide data via the admin token
    // (bypasses permission rules — like a teacher/student acting in other
    // contexts). Fresh ids per run so reruns against the shared app never collide.
    const liveId = crypto.randomUUID()
    const draftId = crypto.randomUUID()
    const teacherA = crypto.randomUUID()
    const teacherB = crypto.randomUUID()
    const p1 = crypto.randomUUID()
    const p2 = crypto.randomUUID()
    const now = Date.now()

    const seedParticipant = (sessionId: string, ts: number) => ({
      sessionId,
      userId: crypto.randomUUID(),
      role: 'student' as const,
      username: 'student',
      joinedAt: ts,
      lastSeenAt: ts,
      chatStatus: 'active',
    })

    await admin.transact([
      tx.sessions[liveId].update({
        title: `console-live-${liveId}`,
        status: 'live',
        teacherId: teacherA,
        createdAt: now,
        joinCode: liveId.slice(0, 8).toUpperCase(),
        interactionMode: 'none',
      }),
      tx.sessions[draftId].update({
        title: `console-draft-${draftId}`,
        status: 'draft',
        teacherId: teacherB,
        createdAt: now + 1,
        joinCode: draftId.slice(0, 8).toUpperCase(),
        interactionMode: 'none',
      }),
      tx.participants[p1].update(seedParticipant(liveId, now)),
    ])

    await signInViaUi(page, ALLOWLISTED)
    await page.goto('/admin')

    await expect(page.getByTestId('admin-root')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('admin-session-list')).toBeVisible({ timeout: 20_000 })

    // All-owner/all-status coverage: both the live and draft session (different
    // owners) appear — the console is unscoped.
    const liveRow = page.locator('[data-testid="admin-session-item"][data-session-id="' + liveId + '"]')
    const draftRow = page.locator('[data-testid="admin-session-item"][data-session-id="' + draftId + '"]')
    await expect(liveRow).toBeVisible({ timeout: 20_000 })
    await expect(draftRow).toBeVisible({ timeout: 20_000 })

    // Seeded row reflects status, owner, participant count 1, no active resource.
    await expect(liveRow.getByTestId('admin-session-status')).toHaveText('live')
    await expect(liveRow.getByTestId('admin-session-owner')).toHaveText(teacherA)
    await expect(liveRow.getByTestId('admin-session-participant-count')).toHaveText('1', {
      timeout: 20_000,
    })
    await expect(liveRow.getByTestId('admin-session-active-resource')).toHaveText('(none)')

    // Realtime: add a 2nd participant AND activate a resource in another context
    // (admin transact) WITHOUT reloading the page — the row's count + active
    // resource update via the live query re-render. Wait on element text, never
    // `networkidle` (InstantDB keeps the socket busy).
    await admin.transact([
      tx.participants[p2].update(seedParticipant(liveId, now + 2)),
      tx.sessions[liveId].update({
        activeResourceId: 'res-realtime',
        currentUrl: 'https://example.test/live',
      }),
    ])

    await expect(liveRow.getByTestId('admin-session-participant-count')).toHaveText('2', {
      timeout: 20_000,
    })
    await expect(liveRow.getByTestId('admin-session-active-resource')).toHaveText('res-realtime', {
      timeout: 20_000,
    })
    await expect(liveRow.getByTestId('admin-session-current-url')).toHaveText(
      'https://example.test/live',
      { timeout: 20_000 }
    )

    // No teacher/student email is rendered in the console (privacy is structural).
    const listText = (await page.getByTestId('admin-session-list').innerText()) ?? ''
    expect(listText).not.toContain('@')
  })

  test('failure path: a non-admin signed-in user is denied and never sees the list shell', async ({
    page,
  }) => {
    await signInViaUi(page, freshEmail())
    await page.goto('/admin')

    await expect(page.getByTestId('route-guard-denied')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('admin-root')).toHaveCount(0)
    await expect(page.getByTestId('admin-session-list')).toHaveCount(0)
  })

  test('failure path: an unauthenticated visitor bounces to /login with next', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/, { timeout: 15_000 })
  })
})
