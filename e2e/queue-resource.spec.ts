import { test, expect, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0015 — "Teacher queues a resource (with URL validation)".
// Proves the first vertical slice of the Resource feature end-to-end against the
// live app:
//   - A teacher creates a session and lands on the facilitation view
//     (/dashboard/sessions/<id>) with an EMPTY resource queue.
//   - (1) Happy path: the teacher adds a valid https:// resource → it appears as a
//     `resource-item` with NO reload; via `queryAdmin` exactly one new
//     `sessionResources` row (linked to the session, `embedStatus: 'unchecked'`)
//     and one `ResourceQueued` event with a matching payload are observed.
//   - (2) End-of-queue ordering: a second valid resource gets a strictly greater
//     `data-sort-order` and renders last.
//   - (3) Failure path: a `javascript:` URL (and a `data:` URL) is rejected inline
//     via `add-resource-error`, and a `queryAdmin` read shows the
//     `sessionResources` / `ResourceQueued` counts UNCHANGED (nothing written).
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake. Explicit testid waits,
// never `networkidle` (InstantDB keeps the socket busy).
// ---------------------------------------------------------------------------

test.describe('teacher queues a resource (with URL validation)', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — queue-resource e2e requires admin code minting + observability queries against the live app'
  )

  /** Sign a fresh teacher in, create a session, land on its detail page; returns the title. */
  async function createSession(page: Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const title = `RES ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()
    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('created-session-link').click()
    await expect(page.getByTestId('session-status')).toBeVisible({ timeout: 20_000 })
    return title
  }

  async function countResources(sessionId: string): Promise<number> {
    const res = await queryAdmin({ sessionResources: { $: { where: { sessionId } } } })
    return (res.sessionResources ?? []).length
  }

  async function countResourceEvents(sessionId: string): Promise<number> {
    const res = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ResourceQueued' } } },
    })
    return (res.sessionEvents ?? []).length
  }

  test('adds valid resources end-of-queue, rejects unsafe schemes with nothing written', async ({
    page,
  }) => {
    const title = await createSession(page)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title } } } })).sessions[0]
      .id as string

    // Queue starts empty (explicit empty-state element, never a blank region).
    await expect(page.getByTestId('resource-queue')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('resource-queue-empty')).toBeVisible({ timeout: 20_000 })

    // --- (1) Happy path: add a valid https:// resource ----------------------
    const url1 = `https://example.com/slides-${crypto.randomUUID().slice(0, 8)}`
    const title1 = `Intro ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('add-resource-url').fill(url1)
    await page.getByTestId('add-resource-title').fill(title1)
    await page.getByTestId('add-resource-type').selectOption('google_slides')
    await page.getByTestId('add-resource-submit').click()

    // The row appears with NO reload; the form clears.
    const row1 = page.getByTestId('resource-item').filter({ hasText: title1 })
    await expect(row1).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('add-resource-url')).toHaveValue('')

    // Observability: exactly one row + one event, payload matches the new row.
    await expect.poll(async () => countResources(sessionId), { timeout: 20_000 }).toBe(1)
    await expect.poll(async () => countResourceEvents(sessionId), { timeout: 20_000 }).toBe(1)

    const stored = await queryAdmin({
      sessionResources: { $: { where: { sessionId } } },
    })
    const storedRow = stored.sessionResources[0]
    expect(storedRow.title).toBe(title1)
    expect(storedRow.embedStatus).toBe('unchecked')
    expect(storedRow.type).toBe('google_slides')

    const evRes = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ResourceQueued' } } },
    })
    const payload = evRes.sessionEvents[0].payload as Record<string, unknown>
    expect(payload.id).toBe(storedRow.id)
    expect(payload.sessionId).toBe(sessionId)
    expect(payload.title).toBe(title1)

    const sortOrder1 = Number(await row1.getAttribute('data-sort-order'))

    // --- (2) End-of-queue ordering: add a second valid resource -------------
    const url2 = `https://example.com/handout-${crypto.randomUUID().slice(0, 8)}.pdf`
    const title2 = `Handout ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('add-resource-url').fill(url2)
    await page.getByTestId('add-resource-title').fill(title2)
    await page.getByTestId('add-resource-type').selectOption('pdf')
    await page.getByTestId('add-resource-submit').click()

    const row2 = page.getByTestId('resource-item').filter({ hasText: title2 })
    await expect(row2).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => countResources(sessionId), { timeout: 20_000 }).toBe(2)

    const sortOrder2 = Number(await row2.getAttribute('data-sort-order'))
    expect(sortOrder2).toBeGreaterThan(sortOrder1)
    // The second resource renders last in the queue (end-of-queue ordering).
    const lastItem = page.getByTestId('resource-item').last()
    await expect(lastItem).toHaveText(new RegExp(title2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    // --- (3) Failure path: unsafe schemes rejected, nothing written ---------
    const before = await countResources(sessionId)
    const eventsBefore = await countResourceEvents(sessionId)

    for (const unsafe of ['javascript:alert(1)', 'data:text/html,<script>x</script>']) {
      await page.getByTestId('add-resource-url').fill(unsafe)
      await page.getByTestId('add-resource-title').fill('Should not be stored')
      await page.getByTestId('add-resource-submit').click()
      await expect(page.getByTestId('add-resource-error')).toBeVisible({ timeout: 20_000 })
    }

    // Counts unchanged — no row and no event were written for the unsafe URLs.
    expect(await countResources(sessionId)).toBe(before)
    expect(await countResourceEvents(sessionId)).toBe(eventsBefore)
  })
})
