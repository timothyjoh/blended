import { describe, it, expect } from 'vitest'
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  generateJoinCode,
  buildSessionCreate,
  createSession,
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
