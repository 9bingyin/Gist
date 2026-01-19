import { describe, it, expect } from 'vitest'
import { extractImagesFromHtml, getEntryImages } from './extract-images'

describe('extract-images', () => {
  describe('extractImagesFromHtml', () => {
    it('should extract image URLs from img tags', () => {
      const html = '<img src="https://example.com/image1.jpg"><img src="https://example.com/image2.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(2)
      expect(result).toContain('https://example.com/image1.jpg')
      expect(result).toContain('https://example.com/image2.jpg')
    })

    it('should extract from data-src attribute', () => {
      const html = '<img data-src="https://example.com/lazy.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('https://example.com/lazy.jpg')
    })

    it('should extract from data-lazy-src attribute', () => {
      const html = '<img data-lazy-src="https://example.com/lazy.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('https://example.com/lazy.jpg')
    })

    it('should filter out data URIs', () => {
      const html = '<img src="data:image/png;base64,abc123"><img src="https://example.com/real.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('https://example.com/real.jpg')
    })

    it('should return unique URLs', () => {
      const html = '<img src="https://example.com/same.jpg"><img src="https://example.com/same.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
    })

    it('should return empty array for empty input', () => {
      expect(extractImagesFromHtml('')).toEqual([])
    })

    it('should return empty array for HTML without images', () => {
      expect(extractImagesFromHtml('<p>No images here</p>')).toEqual([])
    })

    it('should filter out unsafe URLs', () => {
      const html = '<img src="javascript:alert(1)"><img src="https://example.com/safe.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('https://example.com/safe.jpg')
    })

    it('should handle nested img tags in complex HTML', () => {
      const html = `
        <article>
          <figure>
            <img src="https://example.com/figure.jpg" alt="Figure">
            <figcaption>Caption</figcaption>
          </figure>
          <p>Some text <img src="https://example.com/inline.jpg"> more text</p>
        </article>
      `
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(2)
      expect(result).toContain('https://example.com/figure.jpg')
      expect(result).toContain('https://example.com/inline.jpg')
    })

    it('should prefer src over data-src when both exist', () => {
      const html = '<img src="https://example.com/real.jpg" data-src="https://example.com/lazy.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('https://example.com/real.jpg')
    })

    it('should handle images with query parameters', () => {
      const html = '<img src="https://example.com/image.jpg?width=800&quality=90">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('https://example.com/image.jpg?width=800&quality=90')
    })

    it('should handle images with special characters in URL', () => {
      const html = '<img src="https://example.com/path/to/image%20with%20spaces.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
    })

    it('should handle malformed HTML gracefully', () => {
      const html = '<img src="https://example.com/img.jpg"><p>unclosed tag'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
    })

    it('should ignore images without any src attribute', () => {
      const html = '<img alt="no source"><img src="https://example.com/valid.jpg">'
      const result = extractImagesFromHtml(html)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('https://example.com/valid.jpg')
    })
  })

  describe('getEntryImages', () => {
    it('should return thumbnail first when provided', () => {
      const result = getEntryImages('https://example.com/thumb.jpg', undefined, undefined)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('/api/proxy/image/')
    })

    it('should extract images from content', () => {
      const html = '<img src="https://example.com/content.jpg">'
      const result = getEntryImages(undefined, html, 'https://example.com/article')
      expect(result).toHaveLength(1)
    })

    it('should combine thumbnail and content images', () => {
      const html = '<img src="https://example.com/content.jpg">'
      const result = getEntryImages('https://example.com/thumb.jpg', html, 'https://example.com/article')
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('should avoid duplicate images', () => {
      const html = '<img src="https://example.com/thumb.jpg">'
      const result = getEntryImages('https://example.com/thumb.jpg', html, 'https://example.com/article')
      expect(result).toHaveLength(1)
    })

    it('should return empty array when no images', () => {
      const result = getEntryImages(undefined, '<p>No images</p>', undefined)
      expect(result).toEqual([])
    })
  })
})
