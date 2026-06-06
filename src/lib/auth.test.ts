import { describe, it, expect } from 'vitest'
import {
  IDENTITY_SCOPE,
  USER_SIGNED_IN,
  isValidEmail,
  deriveUsername,
  shouldCreateUserRow,
} from './auth'

describe('IDENTITY_SCOPE / USER_SIGNED_IN constants', () => {
  it('reserves a stable non-session sentinel scope', () => {
    expect(IDENTITY_SCOPE).toBe('identity')
  })

  it('names the identity-scope event type', () => {
    expect(USER_SIGNED_IN).toBe('UserSignedIn')
  })
})

describe('isValidEmail', () => {
  it('accepts a well-formed address', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('jane.doe@school.edu')).toBe(true)
  })

  it('trims surrounding whitespace before validating', () => {
    expect(isValidEmail('  a@b.co  ')).toBe(true)
  })

  // Failure paths (SPEC §43): empty/whitespace/malformed must be rejected so the
  // form surfaces a validation message and never calls sendMagicCode.
  it.each(['', '   ', 'foo', 'foo@', '@bar.com', 'a b@c.com', 'a@b'])(
    'rejects the invalid input %p',
    (bad) => {
      expect(isValidEmail(bad)).toBe(false)
    }
  )

  it('rejects null/undefined without throwing', () => {
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(undefined)).toBe(false)
  })
})

describe('deriveUsername', () => {
  it('returns the local-part of an email', () => {
    expect(deriveUsername('jane.doe@school.edu')).toBe('jane.doe')
  })

  it('returns the whole string when there is no @', () => {
    expect(deriveUsername('nobody')).toBe('nobody')
  })

  it('returns empty for empty/null/undefined input', () => {
    expect(deriveUsername('')).toBe('')
    expect(deriveUsername(null)).toBe('')
    expect(deriveUsername(undefined)).toBe('')
  })
})

describe('shouldCreateUserRow', () => {
  const allClear = {
    authUserId: 'auth-1',
    usersLoaded: true,
    existingUserCount: 0,
    inFlight: false,
  }

  it('returns true only when id present, query loaded, no row, nothing in flight', () => {
    expect(shouldCreateUserRow(allClear)).toBe(true)
  })

  // Failure / guard paths — each disqualifying condition must block creation so
  // no duplicate row is written across reloads or repeat sign-ins (SPEC §41).
  it('returns false when there is no auth user id', () => {
    expect(shouldCreateUserRow({ ...allClear, authUserId: null })).toBe(false)
    expect(shouldCreateUserRow({ ...allClear, authUserId: undefined })).toBe(false)
    expect(shouldCreateUserRow({ ...allClear, authUserId: '' })).toBe(false)
  })

  it('returns false when the users query has not loaded yet', () => {
    expect(shouldCreateUserRow({ ...allClear, usersLoaded: false })).toBe(false)
  })

  it('returns false when a row already exists (idempotent)', () => {
    expect(shouldCreateUserRow({ ...allClear, existingUserCount: 1 })).toBe(false)
    expect(shouldCreateUserRow({ ...allClear, existingUserCount: 5 })).toBe(false)
  })

  it('returns false when a creation write is already in flight', () => {
    expect(shouldCreateUserRow({ ...allClear, inFlight: true })).toBe(false)
  })
})
