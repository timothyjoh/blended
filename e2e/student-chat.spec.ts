import { test, expect, type Page, type Browser } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0008 — "Student chat: send + realtime stream (teachers excluded)".
// Proves the student-chat vertical slice end-to-end against the live app:
//   - A teacher (context A) creates and STARTS a session, exposing its join code.
//   - Students B and C open /join/<code>, land on /s/<code>; B types non-blank text
//     and sends it — it renders in B's stream AND, with NO reload, in C's stream
//     (realtime sync).
//   - A late joiner D opens /s/<code> AFTER messages exist and sees prior history.
//   - The teacher facilitation view (/dashboard/sessions/:id) renders NO chat
//     stream/input (teacher exclusion, SPEC §9.3).
//   - Dual-write observability: one `messages` row + one `ChatMessageSubmitted`
//     event per logical message (via `queryAdmin`).
//   - Idempotency: a double-submit yields exactly one rendered message / row / event.
//   - Failure: a blank submit writes nothing and surfaces a non-blank rejection.
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake. Explicit testid waits, never
// `networkidle` (InstantDB keeps the socket busy).
// ---------------------------------------------------------------------------

test.describe('student chat: send + realtime stream (teachers excluded)', () => {
  test.skip(
    !adminAvailable(),
    'INSTANTDB_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — student-chat e2e requires admin code minting + observability queries against the live app'
  )

  /** Sign a fresh teacher in, create a session, return its title (admin-queryable). */
  async function createSession(page: Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const title = `Chat ${crypto.randomUUID().slice(0, 8)}`
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

  /** Sign a fresh student in (own context); return its page + email local-part. */
  async function signInStudent(browser: Browser): Promise<{ page: Page; local: string }> {
    const context = await browser.newContext()
    const page = await context.newPage()
    const email = freshEmail()
    await signInViaUi(page, email)
    return { page, local: email.split('@')[0] }
  }

  /** Open /join/<code> and wait until routed into the /s/<code> chat surface. */
  async function joinAndOpenChat(page: Page, code: string): Promise<void> {
    await page.goto(`/join/${code}`)
    await expect(page.getByTestId('student-chat-root')).toBeVisible({ timeout: 30_000 })
  }

  test('B sends; C sees it in realtime; dual-write writes one row + one event', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessRes = await queryAdmin({ sessions: { $: { where: { title } } } })
    const sessionId = sessRes.sessions[0].id as string

    const { page: b } = await signInStudent(browser)
    const { page: c } = await signInStudent(browser)
    await joinAndOpenChat(b, code)
    await joinAndOpenChat(c, code)

    // Exactly one input, no message-type selector.
    await expect(b.getByTestId('student-chat-input')).toHaveCount(1)
    await expect(b.getByTestId('student-chat-message-type')).toHaveCount(0)

    const message = `hello ${crypto.randomUUID().slice(0, 8)}`
    await b.getByTestId('student-chat-input').fill(message)
    await b.getByTestId('student-chat-send').click()

    // Renders in B's OWN stream...
    await expect(
      b.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toBeVisible({ timeout: 20_000 })
    // ...and in C's stream with NO reload (realtime sync).
    await expect(
      c.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toBeVisible({ timeout: 20_000 })

    // Dual-write observability: one messages row + one ChatMessageSubmitted event.
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({ messages: { $: { where: { sessionId } } } })
          return (res.messages ?? []).filter((m: any) => m.text === message).length
        },
        { timeout: 20_000 }
      )
      .toBe(1)
    const events = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ChatMessageSubmitted' } } },
    })
    expect(events.sessionEvents.length).toBe(1)
    // The row carries no email (structural privacy).
    const rows = (await queryAdmin({ messages: { $: { where: { sessionId } } } })).messages.filter(
      (m: any) => m.text === message
    )
    expect(rows[0]).not.toHaveProperty('email')

    await b.context().close()
    await c.context().close()
  })

  test('late joiner D sees prior chat history on first load', async ({
    page: teacherPage,
    browser,
  }) => {
    await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)

    const { page: b } = await signInStudent(browser)
    await joinAndOpenChat(b, code)
    const message = `early ${crypto.randomUUID().slice(0, 8)}`
    await b.getByTestId('student-chat-input').fill(message)
    await b.getByTestId('student-chat-send').click()
    await expect(
      b.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toBeVisible({ timeout: 20_000 })

    // D joins AFTER the message exists and sees it on first load.
    const { page: d } = await signInStudent(browser)
    await joinAndOpenChat(d, code)
    await expect(
      d.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toBeVisible({ timeout: 20_000 })

    await b.context().close()
    await d.context().close()
  })

  test('teacher facilitation view renders no chat stream or input', async ({
    page: teacherPage,
  }) => {
    await createSession(teacherPage)
    await startAndReadJoinCode(teacherPage)
    // Still on /dashboard/sessions/:id — assert the chat testids are absent.
    await expect(teacherPage.getByTestId('student-chat-root')).toHaveCount(0)
    await expect(teacherPage.getByTestId('student-chat-stream')).toHaveCount(0)
    await expect(teacherPage.getByTestId('student-chat-input')).toHaveCount(0)
  })

  test('idempotency: a double-submit yields exactly one message / row / event', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title } } } })).sessions[0]
      .id as string

    const { page: b } = await signInStudent(browser)
    await joinAndOpenChat(b, code)

    const message = `once ${crypto.randomUUID().slice(0, 8)}`
    await b.getByTestId('student-chat-input').fill(message)
    // Rapid double-fire: the inFlight latch + deterministic keyed-upsert id collapse
    // the duplicate to a single row/event.
    await b.getByTestId('student-chat-send').dblclick()

    await expect(
      b.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toBeVisible({ timeout: 20_000 })

    // Exactly one rendered message with this text.
    await expect(
      b.getByTestId('student-chat-message-item').filter({ hasText: message })
    ).toHaveCount(1)

    // Exactly one row and one event (give realtime a beat, then confirm it stays 1).
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({ messages: { $: { where: { sessionId } } } })
          return (res.messages ?? []).filter((m: any) => m.text === message).length
        },
        { timeout: 20_000 }
      )
      .toBe(1)
    const events = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ChatMessageSubmitted' } } },
    })
    expect(events.sessionEvents.length).toBe(1)

    await b.context().close()
  })

  test('failure: a blank submit writes nothing and surfaces a rejection', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)
    const sessionId = (await queryAdmin({ sessions: { $: { where: { title } } } })).sessions[0]
      .id as string

    const { page: b } = await signInStudent(browser)
    await joinAndOpenChat(b, code)

    // Submit with an empty (then whitespace-only) input.
    await b.getByTestId('student-chat-input').fill('   ')
    await b.getByTestId('student-chat-send').click()
    await expect(b.getByTestId('student-chat-error')).toBeVisible({ timeout: 10_000 })
    await expect(b.getByTestId('student-chat-error')).not.toBeEmpty()

    // Nothing was written for this session.
    const res = await queryAdmin({ messages: { $: { where: { sessionId } } } })
    expect(res.messages ?? []).toHaveLength(0)
    const events = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ChatMessageSubmitted' } } },
    })
    expect(events.sessionEvents ?? []).toHaveLength(0)

    await b.context().close()
  })
})
