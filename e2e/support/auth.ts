import { init } from '@instantdb/admin'
import { expect, type Page } from '@playwright/test'

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

/** A fresh disposable email so reruns against the shared Instant app never collide. */
export function freshEmail(): string {
  return `e2e+${crypto.randomUUID()}@blended.test`
}

/**
 * e2e-only Node-side admin read for observability assertions (the dual-write is
 * only fully observable against the live app). Throws — the failure surfaces in
 * the test, never swallowed — matching `mintCode`'s convention. Read-only, so
 * re-run safe. Requires `adminAvailable()`; callers gate with `test.skip`.
 */
export async function queryAdmin(query: Record<string, unknown>): Promise<any> {
  const admin = init({
    appId: process.env.PUBLIC_INSTANTDB_APP_ID as string,
    adminToken: process.env.INSTANT_ADMIN_TOKEN as string,
  })
  return admin.query(query as any)
}

/**
 * Drive the real `/login` island to a signed-in state for `email`, replacing
 * only code RETRIEVAL with the admin-minted code (mirrors the inline helper in
 * auth.spec.ts). Shared so every spec that needs an authenticated context signs
 * in the same way. Each assertion failure surfaces in the test — never swallowed.
 * Requires `adminAvailable()`; callers gate with `test.skip(!adminAvailable(), …)`.
 */
export async function signInViaUi(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  // `client:only="react"` island — cold-start hydration can exceed Playwright's
  // 5s default, so give the first assertion a 15s budget.
  await expect(page.getByTestId('auth-email-input')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('auth-email-input').fill(email)
  await page.getByTestId('auth-send').click()
  await expect(page.getByTestId('auth-code-input')).toBeVisible({ timeout: 15_000 })
  // Mint AFTER send so the admin code is the latest-valid one.
  const code = await mintCode(email)
  await page.getByTestId('auth-code-input').fill(code)
  await page.getByTestId('auth-verify').click()
  await expect(page.getByTestId('auth-signed-in')).toBeVisible({ timeout: 15_000 })
}
