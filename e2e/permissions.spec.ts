import { test, expect, type Page } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi } from './support/auth'

// Primary gate for the cycle-0003 data-layer invariants. These are behaviors of
// the LIVE Instant app (the pushed permission rules), observable only against it,
// so this spec signs in two distinct real users — a teacher and a student — in
// two browser contexts via the admin code-minting seam, then drives the raw
// read/write probe. Without the admin token (or app id) there is no deterministic
// sign-in, so the suite SKIPS LOUDLY rather than passing falsely.
test.describe('data-layer permission rules', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — permission e2e requires admin code minting against the live app'
  )

  function freshSessionId(): string {
    return crypto.randomUUID()
  }

  async function gotoProbe(
    page: Page,
    params: { targetUserId?: string; targetSessionId?: string; targetTeacherId?: string }
  ) {
    const qs = new URLSearchParams()
    if (params.targetUserId) qs.set('targetUserId', params.targetUserId)
    if (params.targetSessionId) qs.set('targetSessionId', params.targetSessionId)
    if (params.targetTeacherId) qs.set('targetTeacherId', params.targetTeacherId)
    await page.goto(`/dev/perms-probe?${qs.toString()}`)
    // `client:only="react"` island — give cold-start hydration a 15s budget.
    await expect(page.getByTestId('perms-probe')).toBeVisible({ timeout: 15_000 })
  }

  test('owner write propagates in realtime; student write is denied and state unchanged', async ({
    browser,
  }) => {
    const sessionId = freshSessionId()

    // --- Teacher context: sign in, capture id, create an owned session. ---
    const teacherCtx = await browser.newContext()
    const teacherPage = await teacherCtx.newPage()
    await signInViaUi(teacherPage, freshEmail())
    await gotoProbe(teacherPage, { targetSessionId: sessionId })
    const teacherId = await teacherPage.getByTestId('probe-self-id').textContent()
    expect(teacherId).toBeTruthy()

    await teacherPage.getByTestId('probe-create-owned-session').click()
    await expect(teacherPage.getByTestId('probe-write-result')).toHaveText('ok', { timeout: 20_000 })

    // --- Student context: a DIFFERENT signed-in user observing the same session. ---
    const studentCtx = await browser.newContext()
    const studentPage = await studentCtx.newPage()
    await signInViaUi(studentPage, freshEmail())
    await gotoProbe(studentPage, {
      targetSessionId: sessionId,
      targetUserId: teacherId as string,
      targetTeacherId: teacherId as string,
    })
    // Student can VIEW the session (reads are open) — it exists.
    await expect(studentPage.getByTestId('probe-active-resource')).not.toHaveText('none', {
      timeout: 20_000,
    })

    // (Happy path) Owner changes the active resource → student sees it live.
    await teacherPage.getByTestId('probe-write-session').click()
    await expect(teacherPage.getByTestId('probe-write-result')).toHaveText('ok', { timeout: 20_000 })
    let ownerValue = ''
    await expect
      .poll(
        async () => {
          ownerValue = (await teacherPage.getByTestId('probe-active-resource').textContent()) ?? ''
          return ownerValue
        },
        { timeout: 20_000 }
      )
      .not.toBe('none')
    await expect(studentPage.getByTestId('probe-active-resource')).toHaveText(ownerValue, {
      timeout: 20_000,
    })

    // (Failure path) Student raw-writes the teacher's session → permission error,
    // and the stored value is UNCHANGED (neither silently dropped nor applied).
    await studentPage.getByTestId('probe-write-session').click()
    await expect(studentPage.getByTestId('probe-write-result')).toContainText('error:', {
      timeout: 20_000,
    })
    await expect(studentPage.getByTestId('probe-active-resource')).toHaveText(ownerValue, {
      timeout: 20_000,
    })

    // (Failure path) Student raw-writes a resource owned by the teacher → denied.
    await studentPage.getByTestId('probe-write-resource').click()
    await expect(studentPage.getByTestId('probe-write-result')).toContainText('error:', {
      timeout: 20_000,
    })

    // (Failure path — create-time injection vector) Student creates a resource
    // declaring THEMSELVES as teacherId but linked to the teacher's session.
    // The link-based ownership rule checks the parent session's real owner, so
    // the injection is rejected — the student cannot plant a resource into the
    // teacher's lesson by self-asserting ownership.
    await studentPage.getByTestId('probe-inject-resource').click()
    await expect(studentPage.getByTestId('probe-write-result')).toContainText('error:', {
      timeout: 20_000,
    })

    await teacherCtx.close()
    await studentCtx.close()
  })

  test('deny-by-default: a signed-in client cannot write an undeclared/default-governed entity', async ({
    browser,
  }) => {
    // The global `$default: 'false'` rule (cycle 0013) locks every namespace
    // without an explicit block. A signed-in user's raw write to an UNDECLARED
    // entity is rejected by the live app — proving the "next entity is locked by
    // default" guarantee, with no row persisted.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signInViaUi(page, freshEmail())
    await gotoProbe(page, { targetSessionId: freshSessionId() })
    await page.getByTestId('probe-write-undeclared').click()
    await expect(page.getByTestId('probe-write-result')).toContainText('error:', {
      timeout: 20_000,
    })
    await ctx.close()
  })

  test('email privacy: a student cannot read another user email', async ({ browser }) => {
    const sessionId = freshSessionId()

    const teacherCtx = await browser.newContext()
    const teacherPage = await teacherCtx.newPage()
    await signInViaUi(teacherPage, freshEmail())
    await gotoProbe(teacherPage, { targetSessionId: sessionId })
    const teacherId = await teacherPage.getByTestId('probe-self-id').textContent()
    expect(teacherId).toBeTruthy()

    const studentCtx = await browser.newContext()
    const studentPage = await studentCtx.newPage()
    await signInViaUi(studentPage, freshEmail())
    await gotoProbe(studentPage, { targetUserId: teacherId as string })

    // The own-row-only `users` view rule returns zero rows for the teacher's id,
    // so the student gets no email value — the classmate's address is unreadable.
    await studentPage.getByTestId('probe-read-email').click()
    await expect(studentPage.getByTestId('probe-read-result')).toHaveText('no-email', {
      timeout: 20_000,
    })

    // Sanity: a user CAN read their own row (own-row view permitted).
    await gotoProbe(teacherPage, { targetUserId: teacherId as string })
    await teacherPage.getByTestId('probe-read-email').click()
    await expect(teacherPage.getByTestId('probe-read-result')).toContainText('email:', {
      timeout: 20_000,
    })

    await teacherCtx.close()
    await studentCtx.close()
  })

  test('cross-teacher denial: a second teacher cannot write the first teacher session', async ({
    browser,
  }) => {
    const sessionId = freshSessionId()

    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    await signInViaUi(ownerPage, freshEmail())
    await gotoProbe(ownerPage, { targetSessionId: sessionId })
    await ownerPage.getByTestId('probe-create-owned-session').click()
    await expect(ownerPage.getByTestId('probe-write-result')).toHaveText('ok', { timeout: 20_000 })

    // A different authenticated teacher targets the first teacher's session.
    const otherCtx = await browser.newContext()
    const otherPage = await otherCtx.newPage()
    await signInViaUi(otherPage, freshEmail())
    await gotoProbe(otherPage, { targetSessionId: sessionId })
    await otherPage.getByTestId('probe-write-session').click()
    await expect(otherPage.getByTestId('probe-write-result')).toContainText('error:', {
      timeout: 20_000,
    })

    await ownerCtx.close()
    await otherCtx.close()
  })
})
