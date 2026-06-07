import { test, expect, type Page, type Browser } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0010 — "Teacher question queue + mark answered".
// Proves the teacher-facing consumer of the Question object end-to-end against
// the live app:
//   - A teacher (context A) creates and STARTS a session, then sits on the
//     facilitation view (/dashboard/sessions/<id>) with an empty queue.
//   - A student (context B) joins and asks a `?` question → it appears in A's
//     `teacher-question-queue` with NO reload; B also sends a non-`?` message →
//     it NEVER enters the queue (Questions-only, teacher exclusion preserved).
//   - A marks one Question answered WITH a summary and another WITHOUT → each
//     leaves the queue immediately, and via `queryAdmin` we assert a
//     `QuestionAnswered` event + an `answered` projection row (with `addressedBy`
//     = the teacher's userId and `answerSummary` present only when supplied).
//     When the queue drains the explicit empty-state element returns.
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake. Explicit testid waits,
// never `networkidle` (InstantDB keeps the socket busy).
// ---------------------------------------------------------------------------

test.describe('teacher question queue + mark answered', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — teacher-question-queue e2e requires admin code minting + observability queries against the live app'
  )

  /** Sign a fresh teacher in, create a session, land on its detail page. */
  async function createSession(page: Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const title = `TQ ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()
    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('created-session-link').click()
    await expect(page.getByTestId('session-status')).toBeVisible({ timeout: 20_000 })
    return title
  }

  /** Start an open session and return its live join code from the detail page. */
  async function startAndReadJoinCode(page: Page): Promise<string> {
    await page.getByTestId('session-start').click()
    await expect(page.getByTestId('session-status')).toHaveText('live', { timeout: 20_000 })
    const code = (await page.getByTestId('session-joincode').textContent())?.trim()
    expect(code, 'join code should be visible on a live session').toBeTruthy()
    return code as string
  }

  /** Sign a fresh student in (own context); return its page. */
  async function signInStudent(browser: Browser): Promise<Page> {
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInViaUi(page, freshEmail())
    return page
  }

  /** Open /join/<code> and wait until routed into the /s/<code> chat surface. */
  async function joinAndOpenChat(page: Page, code: string): Promise<void> {
    await page.goto(`/join/${code}`)
    await expect(page.getByTestId('student-chat-root')).toBeVisible({ timeout: 30_000 })
  }

  /** Send a chat message from the student page and wait for it in the stream. */
  async function sendMessage(page: Page, message: string): Promise<void> {
    await page.getByTestId('student-chat-input').fill(message)
    await page.getByTestId('student-chat-send').click()
    await expect(
      page.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toBeVisible({ timeout: 20_000 })
  }

  test('student `?` appears in the teacher queue, non-`?` never does, and answering removes it', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title } } } })).sessions[0]
      .id as string

    // The teacher's own auth id (= addressedBy on resolution) from the users row.
    // The created session's teacherId is the teacher's auth id.
    const teacherId = (await queryAdmin({ sessions: { $: { where: { id: sessionId } } } }))
      .sessions[0].teacherId as string

    // Queue starts empty (explicit empty-state element, never a blank region).
    await expect(teacherPage.getByTestId('teacher-question-queue')).toBeVisible({ timeout: 20_000 })
    await expect(teacherPage.getByTestId('teacher-question-queue-empty')).toBeVisible({
      timeout: 20_000,
    })

    const b = await signInStudent(browser)
    await joinAndOpenChat(b, code)

    // Student asks two `?` questions (one answered with a summary, one without)
    // plus one non-`?` chat message that must never enter the queue.
    const qWithSummary = `what is mitosis ${crypto.randomUUID().slice(0, 8)}?`
    const qWithout = `why is the sky blue ${crypto.randomUUID().slice(0, 8)}?`
    const casual = `ok thanks ${crypto.randomUUID().slice(0, 8)}`
    await sendMessage(b, qWithSummary)
    await sendMessage(b, qWithout)
    await sendMessage(b, casual)

    // Both `?` questions appear in the teacher's queue WITH NO RELOAD.
    await expect(
      teacherPage.getByTestId('teacher-question-item').filter({ hasText: qWithSummary })
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      teacherPage.getByTestId('teacher-question-item').filter({ hasText: qWithout })
    ).toBeVisible({ timeout: 20_000 })

    // Questions-only: the non-`?` chat message never enters the queue.
    await expect
      .poll(
        async () => teacherPage.getByTestId('teacher-question-item').count(),
        { timeout: 20_000 }
      )
      .toBe(2)
    await expect(
      teacherPage.getByTestId('teacher-question-queue').filter({ hasText: casual })
    ).toHaveCount(0)

    // Answer the first WITH a summary.
    const summary = 'Cell division producing two identical daughter cells.'
    const rowWithSummary = teacherPage
      .getByTestId('teacher-question-item')
      .filter({ hasText: qWithSummary })
    await rowWithSummary.getByTestId('question-answer-summary').fill(summary)
    await rowWithSummary.getByTestId('question-mark-answered').click()
    // It leaves the queue (open-only filter holds).
    await expect(rowWithSummary).toHaveCount(0, { timeout: 20_000 })

    // Answer the second WITHOUT a summary.
    const rowWithout = teacherPage
      .getByTestId('teacher-question-item')
      .filter({ hasText: qWithout })
    await rowWithout.getByTestId('question-mark-answered').click()
    await expect(rowWithout).toHaveCount(0, { timeout: 20_000 })

    // Queue drained → the explicit empty-state element returns.
    await expect(teacherPage.getByTestId('teacher-question-queue-empty')).toBeVisible({
      timeout: 20_000,
    })

    // Observability: exactly two QuestionAnswered events for the session.
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({
            sessionEvents: { $: { where: { sessionId, type: 'QuestionAnswered' } } },
          })
          return (res.sessionEvents ?? []).length
        },
        { timeout: 20_000 }
      )
      .toBe(2)

    // Both projection rows are `answered`, addressedBy the teacher; the summary
    // is present only on the one we supplied it for.
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({ questions: { $: { where: { sessionId } }, message: {} } })
          return (res.questions ?? []).filter((x: any) => x.status === 'answered').length
        },
        { timeout: 20_000 }
      )
      .toBe(2)

    const qRes = await queryAdmin({ questions: { $: { where: { sessionId } }, message: {} } })
    const answered = (qRes.questions ?? []).filter((x: any) => x.status === 'answered')
    expect(answered).toHaveLength(2)
    for (const row of answered) {
      expect(row.addressedBy).toBe(teacherId)
    }
    const summarized = answered.find((x: any) => x.message?.text === qWithSummary)
    const unsummarized = answered.find((x: any) => x.message?.text === qWithout)
    expect(summarized?.answerSummary).toBe(summary)
    // No summary supplied → the field is absent (not an empty string).
    expect(unsummarized?.answerSummary ?? null).toBeNull()

    await b.context().close()
  })
})
