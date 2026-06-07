// Cycle 0014 walkthrough — Tighten `messages` from fail-open to participant-
// scoped create + row-owner/owning-teacher update/delete (reads stay open).
//
// This cycle ships NO new product UI — it is a data-layer authorization change.
// Its observable effects are:
//   (a) a legitimate student chat send STILL works end-to-end over the real
//       /s/:joinCode route, and the message renders in the live cross-student
//       stream (proving reads stay open by design), and
//   (b) a forged/non-author write is now DENIED at the data layer.
//
// The positive legs (a) are driven over real, non-home routes:
//   01 — student A signs in, joins a live session, sends a chat message that
//        renders in A's stream (`student-chat-message-item`).
//   02 — a SECOND student B opens the SAME /s/:joinCode and sees A's message
//        stream in live (open cross-student read preserved).
//
// The denial legs (b) require BOTH the live-pushed tightened rules (Task 3) AND
// a raw `messages` write target. `PermsProbe` (/dev/perms-probe) exposes raw
// session/resource/undeclared-entity write targets but NO `messages` target, and
// adding product/probe UI for it is out of scope (SPEC). So — exactly as the
// PLAN's "If no observable UI / PermsProbe lacks the target" clause prescribes —
// the denial legs DEGRADE LOUDLY (a one-line stderr diagnostic) rather than
// fabricating a denial, while still capturing the real dev probe surface:
//   03 — /dev/perms-probe mounted (the observable authorization-probe seam),
//        with a loud note that the messages-denial legs need the live push +
//        a messages probe target.
//
// Runnable under a bare `node` — deps are `playwright` + `@instantdb/admin`
// (both already in node_modules; no project `.ts` imports). Auth uses the
// deterministic admin magic-code seam (never a real inbox). When the admin env
// is unset, the walkthrough DEGRADES LOUDLY — capturing the login surface with a
// one-line diagnostic — never silently falling back to the home page.

import { init } from '@instantdb/admin'

const APP_ID = process.env.PUBLIC_INSTANTDB_APP_ID
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN

const freshEmail = () => `walk+${crypto.randomUUID()}@blended.test`

async function mintCode(email) {
  const admin = init({ appId: APP_ID, adminToken: ADMIN_TOKEN })
  const { code } = await admin.auth.generateMagicCode(email)
  return code
}

/** Sign `page` in via the deterministic admin magic-code seam (never an inbox). */
async function signIn(page, baseURL) {
  const email = freshEmail()
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('auth-email-input').fill(email)
  await page.getByTestId('auth-send').click()
  await page.getByTestId('auth-code-input').waitFor({ state: 'visible', timeout: 30_000 })
  const code = await mintCode(email)
  await page.getByTestId('auth-code-input').fill(code)
  await page.getByTestId('auth-verify').click()
  await page.getByTestId('auth-signed-in').waitFor({ state: 'visible', timeout: 30_000 })
  return email
}

export default async ({ page, baseURL, capture }) => {
  if (!APP_ID || !ADMIN_TOKEN) {
    process.stderr.write(
      '[walkthrough-0014] INSTANT_ADMIN_TOKEN/PUBLIC_INSTANTDB_APP_ID unset — ' +
        'cannot sign in to drive the real chat send/stream or the live tightened rules; ' +
        'capturing the login surface only\n'
    )
    await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
    await page.getByTestId('auth-email-input').waitFor({ state: 'visible', timeout: 30_000 })
    await capture('01-login-admin-env-missing')
    return
  }

  const browser = page.context().browser()

  // --- Teacher: create + start a session, exposing its join code -----------
  const teacherCtx = await browser.newContext()
  const teacher = await teacherCtx.newPage()
  await signIn(teacher, baseURL)
  await teacher.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
  await teacher.getByTestId('dashboard-root').waitFor({ state: 'visible', timeout: 30_000 })
  await teacher.getByTestId('new-session-open').click()
  await teacher.getByTestId('new-session-title').fill(`Chat ${crypto.randomUUID().slice(0, 8)}`)
  await teacher.getByTestId('new-session-submit').click()
  await teacher.getByTestId('created-session').waitFor({ state: 'visible', timeout: 30_000 })
  await teacher.getByTestId('created-session-link').click()
  await teacher.getByTestId('session-status').waitFor({ state: 'visible', timeout: 30_000 })
  await teacher.getByTestId('session-start').click()
  // Wait on the explicit live status, never `networkidle` (InstantDB keeps the
  // realtime socket busy).
  await teacher
    .getByTestId('session-status')
    .filter({ hasText: /live/i })
    .waitFor({ state: 'visible', timeout: 30_000 })
  const code = (await teacher.getByTestId('session-joincode').textContent())?.trim()
  if (!code) throw new Error('[walkthrough-0014] live session exposed no join code')

  // --- Student A (the recorded page): join + send a chat message -----------
  await signIn(page, baseURL)
  await page.goto(`${baseURL}/join/${code}`, { waitUntil: 'load' })
  await page.getByTestId('student-chat-root').waitFor({ state: 'visible', timeout: 30_000 })
  const message = `hello ${crypto.randomUUID().slice(0, 8)}`
  await page.getByTestId('student-chat-input').fill(message)
  await page.getByTestId('student-chat-send').click()
  // The legitimate send still satisfies the tightened create rule (the txn sets
  // the `messageParticipant` link) — A's message renders in A's own stream.
  await page
    .getByTestId('student-chat-message-item')
    .filter({ hasText: message })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  // 01 — legitimate send still succeeds end-to-end.
  await capture('01-student-a-sends')

  // --- Student B (second context): sees A's message stream in live ---------
  const bCtx = await browser.newContext()
  const b = await bCtx.newPage()
  await signIn(b, baseURL)
  await b.goto(`${baseURL}/join/${code}`, { waitUntil: 'load' })
  await b.getByTestId('student-chat-root').waitFor({ state: 'visible', timeout: 30_000 })
  // Open cross-student READ is preserved by design — B sees A's message with no
  // reload (the live stream still renders for everyone).
  await b
    .getByTestId('student-chat-message-item')
    .filter({ hasText: message })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await capture('02-student-b-sees-stream')

  // --- Denial legs: degrade loudly (out-of-scope to add a messages probe) ---
  // The spoofed-create and non-author update/delete denials are enforced at the
  // data layer once the tightened rules are pushed live (Task 3), but the dev
  // `PermsProbe` exposes no raw `messages` write target and adding one is out of
  // scope (SPEC). Per the PLAN, degrade LOUDLY rather than fabricating a denial,
  // while still capturing the real authorization-probe surface.
  process.stderr.write(
    '[walkthrough-0014] denial legs (spoofed messages-create, non-author ' +
      'update/delete) are NOT demonstrated here: PermsProbe exposes no raw ' +
      '`messages` write target and adding probe/product UI is out of scope; the ' +
      'denials are pinned by the perms structural guard (src/lib/perms.test.ts) ' +
      'and enforced live after `push schema` + `perms:push` (Task 3). Capturing ' +
      'the probe surface only for the denial legs.\n'
  )
  await page.goto(`${baseURL}/dev/perms-probe`, { waitUntil: 'load' })
  await page.getByTestId('perms-probe').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('probe-self-id').waitFor({ state: 'visible', timeout: 30_000 })
  // 03 — the authorization-probe seam (denial legs degraded loudly, see stderr).
  await capture('03-perms-probe-surface')

  await teacherCtx.close()
  await bCtx.close()
}
