import { test, expect } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0006 — "Teacher starts / ends a session (lifecycle state machine)".
// Proves the owning teacher drives a created `draft` session through its real
// lifecycle on the detail page: Start → `live` (join gate opens) → End → `ended`
// (join closes), with the dual-write landing exactly one ordered `SessionStarted`
// and one `SessionEnded` event and the live `sessions` row finishing `ended` with
// `startedAt`/`endedAt` set. The failure path drives an illegal transition (End on
// a still-`draft` session) and asserts an inline error with the status unchanged.
//
// NOTE: a real cross-context student join is deferred to the join cycle — this
// suite verifies the join-ENABLEMENT gate state (`session-join-state`), not an
// actual student join. Skips loudly when admin env is unset (never a false green).
// ---------------------------------------------------------------------------

test.describe('teacher starts / ends a session (lifecycle)', () => {
  test.skip(
    !adminAvailable(),
    'INSTANTDB_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — session-lifecycle e2e requires admin code minting + observability queries against the live app'
  )

  async function createSessionAndOpen(page: import('@playwright/test').Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })

    const title = `Lesson ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()
    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })

    // Follow the post-create link to the detail page (cycle-0006 reachability).
    await page.getByTestId('created-session-link').click()
    await expect(page.getByTestId('session-status')).toBeVisible({ timeout: 20_000 })
    return title
  }

  test('draft → live → ended with join gate and ordered observability', async ({ page }) => {
    const title = await createSessionAndOpen(page)

    // Draft: join disabled (acceptance #1 precondition).
    await expect(page.getByTestId('session-status')).toHaveText('draft', { timeout: 20_000 })
    await expect(page.getByTestId('session-join-state')).toHaveAttribute(
      'data-join-enabled',
      'false'
    )

    // Start → live + join enabled (acceptance #1).
    await page.getByTestId('session-start').click()
    await expect(page.getByTestId('session-status')).toHaveText('live', { timeout: 20_000 })
    await expect(page.getByTestId('session-join-state')).toHaveAttribute(
      'data-join-enabled',
      'true'
    )

    // End → ended + join closed (acceptance #2).
    await page.getByTestId('session-end').click()
    await expect(page.getByTestId('session-status')).toHaveText('ended', { timeout: 20_000 })
    await expect(page.getByTestId('session-join-state')).toHaveAttribute(
      'data-join-enabled',
      'false'
    )

    // Observability (acceptance #3): exactly one ordered SessionStarted + SessionEnded,
    // and the live sessions row at `ended` with startedAt/endedAt set.
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({ sessions: { $: { where: { title } } } })
          return res.sessions?.[0]?.status ?? null
        },
        { timeout: 20_000 }
      )
      .toBe('ended')

    const sessRes = await queryAdmin({ sessions: { $: { where: { title } } } })
    const session = sessRes.sessions[0]
    expect(typeof session.startedAt).toBe('number')
    expect(typeof session.endedAt).toBe('number')

    const started = await queryAdmin({
      sessionEvents: { $: { where: { sessionId: session.id, type: 'SessionStarted' } } },
    })
    const ended = await queryAdmin({
      sessionEvents: { $: { where: { sessionId: session.id, type: 'SessionEnded' } } },
    })
    expect(started.sessionEvents).toHaveLength(1)
    expect(ended.sessionEvents).toHaveLength(1)
    expect(started.sessionEvents[0].occurredAt).toBeLessThan(ended.sessionEvents[0].occurredAt)
  })

  test('illegal transition (End on a draft session) shows an inline error, status unchanged', async ({
    page,
  }) => {
    await createSessionAndOpen(page)
    await expect(page.getByTestId('session-status')).toHaveText('draft', { timeout: 20_000 })

    // Forced illegal transition: End is rejected by the builder guard on a draft
    // session (draft → ended is not a legal §6.2 transition).
    await page.getByTestId('session-end').click()

    // Failure path (acceptance #6): inline error, displayed status unchanged.
    await expect(page.getByTestId('session-lifecycle-error')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('session-status')).toHaveText('draft')
  })
})
