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
} from './sessions'

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
