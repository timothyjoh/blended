import { test, expect, type Browser, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0018 — "Blocked-embed fallback card (never a blank pane)" (SPEC §8.2).
// Proves the fallback vertical slice end-to-end against the live app:
//   - A teacher creates + starts a session and queues two resources: a
//     deterministically NON-LOADING fixture (`/e2e/hang`, delays past the
//     detection timeout) and a cleanly-embeddable fixture (`/e2e/embed-ok.html`).
//   - The teacher activates the hung resource → within the bounded detection
//     window the `ResourcePane` replaces the blank iframe with the fallback card
//     (title + URL + an "Open externally" action: new tab, rel="noopener
//     noreferrer", href = the URL), and `resource-pane-frame` is absent — for the
//     teacher AND a joined student (waits target the explicit fallback element,
//     never `networkidle`).
//   - Evidence via `queryAdmin`: exactly one `ResourceEmbedChecked` event and a
//     `blocked` `sessionResources` projection row for the hung resource.
//   - The teacher activates the embeddable resource → the inline
//     `resource-pane-frame` renders and NO fallback card appears (no false
//     positive); no `ResourceEmbedChecked` event for that resource.
//   - Failure leg: the student renders the fallback card but writes NO
//     `ResourceEmbedChecked` event and never flips an `embedStatus` (no
//     `sessionResources` write permission) — the count stays exactly one.
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake. The `/e2e/hang` fixture is
// dev-guarded (404 in production).
// ---------------------------------------------------------------------------

test.describe('blocked embed shows a fallback card in both contexts; embeddable renders inline', () => {
  test.skip(
    !adminAvailable(),
    'INSTANTDB_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — blocked-embed-fallback e2e requires admin code minting + observability queries against the live app'
  )

  /** Sign a fresh teacher in, create a session, land on its detail page; returns the title. */
  async function createSession(page: Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const title = `EMBED ${crypto.randomUUID().slice(0, 8)}`
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

  async function activate(page: Page, resourceId: string): Promise<void> {
    await page
      .locator(`[data-testid="resource-item"][data-resource-id="${resourceId}"] [data-testid="activate-resource"]`)
      .click()
  }

  async function signInStudent(browser: Browser): Promise<{ page: Page }> {
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInViaUi(page, freshEmail())
    return { page }
  }

  async function countEmbedCheckedEvents(sessionId: string): Promise<number> {
    const res = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ResourceEmbedChecked' } } },
    })
    return (res.sessionEvents ?? []).length
  }

  /** Assert the fallback card is fully present (and the iframe absent) on `page`. */
  async function expectFallbackCard(page: Page, url: string, title: string): Promise<void> {
    // Detection is bounded by EMBED_LOAD_TIMEOUT_MS (4s) — allow generously for it.
    await expect(page.getByTestId('resource-pane-fallback')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('resource-pane-fallback-title')).toHaveText(title)
    await expect(page.getByTestId('resource-pane-fallback-url')).toHaveText(url)
    const link = page.getByTestId('resource-pane-open-external')
    await expect(link).toHaveAttribute('href', url)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // Never a blank/broken iframe alongside the card.
    expect(await page.getByTestId('resource-pane-frame').count()).toBe(0)
  }

  test('blocked embed → fallback card (teacher + student) + one event; embeddable → inline frame, no card', async ({
    page: teacherPage,
    browser,
  }) => {
    const sessionTitle = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title: sessionTitle } } } }))
      .sessions[0].id as string

    // Queue the non-loading (blocked) fixture and the embeddable fixture.
    const hangUrl = 'http://localhost:4399/e2e/hang'
    const okUrl = 'http://localhost:4399/e2e/embed-ok.html'
    const blockedTitle = `Blocked ${crypto.randomUUID().slice(0, 6)}`
    const okTitle = `Embeddable ${crypto.randomUUID().slice(0, 6)}`
    const blocked = await queueResourceViaUi(teacherPage, hangUrl, blockedTitle)
    const ok = await queueResourceViaUi(teacherPage, okUrl, okTitle)

    // A student joins (before activation it shows the explicit empty state).
    const { page: student } = await signInStudent(browser)
    await student.goto(`/join/${code}`)
    await expect(student.getByTestId('student-session-root')).toBeVisible({ timeout: 30_000 })
    await expect(student.getByTestId('resource-pane-empty')).toBeVisible({ timeout: 20_000 })

    // --- Activate the BLOCKED resource → fallback card in both contexts --------
    await activate(teacherPage, blocked.id)
    await expectFallbackCard(teacherPage, hangUrl, blockedTitle)
    await expectFallbackCard(student, hangUrl, blockedTitle)

    // Evidence: exactly one ResourceEmbedChecked event + a blocked projection row.
    await expect.poll(async () => countEmbedCheckedEvents(sessionId), { timeout: 20_000 }).toBe(1)
    {
      const ev = (
        await queryAdmin({
          sessionEvents: { $: { where: { sessionId, type: 'ResourceEmbedChecked' } } },
        })
      ).sessionEvents[0]
      const payload = ev.payload as Record<string, unknown>
      expect(payload.sessionId).toBe(sessionId)
      expect(payload.resourceId).toBe(blocked.id)
      expect(['blocked', 'failed']).toContain(payload.embedStatus)
      const row = (await queryAdmin({ sessionResources: { $: { where: { id: blocked.id } } } }))
        .sessionResources[0]
      expect(['blocked', 'failed']).toContain(row.embedStatus)
    }

    // --- Failure leg: the student rendered the card but wrote nothing ----------
    // The single event above is the teacher's. Confirm the student's mere presence
    // on the fallback card moved no admin state (no sessionResources write perm).
    await student.waitForTimeout(1_000)
    expect(await countEmbedCheckedEvents(sessionId)).toBe(1)

    // --- Activate the EMBEDDABLE resource → inline frame, no fallback card ------
    await activate(teacherPage, ok.id)
    await expect(teacherPage.getByTestId('resource-pane-frame')).toHaveAttribute(
      'data-resource-id',
      ok.id,
      { timeout: 30_000 }
    )
    // No false positive: the embeddable load cancels the timeout, so no card.
    expect(await teacherPage.getByTestId('resource-pane-fallback').count()).toBe(0)
    // The student follows to the inline frame too.
    await expect(student.getByTestId('resource-pane-frame')).toHaveAttribute(
      'data-resource-id',
      ok.id,
      { timeout: 30_000 }
    )

    // No ResourceEmbedChecked event for the embeddable resource — count unchanged.
    await teacherPage.waitForTimeout(1_000)
    expect(await countEmbedCheckedEvents(sessionId)).toBe(1)
    {
      const okRow = (await queryAdmin({ sessionResources: { $: { where: { id: ok.id } } } }))
        .sessionResources[0]
      expect(okRow.embedStatus).toBe('unchecked')
    }

    await student.context().close()
  })
})
