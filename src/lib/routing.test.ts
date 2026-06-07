import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LANDING,
  safeNextPath,
  loginRedirectTarget,
  authorizeOwnership,
} from './routing'

describe('DEFAULT_LANDING', () => {
  it('is the role-aware default destination', () => {
    expect(DEFAULT_LANDING).toBe('/dashboard')
  })
})

describe('safeNextPath', () => {
  it('passes through a same-origin absolute path', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard')
  })

  it('preserves pathname + search of a deep link', () => {
    expect(safeNextPath('/dashboard/sessions/abc?x=1')).toBe('/dashboard/sessions/abc?x=1')
  })

  // Failure paths (SPEC §43 / acceptance bullet): a crafted `next` must NEVER
  // drive an off-origin navigation — each hostile/empty/missing input collapses
  // to the safe default rather than being honored.
  it.each([
    ['', 'empty string'],
    ['//evil.example.com', 'protocol-relative host'],
    ['/\\evil.example.com', 'backslash protocol-relative'],
    ['https://evil.example.com', 'absolute URL with scheme'],
    ['http://evil.example.com', 'http scheme'],
    ['evil', 'bare relative token'],
    ['javascript:alert(1)', 'javascript scheme'],
    ['/foo\r\nSet-Cookie: x', 'CRLF smuggling'],
    ['/foo\tbar', 'tab control char'],
  ])('discards %p (%s) and resolves to /dashboard', (raw) => {
    expect(safeNextPath(raw)).toBe('/dashboard')
  })

  it('rejects null/undefined without throwing', () => {
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath(undefined)).toBe('/dashboard')
  })
})

describe('loginRedirectTarget', () => {
  it('encodes pathname into the next param', () => {
    expect(loginRedirectTarget({ pathname: '/dashboard', search: '' })).toBe(
      '/login?next=%2Fdashboard'
    )
  })

  it('encodes pathname + search and round-trips back to the original destination', () => {
    const out = loginRedirectTarget({ pathname: '/dashboard/sessions/abc', search: '?x=1' })
    expect(out).toBe('/login?next=%2Fdashboard%2Fsessions%2Fabc%3Fx%3D1')
    const next = new URLSearchParams(out.split('?')[1]).get('next')
    expect(next).toBe('/dashboard/sessions/abc?x=1')
    // And the round-tripped value is itself a safe same-origin path.
    expect(safeNextPath(next)).toBe('/dashboard/sessions/abc?x=1')
  })
})

describe('authorizeOwnership', () => {
  it('authorizes only when the signed-in user owns the row', () => {
    expect(
      authorizeOwnership({ userId: 'u1', ownerId: 'u1', loading: false, error: false })
    ).toBe('authorized')
  })

  it('reports loading while the query is unresolved', () => {
    expect(
      authorizeOwnership({ userId: 'u1', ownerId: null, loading: true, error: false })
    ).toBe('loading')
  })

  // Failure paths: error wins over everything (no infinite spinner), a foreign
  // owner is denied, and a missing user/owner (zero-row id) is denied.
  it('denies on query error even while loading', () => {
    expect(
      authorizeOwnership({ userId: 'u1', ownerId: 'u1', loading: true, error: true })
    ).toBe('denied')
  })

  it('denies a different user (ownership mismatch)', () => {
    expect(
      authorizeOwnership({ userId: 'u2', ownerId: 'u1', loading: false, error: false })
    ).toBe('denied')
  })

  it.each([
    [null, 'u1', 'missing user'],
    ['u1', null, 'missing owner / zero-row id'],
    [undefined, undefined, 'both missing'],
    ['', 'u1', 'empty user id'],
  ])('denies when ids are absent: user=%p owner=%p (%s)', (userId, ownerId, _label) => {
    expect(authorizeOwnership({ userId, ownerId, loading: false, error: false })).toBe('denied')
  })
})
