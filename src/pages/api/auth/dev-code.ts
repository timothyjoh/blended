import type { APIRoute } from 'astro'
import { init } from '@instantdb/admin'
import { isValidEmail } from '@/lib/auth'
import { authorizeDevLogin, isEnabledFlag } from '@/lib/devAuth'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
    },
  })

export const POST: APIRoute = async ({ request }) => {
  const { email, secret } = (await request.json().catch(() => ({}))) as {
    email?: string
    secret?: string
  }

  const decision = authorizeDevLogin({
    enabled: isEnabledFlag(process.env.PUBLIC_DEV_LOGIN_ENABLED),
    configuredSecret: process.env.DEV_LOGIN_SECRET,
    providedSecret: secret,
  })

  if (!decision.allowed) return json(decision.status, { error: decision.error })

  const normalizedEmail = email?.trim() ?? ''
  if (!isValidEmail(normalizedEmail)) return json(400, { error: 'invalid-email' })

  const appId = process.env.PUBLIC_INSTANTDB_APP_ID
  const adminToken = process.env.INSTANTDB_ADMIN_TOKEN
  if (!appId || !adminToken) {
    console.error('[api/auth/dev-code] admin SDK unavailable')
    return json(500, { error: 'admin-unavailable' })
  }

  try {
    const admin = init({ appId, adminToken })
    const { code } = await admin.auth.generateMagicCode(normalizedEmail)
    return json(200, { code })
  } catch (err) {
    console.error('[api/auth/dev-code] magic-code mint failed:', err)
    return json(500, { error: 'code-mint-failed' })
  }
}
