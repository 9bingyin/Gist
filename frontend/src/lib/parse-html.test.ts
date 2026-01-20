import { describe, it, expect } from 'vitest'
import { parseHtml } from './parse-html'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'
import type { Root } from 'hast'

// Helper to convert hastTree back to HTML string for easier assertion
function hastToHtml(tree: Root): string {
  const processor = unified().use(rehypeStringify)
  return processor.stringify(tree)
}

describe('parse-html', () => {
  describe('parseHtml', () => {
    it('should parse basic HTML', () => {
      const result = parseHtml('<p>Hello World</p>')
      expect(hastToHtml(result.hastTree)).toBe('<p>Hello World</p>')
    })

    it('should trim trailing br elements', () => {
      const result = parseHtml('<p>Hello</p><br><br>')
      expect(hastToHtml(result.hastTree)).toBe('<p>Hello</p>')
    })

    it('should preserve allowed media tags', () => {
      const result = parseHtml('<video src="test.mp4" controls></video>')
      expect(hastToHtml(result.hastTree)).toContain('<video')
      expect(hastToHtml(result.hastTree)).toContain('controls')
    })
  })

  describe('emoji image conversion', () => {
    it('should convert WordPress wp-smiley emoji image to native emoji', () => {
      const html =
        '<p>Check this <img src="https://s.w.org/images/core/emoji/1.png" alt="\u2705" class="wp-smiley" style="height: 1em;"> out</p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).not.toContain('<img')
      expect(output).toContain('\u2705')
      expect(output).toBe('<p>Check this \u2705 out</p>')
    })

    it('should convert EmojiOne emoji image to native emoji', () => {
      const html =
        '<p>Hello <img class="emojione" alt="\ud83d\ude00" src="https://cdn.jsdelivr.net/emojione/1f600.png"> World</p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).not.toContain('<img')
      expect(output).toContain('\ud83d\ude00')
    })

    it('should convert Twemoji emoji image to native emoji', () => {
      const html =
        '<p>Love <img class="emoji" alt="\u2764\ufe0f" src="https://twemoji.maxcdn.com/heart.png"></p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).not.toContain('<img')
      expect(output).toContain('\u2764')
    })

    it('should convert emoji image with emoticon class', () => {
      const html = '<p>Hi <img class="emoticon" alt="\ud83d\udc4b" src="wave.png"></p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).not.toContain('<img')
      expect(output).toContain('\ud83d\udc4b')
    })

    it('should convert emoji image with smiley class', () => {
      const html = '<p>Happy <img class="smiley" alt="\ud83d\ude0a" src="smile.png"></p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).not.toContain('<img')
      expect(output).toContain('\ud83d\ude0a')
    })

    it('should handle case-insensitive class matching', () => {
      const html = '<p>Test <img class="WP-SMILEY" alt="\u2705" src="check.png"></p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).not.toContain('<img')
      expect(output).toContain('\u2705')
    })

    it('should NOT convert regular images without emoji class or URL', () => {
      const html = '<p>Photo <img src="https://example.com/photo.jpg" alt="A photo"></p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).toContain('<img')
      expect(output).toContain('src="https://example.com/photo.jpg"')
    })

    it('should NOT convert emoji-class image if alt is not an emoji', () => {
      const html = '<p>Icon <img class="emoji" alt="smile" src="smile.png"></p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).toContain('<img')
    })

    it('should NOT convert emoji-class image if alt is empty', () => {
      const html = '<p>Icon <img class="emoji" alt="" src="smile.png"></p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).toContain('<img')
    })

    it('should handle mixed content with emoji and regular images', () => {
      const html = `
        <p>
          Check <img class="wp-smiley" alt="\u2705" src="check.png">
          Photo <img src="photo.jpg" alt="My photo">
          Star <img class="emoji" alt="\u2b50" src="star.png">
        </p>
      `
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      // Emoji images should be converted
      expect(output).toContain('\u2705')
      expect(output).toContain('\u2b50')
      // Regular image should be preserved
      expect(output).toContain('<img')
      expect(output).toContain('photo.jpg')
    })

    it('should handle multiple consecutive emoji images', () => {
      const html =
        '<p><img class="emoji" alt="\ud83d\udc4d" src="1.png"><img class="emoji" alt="\ud83d\udc4e" src="2.png"><img class="emoji" alt="\ud83d\udc4c" src="3.png"></p>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).not.toContain('<img')
      expect(output).toContain('\ud83d\udc4d')
      expect(output).toContain('\ud83d\udc4e')
      expect(output).toContain('\ud83d\udc4c')
    })

    it('should handle emoji in nested elements', () => {
      const html =
        '<div><p><span>Hello <img class="emoji" alt="\ud83d\udc4b" src="wave.png"> World</span></p></div>'
      const result = parseHtml(html)
      const output = hastToHtml(result.hastTree)

      expect(output).not.toContain('<img')
      expect(output).toContain('\ud83d\udc4b')
    })

    it('should handle various emoji unicode ranges', () => {
      const testCases = [
        { alt: '\u2600', desc: 'sun (Miscellaneous Symbols)' },
        { alt: '\u2705', desc: 'check mark (Dingbats)' },
        { alt: '\ud83c\udf00', desc: 'cyclone (Miscellaneous Symbols and Pictographs)' },
        { alt: '\ud83d\ude00', desc: 'grinning face (Emoticons)' },
        { alt: '\ud83e\udd14', desc: 'thinking face (Supplemental Symbols)' },
      ]

      for (const { alt, desc } of testCases) {
        const html = `<p><img class="emoji" alt="${alt}" src="emoji.png"></p>`
        const result = parseHtml(html)
        const output = hastToHtml(result.hastTree)

        expect(output, `Failed for ${desc}`).not.toContain('<img')
        expect(output, `Failed for ${desc}`).toContain(alt)
      }
    })
  })
})
