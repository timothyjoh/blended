export const DEV_LOGIN_NOT_FOUND = 'not-found'
export const DEV_LOGIN_SECRET_REQUIRED = 'secret-required'
export const DEV_LOGIN_UNAUTHORIZED = 'unauthorized'

export type DevLoginDecision =
  | { allowed: true }
  | { allowed: false; status: 404 | 401 | 500; error: string }

export function isEnabledFlag(raw: string | null | undefined): boolean {
  if (!raw) return false
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

export function authorizeDevLogin(input: {
  enabled: boolean
  configuredSecret: string | null | undefined
  providedSecret: string | null | undefined
}): DevLoginDecision {
  if (!input.enabled) return { allowed: false, status: 404, error: DEV_LOGIN_NOT_FOUND }

  const configuredSecret = input.configuredSecret?.trim()
  if (!configuredSecret) {
    return { allowed: false, status: 500, error: DEV_LOGIN_SECRET_REQUIRED }
  }

  const providedSecret = input.providedSecret?.trim()
  if (!providedSecret || providedSecret !== configuredSecret) {
    return { allowed: false, status: 401, error: DEV_LOGIN_UNAUTHORIZED }
  }

  return { allowed: true }
}
