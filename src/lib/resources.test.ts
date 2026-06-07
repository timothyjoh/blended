import { describe, it, expect } from 'vitest'
import { validateResourceUrl } from './resources'

// Full accept/reject table for the single URL-validation seam (SPEC §16.3/16.4).
// The function MUST be total — never throws on ANY input — so the suite drives
// every category plus hostile/non-string input and asserts no throw.
describe('validateResourceUrl', () => {
  describe('accepts absolute http/https URLs', () => {
    it('accepts an https URL and returns the normalized href', () => {
      const result = validateResourceUrl('https://example.com/slides')
      expect(result).toEqual({ ok: true, url: 'https://example.com/slides' })
    })

    it('accepts an http URL', () => {
      const result = validateResourceUrl('http://example.com')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.url).toBe('http://example.com/')
    })

    it('trims surrounding whitespace before accepting', () => {
      const result = validateResourceUrl('  https://example.com/a?b=1  ')
      expect(result).toEqual({ ok: true, url: 'https://example.com/a?b=1' })
    })

    it('accepts an uppercase HTTPS scheme (case-insensitive)', () => {
      const result = validateResourceUrl('HTTPS://EXAMPLE.COM/X')
      expect(result.ok).toBe(true)
    })
  })

  describe('rejects unsafe schemes', () => {
    it.each([
      ['javascript:alert(1)'],
      ['JavaScript:alert(1)'],
      ['data:text/html,<script>alert(1)</script>'],
      ['vbscript:msgbox(1)'],
      ['file:///etc/passwd'],
      ['ftp://example.com/x'],
      ['mailto:teacher@example.com'],
    ])('rejects %s as unsafe_scheme', (url) => {
      expect(validateResourceUrl(url)).toEqual({ ok: false, reason: 'unsafe_scheme' })
    })
  })

  describe('rejects blank/whitespace', () => {
    it.each([[''], ['   '], ['\t\n  ']])('rejects %j as blank', (url) => {
      expect(validateResourceUrl(url)).toEqual({ ok: false, reason: 'blank' })
    })
  })

  describe('rejects unparseable / relative / bare input', () => {
    it.each([
      ['example.com'],
      ['foo/bar'],
      ['not a url'],
      ['/relative/path'],
      ['://missing-scheme.com'],
    ])('rejects %j as unparseable', (url) => {
      expect(validateResourceUrl(url)).toEqual({ ok: false, reason: 'unparseable' })
    })
  })

  describe('is total — never throws on any input', () => {
    it('treats null as blank without throwing', () => {
      expect(() => validateResourceUrl(null)).not.toThrow()
      expect(validateResourceUrl(null)).toEqual({ ok: false, reason: 'blank' })
    })

    it('treats undefined as blank without throwing', () => {
      expect(() => validateResourceUrl(undefined)).not.toThrow()
      expect(validateResourceUrl(undefined)).toEqual({ ok: false, reason: 'blank' })
    })

    it('treats a non-string-ish value as blank without throwing', () => {
      // Defends the typeof guard — a caller passing a non-string never crashes.
      expect(() => validateResourceUrl(123 as unknown as string)).not.toThrow()
      expect(validateResourceUrl(123 as unknown as string)).toEqual({
        ok: false,
        reason: 'blank',
      })
    })

    it('never throws across the whole accept/reject fixture', () => {
      const fixture = [
        'https://example.com',
        'http://a.b',
        'javascript:alert(1)',
        'data:text/html,x',
        'vbscript:x',
        'file:///x',
        '',
        '   ',
        'example.com',
        'not a url',
        null,
        undefined,
      ]
      for (const input of fixture) {
        expect(() => validateResourceUrl(input as string)).not.toThrow()
      }
    })
  })
})
