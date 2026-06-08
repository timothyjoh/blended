import { describe, expect, it } from 'vitest'
import {
  DEV_LOGIN_NOT_FOUND,
  DEV_LOGIN_SECRET_REQUIRED,
  DEV_LOGIN_UNAUTHORIZED,
  authorizeDevLogin,
  isEnabledFlag,
} from './devAuth'

describe('isEnabledFlag', () => {
  it('accepts explicit truthy deployment flags', () => {
    expect(isEnabledFlag('true')).toBe(true)
    expect(isEnabledFlag('1')).toBe(true)
    expect(isEnabledFlag('yes')).toBe(true)
    expect(isEnabledFlag('on')).toBe(true)
    expect(isEnabledFlag(' TRUE ')).toBe(true)
  })

  it('rejects absent or non-truthy values', () => {
    expect(isEnabledFlag(undefined)).toBe(false)
    expect(isEnabledFlag(null)).toBe(false)
    expect(isEnabledFlag('')).toBe(false)
    expect(isEnabledFlag('false')).toBe(false)
    expect(isEnabledFlag('0')).toBe(false)
  })
})

describe('authorizeDevLogin', () => {
  it('hides the endpoint when disabled', () => {
    expect(
      authorizeDevLogin({
        enabled: false,
        configuredSecret: 'secret',
        providedSecret: 'secret',
      })
    ).toEqual({ allowed: false, status: 404, error: DEV_LOGIN_NOT_FOUND })
  })

  it('fails closed when enabled without a configured server secret', () => {
    expect(
      authorizeDevLogin({
        enabled: true,
        configuredSecret: '',
        providedSecret: 'secret',
      })
    ).toEqual({ allowed: false, status: 500, error: DEV_LOGIN_SECRET_REQUIRED })
  })

  it('rejects a missing or incorrect caller secret', () => {
    expect(
      authorizeDevLogin({
        enabled: true,
        configuredSecret: 'secret',
        providedSecret: '',
      })
    ).toEqual({ allowed: false, status: 401, error: DEV_LOGIN_UNAUTHORIZED })

    expect(
      authorizeDevLogin({
        enabled: true,
        configuredSecret: 'secret',
        providedSecret: 'wrong',
      })
    ).toEqual({ allowed: false, status: 401, error: DEV_LOGIN_UNAUTHORIZED })
  })

  it('allows only the matching secret when enabled', () => {
    expect(
      authorizeDevLogin({
        enabled: true,
        configuredSecret: ' secret ',
        providedSecret: 'secret',
      })
    ).toEqual({ allowed: true })
  })
})
