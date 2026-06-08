import { test, expect, type Page, type Browser } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0009 — "Auto-create a Question from messages ending in '?'".
// Proves the message→Question promotion vertical slice end-to-end against the
// live app:
//   - A teacher (context A) creates and STARTS a session, exposing its join code.
//   - A student (context B) opens /join/<code>, lands on /s/<code>, and sends a
//     question-like message ("what is mitosis?"). Via `queryAdmin` we assert that
//     exactly one `questions` row exists for the session, links to the source
//     `messages` row + author `participants` row, and that a `QuestionCreated`
//     event referencing the source `messageId` exists — alongside the original
//     `ChatMessageSubmitted` event (dual-write counts).
//   - The same student sends a casual message ("ok thanks") → NO `questions` row
//     and NO `QuestionCreated` event are created; it stays chat-only.
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake. Explicit testid waits,
// never `networkidle` (InstantDB keeps the socket busy).
// ---------------------------------------------------------------------------

test.describe('auto-create a Question from messages ending in "?"', () => {
  test.skip(
    !adminAvailable(),
    'INSTANTDB_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — auto-create-question e2e requires admin code minting + observability queries against the live app'
  )

  /** Sign a fresh teacher in, create a session, return its admin-queryable title. */
  async function createSession(page: Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const title = `Q ${crypto.randomUUID().slice(0, 8)}`
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

  test('a "?" message creates one linked Question + QuestionCreated event', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title } } } })).sessions[0]
      .id as string

    const b = await signInStudent(browser)
    await joinAndOpenChat(b, code)

    const message = `what is mitosis ${crypto.randomUUID().slice(0, 8)}?`
    await b.getByTestId('student-chat-input').fill(message)
    await b.getByTestId('student-chat-send').click()
    await expect(
      b.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toBeVisible({ timeout: 20_000 })

    // Exactly one questions row for this session, linked to its source message + participant.
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({
            questions: { $: { where: { sessionId } }, message: {}, participant: {} },
          })
          return (res.questions ?? []).length
        },
        { timeout: 20_000 }
      )
      .toBe(1)

    const qRes = await queryAdmin({
      questions: { $: { where: { sessionId } }, message: {}, participant: {} },
    })
    const q = qRes.questions[0]
    expect(q.status).toBe('submitted')
    // Privacy is structural: the question row carries no email.
    expect(q).not.toHaveProperty('email')
    // Linked back to the source message (whose text is the submitted message)...
    expect(q.message?.text).toBe(message)
    // ...and to an author participant.
    expect(q.participant?.id).toBeTruthy()
    const messageId = q.message.id as string

    // Dual-write counts: one ChatMessageSubmitted + one QuestionCreated, the latter
    // referencing the source messageId in its payload.
    const chatEvents = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ChatMessageSubmitted' } } },
    })
    expect(chatEvents.sessionEvents.length).toBe(1)
    const qEvents = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'QuestionCreated' } } },
    })
    expect(qEvents.sessionEvents.length).toBe(1)
    expect((qEvents.sessionEvents[0].payload as any).messageId).toBe(messageId)

    await b.context().close()
  })

  test('a non-"?" message stays chat-only (no Question, no QuestionCreated)', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title } } } })).sessions[0]
      .id as string

    const b = await signInStudent(browser)
    await joinAndOpenChat(b, code)

    const message = `ok thanks ${crypto.randomUUID().slice(0, 8)}`
    await b.getByTestId('student-chat-input').fill(message)
    await b.getByTestId('student-chat-send').click()
    await expect(
      b.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toBeVisible({ timeout: 20_000 })

    // The message was written (chat-only)...
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({ messages: { $: { where: { sessionId } } } })
          return (res.messages ?? []).filter((m: any) => m.text === message).length
        },
        { timeout: 20_000 }
      )
      .toBe(1)

    // ...but NO question row and NO QuestionCreated event exist for this session.
    const qRes = await queryAdmin({ questions: { $: { where: { sessionId } } } })
    expect(qRes.questions ?? []).toHaveLength(0)
    const qEvents = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'QuestionCreated' } } },
    })
    expect(qEvents.sessionEvents ?? []).toHaveLength(0)

    await b.context().close()
  })
})
