import { test, expect, type Page, type Browser } from '@playwright/test'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0007 — "Student joins via link and becomes a participant".
// Proves the student-join vertical slice end-to-end against the live app:
//   - A teacher (context A) creates and STARTS a session, exposing its join code.
//   - A student (context B) opens `/join/<code>`, authenticates, and lands in the
//     `/s/<code>` student session view as a `role: 'student'` participant whose
//     `username` is the email local-part — with NO email on the row.
//   - A THIRD context (C) joins later and its `/s/<code>` view immediately reflects
//     the same current shared state (live status + the present-participants set),
//     proving real-time late-joiner sync.
//   - Reloading `/join/<code>` as an already-joined user routes in WITHOUT a second
//     participant row (idempotency per (user, session)).
//   - Failure paths: an unknown code shows `join-not-found` and writes nothing; a
//     non-live (draft) session's link shows `join-not-open` and writes nothing.
// Skips loudly when admin env is unset (never a false green); `retries: 3`
// (playwright.config.ts) absorbs realtime-sync flake. Explicit testid waits, never
// `networkidle` (InstantDB keeps the socket busy).
// ---------------------------------------------------------------------------

test.describe('student joins via link and becomes a participant', () => {
  test.skip(
    !adminAvailable(),
    'INSTANT_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — join-via-link e2e requires admin code minting + observability queries against the live app'
  )

  /** Sign a fresh teacher in, create a session, return its title (admin-queryable). */
  async function createSession(page: Page): Promise<string> {
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })
    const title = `Lesson ${crypto.randomUUID().slice(0, 8)}`
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

  /** Sign a fresh student in (own context) and return its email so the local-part is assertable. */
  async function signInStudent(browser: Browser): Promise<{ page: Page; email: string }> {
    const context = await browser.newContext()
    const page = await context.newPage()
    const email = freshEmail()
    await signInViaUi(page, email)
    return { page, email }
  }

  test('B joins, C joins late and immediately sees the shared state; idempotent reload', async ({
    page: teacherPage,
    browser,
  }) => {
    const title = await createSession(teacherPage)
    const code = await startAndReadJoinCode(teacherPage)

    const sessRes = await queryAdmin({ sessions: { $: { where: { title } } } })
    const sessionId = sessRes.sessions[0].id as string

    // --- Student B joins and lands in the session view. ---
    const { page: b, email: bEmail } = await signInStudent(browser)
    const bLocal = bEmail.split('@')[0]
    await b.goto(`/join/${code}`)
    await expect(b.getByTestId('student-session-root')).toBeVisible({ timeout: 30_000 })
    await expect(b.getByTestId('student-session-status')).toHaveText('live', { timeout: 20_000 })
    await expect(
      b.getByTestId('student-session-presence-item').filter({ hasText: bLocal })
    ).toBeVisible({ timeout: 20_000 })

    // Observability: exactly one student row for (B, session), local-part username,
    // NO email field, and a ParticipantJoined event for the join.
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({ participants: { $: { where: { sessionId } } } })
          return (res.participants ?? []).filter((p: any) => p.username === bLocal).length
        },
        { timeout: 20_000 }
      )
      .toBe(1)
    const bRows = (
      await queryAdmin({ participants: { $: { where: { sessionId } } } })
    ).participants.filter((p: any) => p.username === bLocal)
    expect(bRows[0].role).toBe('student')
    expect(bRows[0].username).toBe(bLocal)
    expect(bRows[0]).not.toHaveProperty('email')
    const joinedEvents = await queryAdmin({
      sessionEvents: { $: { where: { sessionId, type: 'ParticipantJoined' } } },
    })
    expect(joinedEvents.sessionEvents.length).toBeGreaterThanOrEqual(1)

    // --- Student C joins LATE and immediately sees the shared current state. ---
    const { page: c, email: cEmail } = await signInStudent(browser)
    const cLocal = cEmail.split('@')[0]
    await c.goto(`/join/${code}`)
    await expect(c.getByTestId('student-session-root')).toBeVisible({ timeout: 30_000 })
    await expect(c.getByTestId('student-session-status')).toHaveText('live', { timeout: 20_000 })
    // Late joiner reflects BOTH present participants without a manual refresh.
    await expect(
      c.getByTestId('student-session-presence-item').filter({ hasText: bLocal })
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      c.getByTestId('student-session-presence-item').filter({ hasText: cLocal })
    ).toBeVisible({ timeout: 20_000 })

    // --- Idempotency: B reloads /join/<code>, lands in /s/<code>, count stays 1. ---
    await b.goto(`/join/${code}`)
    await expect(b.getByTestId('student-session-root')).toBeVisible({ timeout: 30_000 })
    const afterReload = (
      await queryAdmin({ participants: { $: { where: { sessionId } } } })
    ).participants.filter((p: any) => p.username === bLocal).length
    expect(afterReload).toBe(1)

    await b.context().close()
    await c.context().close()
  })

  test('failure: unknown code shows not-found and writes no participant', async ({ browser }) => {
    const { page: student } = await signInStudent(browser)
    const unknown = `ZZZ${crypto.randomUUID().slice(0, 7).toUpperCase()}`
    await student.goto(`/join/${unknown}`)
    await expect(student.getByTestId('join-not-found')).toBeVisible({ timeout: 30_000 })
    // No session exists for the code, so no participant could have been created.
    const res = await queryAdmin({ sessions: { $: { where: { joinCode: unknown } } } })
    expect(res.sessions ?? []).toHaveLength(0)
    await student.context().close()
  })

  test('failure: non-live (draft) session shows not-open and writes no participant', async ({
    page: teacherPage,
    browser,
  }) => {
    // Create but DO NOT start — the session stays `draft` (join gate closed).
    const title = await createSession(teacherPage)
    const sessRes = await queryAdmin({ sessions: { $: { where: { title } } } })
    const session = sessRes.sessions[0]
    expect(session.status).toBe('draft')

    const { page: student } = await signInStudent(browser)
    await student.goto(`/join/${session.joinCode}`)
    await expect(student.getByTestId('join-not-open')).toBeVisible({ timeout: 30_000 })

    // No participant row was written for the draft session.
    const parts = await queryAdmin({ participants: { $: { where: { sessionId: session.id } } } })
    expect(parts.participants ?? []).toHaveLength(0)
    await student.context().close()
  })
})
