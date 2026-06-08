import { describe, it, expect } from 'vitest'
import { safeUrl, safeHostname } from './safeUrl'

describe('safeUrl', () => {
  it('returns the same string for allowed schemes (case-insensitive)', () => {
    expect(safeUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(safeUrl('http://example.com')).toBe('http://example.com')
    expect(safeUrl('HTTPS://Example.com')).toBe('HTTPS://Example.com')
    expect(safeUrl('HtTp://example.com')).toBe('HtTp://example.com')
    expect(safeUrl('mailto:user@example.com')).toBe('mailto:user@example.com')
    expect(safeUrl('MAILTO:user@example.com')).toBe('MAILTO:user@example.com')
  })

  it('trims surrounding whitespace and returns the trimmed value', () => {
    expect(safeUrl('  https://example.com  ')).toBe('https://example.com')
    expect(safeUrl('\t mailto:user@example.com \n')).toBe('mailto:user@example.com')
  })

  it('returns undefined for dangerous or unsupported schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeUrl('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeUrl('ftp://example.com/file')).toBeUndefined()
    expect(safeUrl('  javascript:alert(1)  ')).toBeUndefined()
  })

  it('returns undefined for empty, null, and undefined input', () => {
    expect(safeUrl('')).toBeUndefined()
    expect(safeUrl(null)).toBeUndefined()
    expect(safeUrl(undefined)).toBeUndefined()
  })
})

describe('safeHostname', () => {
  it('returns the hostname for valid URLs', () => {
    expect(safeHostname('https://example.com/path?q=1')).toBe('example.com')
    expect(safeHostname('http://sub.example.org:8080/x')).toBe('sub.example.org')
  })

  it('strips a leading www. but only at the start', () => {
    expect(safeHostname('https://www.example.com')).toBe('example.com')
    expect(safeHostname('https://www.www.example.com')).toBe('www.example.com')
    expect(safeHostname('https://api.www.example.com')).toBe('api.www.example.com')
  })

  it("returns '' for unparseable input, null, undefined, and empty string", () => {
    expect(safeHostname('not a url')).toBe('')
    expect(safeHostname('example.com/no-scheme')).toBe('')
    expect(safeHostname(null)).toBe('')
    expect(safeHostname(undefined)).toBe('')
    expect(safeHostname('')).toBe('')
  })
})
