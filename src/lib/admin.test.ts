import { describe, it, expect } from 'vitest'
import {
  ADMIN_LEVEL_NONE,
  ADMIN_LEVEL_UBER,
  normalizeAdminLevel,
  parseAdminEmails,
  isEmailAllowlisted,
  decideBootstrap,
} from './admin'

describe('admin level constants', () => {
  it('are the named domain values', () => {
    expect(ADMIN_LEVEL_NONE).toBe('none')
    expect(ADMIN_LEVEL_UBER).toBe('uber')
  })
})

describe('normalizeAdminLevel', () => {
  it('passes through the elevated value', () => {
    expect(normalizeAdminLevel('uber')).toBe('uber')
  })

  // Anything not EXACTLY 'uber' → 'none' (legacy number/absent/garbage safe).
  it.each([
    ['none', 'the explicit non-elevated value'],
    [0, 'legacy numeric placeholder zero'],
    [1, 'legacy numeric one'],
    [undefined, 'absent'],
    [null, 'null'],
    ['UBER', 'wrong case'],
    ['Uber', 'mixed case'],
    [' uber ', 'padded'],
    ['admin', 'unknown string'],
    [{}, 'object'],
    [['uber'], 'array'],
    [true, 'boolean'],
  ])('maps %p (%s) to none — never throws', (raw, _label) => {
    expect(normalizeAdminLevel(raw)).toBe('none')
  })
})

describe('parseAdminEmails', () => {
  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    [',\n,  ,', 'only separators'],
  ])('returns [] for %p (%s)', (raw, _label) => {
    expect(parseAdminEmails(raw)).toEqual([])
  })

  it('trims and lowercases entries', () => {
    expect(parseAdminEmails('  Admin@Blended.TEST ')).toEqual(['admin@blended.test'])
  })

  it('splits on commas and whitespace (mixed)', () => {
    expect(parseAdminEmails('a@x.com, b@x.com\tc@x.com\nd@x.com')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
    ])
  })

  it('de-dupes case-insensitively', () => {
    expect(parseAdminEmails('a@x.com, A@X.COM, a@x.com')).toEqual(['a@x.com'])
  })
})

describe('isEmailAllowlisted', () => {
  const allow = ['admin@blended.test', 'ops@blended.test']

  it('matches case-insensitively (and trims)', () => {
    expect(isEmailAllowlisted('ADMIN@Blended.test', allow)).toBe(true)
    expect(isEmailAllowlisted('  ops@blended.test  ', allow)).toBe(true)
  })

  it('rejects a non-member', () => {
    expect(isEmailAllowlisted('nobody@blended.test', allow)).toBe(false)
  })

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    ['', 'empty'],
  ])('rejects a missing email %p (%s) without throwing', (email, _label) => {
    expect(isEmailAllowlisted(email, allow)).toBe(false)
  })

  it('rejects everything against an empty allowlist', () => {
    expect(isEmailAllowlisted('admin@blended.test', [])).toBe(false)
  })
})

describe('decideBootstrap', () => {
  const allow = ['admin@blended.test']

  it('elevates an allowlisted, not-yet-uber caller', () => {
    expect(
      decideBootstrap({ verifiedEmail: 'admin@blended.test', allowlist: allow, currentLevel: 'none' })
    ).toEqual({ elevate: true, adminLevel: 'uber' })
  })

  it('elevates an allowlisted caller with a legacy numeric level', () => {
    expect(
      decideBootstrap({ verifiedEmail: 'admin@blended.test', allowlist: allow, currentLevel: 0 })
    ).toEqual({ elevate: true, adminLevel: 'uber' })
  })

  // Idempotency: an already-uber user is never re-elevated (no duplicate write/event).
  it('does not re-elevate an already-uber caller', () => {
    expect(
      decideBootstrap({ verifiedEmail: 'admin@blended.test', allowlist: allow, currentLevel: 'uber' })
    ).toEqual({ elevate: false, adminLevel: 'uber' })
  })

  // Even off the allowlist, an already-uber row stays uber (idempotent, never demotes here).
  it('keeps an already-uber caller uber even when not allowlisted', () => {
    expect(
      decideBootstrap({ verifiedEmail: 'stranger@blended.test', allowlist: allow, currentLevel: 'uber' })
    ).toEqual({ elevate: false, adminLevel: 'uber' })
  })

  // Failure path: a verified-but-not-allowlisted caller is left none, no elevate.
  it('does not elevate a non-allowlisted caller', () => {
    expect(
      decideBootstrap({ verifiedEmail: 'stranger@blended.test', allowlist: allow, currentLevel: 'none' })
    ).toEqual({ elevate: false, adminLevel: 'none' })
  })

  // Failure path: an empty/unset allowlist bootstraps no one.
  it('does not elevate against an empty allowlist', () => {
    expect(
      decideBootstrap({ verifiedEmail: 'admin@blended.test', allowlist: [], currentLevel: 'none' })
    ).toEqual({ elevate: false, adminLevel: 'none' })
  })

  it('does not elevate a missing email', () => {
    expect(
      decideBootstrap({ verifiedEmail: null, allowlist: allow, currentLevel: 'none' })
    ).toEqual({ elevate: false, adminLevel: 'none' })
  })
})
