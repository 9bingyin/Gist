import { describe, it, expect } from 'vitest'
import { stripHtml } from './html-utils'

describe('html-utils', () => {
  describe('stripHtml', () => {
    it('should strip HTML tags and return plain text', () => {
      expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World')
    })

    it('should handle nested tags', () => {
      expect(stripHtml('<div><p><span>Nested</span> text</p></div>')).toBe('Nested text')
    })

    it('should handle empty string', () => {
      expect(stripHtml('')).toBe('')
    })

    it('should handle text without HTML', () => {
      expect(stripHtml('Plain text')).toBe('Plain text')
    })

    it('should handle special characters', () => {
      expect(stripHtml('<p>&amp; &lt; &gt;</p>')).toBe('& < >')
    })

    it('should handle self-closing tags', () => {
      expect(stripHtml('Hello<br/>World')).toBe('HelloWorld')
      expect(stripHtml('Image: <img src="test.jpg" />')).toBe('Image: ')
    })

    it('should handle script and style tags', () => {
      // jsdom filters out script/style content for security
      expect(stripHtml('<script>alert("xss")</script>Hello')).toBe('Hello')
      expect(stripHtml('<style>.red{color:red}</style>Content')).toBe('Content')
    })

    it('should remove nested newsletter style content from summaries', () => {
      const html = [
        "<div class='beehiiv'>",
        '<style>.bh__table { border: 1px solid #C0C0C0; }</style>',
        '<div><p>Hello World</p></div>',
        '</div>',
      ].join('')

      expect(stripHtml(html)).toBe('Hello World')
    })

    it('should remove embedded fallback text from non-content tags', () => {
      const html = [
        '<iframe src="https://example.com/embed">iframe fallback</iframe>',
        '<object data="movie.swf">object fallback</object>',
        '<textarea>raw text</textarea>',
        '<p>Hello World</p>',
      ].join('')

      expect(stripHtml(html)).toBe('Hello World')
    })
  })
})
