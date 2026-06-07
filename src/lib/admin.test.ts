import { describe, it, expect } from 'vitest'
import {
  ADMIN_LEVEL_NONE,
  ADMIN_LEVEL_UBER,
  ADMIN_VALUE_NONE,
  normalizeAdminLevel,
  parseAdminEmails,
  isEmailAllowlisted,
  decideBootstrap,
  buildAdminSessionRows,
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

describe('buildAdminSessionRows', () => {
  it('joins participant and open-question tallies per session', () => {
    const sessions = [
      { id: 's1', title: 'Alpha', status: 'live', teacherId: 't1', createdAt: 1 },
      { id: 's2', title: 'Beta', status: 'draft', teacherId: 't2', createdAt: 2 },
    ]
    const participants = [
      { sessionId: 's1' },
      { sessionId: 's1' },
      { sessionId: 's2' },
    ]
    const questions = [
      { sessionId: 's1', status: 'open' },
      { sessionId: 's1', status: 'answered' },
      { sessionId: 's2', status: 'open' },
    ]
    const rows = buildAdminSessionRows(sessions, participants, questions)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      id: 's1',
      title: 'Alpha',
      status: 'live',
      teacherId: 't1',
      participantCount: 2,
      openQuestionCount: 1, // the 'answered' one is excluded
    })
    expect(rows[1]).toMatchObject({ id: 's2', participantCount: 1, openQuestionCount: 1 })
  })

  it('counts every non-answered status as an open question', () => {
    const sessions = [{ id: 's1', createdAt: 1 }]
    const questions = [
      { sessionId: 's1', status: 'open' },
      { sessionId: 's1', status: 'pending' },
      { sessionId: 's1' }, // absent status → not 'answered' → open
      { sessionId: 's1', status: 'answered' },
    ]
    const rows = buildAdminSessionRows(sessions, [], questions)
    expect(rows[0].openQuestionCount).toBe(3)
  })

  it('yields count 0 for a session with no participants or questions', () => {
    const rows = buildAdminSessionRows([{ id: 's1', createdAt: 1 }], [], [])
    expect(rows[0]).toMatchObject({ participantCount: 0, openQuestionCount: 0 })
  })

  it('ignores a participant referencing an unknown sessionId (no throw)', () => {
    const rows = buildAdminSessionRows(
      [{ id: 's1', createdAt: 1 }],
      [{ sessionId: 's1' }, { sessionId: 'ghost' }, { sessionId: undefined }],
      []
    )
    expect(rows[0].participantCount).toBe(1)
  })

  it('ignores a question referencing an unknown sessionId (no throw)', () => {
    const rows = buildAdminSessionRows(
      [{ id: 's1', createdAt: 1 }],
      [],
      [{ sessionId: 's1', status: 'open' }, { sessionId: 'ghost', status: 'open' }]
    )
    expect(rows[0].openQuestionCount).toBe(1)
  })

  it('normalizes absent/blank optional fields to null and a missing title to the fallback', () => {
    const rows = buildAdminSessionRows(
      [
        { id: 's1', createdAt: 1, title: '   ', activeResourceId: '   ', currentUrl: undefined },
      ],
      [],
      []
    )
    expect(rows[0].title).toBe('(untitled session)')
    expect(rows[0].activeResourceId).toBeNull()
    expect(rows[0].currentUrl).toBeNull()
    expect(ADMIN_VALUE_NONE).toBe('(none)')
  })

  it('carries through present optional resource/url (trimmed)', () => {
    const rows = buildAdminSessionRows(
      [{ id: 's1', createdAt: 1, activeResourceId: ' res-1 ', currentUrl: ' https://x.test ' }],
      [],
      []
    )
    expect(rows[0].activeResourceId).toBe('res-1')
    expect(rows[0].currentUrl).toBe('https://x.test')
  })

  it('orders by createdAt asc, tie-broken by id', () => {
    const sessions = [
      { id: 'b', createdAt: 5 },
      { id: 'a', createdAt: 5 }, // same createdAt → id tie-break: a before b
      { id: 'c', createdAt: 1 }, // oldest first
    ]
    const rows = buildAdminSessionRows(sessions, [], [])
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('treats an absent createdAt as 0 (sorts first) without throwing', () => {
    const rows = buildAdminSessionRows(
      [{ id: 'late', createdAt: 10 }, { id: 'noTs' }],
      [],
      []
    )
    expect(rows.map((r) => r.id)).toEqual(['noTs', 'late'])
  })

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    [[], 'empty'],
  ])('returns [] for %p sessions without throwing', (sessions, _label) => {
    expect(buildAdminSessionRows(sessions as any, null, undefined)).toEqual([])
  })

  it('tolerates null/undefined participant & question args', () => {
    const rows = buildAdminSessionRows([{ id: 's1', createdAt: 1 }], null, undefined)
    expect(rows[0]).toMatchObject({ participantCount: 0, openQuestionCount: 0 })
  })

  it('never leaks an email from a field outside the consumed set', () => {
    // An `@`-bearing field that is NOT part of the consumed projection must not
    // appear in any output row (the helper reads no email).
    const rows = buildAdminSessionRows(
      [{ id: 's1', createdAt: 1, teacherId: 't1', email: 'secret@blended.test' } as any],
      [{ sessionId: 's1', email: 'p@blended.test' } as any],
      []
    )
    expect(JSON.stringify(rows)).not.toContain('@')
  })
})
