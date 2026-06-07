import { test, expect, type Browser, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0017 — "Teacher-driven URL broadcast + student follow / re-sync".
// Proves the broadcast vertical slice end-to-end against the live app:
//   - A teacher creates + starts a session, queues a resource (R1), activates it.
//   - Students B and C join via the join link and render R1.
//   - The teacher broadcasts a slide-3 route → the teacher's own frame and BOTH
//     students' frames snap to slide-3 in realtime (waits target the explicit
//     frame `src`/`data-url-version`, never `networkidle`).
//   - Re-sync: re-broadcasting the SAME URL changes the frame's
//     `data-url-version` (the version-keyed iframe remounts), proving a locally-
//     navigated student is re-snapped even when the URL is unchanged.
//   - The teacher broadcasts slide-4 → B and C both follow to slide-4.
//   - A late-joining context D opens the join link AFTER the broadcasts and
//     immediately renders the current broadcast URL (slide-4) — not R1's origin.
//   - Observability via `queryAdmin`: one `ResourceUrlChanged` event per
//     broadcast with a matching payload, and the `sessions` projection row
//     carrying the updated `currentUrl`/`currentUrlVersion`.
//   - Failure leg: a student context exposes NO `broadcast-url-submit` control,
//     and a teacher blank-URL submit is gated by `validateResourceUrl` (no write)
//     — the `ResourceUrlChanged` count and `currentUrl`/`currentUrlVersion` are
//     unchanged.
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake.
// ---------------------------------------------------------------------------

test.describe('teacher broadcasts a URL, students follow + re-sync live', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — broadcast-resource-url e2e requires admin code minting + observability queries against the live app'
  )

  /** Sign a fresh teacher in, create a session, land on its detail page; returns the title. */
  async function createSession(page: Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const title = `BCAST ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()
    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('created-session-link').click()
    await expect(page.getByTestId('session-status')).toBeVisible({ timeout: 20_000 })
    return title
  }

  async function startAndReadJoinCode(page: Page): Promise<string> {
    await page.getByTestId('session-start').click()
    await expect(page.getByTestId('session-status')).toHaveText('live', { timeout: 20_000 })
    const code = (await page.getByTestId('session-joincode').textContent())?.trim()
    expect(code, 'join code must be visible once live').toBeTruthy()
    return code as string
  }

  async function queueResourceViaUi(page: Page, url: string, title: string): Promise<{ id: string }> {
    await page.getByTestId('add-resource-url').fill(url)
    await page.getByTestId('add-resource-title').fill(title)
    await page.getByTestId('add-resource-submit').click()
    const row = page.getByTestId('resource-item').filter({ hasText: title })
    await expect(row).toBeVisible({ timeout: 20_000 })
    const id = await row.getAttribute('data-resource-id')
    expect(id, 'queued row must carry a data-resource-id').toBeTruthy()
    return { id: id as string }
  }

  async function signInStudent(browser: Browser): Promise<{ page: Page }> {
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInViaUi(page, freshEmail())
    return { page }
  }

  async function countBroadcastEvents(sessionId: string): Promise<number> {
    const res = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ResourceUrlChanged' } } },
    })
    return (res.sessionEvents ?? []).length
  }

  /** Read the frame's current re-sync token (the value the iframe is keyed on). */
  async function frameVersion(page: Page): Promise<string | null> {
    return page.getByTestId('resource-pane-frame').getAttribute('data-url-version')
  }

  test('broadcasts slide-3 then slide-4; students follow + re-sync; late joiner lands current', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title } } } })).sessions[0]
      .id as string

    // Queue + activate R1 so the broadcast control is enabled.
    const base = `https://example.com/deck-${crypto.randomUUID().slice(0, 8)}`
    const r1 = await queueResourceViaUi(teacherPage, `${base}/1`, `R1 ${crypto.randomUUID().slice(0, 6)}`)
    await teacherPage
      .locator(`[data-testid="resource-item"][data-resource-id="${r1.id}"] [data-testid="activate-resource"]`)
      .click()
    await expect(teacherPage.getByTestId('resource-pane-frame')).toHaveAttribute(
      'data-resource-id',
      r1.id,
      { timeout: 20_000 }
    )

    // The broadcast control is enabled now that a resource is active.
    await expect(teacherPage.getByTestId('broadcast-url-submit')).toBeEnabled({ timeout: 20_000 })

    // Students B and C join and render R1's origin URL.
    const { page: b } = await signInStudent(browser)
    const { page: c } = await signInStudent(browser)
    for (const s of [b, c]) {
      await s.goto(`/join/${code}`)
      await expect(s.getByTestId('student-session-root')).toBeVisible({ timeout: 30_000 })
      await expect(s.getByTestId('resource-pane-frame')).toHaveAttribute('src', `${base}/1`, {
        timeout: 30_000,
      })
    }

    // --- Broadcast slide-3 ---------------------------------------------------
    const slide3 = `${base}/3`
    await teacherPage.getByTestId('broadcast-url-input').fill(slide3)
    await teacherPage.getByTestId('broadcast-url-submit').click()

    // Teacher's own frame + both students snap to slide-3 (no page reload).
    for (const p of [teacherPage, b, c]) {
      await expect(p.getByTestId('resource-pane-frame')).toHaveAttribute('src', slide3, {
        timeout: 30_000,
      })
    }
    await expect.poll(async () => countBroadcastEvents(sessionId), { timeout: 20_000 }).toBe(1)
    {
      const ev = (
        await queryAdmin({
          sessionEvents: { $: { where: { sessionId, type: 'ResourceUrlChanged' } } },
        })
      ).sessionEvents[0]
      const payload = ev.payload as Record<string, unknown>
      expect(payload.sessionId).toBe(sessionId)
      expect(payload.currentUrl).toBe(slide3)
      expect(payload.currentUrlVersion).toBeTruthy()
      const sess = (await queryAdmin({ sessions: { $: { where: { id: sessionId } } } })).sessions[0]
      expect(sess.currentUrl).toBe(slide3)
      expect(sess.currentUrlVersion).toBe(payload.currentUrlVersion)
    }

    // --- Re-sync: re-broadcast the SAME URL → version changes (frame remounts) -
    const versionBefore = await frameVersion(b)
    expect(versionBefore, 'student frame must carry a re-sync token').toBeTruthy()
    await teacherPage.getByTestId('broadcast-url-input').fill(slide3)
    await teacherPage.getByTestId('broadcast-url-submit').click()
    // The URL is identical, so we assert the re-sync token advanced on B and C
    // (the version-keyed iframe remounted, re-snapping a locally-navigated user).
    for (const s of [b, c]) {
      await expect
        .poll(async () => frameVersion(s), { timeout: 30_000 })
        .not.toBe(versionBefore)
      await expect(s.getByTestId('resource-pane-frame')).toHaveAttribute('src', slide3)
    }
    await expect.poll(async () => countBroadcastEvents(sessionId), { timeout: 20_000 }).toBe(2)

    // --- Broadcast slide-4 → B and C follow ----------------------------------
    const slide4 = `${base}/4`
    await teacherPage.getByTestId('broadcast-url-input').fill(slide4)
    await teacherPage.getByTestId('broadcast-url-submit').click()
    for (const s of [b, c]) {
      await expect(s.getByTestId('resource-pane-frame')).toHaveAttribute('src', slide4, {
        timeout: 30_000,
      })
    }
    await expect.poll(async () => countBroadcastEvents(sessionId), { timeout: 20_000 }).toBe(3)

    // --- Late joiner D immediately lands on the current broadcast URL (slide-4) -
    const { page: d } = await signInStudent(browser)
    await d.goto(`/join/${code}`)
    await expect(d.getByTestId('student-session-root')).toBeVisible({ timeout: 30_000 })
    await expect(d.getByTestId('resource-pane-frame')).toHaveAttribute('src', slide4, {
      timeout: 30_000,
    })

    // --- Failure leg: students have no broadcast control; a blank teacher
    //     submit is gated and writes nothing (counts + projection unchanged) ---
    expect(await b.getByTestId('broadcast-url-submit').count()).toBe(0)
    const eventsBefore = await countBroadcastEvents(sessionId)
    const sessBefore = (await queryAdmin({ sessions: { $: { where: { id: sessionId } } } }))
      .sessions[0]
    // Teacher attempts a blank broadcast: the validateResourceUrl gate rejects it
    // inline with no write.
    await teacherPage.getByTestId('broadcast-url-input').fill('   ')
    await teacherPage.getByTestId('broadcast-url-submit').click()
    await expect(teacherPage.getByTestId('broadcast-url-error')).toBeVisible({ timeout: 10_000 })
    await teacherPage.waitForTimeout(1_000)
    expect(await countBroadcastEvents(sessionId)).toBe(eventsBefore)
    const sessAfter = (await queryAdmin({ sessions: { $: { where: { id: sessionId } } } }))
      .sessions[0]
    expect(sessAfter.currentUrl).toBe(sessBefore.currentUrl)
    expect(sessAfter.currentUrlVersion).toBe(sessBefore.currentUrlVersion)

    await b.context().close()
    await c.context().close()
    await d.context().close()
  })
})
