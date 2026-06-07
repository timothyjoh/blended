import { describe, it, expect } from 'vitest'
import { id } from '@instantdb/react'
import { classifyMessage, deriveQuestionId } from './classify'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('classifyMessage', () => {
  it('is a question when the trimmed text ends with ?', () => {
    expect(classifyMessage('what is mitosis?')).toEqual({ isQuestion: true })
  })

  it('trims leading/trailing whitespace before the trailing-? check', () => {
    expect(classifyMessage('  what?  ')).toEqual({ isQuestion: true })
  })

  it('is NOT a question when ? is only internal (no trailing ?)', () => {
    expect(classifyMessage('why? then more text')).toEqual({ isQuestion: false })
  })

  it('is NOT a question for a casual statement', () => {
    expect(classifyMessage('ok thanks')).toEqual({ isQuestion: false })
  })

  // Failure/edge paths: total over any input — never throws.
  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['null', null],
    ['undefined', undefined],
  ] as const)('returns { isQuestion: false } without throwing for %s', (_label, input) => {
    let result: { isQuestion: boolean } | undefined
    expect(() => {
      result = classifyMessage(input)
    }).not.toThrow()
    expect(result).toEqual({ isQuestion: false })
  })

  it('treats a bare ? as a question', () => {
    expect(classifyMessage('?')).toEqual({ isQuestion: true })
  })
})

describe('deriveQuestionId', () => {
  it('is deterministic — same input yields the same id across calls', () => {
    const mId = id()
    expect(deriveQuestionId(mId)).toBe(deriveQuestionId(mId))
  })

  it('is injective — distinct message ids yield distinct question ids', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const q = deriveQuestionId(id())
      expect(seen.has(q)).toBe(false)
      seen.add(q)
    }
  })

  it('returns a valid v4-shaped UUID', () => {
    for (let i = 0; i < 50; i++) {
      expect(deriveQuestionId(id())).toMatch(UUID_RE)
    }
  })

  it('never equals the source message id (non-zero namespace)', () => {
    for (let i = 0; i < 50; i++) {
      const mId = id()
      expect(deriveQuestionId(mId)).not.toBe(mId)
    }
  })

  it('is bijective — the same derived id never collides for two known inputs', () => {
    const a = '11111111-1111-4111-8111-111111111111'
    const b = '22222222-2222-4222-8222-222222222222'
    expect(deriveQuestionId(a)).not.toBe(deriveQuestionId(b))
  })

  // Failure path: a non-UUID input surfaces an error rather than emitting garbage.
  it('throws on a non-UUID-shaped id', () => {
    expect(() => deriveQuestionId('not-a-uuid')).toThrow(/not a UUID-shaped id/)
    expect(() => deriveQuestionId('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz')).toThrow(
      /not a UUID-shaped id/
    )
  })
})
