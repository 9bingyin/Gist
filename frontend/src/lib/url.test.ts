import { describe, it, expect } from 'vitest'
import { isSafeUrl, getSafeHostname, normalizeUrl } from './url'

describe('url utils', () => {
  describe('isSafeUrl', () => {
    it('should accept http urls', () => {
      expect(isSafeUrl('http://example.com')).toBe(true)
    })

    it('should accept https urls', () => {
      expect(isSafeUrl('https://example.com')).toBe(true)
    })

    it('should reject javascript urls', () => {
      expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    })

    it('should reject data urls', () => {
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    })

    it('should reject file urls', () => {
      expect(isSafeUrl('file:///etc/passwd')).toBe(false)
    })

    it('should reject ftp urls', () => {
      expect(isSafeUrl('ftp://example.com')).toBe(false)
    })

    it('should reject invalid urls', () => {
      expect(isSafeUrl('not a url')).toBe(false)
    })

    it('should handle urls with ports', () => {
      expect(isSafeUrl('https://example.com:8080')).toBe(true)
      expect(isSafeUrl('http://localhost:3000')).toBe(true)
    })

    it('should handle urls with authentication', () => {
      expect(isSafeUrl('https://user:pass@example.com')).toBe(true)
    })

    it('should handle urls with query strings and fragments', () => {
      expect(isSafeUrl('https://example.com/path?query=1#hash')).toBe(true)
    })
  })

  describe('getSafeHostname', () => {
    it('should extract hostname from valid url', () => {
      expect(getSafeHostname('https://example.com/path')).toBe('example.com')
    })

    it('should return undefined for invalid url', () => {
      expect(getSafeHostname('not a url')).toBeUndefined()
    })

    it('should return undefined for unsafe protocol', () => {
      expect(getSafeHostname('javascript:alert(1)')).toBeUndefined()
    })

    it('should handle subdomains', () => {
      expect(getSafeHostname('https://blog.example.com/post')).toBe('blog.example.com')
    })

    it('should handle urls with ports', () => {
      expect(getSafeHostname('https://example.com:8080/path')).toBe('example.com')
    })

    it('should handle localhost', () => {
      expect(getSafeHostname('http://localhost:3000')).toBe('localhost')
    })

    it('should handle IP addresses', () => {
      expect(getSafeHostname('http://192.168.1.1/path')).toBe('192.168.1.1')
    })
  })

  describe('normalizeUrl', () => {
    it('should add https to bare domains', () => {
      expect(normalizeUrl('example.com')).toBe('https://example.com')
    })

    it('should convert feed:// to https://', () => {
      expect(normalizeUrl('feed://example.com/rss')).toBe('https://example.com/rss')
    })

    it('should preserve existing http://', () => {
      expect(normalizeUrl('http://example.com')).toBe('http://example.com')
    })

    it('should preserve existing https://', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com')
    })

    it('should return null for empty input', () => {
      expect(normalizeUrl('')).toBe(null)
      expect(normalizeUrl('   ')).toBe(null)
    })

    it('should return null for invalid URL after normalization', () => {
      expect(normalizeUrl(':::')).toBe(null)
      expect(normalizeUrl('[invalid')).toBe(null)
    })

    it('should trim whitespace', () => {
      expect(normalizeUrl('  example.com  ')).toBe('https://example.com')
    })

    it('should handle feed:// with path and query', () => {
      expect(normalizeUrl('feed://example.com/rss.xml?format=atom')).toBe('https://example.com/rss.xml?format=atom')
    })

    it('should handle domains with subdomains', () => {
      expect(normalizeUrl('blog.example.com/feed')).toBe('https://blog.example.com/feed')
    })

    it('should handle domains with ports', () => {
      expect(normalizeUrl('example.com:8080/rss')).toBe('https://example.com:8080/rss')
    })

    it('should reject javascript: protocol even after trimming', () => {
      expect(normalizeUrl('javascript:alert(1)')).toBe(null)
      expect(normalizeUrl('  javascript:void(0)  ')).toBe(null)
    })
  })
})
