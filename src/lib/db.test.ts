import { describe, it, expect } from 'vitest'
import {
  requireAppId,
  applyEvent,
  rebuildSessionProjection,
  emptyProjection,
  compareEvents,
  writeEvent,
  UnknownEventTypeError,
  type EventLike,
  type ProjectionTxn,
} from './db'

// A non-empty stand-in projection txn list for validation cases that must throw
// BEFORE `db.transact()` is reached — these chunks are never submitted.
const dummyTxns = [{} as ProjectionTxn]

describe('requireAppId', () => {
  it('returns a non-empty value unchanged', () => {
    expect(requireAppId('9199c9db')).toBe('9199c9db')
  })

  it('throws a descriptive error on an empty string', () => {
    expect(() => requireAppId('')).toThrow(/PUBLIC_INSTANTDB_APP_ID is missing or empty/)
  })

  it('throws on a whitespace-only string', () => {
    expect(() => requireAppId('   ')).toThrow(/PUBLIC_INSTANTDB_APP_ID is missing or empty/)
  })

  it('throws on undefined', () => {
    expect(() => requireAppId(undefined)).toThrow(/PUBLIC_INSTANTDB_APP_ID is missing or empty/)
  })
})

const sessionCreated: EventLike = {
  id: 'evt-1',
  type: 'SessionCreated',
  occurredAt: 1000,
  receivedAt: 1000,
  payload: { id: 's1', title: 'Algebra', teacherId: 'teacher-1' },
}

const participantJoined: EventLike = {
  id: 'evt-2',
  type: 'ParticipantJoined',
  occurredAt: 2000,
  receivedAt: 2000,
  payload: { participantId: 'p1', userId: 'u1', role: 'student', username: 'ada' },
}

describe('applyEvent', () => {
  it('folds SessionCreated into the session projection', () => {
    const result = applyEvent(emptyProjection('s1'), sessionCreated)
    expect(result.session).toEqual({
      id: 's1',
      title: 'Algebra',
      status: 'draft',
      teacherId: 'teacher-1',
    })
  })

  it('folds ParticipantJoined keyed by participantId', () => {
    const result = applyEvent(emptyProjection('s1'), participantJoined)
    expect(result.participants.p1).toEqual({
      id: 'p1',
      userId: 'u1',
      role: 'student',
      username: 'ada',
    })
  })

  it('surfaces an unknown event type instead of dropping it', () => {
    const unknown: EventLike = {
      id: 'evt-x',
      type: 'NopeEvent',
      occurredAt: 1,
      receivedAt: 1,
      payload: {},
    }
    expect(() => applyEvent(emptyProjection('s1'), unknown)).toThrow(UnknownEventTypeError)
    expect(() => applyEvent(emptyProjection('s1'), unknown)).toThrow(/Unknown event type: NopeEvent/)
  })

  it('does not mutate the input projection', () => {
    const base = emptyProjection('s1')
    applyEvent(base, sessionCreated)
    expect(base.session).toBeNull()
  })

  it('does NOT fold an identity-scope UserSignedIn event into a session', () => {
    // Locks the cycle-0002 decision: identity events (written under the
    // IDENTITY_SCOPE sentinel by useAuth) live outside the session fold. If
    // someone ever adds a UserSignedIn case here, this guard fails loudly so
    // identity writes are never accidentally projected into a session.
    const identityEvent: EventLike = {
      id: 'evt-identity',
      type: 'UserSignedIn',
      occurredAt: 1,
      receivedAt: 1,
      payload: { userId: 'auth-1', username: 'jane' },
    }
    expect(() => applyEvent(emptyProjection('identity'), identityEvent)).toThrow(
      UnknownEventTypeError
    )
  })
})

describe('rebuildSessionProjection determinism', () => {
  it('produces identical results for in-order and out-of-order input', () => {
    const inOrder = rebuildSessionProjection('s1', [sessionCreated, participantJoined])
    const outOfOrder = rebuildSessionProjection('s1', [participantJoined, sessionCreated])
    expect(outOfOrder).toEqual(inOrder)
    expect(inOrder.session?.title).toBe('Algebra')
    expect(inOrder.participants.p1.username).toBe('ada')
  })

  it('orders by occurredAt, then receivedAt, then id (§17.1)', () => {
    const a: EventLike = { id: 'b', type: 'X', occurredAt: 5, receivedAt: 9, payload: {} }
    const b: EventLike = { id: 'a', type: 'X', occurredAt: 5, receivedAt: 9, payload: {} }
    const c: EventLike = { id: 'c', type: 'X', occurredAt: 5, receivedAt: 1, payload: {} }
    const d: EventLike = { id: 'd', type: 'X', occurredAt: 1, receivedAt: 99, payload: {} }
    const sorted = [a, b, c, d].sort(compareEvents).map((e) => e.id)
    // occurredAt asc → d(1) first; among occurredAt 5, receivedAt asc → c(1) then
    // the receivedAt-9 pair tie-broken by id → a then b.
    expect(sorted).toEqual(['d', 'c', 'a', 'b'])
  })

  it('surfaces an unknown type while rebuilding (no silent drop)', () => {
    const events: EventLike[] = [
      sessionCreated,
      { id: 'evt-z', type: 'MysteryEvent', occurredAt: 3000, receivedAt: 3000, payload: {} },
    ]
    expect(() => rebuildSessionProjection('s1', events)).toThrow(UnknownEventTypeError)
  })
})

describe('writeEvent input validation (throws before any transaction)', () => {
  const validMeta = {
    sessionId: 's1',
    actor: { id: 'u1', role: 'teacher' as const },
    payload: {},
  }

  it('throws when `type` is missing', () => {
    expect(() => writeEvent('', validMeta, dummyTxns)).toThrow(/`type` is required/)
  })

  it('throws when `sessionId` is missing', () => {
    expect(() =>
      writeEvent('SessionCreated', { ...validMeta, sessionId: '' }, dummyTxns)
    ).toThrow(/`sessionId` is required/)
  })

  it('throws when `actor` is missing', () => {
    expect(() =>
      // @ts-expect-error intentionally omitting actor to exercise the guard
      writeEvent('SessionCreated', { sessionId: 's1', payload: {} }, dummyTxns)
    ).toThrow(/`actor` with a role is required/)
  })

  it('throws on an invalid actor.role', () => {
    expect(() =>
      // @ts-expect-error intentionally invalid role
      writeEvent('SessionCreated', { ...validMeta, actor: { id: 'u1', role: 'wizard' } }, dummyTxns)
    ).toThrow(/invalid actor.role "wizard"/)
  })

  it('throws on a non-integer schemaVersion', () => {
    expect(() =>
      writeEvent('SessionCreated', { ...validMeta, schemaVersion: 1.5 }, dummyTxns)
    ).toThrow(/`schemaVersion` must be an integer/)
  })

  it('throws on an empty projectionTxns array (no projection-only writes)', () => {
    expect(() => writeEvent('SessionCreated', validMeta, [])).toThrow(/non-empty array/)
  })

  it('throws when projectionTxns is not an array', () => {
    expect(() =>
      // @ts-expect-error intentionally wrong type
      writeEvent('SessionCreated', validMeta, undefined)
    ).toThrow(/non-empty array/)
  })
})
