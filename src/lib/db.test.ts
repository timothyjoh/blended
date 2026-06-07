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

const sessionStarted: EventLike = {
  id: 'evt-3',
  type: 'SessionStarted',
  occurredAt: 3000,
  receivedAt: 3000,
  payload: { id: 's1', status: 'live', startedAt: 3000 },
}

const sessionEnded: EventLike = {
  id: 'evt-4',
  type: 'SessionEnded',
  occurredAt: 4000,
  receivedAt: 4000,
  payload: { id: 's1', status: 'ended', endedAt: 4000 },
}

const chatMessageSubmitted: EventLike = {
  id: 'evt-5',
  type: 'ChatMessageSubmitted',
  occurredAt: 5000,
  receivedAt: 5000,
  payload: { messageId: 'm1', participantId: 'p1', text: 'hello class', createdAt: 5000 },
}

const chatMessageSubmitted2: EventLike = {
  id: 'evt-6',
  type: 'ChatMessageSubmitted',
  occurredAt: 6000,
  receivedAt: 6000,
  payload: { messageId: 'm2', participantId: 'p1', text: 'second message', createdAt: 6000 },
}

const questionCreated: EventLike = {
  id: 'evt-7',
  type: 'QuestionCreated',
  occurredAt: 7000,
  receivedAt: 7000,
  payload: {
    questionId: 'q1',
    messageId: 'm1',
    participantId: 'p1',
    sessionId: 's1',
    status: 'submitted',
    createdAt: 7000,
  },
}

const questionAnswered: EventLike = {
  id: 'evt-8',
  type: 'QuestionAnswered',
  occurredAt: 8000,
  receivedAt: 8000,
  payload: {
    questionId: 'q1',
    sessionId: 's1',
    status: 'answered',
    answerSummary: 'mitosis is cell division',
    addressedBy: 'teacher-1',
  },
}

const questionAnsweredNoSummary: EventLike = {
  id: 'evt-9',
  type: 'QuestionAnswered',
  occurredAt: 9000,
  receivedAt: 9000,
  payload: {
    questionId: 'q1',
    sessionId: 's1',
    status: 'answered',
    addressedBy: 'teacher-1',
  },
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

  it('folds ChatMessageSubmitted keyed by messageId', () => {
    const result = applyEvent(emptyProjection('s1'), chatMessageSubmitted)
    expect(result.messages.m1).toEqual({
      id: 'm1',
      participantId: 'p1',
      text: 'hello class',
      createdAt: 5000,
    })
  })

  it('does not throw on ChatMessageSubmitted (the type is known)', () => {
    expect(() => applyEvent(emptyProjection('s1'), chatMessageSubmitted)).not.toThrow()
  })

  it('accumulates multiple chat messages in the messages map', () => {
    const first = applyEvent(emptyProjection('s1'), chatMessageSubmitted)
    const second = applyEvent(first, chatMessageSubmitted2)
    expect(Object.keys(second.messages)).toEqual(['m1', 'm2'])
    expect(second.messages.m2.text).toBe('second message')
  })

  it('folds ChatMessageSubmitted defensively on a partial payload (no throw)', () => {
    const partial: EventLike = {
      id: 'evt-partial',
      type: 'ChatMessageSubmitted',
      occurredAt: 7000,
      receivedAt: 7000,
      payload: {},
    }
    const result = applyEvent(emptyProjection('s1'), partial)
    // Keyed by the event id when no messageId is present; defaults fill the rest,
    // and createdAt falls back to occurredAt.
    expect(result.messages['evt-partial']).toEqual({
      id: 'evt-partial',
      participantId: '',
      text: '',
      createdAt: 7000,
    })
  })

  it('does not mutate the input projection when folding a chat message', () => {
    const base = emptyProjection('s1')
    applyEvent(base, chatMessageSubmitted)
    expect(base.messages).toEqual({})
  })

  it('folds QuestionCreated keyed by questionId without throwing', () => {
    expect(() => applyEvent(emptyProjection('s1'), questionCreated)).not.toThrow()
    const result = applyEvent(emptyProjection('s1'), questionCreated)
    expect(result.questions.q1).toEqual({
      id: 'q1',
      messageId: 'm1',
      participantId: 'p1',
      sessionId: 's1',
      status: 'submitted',
      createdAt: 7000,
    })
  })

  it('folds QuestionCreated defensively on a partial payload (keys by event id, no throw)', () => {
    const partial: EventLike = {
      id: 'evt-q-partial',
      type: 'QuestionCreated',
      occurredAt: 8000,
      receivedAt: 8000,
      payload: {},
    }
    const result = applyEvent(emptyProjection('s1'), partial)
    // Keyed by event id when no questionId; status defaults to 'submitted',
    // createdAt falls back to occurredAt, sessionId to the projection's session.
    expect(result.questions['evt-q-partial']).toEqual({
      id: 'evt-q-partial',
      messageId: '',
      participantId: '',
      sessionId: 's1',
      status: 'submitted',
      createdAt: 8000,
    })
  })

  it('re-folding the same QuestionCreated reproduces the identical entry (idempotent)', () => {
    const once = applyEvent(emptyProjection('s1'), questionCreated)
    const twice = applyEvent(once, questionCreated)
    expect(twice.questions.q1).toEqual(once.questions.q1)
    expect(Object.keys(twice.questions)).toEqual(['q1'])
  })

  it('does not mutate the input projection when folding a QuestionCreated', () => {
    const base = emptyProjection('s1')
    applyEvent(base, questionCreated)
    expect(base.questions).toEqual({})
  })

  it('folds QuestionAnswered onto a prior question: status → answered, summary + addressedBy applied', () => {
    const created = applyEvent(emptyProjection('s1'), questionCreated)
    const result = applyEvent(created, questionAnswered)
    expect(result.questions.q1).toEqual({
      id: 'q1',
      messageId: 'm1',
      participantId: 'p1',
      sessionId: 's1',
      status: 'answered',
      createdAt: 7000,
      answerSummary: 'mitosis is cell division',
      addressedBy: 'teacher-1',
    })
  })

  it('folds QuestionAnswered without a summary: status → answered, no answerSummary key', () => {
    const created = applyEvent(emptyProjection('s1'), questionCreated)
    const result = applyEvent(created, questionAnsweredNoSummary)
    expect(result.questions.q1.status).toBe('answered')
    expect(result.questions.q1.addressedBy).toBe('teacher-1')
    expect(result.questions.q1).not.toHaveProperty('answerSummary')
  })

  it('folds QuestionAnswered defensively onto an absent prior question (minimal answered row)', () => {
    const result = applyEvent(emptyProjection('s1'), questionAnswered)
    expect(result.questions.q1).toEqual({
      id: 'q1',
      messageId: '',
      participantId: '',
      sessionId: 's1',
      status: 'answered',
      createdAt: 8000,
      answerSummary: 'mitosis is cell division',
      addressedBy: 'teacher-1',
    })
  })

  it('does not throw on QuestionAnswered (the type is known)', () => {
    expect(() => applyEvent(emptyProjection('s1'), questionAnswered)).not.toThrow()
  })

  it('folds QuestionAnswered defensively on a partial payload (keys by event id, fallback sessionId)', () => {
    const partial: EventLike = {
      id: 'evt-qa-partial',
      type: 'QuestionAnswered',
      occurredAt: 9500,
      receivedAt: 9500,
      payload: {},
    }
    const result = applyEvent(emptyProjection('s1'), partial)
    // No questionId → keyed by event id; no sessionId → projection's; no summary
    // or addressedBy keys; status still flips to answered.
    expect(result.questions['evt-qa-partial']).toEqual({
      id: 'evt-qa-partial',
      messageId: '',
      participantId: '',
      sessionId: 's1',
      status: 'answered',
      createdAt: 9500,
    })
  })

  it('re-folding the same QuestionAnswered reproduces the identical entry (idempotent)', () => {
    const created = applyEvent(emptyProjection('s1'), questionCreated)
    const once = applyEvent(created, questionAnswered)
    const twice = applyEvent(once, questionAnswered)
    expect(twice.questions.q1).toEqual(once.questions.q1)
    expect(Object.keys(twice.questions)).toEqual(['q1'])
  })

  it('does not mutate the input projection when folding a QuestionAnswered', () => {
    const created = applyEvent(emptyProjection('s1'), questionCreated)
    applyEvent(created, questionAnswered)
    expect(created.questions.q1.status).toBe('submitted')
    expect(created.questions.q1).not.toHaveProperty('answerSummary')
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

  it('folds SessionStarted into status === live, preserving other fields', () => {
    const created = applyEvent(emptyProjection('s1'), sessionCreated)
    const result = applyEvent(created, sessionStarted)
    expect(result.session).toEqual({
      id: 's1',
      title: 'Algebra',
      status: 'live',
      teacherId: 'teacher-1',
    })
  })

  it('folds SessionEnded into status === ended', () => {
    const created = applyEvent(emptyProjection('s1'), sessionCreated)
    const result = applyEvent(created, sessionEnded)
    expect(result.session?.status).toBe('ended')
  })

  it('does not throw on SessionStarted/SessionEnded (the types are known)', () => {
    expect(() => applyEvent(emptyProjection('s1'), sessionStarted)).not.toThrow()
    expect(() => applyEvent(emptyProjection('s1'), sessionEnded)).not.toThrow()
  })

  it('folds a lifecycle event with no prior session into a minimal session', () => {
    // Out-of-order / partial log: a SessionStarted reaching an empty projection
    // builds a minimal session at the event status rather than throwing.
    const result = applyEvent(emptyProjection('s1'), sessionStarted)
    expect(result.session).toEqual({ id: 's1', title: '', status: 'live', teacherId: '' })
  })

  it('does not mutate the input projection when folding a lifecycle event', () => {
    const created = applyEvent(emptyProjection('s1'), sessionCreated)
    applyEvent(created, sessionStarted)
    expect(created.session?.status).toBe('draft')
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

  it('rebuilds the full lifecycle to status === ended', () => {
    const result = rebuildSessionProjection('s1', [sessionCreated, sessionStarted, sessionEnded])
    expect(result.session?.status).toBe('ended')
    expect(result.session?.title).toBe('Algebra')
  })

  it('folds the full lifecycle deterministically regardless of input order', () => {
    const shuffled = rebuildSessionProjection('s1', [sessionEnded, sessionCreated, sessionStarted])
    const inOrder = rebuildSessionProjection('s1', [sessionCreated, sessionStarted, sessionEnded])
    expect(shuffled).toEqual(inOrder)
    expect(shuffled.session?.status).toBe('ended')
  })

  it('rebuilds a stream including chat messages, regardless of input order', () => {
    const inOrder = rebuildSessionProjection('s1', [
      sessionCreated,
      sessionStarted,
      participantJoined,
      chatMessageSubmitted,
      chatMessageSubmitted2,
    ])
    const shuffled = rebuildSessionProjection('s1', [
      chatMessageSubmitted2,
      participantJoined,
      sessionStarted,
      chatMessageSubmitted,
      sessionCreated,
    ])
    expect(shuffled).toEqual(inOrder)
    expect(Object.keys(inOrder.messages)).toEqual(['m1', 'm2'])
    expect(inOrder.messages.m1.text).toBe('hello class')
    expect(inOrder.session?.status).toBe('live')
    expect(inOrder.participants.p1.username).toBe('ada')
  })

  it('rebuilds a stream including a promoted Question, regardless of input order', () => {
    const inOrder = rebuildSessionProjection('s1', [
      sessionCreated,
      sessionStarted,
      participantJoined,
      chatMessageSubmitted,
      questionCreated,
    ])
    const shuffled = rebuildSessionProjection('s1', [
      questionCreated,
      chatMessageSubmitted,
      participantJoined,
      sessionStarted,
      sessionCreated,
    ])
    expect(shuffled).toEqual(inOrder)
    expect(Object.keys(inOrder.questions)).toEqual(['q1'])
    expect(inOrder.questions.q1).toEqual({
      id: 'q1',
      messageId: 'm1',
      participantId: 'p1',
      sessionId: 's1',
      status: 'submitted',
      createdAt: 7000,
    })
  })

  it('rebuilds a log with QuestionCreated then QuestionAnswered into an answered row', () => {
    const inOrder = rebuildSessionProjection('s1', [
      sessionCreated,
      sessionStarted,
      participantJoined,
      chatMessageSubmitted,
      questionCreated,
      questionAnswered,
    ])
    const shuffled = rebuildSessionProjection('s1', [
      questionAnswered,
      questionCreated,
      chatMessageSubmitted,
      participantJoined,
      sessionStarted,
      sessionCreated,
    ])
    expect(shuffled).toEqual(inOrder)
    expect(Object.keys(inOrder.questions)).toEqual(['q1'])
    expect(inOrder.questions.q1).toEqual({
      id: 'q1',
      messageId: 'm1',
      participantId: 'p1',
      sessionId: 's1',
      status: 'answered',
      createdAt: 7000,
      answerSummary: 'mitosis is cell division',
      addressedBy: 'teacher-1',
    })
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
