import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { adminAvailable, freshEmail, signInViaUi, queryAdmin } from './support/auth'

// ---------------------------------------------------------------------------
// Cycle 0021 — "Push the Blended schema to the live Instant app". Proves the
// user-observable benefit: after `npm run schema:push` succeeds against the live
// app, a representative `writeEvent()` transaction (a real session create) is
// ACCEPTED — not rejected — by the schema-enforced live app, with the event +
// projection rows landing. Reuses the create-session acceptance-proof pattern
// (`e2e/create-session.spec.ts`) + the loud-skip gate (`e2e/permissions.spec.ts`).
//
// Skips loudly when admin env is unset — a missing token never produces a false
// green. If `instant-cli login` is unauthenticated in the build env, the push
// runner exits non-zero and the setup assertion fails loudly (never a false pass).
// ---------------------------------------------------------------------------

const runnerPath = fileURLToPath(new URL('../scripts/push-schema.mjs', import.meta.url))

test.describe('schema push → live writeEvent accepted', () => {
  test.skip(
    !adminAvailable(),
    'INSTANTDB_ADMIN_TOKEN (and PUBLIC_INSTANTDB_APP_ID) unset — live schema-push verification requires admin code minting + observability queries against the live app'
  )

  test('after schema:push, a writeEvent() transaction is accepted by the live app', async ({
    page,
  }) => {
    // 1) Push the committed schema to the live app via the real runner. A
    //    non-zero exit (e.g. unauthenticated `instant-cli login`) fails loudly
    //    here — the schema is never left unmigrated while the test reports success.
    const push = spawnSync(process.execPath, [runnerPath], {
      env: process.env,
      encoding: 'utf8',
    })
    expect(
      push.status,
      `schema:push must succeed before verifying writes (stderr: ${push.stderr ?? ''})`
    ).toBe(0)

    // 2) Drive a representative product mutation that routes through writeEvent()
    //    (createSession's dual-write), exactly as create-session.spec.ts does.
    await signInViaUi(page, freshEmail())
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-root')).toBeVisible({ timeout: 15_000 })

    const title = `Schema-push ${crypto.randomUUID().slice(0, 8)}`
    await page.getByTestId('new-session-open').click()
    await page.getByTestId('new-session-title').fill(title)
    await page.getByTestId('new-session-submit').click()

    await expect(page.getByTestId('created-session')).toBeVisible({ timeout: 20_000 })
    const joinCode = (await page.getByTestId('created-session-joincode').textContent())?.trim()
    expect(joinCode).toBeTruthy()

    // 3) The transaction was ACCEPTED by the schema-enforced live app: the
    //    projection row + its `sessionEvents` envelope landed (acceptance #3).
    await expect
      .poll(
        async () => {
          const res = await queryAdmin({ sessions: { $: { where: { joinCode: joinCode! } } } })
          return res.sessions?.length ?? 0
        },
        { timeout: 20_000 }
      )
      .toBe(1)

    const res = await queryAdmin({ sessions: { $: { where: { joinCode: joinCode! } } } })
    const session = res.sessions[0]
    expect(session.title).toBe(title)

    const events = await queryAdmin({
      sessionEvents: { $: { where: { sessionId: session.id, type: 'SessionCreated' } } },
    })
    expect(events.sessionEvents).toHaveLength(1)
  })
})
