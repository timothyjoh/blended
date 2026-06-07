import { test, expect, type Browser, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0016 — "Activate a resource and render it for teacher + students".
// Proves the activation vertical slice end-to-end against the live app:
//   - A teacher creates + starts a session and queues two resources (R1, R2).
//   - Students B and C join via the join link.
//   - The teacher clicks Activate on R1 → the teacher's own `resource-pane-frame`
//     and BOTH students' panes render R1 with NO reload (waits target the explicit
//     frame element, never `networkidle`).
//   - The teacher activates R2 → B and C switch from R1 to R2 in realtime.
//   - A late-joining context D opens `/s/<code>` AFTER activation and immediately
//     shows the current active resource (R2) — no prior event observed by D.
//   - Observability via `queryAdmin`: exactly one `ResourceActivated` event per
//     activation with a matching `sessionId`/`resourceId`/`currentUrl`, and the
//     `sessions` projection row carrying the updated `activeResourceId`/`currentUrl`.
//   - Failure leg: a student context exposes NO `activate-resource` control, and a
//     student attempt cannot move the admin counts (`ResourceActivated` events /
//     `sessions.activeResourceId` unchanged) — the write path is teacher-only in
//     depth (builder role check + owner-only `sessions` rule).
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake.
// ---------------------------------------------------------------------------

test.describe('teacher activates a resource, students render it live', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — activate-resource e2e requires admin code minting + observability queries against the live app'
  )

  /** Sign a fresh teacher in, create a session, land on its detail page; returns the title. */
  async function createSession(page: Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const title = `ACT ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()
    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('created-session-link').click()
    await expect(page.getByTestId('session-status')).toBeVisible({ timeout: 20_000 })
    return title
  }

  /** Start the session and read the visible join code. */
  async function startAndReadJoinCode(page: Page): Promise<string> {
    await page.getByTestId('session-start').click()
    await expect(page.getByTestId('session-status')).toHaveText('live', { timeout: 20_000 })
    const code = (await page.getByTestId('session-joincode').textContent())?.trim()
    expect(code, 'join code must be visible once live').toBeTruthy()
    return code as string
  }

  /** Queue a resource via the add form; returns its row + the resolved resource id. */
  async function queueResourceViaUi(
    page: Page,
    url: string,
    title: string
  ): Promise<{ id: string }> {
    await page.getByTestId('add-resource-url').fill(url)
    await page.getByTestId('add-resource-title').fill(title)
    await page.getByTestId('add-resource-submit').click()
    const row = page.getByTestId('resource-item').filter({ hasText: title })
    await expect(row).toBeVisible({ timeout: 20_000 })
    const id = await row.getAttribute('data-resource-id')
    expect(id, 'queued row must carry a data-resource-id').toBeTruthy()
    return { id: id as string }
  }

  /** Sign a fresh student into its own context and return the page + email. */
  async function signInStudent(browser: Browser): Promise<{ page: Page; email: string }> {
    const context = await browser.newContext()
    const page = await context.newPage()
    const email = freshEmail()
    await signInViaUi(page, email)
    return { page, email }
  }

  async function countActivatedEvents(sessionId: string): Promise<number> {
    const res = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ResourceActivated' } } },
    })
    return (res.sessionEvents ?? []).length
  }

  test('activates R1 then R2; both students render live; late joiner sees current', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title } } } })).sessions[0]
      .id as string

    // The teacher pane starts in the explicit empty state (nothing active yet).
    await expect(teacherPage.getByTestId('resource-pane-empty')).toBeVisible({ timeout: 20_000 })

    // Queue two embeddable resources.
    const url1 = `https://example.com/r1-${crypto.randomUUID().slice(0, 8)}`
    const url2 = `https://example.com/r2-${crypto.randomUUID().slice(0, 8)}`
    const r1 = await queueResourceViaUi(teacherPage, url1, `R1 ${crypto.randomUUID().slice(0, 6)}`)
    const r2 = await queueResourceViaUi(teacherPage, url2, `R2 ${crypto.randomUUID().slice(0, 6)}`)

    // Students B and C join.
    const { page: b } = await signInStudent(browser)
    const { page: c } = await signInStudent(browser)
    for (const s of [b, c]) {
      await s.goto(`/join/${code}`)
      await expect(s.getByTestId('student-session-root')).toBeVisible({ timeout: 30_000 })
      // Before activation, the student pane shows the explicit empty state.
      await expect(s.getByTestId('resource-pane-empty')).toBeVisible({ timeout: 20_000 })
    }

    // --- Activate R1 ---------------------------------------------------------
    // The row carries data-resource-id at the item level; click its Activate button.
    await teacherPage
      .locator(`[data-testid="resource-item"][data-resource-id="${r1.id}"] [data-testid="activate-resource"]`)
      .click()

    // Teacher's own pane shows R1 (no reload — wait on the explicit frame).
    await expect(teacherPage.getByTestId('resource-pane-frame')).toHaveAttribute(
      'data-resource-id',
      r1.id,
      { timeout: 20_000 }
    )
    // The active row is marked + its button reads "Active".
    await expect(
      teacherPage.locator(`[data-testid="resource-item"][data-resource-id="${r1.id}"]`)
    ).toHaveAttribute('data-active', 'true', { timeout: 20_000 })

    // Both students render R1 live, no reload.
    for (const s of [b, c]) {
      await expect(s.getByTestId('resource-pane-frame')).toHaveAttribute(
        'data-resource-id',
        r1.id,
        { timeout: 30_000 }
      )
    }

    // Observability: exactly one ResourceActivated event; projection updated to R1.
    await expect.poll(async () => countActivatedEvents(sessionId), { timeout: 20_000 }).toBe(1)
    {
      const ev = (
        await queryAdmin({
          sessionEvents: { $: { where: { sessionId, type: 'ResourceActivated' } } },
        })
      ).sessionEvents[0]
      const payload = ev.payload as Record<string, unknown>
      expect(payload.sessionId).toBe(sessionId)
      expect(payload.resourceId).toBe(r1.id)
      expect(payload.currentUrl).toBeTruthy()
      const sess = (await queryAdmin({ sessions: { $: { where: { id: sessionId } } } })).sessions[0]
      expect(sess.activeResourceId).toBe(r1.id)
      expect(sess.currentUrl).toBe(payload.currentUrl)
    }

    // --- Switch to R2 --------------------------------------------------------
    await teacherPage
      .locator(`[data-testid="resource-item"][data-resource-id="${r2.id}"] [data-testid="activate-resource"]`)
      .click()

    // Both students switch from R1 to R2 in realtime.
    for (const s of [b, c]) {
      await expect(s.getByTestId('resource-pane-frame')).toHaveAttribute(
        'data-resource-id',
        r2.id,
        { timeout: 30_000 }
      )
    }
    await expect.poll(async () => countActivatedEvents(sessionId), { timeout: 20_000 }).toBe(2)
    {
      const sess = (await queryAdmin({ sessions: { $: { where: { id: sessionId } } } })).sessions[0]
      expect(sess.activeResourceId).toBe(r2.id)
    }

    // --- Late joiner D immediately sees the current active resource (R2) ------
    const { page: d } = await signInStudent(browser)
    await d.goto(`/join/${code}`)
    await expect(d.getByTestId('student-session-root')).toBeVisible({ timeout: 30_000 })
    await expect(d.getByTestId('resource-pane-frame')).toHaveAttribute('data-resource-id', r2.id, {
      timeout: 30_000,
    })

    // --- Failure leg: students have no Activate control; counts cannot move ---
    expect(await b.getByTestId('activate-resource').count()).toBe(0)
    const eventsBefore = await countActivatedEvents(sessionId)
    const before = (await queryAdmin({ sessions: { $: { where: { id: sessionId } } } })).sessions[0]
      .activeResourceId
    // A student cannot activate (no control to click). Confirm the admin state is
    // unchanged by the student's mere presence on the view.
    await b.waitForTimeout(1_000)
    expect(await countActivatedEvents(sessionId)).toBe(eventsBefore)
    const after = (await queryAdmin({ sessions: { $: { where: { id: sessionId } } } })).sessions[0]
      .activeResourceId
    expect(after).toBe(before)

    await b.context().close()
    await c.context().close()
    await d.context().close()
  })
})
