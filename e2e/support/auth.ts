import { init } from '@instantdb/admin'

// ---------------------------------------------------------------------------
// Deterministic magic-code seam for the auth e2e suite. InstantDB ships no
// client-side fixed test code, so we mint a server-valid code via the ADMIN SDK
// (`generateMagicCode`, which returns a valid code WITHOUT sending an email).
// This is e2e-only: the admin token is Node-side, never exposed to product/
// client code. When the token is absent the spec skips loudly (never a false
// green) — see e2e/auth.spec.ts.
// ---------------------------------------------------------------------------

/** True only when both the app id and the e2e-only admin token are present. */
export function adminAvailable(): boolean {
  return !!process.env.INSTANT_ADMIN_TOKEN && !!process.env.PUBLIC_INSTANTDB_APP_ID
}

/**
 * Mint a fresh, server-valid magic code for `email`. Must be called AFTER the UI
 * "send code" click so the admin-minted code is the latest-valid one. Throws if
 * the admin call fails — the failure surfaces in the test, never swallowed.
 */
export async function mintCode(email: string): Promise<string> {
  const admin = init({
    appId: process.env.PUBLIC_INSTANTDB_APP_ID as string,
    adminToken: process.env.INSTANT_ADMIN_TOKEN as string,
  })
  const { code } = await admin.auth.generateMagicCode(email)
  return code
}
