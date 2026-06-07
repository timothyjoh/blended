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
  defaultChatTxn,
  buildQuestion,
  buildQuestionAnswer,
  answerQuestion,
  SESSION_LIST_TITLE_FALLBACK,
  sessionDisplayTitle,
  compareSessionsForList,
  RESOURCE_TYPES,
  buildResourceQueue,
  queueResource,
  defaultResourceTxn,
  buildResourceActivate,
  activateResource,
  defaultResourceActivateTxn,
  generateUrlVersion,
  buildResourceUrlChange,
  broadcastResourceUrl,
  defaultResourceUrlChangeTxn,
  buildEmbedStatusCheck,
  recordEmbedStatus,
  defaultEmbedStatusTxn,
  type SessionListRow,
  type SessionResourceRecord,
  type ResourceActivatePlan,
  type ResourceUrlChangePlan,
  type EmbedStatusCheckPlan,
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

describe('defaultChatTxn (real projection txn, cycle 0014)', () => {
  // The submitChatMessage wrapper tests stub `buildTxn`, so they never exercise
  // the real txn body. This test invokes the real builder and pins that it sets
  // BOTH the parent-session link and the author-participant link — the latter is
  // what the tightened `messages` create rule traverses to verify the author.
  const record = {
    id: 'm1',
    sessionId: 's1',
    participantId: 'p1',
    clientActionId: 'ca1',
    text: 'hello class',
    visibility: 'class',
    classificationStatus: 'chat',
    createdAt: 5000,
  }

  it('sets both the session and participant links from the record', () => {
    const txn = defaultChatTxn(record as never) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    const linkOp = txn.__ops.find((op) => op[0] === 'link')
    expect(linkOp, 'defaultChatTxn must emit a link op').toBeDefined()
    expect(linkOp![3]).toEqual({ session: 's1', participant: 'p1' })
  })

  it('keys the row on the message id (deterministic upsert)', () => {
    const txn = defaultChatTxn(record as never) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    const updateOp = txn.__ops.find((op) => op[0] === 'update')
    expect(updateOp![2]).toBe('m1')
    expect(updateOp![3]).toMatchObject({ sessionId: 's1', participantId: 'p1' })
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

describe('buildResourceQueue', () => {
  const okInput = {
    sessionId: 's1',
    url: 'https://example.com/slides',
    title: 'Intro slides',
    type: 'google_slides',
    actor: { id: 'teacher-1', role: 'teacher' },
    id: 'r1',
    now: 4242,
  }

  it('produces the projection record + ResourceQueued envelope on valid input', () => {
    const { record, meta } = buildResourceQueue(okInput)
    expect(record).toEqual({
      id: 'r1',
      sessionId: 's1',
      teacherId: 'teacher-1',
      url: 'https://example.com/slides',
      title: 'Intro slides',
      type: 'google_slides',
      sortOrder: 0,
      embedMode: 'blocked',
      embedStatus: 'unchecked',
      createdAt: 4242,
    })
    // meta.payload.id === record.id so the event folds cleanly.
    expect(meta.payload.id).toBe(record.id)
    expect(meta.actor).toEqual({ id: 'teacher-1', role: 'teacher' })
    expect(meta.sessionId).toBe('s1')
  })

  it('sets teacherId = the actor id (denormalized owner)', () => {
    expect(buildResourceQueue(okInput).record.teacherId).toBe('teacher-1')
  })

  it('defaults deferred-feature fields safely (blocked/unchecked, no activatedAt)', () => {
    const { record } = buildResourceQueue(okInput)
    expect(record.embedMode).toBe('blocked')
    expect(record.embedStatus).toBe('unchecked')
    expect(record).not.toHaveProperty('activatedAt')
  })

  it('stores the normalized url from the validator', () => {
    const { record } = buildResourceQueue({ ...okInput, url: '  https://example.com  ' })
    expect(record.url).toBe('https://example.com/')
  })

  it('trims the title before storing', () => {
    expect(buildResourceQueue({ ...okInput, title: '  Slides  ' }).record.title).toBe('Slides')
  })

  it('defaults a blank type to generic_url', () => {
    expect(buildResourceQueue({ ...okInput, type: '  ' }).record.type).toBe('generic_url')
  })

  it('computes sortOrder = 0 for an empty queue (null/undefined current max)', () => {
    expect(buildResourceQueue({ ...okInput, currentMaxSortOrder: null }).record.sortOrder).toBe(0)
    expect(buildResourceQueue({ ...okInput, currentMaxSortOrder: undefined }).record.sortOrder).toBe(
      0
    )
  })

  it('computes sortOrder = max + 1 for a non-empty queue (end-of-queue)', () => {
    expect(buildResourceQueue({ ...okInput, currentMaxSortOrder: 4 }).record.sortOrder).toBe(5)
  })

  it('throws on a non-teacher actor (before any plan)', () => {
    expect(() =>
      buildResourceQueue({ ...okInput, actor: { id: 'u1', role: 'student' } })
    ).toThrow(/only a teacher/)
  })

  it('throws on a missing actor id', () => {
    expect(() =>
      buildResourceQueue({ ...okInput, actor: { id: null, role: 'teacher' } })
    ).toThrow(/actor userId is required/)
  })

  it('throws on a missing sessionId', () => {
    expect(() => buildResourceQueue({ ...okInput, sessionId: null })).toThrow(
      /sessionId is required/
    )
  })

  it('throws on a blank/whitespace title', () => {
    expect(() => buildResourceQueue({ ...okInput, title: '   ' })).toThrow(/title is required/)
  })

  it('throws on an unsafe-scheme URL (rejected by the validator)', () => {
    expect(() => buildResourceQueue({ ...okInput, url: 'javascript:alert(1)' })).toThrow(
      /invalid url \(unsafe_scheme\)/
    )
  })

  it('throws on a data: URL (a second unsafe scheme)', () => {
    expect(() => buildResourceQueue({ ...okInput, url: 'data:text/html,x' })).toThrow(
      /invalid url \(unsafe_scheme\)/
    )
  })

  it('throws on an unparseable/bare URL', () => {
    expect(() => buildResourceQueue({ ...okInput, url: 'example.com' })).toThrow(
      /invalid url \(unparseable\)/
    )
  })

  it('surfaces every value in the RESOURCE_TYPES closed set', () => {
    expect(RESOURCE_TYPES).toEqual([
      'generic_url',
      'google_slides',
      'form',
      'pdf',
      'controlled_page',
      'unknown',
    ])
  })
})

describe('queueResource', () => {
  const okInput = {
    sessionId: 's1',
    url: 'https://example.com/slides',
    title: 'Intro slides',
    type: 'generic_url',
    actor: { id: 'teacher-1', role: 'teacher' as const },
    id: 'r1',
    now: 4242,
  }

  it('dual-writes ResourceQueued with exactly one projection txn', async () => {
    let calledType: string | null = null
    let calledTxnCount = -1
    const write = (type: string, _meta: unknown, txns: unknown[]) => {
      calledType = type
      calledTxnCount = txns.length
      return Promise.resolve()
    }
    const buildTxn = (r: SessionResourceRecord) => ({ marker: r.id }) as never
    const record = await queueResource(okInput, { write: write as never, buildTxn })
    expect(calledType).toBe('ResourceQueued')
    expect(calledTxnCount).toBe(1)
    expect(record.id).toBe('r1')
  })

  it('does not write when the builder rejects an unsafe scheme (no txn)', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      queueResource(
        { ...okInput, url: 'javascript:alert(1)' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/invalid url \(unsafe_scheme\)/)
    expect(called).toBe(false)
  })

  it('does not catch a rejecting write — the rejection propagates', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      queueResource(okInput, { write: write as never, buildTxn: () => ({}) as never })
    ).rejects.toThrow(/permission denied/)
  })
})

describe('defaultResourceTxn (real projection txn, cycle 0015)', () => {
  // The queueResource wrapper tests stub `buildTxn`, so they never exercise the
  // real txn body. This invokes the real builder and pins that it sets the
  // forgery-proof `session` link the existing owner-only-write rule traverses,
  // and keys the row + writes the deferred-feature defaults.
  const record: SessionResourceRecord = {
    id: 'r1',
    sessionId: 's1',
    teacherId: 'teacher-1',
    url: 'https://example.com/slides',
    title: 'Intro slides',
    type: 'google_slides',
    sortOrder: 0,
    embedMode: 'blocked',
    embedStatus: 'unchecked',
    createdAt: 4242,
  }

  it('sets the session ownership link from the record', () => {
    const txn = defaultResourceTxn(record) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    const linkOp = txn.__ops.find((op) => op[0] === 'link')
    expect(linkOp, 'defaultResourceTxn must emit a link op').toBeDefined()
    expect(linkOp![3]).toEqual({ session: 's1' })
  })

  it('keys the row on the resource id and writes the deferred-feature defaults', () => {
    const txn = defaultResourceTxn(record) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    const updateOp = txn.__ops.find((op) => op[0] === 'update')
    expect(updateOp![2]).toBe('r1')
    expect(updateOp![3]).toMatchObject({
      sessionId: 's1',
      teacherId: 'teacher-1',
      embedMode: 'blocked',
      embedStatus: 'unchecked',
      sortOrder: 0,
    })
  })
})

describe('buildResourceActivate (cycle 0016)', () => {
  const resources = [
    { id: 'r1', sessionId: 's1', url: 'https://example.com/slides' },
    { id: 'r2', sessionId: 's1', url: 'https://example.com/form' },
    { id: 'rX', sessionId: 's-other', url: 'https://example.com/foreign' },
  ]
  const okInput = {
    sessionId: 's1',
    resourceId: 'r1',
    actor: { id: 'teacher-1', role: 'teacher' },
    resources,
    // Cycle 0017: pin the per-activation version token for a deterministic plan.
    version: 'ver-act-1',
  }

  it('produces the plan + ResourceActivated envelope with derived currentUrl on valid input', () => {
    const plan = buildResourceActivate(okInput)
    expect(plan).toEqual({
      sessionId: 's1',
      resourceId: 'r1',
      currentUrl: 'https://example.com/slides',
      currentUrlVersion: 'ver-act-1',
      meta: {
        sessionId: 's1',
        actor: { id: 'teacher-1', role: 'teacher' },
        payload: {
          sessionId: 's1',
          resourceId: 'r1',
          currentUrl: 'https://example.com/slides',
          currentUrlVersion: 'ver-act-1',
        },
      },
    })
  })

  it('stamps a fresh currentUrlVersion when none is injected (mints per activation)', () => {
    const a = buildResourceActivate({ ...okInput, version: undefined })
    const b = buildResourceActivate({ ...okInput, version: undefined })
    expect(a.currentUrlVersion).toBeTruthy()
    expect(a.currentUrlVersion).not.toBe(b.currentUrlVersion)
  })

  it('hard-sets the envelope actor.role to teacher', () => {
    const plan = buildResourceActivate(okInput)
    expect(plan.meta.actor).toEqual({ id: 'teacher-1', role: 'teacher' })
  })

  it('derives currentUrl from the target resource (not another row)', () => {
    expect(buildResourceActivate({ ...okInput, resourceId: 'r2' }).currentUrl).toBe(
      'https://example.com/form'
    )
  })

  it('throws on a non-teacher actor (before any plan)', () => {
    expect(() =>
      buildResourceActivate({ ...okInput, actor: { id: 'u1', role: 'student' } })
    ).toThrow(/only a teacher/)
  })

  it('throws on a missing actor id', () => {
    expect(() =>
      buildResourceActivate({ ...okInput, actor: { id: null, role: 'teacher' } })
    ).toThrow(/actor userId is required/)
  })

  it('throws on a missing sessionId', () => {
    expect(() => buildResourceActivate({ ...okInput, sessionId: null })).toThrow(
      /sessionId is required/
    )
  })

  it('throws on a missing resourceId', () => {
    expect(() => buildResourceActivate({ ...okInput, resourceId: null })).toThrow(
      /resourceId is required/
    )
  })

  it('throws when the resource is not found in the session queue', () => {
    expect(() => buildResourceActivate({ ...okInput, resourceId: 'nope' })).toThrow(
      /does not belong to this session/
    )
  })

  it('throws when the resource belongs to a different session (foreign)', () => {
    expect(() => buildResourceActivate({ ...okInput, resourceId: 'rX' })).toThrow(
      /does not belong to this session/
    )
  })

  it('throws when the resource has a blank/missing url', () => {
    const withBlank = [{ id: 'r1', sessionId: 's1', url: '   ' }]
    expect(() => buildResourceActivate({ ...okInput, resources: withBlank })).toThrow(
      /resource has no url/
    )
  })
})

describe('activateResource (cycle 0016)', () => {
  const resources = [{ id: 'r1', sessionId: 's1', url: 'https://example.com/slides' }]
  const okInput = {
    sessionId: 's1',
    resourceId: 'r1',
    actor: { id: 'teacher-1', role: 'teacher' as const },
    resources,
  }

  it('dual-writes ResourceActivated with exactly one projection txn', async () => {
    let calledType: string | null = null
    let calledTxnCount = -1
    const write = (type: string, _meta: unknown, txns: unknown[]) => {
      calledType = type
      calledTxnCount = txns.length
      return Promise.resolve()
    }
    const buildTxn = (p: ResourceActivatePlan) => ({ marker: p.resourceId }) as never
    const plan = await activateResource(okInput, { write: write as never, buildTxn })
    expect(calledType).toBe('ResourceActivated')
    expect(calledTxnCount).toBe(1)
    expect(plan.resourceId).toBe('r1')
    expect(plan.currentUrl).toBe('https://example.com/slides')
  })

  it('does not write when the builder rejects a non-teacher actor (no txn)', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      activateResource(
        { ...okInput, actor: { id: 'u1', role: 'student' } as never },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/only a teacher/)
    expect(called).toBe(false)
  })

  it('does not catch a rejecting write — the rejection propagates', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      activateResource(okInput, { write: write as never, buildTxn: () => ({}) as never })
    ).rejects.toThrow(/permission denied/)
  })
})

describe('defaultResourceActivateTxn (real projection txn, cycle 0016)', () => {
  // The activateResource wrapper tests stub `buildTxn`, so they never exercise
  // the real txn body. This invokes the real builder and pins that it keys the
  // session row and sets activeResourceId + currentUrl with NO link op (the
  // session row already exists — unlike the resource-create txn).
  const plan: ResourceActivatePlan = {
    sessionId: 's1',
    resourceId: 'r1',
    currentUrl: 'https://example.com/slides',
    currentUrlVersion: 'ver-act-1',
    meta: {
      sessionId: 's1',
      actor: { id: 'teacher-1', role: 'teacher' },
      payload: {
        sessionId: 's1',
        resourceId: 'r1',
        currentUrl: 'https://example.com/slides',
        currentUrlVersion: 'ver-act-1',
      },
    },
  }

  it('keys the sessions row and sets activeResourceId + currentUrl + currentUrlVersion', () => {
    const txn = defaultResourceActivateTxn(plan) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    const updateOp = txn.__ops.find((op) => op[0] === 'update')
    expect(updateOp![2]).toBe('s1')
    expect(updateOp![3]).toEqual({
      activeResourceId: 'r1',
      currentUrl: 'https://example.com/slides',
      currentUrlVersion: 'ver-act-1',
    })
  })

  it('emits no link op (the session row already exists)', () => {
    const txn = defaultResourceActivateTxn(plan) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    expect(txn.__ops.find((op) => op[0] === 'link')).toBeUndefined()
  })
})

describe('generateUrlVersion (cycle 0017)', () => {
  it('returns the injected mint value (deterministic under a stub)', () => {
    expect(generateUrlVersion(() => 'ver-xyz')).toBe('ver-xyz')
  })

  it('two successive real-mint calls differ (unguessable, never collide)', () => {
    expect(generateUrlVersion()).not.toBe(generateUrlVersion())
  })
})

describe('buildResourceUrlChange (cycle 0017)', () => {
  const okInput = {
    sessionId: 's1',
    actor: { id: 'teacher-1', role: 'teacher' },
    url: 'https://example.com/slides/3',
    activeResourceId: 'r1',
    version: 'ver-1',
  }

  it('produces the plan + ResourceUrlChanged envelope on valid input', () => {
    const plan = buildResourceUrlChange(okInput)
    expect(plan).toEqual({
      sessionId: 's1',
      currentUrl: 'https://example.com/slides/3',
      currentUrlVersion: 'ver-1',
      meta: {
        sessionId: 's1',
        actor: { id: 'teacher-1', role: 'teacher' },
        payload: {
          sessionId: 's1',
          currentUrl: 'https://example.com/slides/3',
          currentUrlVersion: 'ver-1',
        },
      },
    })
  })

  it('hard-sets the envelope actor.role to teacher', () => {
    expect(buildResourceUrlChange(okInput).meta.actor).toEqual({
      id: 'teacher-1',
      role: 'teacher',
    })
  })

  it('normalizes the URL through the validateResourceUrl seam', () => {
    // `validateResourceUrl` returns `parsed.href`, which appends a trailing slash
    // to an origin-only URL — proves the seam (not inline parsing) produced it.
    expect(buildResourceUrlChange({ ...okInput, url: 'https://example.com' }).currentUrl).toBe(
      'https://example.com/'
    )
  })

  it('mints a fresh distinct currentUrlVersion per call when none is injected', () => {
    const a = buildResourceUrlChange({ ...okInput, version: undefined })
    const b = buildResourceUrlChange({ ...okInput, version: undefined })
    expect(a.currentUrlVersion).toBeTruthy()
    expect(a.currentUrlVersion).not.toBe(b.currentUrlVersion)
  })

  it('throws on a non-teacher actor (before any plan)', () => {
    expect(() =>
      buildResourceUrlChange({ ...okInput, actor: { id: 'u1', role: 'student' } })
    ).toThrow(/only a teacher/)
  })

  it('throws on a missing actor id', () => {
    expect(() =>
      buildResourceUrlChange({ ...okInput, actor: { id: null, role: 'teacher' } })
    ).toThrow(/actor userId is required/)
  })

  it('throws on a missing sessionId', () => {
    expect(() => buildResourceUrlChange({ ...okInput, sessionId: null })).toThrow(
      /sessionId is required/
    )
  })

  it('throws when no resource is active (broadcast is illegal without one)', () => {
    expect(() => buildResourceUrlChange({ ...okInput, activeResourceId: null })).toThrow(
      /no active resource/
    )
    expect(() => buildResourceUrlChange({ ...okInput, activeResourceId: '   ' })).toThrow(
      /no active resource/
    )
  })

  it('throws on a blank URL (validateResourceUrl rejection)', () => {
    expect(() => buildResourceUrlChange({ ...okInput, url: '   ' })).toThrow(
      /broadcastResourceUrl: blank/
    )
  })

  it('throws on an unsafe scheme (validateResourceUrl rejection)', () => {
    expect(() =>
      buildResourceUrlChange({ ...okInput, url: 'javascript:alert(1)' })
    ).toThrow(/broadcastResourceUrl: unsafe_scheme/)
  })

  it('throws on an unparseable URL (validateResourceUrl rejection)', () => {
    expect(() => buildResourceUrlChange({ ...okInput, url: 'not a url' })).toThrow(
      /broadcastResourceUrl: unparseable/
    )
  })
})

describe('broadcastResourceUrl (cycle 0017)', () => {
  const okInput = {
    sessionId: 's1',
    actor: { id: 'teacher-1', role: 'teacher' as const },
    url: 'https://example.com/slides/3',
    activeResourceId: 'r1',
    version: 'ver-1',
  }

  it('dual-writes ResourceUrlChanged with exactly one projection txn', async () => {
    let calledType: string | null = null
    let calledTxnCount = -1
    const write = (type: string, _meta: unknown, txns: unknown[]) => {
      calledType = type
      calledTxnCount = txns.length
      return Promise.resolve()
    }
    const buildTxn = (p: ResourceUrlChangePlan) => ({ marker: p.currentUrlVersion }) as never
    const plan = await broadcastResourceUrl(okInput, { write: write as never, buildTxn })
    expect(calledType).toBe('ResourceUrlChanged')
    expect(calledTxnCount).toBe(1)
    expect(plan.currentUrl).toBe('https://example.com/slides/3')
    expect(plan.currentUrlVersion).toBe('ver-1')
  })

  it('does not write when the builder rejects a non-teacher actor (no txn)', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      broadcastResourceUrl(
        { ...okInput, actor: { id: 'u1', role: 'student' } as never },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/only a teacher/)
    expect(called).toBe(false)
  })

  it('does not write when the builder rejects a blank URL (no txn)', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      broadcastResourceUrl(
        { ...okInput, url: '   ' },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/broadcastResourceUrl: blank/)
    expect(called).toBe(false)
  })

  it('does not catch a rejecting write — the rejection propagates', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      broadcastResourceUrl(okInput, { write: write as never, buildTxn: () => ({}) as never })
    ).rejects.toThrow(/permission denied/)
  })
})

describe('defaultResourceUrlChangeTxn (real projection txn, cycle 0017)', () => {
  const plan: ResourceUrlChangePlan = {
    sessionId: 's1',
    currentUrl: 'https://example.com/slides/3',
    currentUrlVersion: 'ver-1',
    meta: {
      sessionId: 's1',
      actor: { id: 'teacher-1', role: 'teacher' },
      payload: {
        sessionId: 's1',
        currentUrl: 'https://example.com/slides/3',
        currentUrlVersion: 'ver-1',
      },
    },
  }

  it('keys the sessions row and sets currentUrl + currentUrlVersion (no activeResourceId)', () => {
    const txn = defaultResourceUrlChangeTxn(plan) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    const updateOp = txn.__ops.find((op) => op[0] === 'update')
    expect(updateOp![2]).toBe('s1')
    expect(updateOp![3]).toEqual({
      currentUrl: 'https://example.com/slides/3',
      currentUrlVersion: 'ver-1',
    })
  })

  it('emits no link op (the session row already exists)', () => {
    const txn = defaultResourceUrlChangeTxn(plan) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    expect(txn.__ops.find((op) => op[0] === 'link')).toBeUndefined()
  })
})

describe('buildEmbedStatusCheck (cycle 0018)', () => {
  const okInput = {
    sessionId: 's1',
    resourceId: 'r1',
    actor: { id: 'teacher-1', role: 'teacher' },
    embedStatus: 'blocked',
  }

  it('produces the plan + ResourceEmbedChecked envelope on valid input', () => {
    const plan = buildEmbedStatusCheck(okInput)
    expect(plan).toEqual({
      sessionId: 's1',
      resourceId: 'r1',
      embedStatus: 'blocked',
      meta: {
        sessionId: 's1',
        actor: { id: 'teacher-1', role: 'teacher' },
        payload: { sessionId: 's1', resourceId: 'r1', embedStatus: 'blocked' },
      },
    })
  })

  it('accepts a failed status as well as blocked', () => {
    expect(buildEmbedStatusCheck({ ...okInput, embedStatus: 'failed' }).embedStatus).toBe('failed')
  })

  it('hard-sets the envelope actor.role to teacher', () => {
    expect(buildEmbedStatusCheck(okInput).meta.actor).toEqual({ id: 'teacher-1', role: 'teacher' })
  })

  it('throws on a non-teacher actor (before any plan)', () => {
    expect(() =>
      buildEmbedStatusCheck({ ...okInput, actor: { id: 'u1', role: 'student' } })
    ).toThrow(/only a teacher/)
  })

  it('throws on a missing actor id', () => {
    expect(() =>
      buildEmbedStatusCheck({ ...okInput, actor: { id: null, role: 'teacher' } })
    ).toThrow(/actor userId is required/)
  })

  it('throws on a missing sessionId', () => {
    expect(() => buildEmbedStatusCheck({ ...okInput, sessionId: null })).toThrow(
      /sessionId is required/
    )
  })

  it('throws on a missing resourceId', () => {
    expect(() => buildEmbedStatusCheck({ ...okInput, resourceId: null })).toThrow(
      /resourceId is required/
    )
  })

  it('throws on a status outside {blocked, failed} — unchecked', () => {
    expect(() => buildEmbedStatusCheck({ ...okInput, embedStatus: 'unchecked' })).toThrow(
      /embedStatus must be blocked or failed/
    )
  })

  it('throws on a status outside {blocked, failed} — embeddable', () => {
    expect(() => buildEmbedStatusCheck({ ...okInput, embedStatus: 'embeddable' })).toThrow(
      /embedStatus must be blocked or failed/
    )
  })

  it('throws on a missing status', () => {
    expect(() => buildEmbedStatusCheck({ ...okInput, embedStatus: undefined })).toThrow(
      /embedStatus must be blocked or failed/
    )
  })
})

describe('recordEmbedStatus (cycle 0018)', () => {
  const okInput = {
    sessionId: 's1',
    resourceId: 'r1',
    actor: { id: 'teacher-1', role: 'teacher' as const },
    embedStatus: 'blocked',
  }

  it('dual-writes ResourceEmbedChecked with exactly one projection txn', async () => {
    let calledType: string | null = null
    let calledTxnCount = -1
    const write = (type: string, _meta: unknown, txns: unknown[]) => {
      calledType = type
      calledTxnCount = txns.length
      return Promise.resolve()
    }
    const buildTxn = (p: EmbedStatusCheckPlan) => ({ marker: p.resourceId }) as never
    const plan = await recordEmbedStatus(okInput, { write: write as never, buildTxn })
    expect(calledType).toBe('ResourceEmbedChecked')
    expect(calledTxnCount).toBe(1)
    expect(plan.resourceId).toBe('r1')
    expect(plan.embedStatus).toBe('blocked')
  })

  it('does not write when the builder rejects a non-teacher actor (no txn)', async () => {
    let called = false
    const write = () => {
      called = true
      return Promise.resolve()
    }
    await expect(
      recordEmbedStatus(
        { ...okInput, actor: { id: 'u1', role: 'student' } as never },
        { write: write as never, buildTxn: () => ({}) as never }
      )
    ).rejects.toThrow(/only a teacher/)
    expect(called).toBe(false)
  })

  it('does not catch a rejecting write — the rejection propagates', async () => {
    const write = () => Promise.reject(new Error('permission denied'))
    await expect(
      recordEmbedStatus(okInput, { write: write as never, buildTxn: () => ({}) as never })
    ).rejects.toThrow(/permission denied/)
  })
})

describe('defaultEmbedStatusTxn (real projection txn, cycle 0018)', () => {
  const plan: EmbedStatusCheckPlan = {
    sessionId: 's1',
    resourceId: 'r1',
    embedStatus: 'blocked',
    meta: {
      sessionId: 's1',
      actor: { id: 'teacher-1', role: 'teacher' },
      payload: { sessionId: 's1', resourceId: 'r1', embedStatus: 'blocked' },
    },
  }

  it('keys the sessionResources row and sets embedStatus', () => {
    const txn = defaultEmbedStatusTxn(plan) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    const updateOp = txn.__ops.find((op) => op[0] === 'update')
    expect(updateOp![2]).toBe('r1')
    expect(updateOp![3]).toEqual({ embedStatus: 'blocked' })
  })

  it('emits no link op (the resource row already exists, linked at create)', () => {
    const txn = defaultEmbedStatusTxn(plan) as unknown as {
      __ops: [string, string, string, Record<string, unknown>][]
    }
    expect(txn.__ops.find((op) => op[0] === 'link')).toBeUndefined()
  })
})
