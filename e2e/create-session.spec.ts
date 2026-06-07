import { test, expect } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '../src/lib/sessions'

// ---------------------------------------------------------------------------
// Cycle 0005 — "Teacher creates a session (draft)". Proves a signed-in user
// creates a real `draft` session they own, sees it on screen (title, status,
// join code), and that the dual-write landed (one `SessionCreated` event + one
// owner `sessions` row). The blank-title failure path asserts an inline error
// and that no session is created. Skips loudly when admin env is unset — a
// missing token never produces a false green (mirrors auth/route-guarding).
// ---------------------------------------------------------------------------

test.describe('teacher creates a session (draft)', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — create-session e2e requires admin code minting + observability queries against the live app'
  )

  test('signed-in user creates a draft session, sees it, and it is recorded', async ({ page }) => {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })

    const title = `Lesson ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()

    // On-screen confirmation (acceptance #1): draft status + non-empty join code.
    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('created-session-title')).toHaveText(title)
    await expect(page.getByTestId('created-session-status')).toHaveText('draft')
    const joinCode = (await page.getByTestId('created-session-joincode').textContent())?.trim()
    expect(joinCode).toHaveLength(JOIN_CODE_LENGTH)
    expect(joinCode).toMatch(new RegExp(`^[${JOIN_CODE_ALPHABET}]+$`))

    // Observability (acceptance #2, #3): admin-query the live app by joinCode.
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({ sessions: { $: { where: { joinCode: joinCode! } } } })
          return res.sessions?.length ?? 0
        },
        { timeout: 20_000 }
      )
      .toBe(1)

    const res = await queryAdmin({ sessions: { $: { where: { joinCode: joinCode! } } } })
    const session = res.sessions[0]
    expect(session.status).toBe('draft')
    expect(session.title).toBe(title)

    const events = await queryAdmin({
      sessionEvents: { $: { where: { sessionId: session.id, type: 'SessionCreated' } } },
    })
    expect(events.sessionEvents).toHaveLength(1)
    // teacherId === the creating user's auth id: the event's actorId is that id
    // and matches the projection's teacherId (acceptance #2).
    expect(session.teacherId).toBe(events.sessionEvents[0].actorId)
  })

  test('blank title shows an inline error and creates no session', async ({ page }) => {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill('   ')
    await page.getByTestId('new-session-submit').click()

    // Failure path (acceptance #5): inline error, no created-session surface.
    await expect(page.getByTestId('new-session-error')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('created-session')).toHaveCount(0)
  })
})
