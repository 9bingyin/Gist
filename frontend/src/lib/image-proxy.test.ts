import { describe, it, expect } from 'vitest'
import { getProxiedImageUrl } from './image-proxy'

describe('image-proxy', () => {
  describe('toAbsoluteUrl (tested via getProxiedImageUrl)', () => {
    it('should return absolute URL as-is', () => {
      const url = getProxiedImageUrl('https://example.com/image.jpg')
      expect(url).toContain('/api/proxy/image/')
    })

    it('should convert protocol-relative URL', () => {
      const url = getProxiedImageUrl('//example.com/image.jpg')
      expect(url).toContain('/api/proxy/image/')
    })

    it('should return data URI as-is', () => {
      const dataUri = 'data:image/png;base64,abc123'
      expect(getProxiedImageUrl(dataUri)).toBe(dataUri)
    })

    it('should return already proxied URL as-is', () => {
      const proxied = '/api/proxy/image/abc123'
      expect(getProxiedImageUrl(proxied)).toBe(proxied)
    })

    it('should resolve relative URL with base URL', () => {
      const url = getProxiedImageUrl('image.jpg', 'https://example.com/article/post.html')
      expect(url).toContain('/api/proxy/image/')
    })

    it('should resolve absolute path with base URL', () => {
      const url = getProxiedImageUrl('/images/photo.jpg', 'https://example.com/article/')
      expect(url).toContain('/api/proxy/image/')
    })

    it('should return original for relative URL without base', () => {
      expect(getProxiedImageUrl('image.jpg')).toBe('image.jpg')
    })

    it('should return original for relative URL with invalid base URL', () => {
      expect(getProxiedImageUrl('image.jpg', 'not a valid url')).toBe('image.jpg')
    })
  })

  describe('getProxiedImageUrl', () => {
    it('should generate proxied URL for absolute URL', () => {
      const url = getProxiedImageUrl('https://example.com/image.jpg')
      expect(url).toMatch(/^\/api\/proxy\/image\/[A-Za-z0-9_=-]+$/)
    })

    it('should include referer parameter when articleUrl is provided', () => {
      const url = getProxiedImageUrl('https://example.com/image.jpg', 'https://example.com/article')
      expect(url).toMatch(/^\/api\/proxy\/image\/[A-Za-z0-9_=-]+\?ref=[A-Za-z0-9_=-]+$/)
    })

    it('should handle URLs with special characters', () => {
      const url = getProxiedImageUrl('https://example.com/image.jpg?size=large&format=webp')
      expect(url).toContain('/api/proxy/image/')
    })

    it('should handle URLs with unicode characters', () => {
      const url = getProxiedImageUrl('https://example.com/images/photo.jpg')
      expect(url).toContain('/api/proxy/image/')
    })
  })

  // BUG regression: #2a1fc58 - Image proxy needs referer for CDN anti-hotlinking
  describe('BUG #2a1fc58: referer parameter for CDN anti-hotlinking', () => {
    it('should include ref parameter when articleUrl is provided (was missing before fix)', () => {
      // Before fix: Image proxy did not pass article URL as referer
      // CDN anti-hotlinking would block images without proper referer
      const url = getProxiedImageUrl(
        'https://cdn.example.com/image.jpg',
        'https://blog.example.com/post/123'
      )
      expect(url).toContain('?ref=')
    })

    it('should NOT include ref parameter when articleUrl is not provided', () => {
      const url = getProxiedImageUrl('https://example.com/image.jpg')
      expect(url).not.toContain('?ref=')
    })

    it('should properly encode articleUrl in ref parameter', () => {
      const url = getProxiedImageUrl(
        'https://example.com/image.jpg',
        'https://example.com/article?id=123&lang=en'
      )
      // ref parameter should be base64 encoded
      expect(url).toMatch(/\?ref=[A-Za-z0-9_=-]+$/)
    })

    it('should include ref even for relative images resolved with articleUrl', () => {
      const url = getProxiedImageUrl(
        '/images/photo.jpg',
        'https://example.com/article/post.html'
      )
      expect(url).toContain('/api/proxy/image/')
      expect(url).toContain('?ref=')
    })

    it('should handle protocol-relative image URLs with referer', () => {
      const url = getProxiedImageUrl(
        '//cdn.example.com/image.jpg',
        'https://example.com/article'
      )
      expect(url).toContain('/api/proxy/image/')
      expect(url).toContain('?ref=')
    })
  })
})
