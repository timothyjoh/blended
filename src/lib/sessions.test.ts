import { describe, it, expect } from 'vitest'
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  generateJoinCode,
  buildSessionCreate,
  createSession,
  assertLegalTransition,
  buildSessionStart,
  buildSessionEnd,
  startSession,
  endSession,
  isJoinEnabled,
  buildParticipantJoin,
  shouldCreateParticipant,
  joinSession,
  buildChatMessage,
  shouldSubmitChatMessage,
  submitChatMessage,
  buildQuestion,
  buildQuestionAnswer,
  answerQuestion,
  SESSION_LIST_TITLE_FALLBACK,
  sessionDisplayTitle,
  compareSessionsForList,
  type SessionListRow,
} from './sessions'
import { deriveQuestionId } from './classify'
import { deriveUsername } from './auth'

describe('generateJoinCode', () => {
  it('returns a code of the pinned length', () => {
    expect(generateJoinCode().length).toBe(JOIN_CODE_LENGTH)
  })

  it('draws only from the allowed unambiguous charset', () => {
    const code = generateJoinCode()
    for (const ch of code) expect(JOIN_CODE_ALPHABET).toContain(ch)
  })

  it('is reproducible under an injected deterministic RNG (determinism)', () => {
    const rng = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i))
    expect(generateJoinCode(rng)).toBe(generateJoinCode(rng))
    // Pin the exact mapping so a charset/length change is caught.
    expect(generateJoinCode(rng)).toBe(JOIN_CODE_ALPHABET.slice(0, JOIN_CODE_LENGTH))
  })

  it('maps each byte modulo the alphabet length', () => {
    // A byte at exactly the alphabet length wraps back to index 0.
    const rng = (n: number) =>
      new Uint8Array(Array.from({ length: n }, () => JOIN_CODE_ALPHABET.length))
    expect(generateJoinCode(rng)).toBe(JOIN_CODE_ALPHABET[0].repeat(JOIN_CODE_LENGTH))
  })

  it('two successive real-CSPRNG calls differ (unguessability)', () => {
    expect(generateJoinCode()).not.toBe(generateJoinCode())
  })
})

describe('buildSessionCreate', () => {
  const ok = { title: '  Algebra  ', teacherId: 'u1', sessionId: 's1', joinCode: 'CODE', now: 100 }

  it('builds a draft projection record with trimmed title and pinned defaults', () => {
    const { record } = buildSessionCreate(ok)
    expect(record).toEqual({
      id: 's1',
      title: 'Algebra',
      status: 'draft',
      teacherId: 'u1',
      joinCode: 'CODE',
      createdAt: 100,
      interactionMode: 'none',
    })
  })

  it('builds meta with a teacher actor and sessionId === payload.id', () => {
    const { meta } = buildSessionCreate(ok)
    expect(meta.actor).toEqual({ id: 'u1', role: 'teacher' })
    expect(meta.sessionId).toBe('s1')
    expect(meta.payload).toEqual({ id: 's1', title: 'Algebra', teacherId: 'u1' })
  })

  it('defaults sessionId, joinCode and createdAt when not injected', () => {
    const { record, meta } = buildSessionCreate({ title: 'Bio', teacherId: 'u2' })
    expect(record.id).toBeTruthy()
    expect(record.id).toBe(meta.sessionId)
    expect(record.joinCode.length).toBe(JOIN_CODE_LENGTH)
    expect(typeof record.createdAt).toBe('number')
  })

  // Failure path: blank/whitespace title rejected BEFORE any plan/txn is built.
  it.each(['', '   ', '\t\n'])('rejects blank/whitespace title %p before any plan', (bad) => {
    expect(() => buildSessionCreate({ ...ok, title: bad })).toThrow(/title is required/)
  })

  // Failure path: a missing teacherId (signed-out) is rejected.
  it.each([null, undefined, ''])('rejects a missing teacherId %p', (bad) => {
    expect(() => buildSessionCreate({ ...ok, teacherId: bad as unknown as string })).toThrow(
      /signed in/
    )
  })
})

describe('createSession', () => {
  it('returns the created draft record on a successful write', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    const rec = await createSession(
      { title: '  Bio  ', teacherId: 'u9' },
      { write: write as never, buildTxn: () => ({}) as never }
    )
    expect(rec.status).toBe('draft')
    expect(rec.teacherId).toBe('u9')
    expect(rec.title).toBe('Bio')
    expect(calls).toHaveLength(1)
    // One transaction carrying exactly one projection txn alongside the event.
    expect(calls[0][0]).toBe('SessionCreated')
    expect(calls[0][2]).toHaveLength(1)
  })

  // Failure path: a rejected write propagates — it is not swallowed.
  it('propagates (does not swallow) a rejected write', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      createSession(
        { title: 'Bio', teacherId: 'u9' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/permission denied/)
  })

  // Failure path: invalid input throws before write is ever called.
  it('rejects synchronously on invalid input without calling write', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      createSession(
        { title: '  ', teacherId: 'u9' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/title is required/)
    expect(called).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Session lifecycle state machine (cycle 0006).
// ---------------------------------------------------------------------------

describe('assertLegalTransition (SPEC §6.2)', () => {
  it('permits the only two legal transitions', () => {
    expect(() => assertLegalTransition('draft', 'live')).not.toThrow()
    expect(() => assertLegalTransition('live', 'ended')).not.toThrow()
  })

  it.each([
    ['draft', 'ended'],
    ['live', 'live'],
    ['ended', 'live'],
    ['ended', 'ended'],
    ['ended', 'archived'],
    ['archived', 'live'],
    ['archived', 'ended'],
  ] as const)('rejects illegal transition %s → %s', (from, to) => {
    expect(() => assertLegalTransition(from, to)).toThrow(/Illegal session transition/)
  })

  it.each([null, undefined, 'bogus'])('rejects unknown/missing `from` %p', (from) => {
    expect(() => assertLegalTransition(from as never, 'live')).toThrow(
      /Illegal session transition/
    )
  })
})

describe('buildSessionStart', () => {
  const draft = { id: 's1', status: 'draft', teacherId: 'u1' }

  it('produces a teacher-actor SessionStarted plan stamping startedAt', () => {
    const plan = buildSessionStart({ session: draft, actorId: 'u1', now: 500 })
    expect(plan.sessionId).toBe('s1')
    expect(plan.meta.actor).toEqual({ id: 'u1', role: 'teacher' })
    expect(plan.meta.sessionId).toBe('s1')
    expect(plan.meta.payload).toEqual({ id: 's1', status: 'live', startedAt: 500 })
    expect((plan.meta.payload as { id: string }).id).toBe(plan.meta.sessionId)
    expect(plan.update).toEqual({ status: 'live', startedAt: 500 })
  })

  it('rejects an illegal transition (non-draft) before producing a plan', () => {
    expect(() =>
      buildSessionStart({ session: { ...draft, status: 'ended' }, actorId: 'u1' })
    ).toThrow(/Illegal session transition/)
    expect(() =>
      buildSessionStart({ session: { ...draft, status: 'live' }, actorId: 'u1' })
    ).toThrow(/Illegal session transition/)
  })

  it.each([null, undefined, 'someone-else'])('rejects a non-owner actor %p', (actorId) => {
    expect(() =>
      buildSessionStart({ session: draft, actorId: actorId as never })
    ).toThrow(/only the owning teacher/)
  })

  it('rejects a missing sessionId', () => {
    expect(() =>
      buildSessionStart({ session: { id: '', status: 'draft', teacherId: 'u1' }, actorId: 'u1' })
    ).toThrow(/sessionId is required/)
  })
})

describe('buildSessionEnd', () => {
  const live = { id: 's1', status: 'live', teacherId: 'u1' }

  it('produces a teacher-actor SessionEnded plan stamping endedAt', () => {
    const plan = buildSessionEnd({ session: live, actorId: 'u1', now: 900 })
    expect(plan.meta.actor).toEqual({ id: 'u1', role: 'teacher' })
    expect(plan.meta.sessionId).toBe('s1')
    expect(plan.meta.payload).toEqual({ id: 's1', status: 'ended', endedAt: 900 })
    expect(plan.update).toEqual({ status: 'ended', endedAt: 900 })
  })

  it('rejects ending a draft session (illegal transition)', () => {
    expect(() =>
      buildSessionEnd({ session: { ...live, status: 'draft' }, actorId: 'u1' })
    ).toThrow(/Illegal session transition/)
  })

  it('rejects a non-owner actor', () => {
    expect(() => buildSessionEnd({ session: live, actorId: 'intruder' })).toThrow(
      /only the owning teacher/
    )
  })
})

describe('startSession / endSession wrappers', () => {
  const draft = { id: 's1', status: 'draft', teacherId: 'u1' }
  const live = { id: 's1', status: 'live', teacherId: 'u1' }

  it('startSession calls write once with SessionStarted and one txn', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    await startSession(
      { session: draft, actorId: 'u1', now: 1 },
      { write: write as never, buildTxn: () => ({}) as never }
    )
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('SessionStarted')
    expect(calls[0][2]).toHaveLength(1)
  })

  it('endSession calls write once with SessionEnded', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    await endSession(
      { session: live, actorId: 'u1', now: 1 },
      { write: write as never, buildTxn: () => ({}) as never }
    )
    expect(calls[0][0]).toBe('SessionEnded')
  })

  // Failure path: a rejected write propagates — it is not swallowed.
  it('propagates (does not swallow) a rejected write', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      startSession(
        { session: draft, actorId: 'u1' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/permission denied/)
  })

  // Failure path: an illegal/non-owner input rejects from the builder BEFORE
  // write is ever called (guard-as-retry-safety).
  it('rejects an illegal transition without calling write', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      startSession(
        { session: { ...draft, status: 'live' }, actorId: 'u1' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/Illegal session transition/)
    expect(called).toBe(false)
  })

  it('rejects a non-owner end without calling write', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      endSession(
        { session: live, actorId: 'intruder' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/only the owning teacher/)
    expect(called).toBe(false)
  })
})

describe('isJoinEnabled (join gate)', () => {
  it('is true only when the session is live', () => {
    expect(isJoinEnabled({ status: 'live' })).toBe(true)
  })

  it.each(['draft', 'ended', 'archived', 'bogus'])('is false for status %p', (status) => {
    expect(isJoinEnabled({ status })).toBe(false)
  })

  it.each([null, undefined, {}])('is false for null/absent/unknown session %p', (session) => {
    expect(isJoinEnabled(session as never)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Student join (cycle 0007).
// ---------------------------------------------------------------------------

describe('buildParticipantJoin', () => {
  const ok = { sessionId: 's1', userId: 'u1', username: 'ada', participantId: 'p1', now: 100 }

  it('builds a student participant record with pinned join values', () => {
    const { record } = buildParticipantJoin(ok)
    expect(record).toEqual({
      id: 'p1',
      sessionId: 's1',
      userId: 'u1',
      role: 'student',
      username: 'ada',
      joinedAt: 100,
      lastSeenAt: 100,
      chatStatus: 'allowed',
    })
  })

  it('builds a ParticipantJoined envelope with a student actor and sessionId set', () => {
    const { meta } = buildParticipantJoin(ok)
    expect(meta.actor).toEqual({ id: 'u1', role: 'student' })
    expect(meta.sessionId).toBe('s1')
    expect(meta.payload).toEqual({
      participantId: 'p1',
      userId: 'u1',
      role: 'student',
      username: 'ada',
    })
  })

  it('keeps participantId === record.id === payload.participantId (folds cleanly)', () => {
    const { record, meta } = buildParticipantJoin(ok)
    expect(record.id).toBe('p1')
    expect((meta.payload as { participantId: string }).participantId).toBe(record.id)
  })

  it('the produced record carries NO email key (structural privacy)', () => {
    const { record } = buildParticipantJoin(ok)
    expect(Object.keys(record)).not.toContain('email')
    expect(JSON.stringify(record).toLowerCase()).not.toContain('email')
  })

  it('trims the username and defaults participantId/now when not injected', () => {
    const { record, meta } = buildParticipantJoin({
      sessionId: 's2',
      userId: 'u2',
      username: '  bob  ',
    })
    expect(record.username).toBe('bob')
    expect(record.id).toBeTruthy()
    expect(record.id).toBe((meta.payload as { participantId: string }).participantId)
    expect(record.joinedAt).toBe(record.lastSeenAt)
    expect(typeof record.joinedAt).toBe('number')
  })

  // Failure path: missing sessionId rejected BEFORE any plan is built.
  it.each([null, undefined, ''])('rejects a missing sessionId %p', (bad) => {
    expect(() => buildParticipantJoin({ ...ok, sessionId: bad })).toThrow(/sessionId is required/)
  })

  // Failure path: a missing userId (signed-out) is rejected.
  it.each([null, undefined, ''])('rejects a missing userId %p', (bad) => {
    expect(() => buildParticipantJoin({ ...ok, userId: bad })).toThrow(/signed in/)
  })

  // Failure path: a blank/whitespace derived username is rejected.
  it.each([null, undefined, '', '   ', '\t\n'])('rejects a blank username %p', (bad) => {
    expect(() => buildParticipantJoin({ ...ok, username: bad as never })).toThrow(
      /username is required/
    )
  })

  it('derives the username from the email local-part for a multi-dot/symbol address', () => {
    // SPEC §12.3 — the join username is the email local-part. A dotted/+tagged
    // local-part is preserved verbatim.
    const username = deriveUsername('a.b+tag@x.io')
    expect(username).toBe('a.b+tag')
    const { record } = buildParticipantJoin({ sessionId: 's1', userId: 'u1', username })
    expect(record.username).toBe('a.b+tag')
  })
})

describe('shouldCreateParticipant (idempotency gate)', () => {
  const base = { authUserId: 'u1', participantsLoaded: true, existingCount: 0, inFlight: false }

  it('is true only when authed + loaded + no row + not in flight', () => {
    expect(shouldCreateParticipant(base)).toBe(true)
  })

  it.each([
    ['no auth id', { authUserId: null }],
    ['not loaded', { participantsLoaded: false }],
    ['a row already exists', { existingCount: 1 }],
    ['a create is in flight', { inFlight: true }],
  ] as const)('is false when %s', (_label, override) => {
    expect(shouldCreateParticipant({ ...base, ...override })).toBe(false)
  })
})

describe('joinSession wrapper', () => {
  const ok = { sessionId: 's1', userId: 'u1', username: 'ada' }

  it('calls write once with ParticipantJoined and one projection txn', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    const rec = await joinSession(ok, { write: write as never, buildTxn: () => ({}) as never })
    expect(rec.role).toBe('student')
    expect(rec.username).toBe('ada')
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('ParticipantJoined')
    expect((calls[0][1] as { sessionId: string }).sessionId).toBe('s1')
    expect(calls[0][2]).toHaveLength(1)
  })

  // Failure path: a rejected write propagates — it is not swallowed.
  it('propagates (does not swallow) a rejected write', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      joinSession(ok, { write: write as never, buildTxn: () => ({}) as never })
    ).rejects.toThrow(/permission denied/)
  })

  // Failure path: invalid input throws before write is ever called.
  it('rejects synchronously on invalid input without calling write', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      joinSession(
        { sessionId: '', userId: 'u1', username: 'ada' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/sessionId is required/)
    expect(called).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Student chat submit (cycle 0008).
// ---------------------------------------------------------------------------

describe('buildChatMessage', () => {
  const ok = {
    sessionId: 's1',
    participantId: 'p1',
    userId: 'u1',
    clientActionId: 'ca1',
    text: 'hello class',
    now: 100,
  }

  it('builds a visible/unclassified message record with the action id as its id', () => {
    const { record } = buildChatMessage(ok)
    expect(record).toEqual({
      id: 'ca1',
      sessionId: 's1',
      participantId: 'p1',
      clientActionId: 'ca1',
      text: 'hello class',
      visibility: 'visible',
      classificationStatus: 'unclassified',
      createdAt: 100,
    })
  })

  it('builds a ChatMessageSubmitted envelope with a student actor and sessionId set', () => {
    const { meta } = buildChatMessage(ok)
    expect(meta.actor).toEqual({ id: 'u1', role: 'student' })
    expect(meta.sessionId).toBe('s1')
    expect(meta.payload).toEqual({
      messageId: 'ca1',
      participantId: 'p1',
      text: 'hello class',
      createdAt: 100,
    })
  })

  it('keeps record.id === clientActionId === payload.messageId (deterministic, folds cleanly)', () => {
    const { record, meta } = buildChatMessage(ok)
    expect(record.id).toBe('ca1')
    expect(record.clientActionId).toBe(record.id)
    expect((meta.payload as { messageId: string }).messageId).toBe(record.id)
  })

  it('trims the text before storage', () => {
    const { record, meta } = buildChatMessage({ ...ok, text: '   padded message   ' })
    expect(record.text).toBe('padded message')
    expect((meta.payload as { text: string }).text).toBe('padded message')
  })

  it('the produced record carries NO email key (structural privacy)', () => {
    const { record } = buildChatMessage(ok)
    expect(Object.keys(record)).not.toContain('email')
    expect(JSON.stringify(record).toLowerCase()).not.toContain('email')
  })

  // Failure path: a missing sessionId is rejected BEFORE any plan is built.
  it.each([null, undefined, ''])('rejects a missing sessionId %p', (bad) => {
    expect(() => buildChatMessage({ ...ok, sessionId: bad })).toThrow(/sessionId is required/)
  })

  // Failure path: a missing/empty participantId is rejected.
  it.each([null, undefined, ''])('rejects a missing participantId %p', (bad) => {
    expect(() => buildChatMessage({ ...ok, participantId: bad })).toThrow(/participantId is required/)
  })

  // Failure path: a missing userId (no actor) is rejected.
  it.each([null, undefined, ''])('rejects a missing userId %p', (bad) => {
    expect(() => buildChatMessage({ ...ok, userId: bad })).toThrow(/signed in/)
  })

  // Failure path: a missing clientActionId is rejected.
  it.each([null, undefined, ''])('rejects a missing clientActionId %p', (bad) => {
    expect(() => buildChatMessage({ ...ok, clientActionId: bad })).toThrow(
      /clientActionId is required/
    )
  })

  // Failure path: blank/whitespace-only text is rejected (no plan, no write).
  it.each([null, undefined, '', '   ', '\t\n'])('rejects blank/whitespace-only text %p', (bad) => {
    expect(() => buildChatMessage({ ...ok, text: bad as never })).toThrow(/cannot be blank/)
  })
})

describe('shouldSubmitChatMessage (idempotency gate)', () => {
  const base = {
    authUserId: 'u1',
    participantId: 'p1',
    messagesLoaded: true,
    existingForActionId: 0,
    inFlight: false,
    text: 'hi',
  }

  it('is true only when authed + participant + loaded + no row + not in flight + non-blank', () => {
    expect(shouldSubmitChatMessage(base)).toBe(true)
  })

  it.each([
    ['no auth id', { authUserId: null }],
    ['no participant', { participantId: null }],
    ['not loaded', { messagesLoaded: false }],
    ['a row already exists for this action id', { existingForActionId: 1 }],
    ['a submit is in flight', { inFlight: true }],
    ['blank text', { text: '   ' }],
  ] as const)('is false when %s', (_label, override) => {
    expect(shouldSubmitChatMessage({ ...base, ...override })).toBe(false)
  })
})

describe('submitChatMessage wrapper', () => {
  const ok = {
    sessionId: 's1',
    participantId: 'p1',
    userId: 'u1',
    clientActionId: 'ca1',
    text: 'hello class',
  }

  // A question-like submit: deterministic message + question ids for assertions.
  const question = {
    sessionId: 's1',
    participantId: 'p1',
    userId: 'u1',
    clientActionId: '11111111-1111-4111-8111-111111111111',
    text: 'what is mitosis?',
  }

  it('calls write once with ChatMessageSubmitted and one projection txn', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    const rec = await submitChatMessage(ok, { write: write as never, buildTxn: () => ({}) as never })
    expect(rec.id).toBe('ca1')
    expect(rec.text).toBe('hello class')
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('ChatMessageSubmitted')
    expect((calls[0][1] as { sessionId: string }).sessionId).toBe('s1')
    expect((calls[0][1] as { actor: { role: string } }).actor.role).toBe('student')
    expect(calls[0][2]).toHaveLength(1)
  })

  // Cycle 0009: a non-question message emits ONLY ChatMessageSubmitted.
  it('does not emit a QuestionCreated for a non-question message', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    await submitChatMessage(ok, {
      write: write as never,
      buildTxn: () => ({}) as never,
      buildQuestionTxn: () => ({}) as never,
    })
    expect(calls.map((c) => c[0])).toEqual(['ChatMessageSubmitted'])
  })

  // Cycle 0009: a question-like message dual-writes BOTH events, in order, with a
  // correct QuestionCreated envelope + exactly one question projection txn.
  it('emits ChatMessageSubmitted then QuestionCreated for a question-like message', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    await submitChatMessage(question, {
      write: write as never,
      buildTxn: () => ({}) as never,
      buildQuestionTxn: () => ({}) as never,
    })
    expect(calls.map((c) => c[0])).toEqual(['ChatMessageSubmitted', 'QuestionCreated'])
    const qMeta = calls[1][1] as {
      sessionId: string
      actor: { role: string }
      payload: { questionId: string; messageId: string; participantId: string }
    }
    expect(qMeta.sessionId).toBe('s1')
    expect(qMeta.actor.role).toBe('student')
    expect(qMeta.payload.messageId).toBe(question.clientActionId)
    expect(qMeta.payload.participantId).toBe('p1')
    expect(qMeta.payload.questionId).toBe(deriveQuestionId(question.clientActionId))
    // Exactly one question projection txn.
    expect(calls[1][2]).toHaveLength(1)
  })

  // Idempotency: the same clientActionId derives the SAME question id on re-submit.
  it('derives a stable question id for the same clientActionId (keyed-upsert idempotency)', async () => {
    const ids: string[] = []
    const write = (type: string, meta: { payload?: { questionId?: string } }) => {
      if (type === 'QuestionCreated') ids.push(meta.payload!.questionId as string)
      return Promise.resolve('ok')
    }
    await submitChatMessage(question, {
      write: write as never,
      buildTxn: () => ({}) as never,
      buildQuestionTxn: () => ({}) as never,
    })
    await submitChatMessage(question, {
      write: write as never,
      buildTxn: () => ({}) as never,
      buildQuestionTxn: () => ({}) as never,
    })
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })

  // Failure path: the QuestionCreated write rejects AFTER ChatMessageSubmitted
  // committed → the message write was observed, the rejection propagates (not
  // swallowed), and no question txn is committed beyond the rejecting call.
  it('propagates a QuestionCreated failure while keeping the message committed', async () => {
    const committed: string[] = []
    const write = (type: string) => {
      if (type === 'QuestionCreated') return Promise.reject(new Error('question write failed'))
      committed.push(type)
      return Promise.resolve('ok')
    }
    await expect(
      submitChatMessage(question, {
        write: write as never,
        buildTxn: () => ({}) as never,
        buildQuestionTxn: () => ({}) as never,
      })
    ).rejects.toThrow(/question write failed/)
    // The first (message) write succeeded; the chat message is NOT lost.
    expect(committed).toEqual(['ChatMessageSubmitted'])
  })

  // Failure path: a rejected write propagates — it is not swallowed.
  it('propagates (does not swallow) a rejected write', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      submitChatMessage(ok, { write: write as never, buildTxn: () => ({}) as never })
    ).rejects.toThrow(/permission denied/)
  })

  // Failure path: invalid input throws before write is ever called.
  it('rejects synchronously on invalid input without calling write', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      submitChatMessage(
        { ...ok, text: '   ' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/cannot be blank/)
    expect(called).toBe(false)
  })
})

describe('buildQuestion', () => {
  const plan = buildChatMessage({
    sessionId: 's1',
    participantId: 'p1',
    userId: 'u1',
    clientActionId: '11111111-1111-4111-8111-111111111111',
    text: 'what is mitosis?',
    now: 4242,
  })

  it('derives the record from the message plan with a deterministic question id', () => {
    const { record } = buildQuestion(plan)
    expect(record).toEqual({
      id: deriveQuestionId(plan.record.id),
      sessionId: 's1',
      messageId: plan.record.id,
      participantId: 'p1',
      status: 'submitted',
      createdAt: 4242,
    })
  })

  it('carries no email on the record (privacy is structural)', () => {
    const { record } = buildQuestion(plan)
    expect(record).not.toHaveProperty('email')
  })

  it('builds a student-actor envelope referencing message/participant/question ids', () => {
    const { meta } = buildQuestion(plan)
    expect(meta.sessionId).toBe('s1')
    expect(meta.actor).toEqual({ id: 'u1', role: 'student' })
    expect(meta.payload).toMatchObject({
      questionId: deriveQuestionId(plan.record.id),
      messageId: plan.record.id,
      participantId: 'p1',
      sessionId: 's1',
      status: 'submitted',
    })
  })

  it('the derived question id differs from the source message id', () => {
    const { record } = buildQuestion(plan)
    expect(record.id).not.toBe(record.messageId)
  })
})

describe('buildQuestionAnswer', () => {
  const ok = {
    questionId: 'q1',
    sessionId: 's1',
    currentStatus: 'submitted',
    actor: { id: 'teacher-1', role: 'teacher' as const },
  }

  it('builds an answered record + teacher envelope with a trimmed summary', () => {
    const { record, meta } = buildQuestionAnswer({ ...ok, answerSummary: '  cell division  ' })
    expect(record).toEqual({
      id: 'q1',
      sessionId: 's1',
      status: 'answered',
      addressedBy: 'teacher-1',
      answerSummary: 'cell division',
    })
    expect(meta.sessionId).toBe('s1')
    expect(meta.actor).toEqual({ id: 'teacher-1', role: 'teacher' })
    expect(meta.payload).toEqual({
      questionId: 'q1',
      sessionId: 's1',
      status: 'answered',
      addressedBy: 'teacher-1',
      answerSummary: 'cell division',
    })
  })

  it('omits answerSummary entirely when none is supplied', () => {
    const { record, meta } = buildQuestionAnswer(ok)
    expect(record).not.toHaveProperty('answerSummary')
    expect(record.status).toBe('answered')
    expect(record.addressedBy).toBe('teacher-1')
    expect(meta.payload).not.toHaveProperty('answerSummary')
  })

  it('omits a blank/whitespace-only answerSummary', () => {
    const { record, meta } = buildQuestionAnswer({ ...ok, answerSummary: '   ' })
    expect(record).not.toHaveProperty('answerSummary')
    expect(meta.payload).not.toHaveProperty('answerSummary')
  })

  it('throws when questionId is missing', () => {
    expect(() => buildQuestionAnswer({ ...ok, questionId: '' })).toThrow(/questionId is required/)
  })

  it('throws when sessionId is missing', () => {
    expect(() => buildQuestionAnswer({ ...ok, sessionId: '' })).toThrow(/sessionId is required/)
  })

  it('throws when actor userId is missing', () => {
    expect(() =>
      buildQuestionAnswer({ ...ok, actor: { id: '', role: 'teacher' } })
    ).toThrow(/actor userId is required/)
  })

  it('throws when the actor is not a teacher', () => {
    expect(() =>
      buildQuestionAnswer({ ...ok, actor: { id: 'u1', role: 'student' } })
    ).toThrow(/only a teacher may answer/)
  })

  it('throws when the question is already answered (duplicate-resolution guard)', () => {
    expect(() => buildQuestionAnswer({ ...ok, currentStatus: 'answered' })).toThrow(
      /already answered/
    )
  })
})

describe('answerQuestion wrapper', () => {
  const ok = {
    questionId: 'q1',
    sessionId: 's1',
    currentStatus: 'submitted',
    actor: { id: 'teacher-1', role: 'teacher' as const },
  }

  it('calls write once with QuestionAnswered and one projection txn', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    const rec = await answerQuestion(
      { ...ok, answerSummary: 'cell division' },
      { write: write as never, buildTxn: () => ({}) as never }
    )
    expect(rec).toEqual({
      id: 'q1',
      sessionId: 's1',
      status: 'answered',
      addressedBy: 'teacher-1',
      answerSummary: 'cell division',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('QuestionAnswered')
    expect((calls[0][1] as { actor: { role: string } }).actor.role).toBe('teacher')
    expect((calls[0][1] as { sessionId: string }).sessionId).toBe('s1')
    expect(calls[0][2]).toHaveLength(1)
  })

  it('propagates (does not swallow) a rejected write', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      answerQuestion(ok, { write: write as never, buildTxn: () => ({}) as never })
    ).rejects.toThrow(/permission denied/)
  })

  it('throws on invalid input before write is ever called', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      answerQuestion(
        { ...ok, currentStatus: 'answered' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/already answered/)
    expect(called).toBe(false)
  })

  // Exercises the real default projection txn builder (only `write` stubbed):
  // a single keyed `questions[id].update(...)` chunk, both with and without a
  // summary, so the dual-write helper receives a non-empty txn array.
  it('passes the default questions[id].update txn to write (with summary)', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    await answerQuestion({ ...ok, answerSummary: 'cell division' }, { write: write as never })
    expect(calls[0][0]).toBe('QuestionAnswered')
    expect(calls[0][2]).toHaveLength(1)
  })

  it('passes the default questions[id].update txn to write (without summary)', async () => {
    const calls: unknown[][] = []
    const write = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve('ok')
    }
    await answerQuestion(ok, { write: write as never })
    expect(calls[0][0]).toBe('QuestionAnswered')
    expect(calls[0][2]).toHaveLength(1)
  })
})

describe('SessionList display helpers (cycle 0012)', () => {
  describe('sessionDisplayTitle', () => {
    it('returns a normal title trimmed of surrounding whitespace', () => {
      expect(sessionDisplayTitle('Algebra — Lesson 3')).toBe('Algebra — Lesson 3')
      expect(sessionDisplayTitle('  Padded title  ')).toBe('Padded title')
    })

    it('falls back to the placeholder for empty / whitespace-only / null / undefined', () => {
      expect(sessionDisplayTitle('')).toBe(SESSION_LIST_TITLE_FALLBACK)
      expect(sessionDisplayTitle('   ')).toBe(SESSION_LIST_TITLE_FALLBACK)
      expect(sessionDisplayTitle(null)).toBe(SESSION_LIST_TITLE_FALLBACK)
      expect(sessionDisplayTitle(undefined)).toBe(SESSION_LIST_TITLE_FALLBACK)
    })

    it('never returns a blank string (totality over hostile input)', () => {
      for (const hostile of ['', ' ', '\t', '\n', null, undefined]) {
        expect(sessionDisplayTitle(hostile).trim()).not.toBe('')
      }
    })
  })

  describe('compareSessionsForList', () => {
    const row = (id: string, createdAt?: number | null): SessionListRow => ({ id, createdAt })

    it('orders distinct createdAt ascending (oldest first)', () => {
      const rows = [row('b', 300), row('a', 100), row('c', 200)]
      expect([...rows].sort(compareSessionsForList).map((r) => r.id)).toEqual(['a', 'c', 'b'])
    })

    it('tie-breaks equal createdAt deterministically by id', () => {
      const rows = [row('z', 100), row('a', 100), row('m', 100)]
      expect([...rows].sort(compareSessionsForList).map((r) => r.id)).toEqual(['a', 'm', 'z'])
    })

    it('treats missing / null createdAt as 0 (no NaN) and falls back to the id tie-break', () => {
      const rows = [row('b', undefined), row('a', null), row('c', 5)]
      // a and b both sort as 0 → id tie-break (a before b); c has a later timestamp.
      expect([...rows].sort(compareSessionsForList).map((r) => r.id)).toEqual(['a', 'b', 'c'])
    })

    it('produces no NaN comparisons for fully absent timestamps', () => {
      expect(compareSessionsForList(row('a'), row('b'))).toBe(-1)
      expect(compareSessionsForList(row('b'), row('a'))).toBe(1)
      expect(compareSessionsForList(row('a'), row('a'))).toBe(0)
    })

    it('sorts an empty list to []', () => {
      expect(([] as SessionListRow[]).sort(compareSessionsForList)).toEqual([])
    })

    it('is stable and total across a mixed hostile fixture', () => {
      const rows: SessionListRow[] = [
        row('d', 200),
        row('a', null),
        row('c', 100),
        row('b', undefined),
        row('e', 100),
      ]
      // 0-timestamp rows (a,b) first by id, then createdAt=100 (c,e) by id, then d.
      expect([...rows].sort(compareSessionsForList).map((r) => r.id)).toEqual([
        'a',
        'b',
        'c',
        'e',
        'd',
      ])
    })
  })
})
