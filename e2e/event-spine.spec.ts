import { test, expect, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi } from './support/auth'

// Each test uses a unique disposable sessionId so concurrent/repeat runs against
// the shared Instant app never pollute one another's assertions. InstantDB
// entity ids must be UUIDs, so we mint one per test.
function freshSessionId(): string {
  return crypto.randomUUID()
}

// Under the cycle-0003 owner-only `sessions` rule the harness must write as an
// authenticated teacher, so the create/realtime tests require admin code minting
// and skip loudly without it. The invalid-write test stays ungated — it asserts
// the SYNCHRONOUS `writeEvent` validation, which throws before any transaction
// and exercises no permission rule.
const NEEDS_AUTH = 'INSTANTDB_ADMIN_TOKEN unset — harness writes require an authenticated owner under perms'

async function gotoHarness(page: Page, sessionId: string) {
  await page.goto(`/dev/event-spine?sessionId=${sessionId}`)
  // The harness is a `client:only="react"` island; cold-start hydration can
  // exceed Playwright's implicit 5s default, so give this assertion an explicit
  // 15s budget. Without it the green run depends on a retry (REVIEW.md #6).
  await expect(page.getByTestId('event-spine-harness')).toBeVisible({ timeout: 15_000 })
}

test.describe('event spine dual-write harness', () => {
  test('writeEvent twice yields exactly two events and two projection rows', async ({ page }) => {
    test.skip(!adminAvailable(), NEEDS_AUTH)
    const sessionId = freshSessionId()
    await signInViaUi(page, freshEmail())
    await gotoHarness(page, sessionId)

    await expect(page.getByTestId('event-count')).toHaveText('0')

    await page.getByTestId('btn-create-session').click()
    await expect(page.getByTestId('event-count')).toHaveText('1')
    await expect(page.getByTestId('session-row')).toHaveCount(1)

    await page.getByTestId('btn-join-participant').click()
    await expect(page.getByTestId('event-count')).toHaveText('2')
    await expect(page.getByTestId('event-row')).toHaveCount(2)
    await expect(page.getByTestId('participant-row')).toHaveCount(1)
  })

  test('realtime: a write in context A appears in context B without reload', async ({ browser }) => {
    test.skip(!adminAvailable(), NEEDS_AUTH)
    const sessionId = freshSessionId()

    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    // Only the WRITER (A) must be authenticated; reads are open so the observer
    // (B) stays unauthenticated and still sees the realtime push.
    await signInViaUi(pageA, freshEmail())
    await gotoHarness(pageA, sessionId)
    await gotoHarness(pageB, sessionId)

    // Both contexts start empty for this disposable session.
    await expect(pageB.getByTestId('event-count')).toHaveText('0')

    // Trigger the write in A only.
    await pageA.getByTestId('btn-create-session').click()

    // B observes it live — no pageB.reload(). Allow extra time for the second
    // context's websocket to receive the realtime push on a cold connection.
    await expect(pageB.getByTestId('event-row')).toHaveCount(1, { timeout: 20_000 })
    await expect(pageB.getByTestId('session-row')).toHaveCount(1, { timeout: 20_000 })

    await ctxA.close()
    await ctxB.close()
  })

  test('failure path: invalid write surfaces an error and writes no rows', async ({ page }) => {
    const sessionId = freshSessionId()
    await gotoHarness(page, sessionId)

    await expect(page.getByTestId('event-count')).toHaveText('0')
    await expect(page.getByTestId('participant-count')).toHaveText('0')

    await page.getByTestId('btn-invalid-write').click()

    await expect(page.getByTestId('harness-error')).toBeVisible()
    await expect(page.getByTestId('harness-error')).toContainText('projectionTxns')

    // Counts unchanged — nothing was appended.
    await expect(page.getByTestId('event-count')).toHaveText('0')
    await expect(page.getByTestId('participant-count')).toHaveText('0')
  })
})
