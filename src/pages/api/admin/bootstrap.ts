import type { APIRoute } from 'astro'
import { init, tx, id } from '@instantdb/admin'
import { IDENTITY_SCOPE } from '@/lib/auth'
import { ADMIN_LEVEL_UBER, parseAdminEmails, decideBootstrap } from '@/lib/admin'
import { buildEventEnvelope } from '@/lib/db'

// ---------------------------------------------------------------------------
// Server-only admin bootstrap endpoint (cycle 0019, ADR-0003). This is the
// SOLE place an elevated `adminLevel: 'uber'` is ever written, and it runs via
// the ADMIN SDK (`@instantdb/admin`), which BYPASSES the permission rules — so
// the tightened client-side `users` rule (which forbids client elevation) can
// never be the gate here. The caller's InstantDB token is verified server-side;
// only a token-verified email present in the server-only `ADMIN_EMAILS`
// allowlist is elevated, and the elevation is recorded as an append-only
// `AdminBootstrapped` event under `IDENTITY_SCOPE`, transacted ATOMICALLY with
// the `users` update.
//
// Secrets (`INSTANTDB_ADMIN_TOKEN`, `ADMIN_EMAILS`) are read via `process.env`
// (no `PUBLIC_` prefix ⇒ never bundled to the client). Every failure branch
// returns a distinct status with a JSON `{ error }` body and logs
// `[api/admin/bootstrap] …` — nothing is swallowed.
// ---------------------------------------------------------------------------

const ADMIN_BOOTSTRAPPED = 'AdminBootstrapped'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

export const POST: APIRoute = async ({ request }) => {
  const appId = process.env.PUBLIC_INSTANTDB_APP_ID
  const adminToken = process.env.INSTANTDB_ADMIN_TOKEN
  // Admin SDK unavailable → cannot verify a token or perform a rule-bypassing
  // write. Surface a clear 500 and write nothing; the client logs it and the
  // user stays non-admin (the rest of the app remains usable).
  if (!appId || !adminToken) {
    console.error(
      '[api/admin/bootstrap] admin SDK unavailable: INSTANTDB_ADMIN_TOKEN / PUBLIC_INSTANTDB_APP_ID unset'
    )
    return json(500, { error: 'admin-unavailable' })
  }

  const admin = init({ appId, adminToken })

  // Tolerate a missing/garbage body — a malformed request is just an unverifiable
  // (→ 401) token below, never a thrown 500.
  const { token } = (await request.json().catch(() => ({}))) as { token?: string }

  let user: { id?: string; email?: string | null } | null = null
  try {
    user = await admin.auth.verifyToken(token as string) // rejects on missing/invalid/expired
  } catch (err) {
    console.error('[api/admin/bootstrap] token verify failed:', err)
    return json(401, { error: 'unauthorized' })
  }
  if (!user?.id) {
    console.error('[api/admin/bootstrap] token verified but carried no user id')
    return json(401, { error: 'unauthorized' })
  }

  const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS)

  let current: unknown
  try {
    // Read the caller's current level via the admin query seam (bypasses rules).
    const result = (await admin.query({
      users: { $: { where: { id: user.id } } },
    })) as { users?: Array<{ adminLevel?: unknown }> }
    current = result.users?.[0]?.adminLevel
  } catch (err) {
    console.error('[api/admin/bootstrap] current-level query failed:', err)
    return json(500, { error: 'query-failed' })
  }

  const decision = decideBootstrap({
    verifiedEmail: user.email,
    allowlist,
    currentLevel: current,
  })

  // Not allowlisted, empty allowlist, or already-uber → no write, no event.
  if (!decision.elevate) return json(200, { adminLevel: decision.adminLevel })

  try {
    const envelope = buildEventEnvelope(
      ADMIN_BOOTSTRAPPED,
      {
        sessionId: IDENTITY_SCOPE,
        actor: { id: user.id, role: 'system' },
        // No email in the payload — privacy (the verified user id is enough).
        payload: { userId: user.id, adminLevel: ADMIN_LEVEL_UBER },
      },
      Date.now()
    )
    // ONE transaction: the event append + the `users` elevation commit together
    // (atomic — a rejected write leaves neither a half-applied row nor an event).
    await admin.transact([
      tx.sessionEvents[id()].update(envelope),
      tx.users[user.id].update({ adminLevel: ADMIN_LEVEL_UBER }),
    ])
  } catch (err) {
    console.error('[api/admin/bootstrap] elevation transact failed:', err)
    return json(500, { error: 'elevation-failed' })
  }

  return json(200, { adminLevel: ADMIN_LEVEL_UBER })
}
