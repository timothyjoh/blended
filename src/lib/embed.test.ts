import { describe, it, expect } from 'vitest'
import { EMBED_LOAD_TIMEOUT_MS, resourceCardHeading } from './embed'

describe('resourceCardHeading (cycle 0018)', () => {
  it('returns the trimmed title when present', () => {
    expect(resourceCardHeading('  Intro slides  ', 'https://example.com/x')).toBe('Intro slides')
  })

  it('falls back to the URL hostname when the title is blank', () => {
    expect(resourceCardHeading('   ', 'https://slides.example.com/deck/3')).toBe(
      'slides.example.com'
    )
  })

  it('falls back to the URL hostname when the title is null/undefined', () => {
    expect(resourceCardHeading(null, 'https://host.test/p')).toBe('host.test')
    expect(resourceCardHeading(undefined, 'https://host.test/p')).toBe('host.test')
  })

  it('falls back to the raw url when it cannot be parsed', () => {
    expect(resourceCardHeading('', 'not a url')).toBe('not a url')
  })
})

describe('EMBED_LOAD_TIMEOUT_MS (cycle 0018)', () => {
  it('is a positive number (guards against an accidental 0/negative that would fire instantly)', () => {
    expect(typeof EMBED_LOAD_TIMEOUT_MS).toBe('number')
    expect(EMBED_LOAD_TIMEOUT_MS).toBeGreaterThan(0)
  })
})
