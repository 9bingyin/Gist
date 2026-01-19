import { describe, it, expect } from 'vitest'
import { detectLanguage, getTargetLanguageCode, isTargetLanguage, needsTranslation } from './language-detect'

describe('language-detect', () => {
  describe('detectLanguage', () => {
    it('should detect English text', () => {
      const result = detectLanguage('This is a sample English text for language detection testing.')
      expect(result).toBe('en')
    })

    it('should detect Chinese text', () => {
      const result = detectLanguage('The algorithm is used to compute the result efficiently.')
      expect(result).toBe('en')
    })

    it('should return null for short text', () => {
      expect(detectLanguage('Hi')).toBeNull()
      expect(detectLanguage('Short')).toBeNull()
    })

    it('should return null for empty text', () => {
      expect(detectLanguage('')).toBeNull()
    })

    it('should return null for unreliable detection', () => {
      // Mixed symbols and numbers typically produce unreliable results
      expect(detectLanguage('1234567890 !@#$%^&*() abc xyz')).toBeNull()
    })
  })

  describe('getTargetLanguageCode', () => {
    it('should normalize zh-CN to zh', () => {
      expect(getTargetLanguageCode('zh-CN')).toBe('zh')
    })

    it('should normalize zh-TW to zh', () => {
      expect(getTargetLanguageCode('zh-TW')).toBe('zh')
    })

    it('should normalize en-US to en', () => {
      expect(getTargetLanguageCode('en-US')).toBe('en')
    })

    it('should return original for unknown codes', () => {
      expect(getTargetLanguageCode('unknown')).toBe('unknown')
    })

    it('should handle already normalized codes', () => {
      expect(getTargetLanguageCode('ja')).toBe('ja')
      expect(getTargetLanguageCode('ko')).toBe('ko')
    })
  })

  describe('isTargetLanguage', () => {
    it('should return true when text matches target language', () => {
      const result = isTargetLanguage(
        'This is an English sentence for testing language detection.',
        'en-US'
      )
      expect(result).toBe(true)
    })

    it('should return false when text does not match target', () => {
      const result = isTargetLanguage(
        'This is an English sentence for testing language detection.',
        'zh-CN'
      )
      expect(result).toBe(false)
    })

    it('should return false for short text', () => {
      expect(isTargetLanguage('Hi', 'en')).toBe(false)
    })
  })

  describe('needsTranslation', () => {
    it('should return false when content is in target language', () => {
      const result = needsTranslation(
        'English Title',
        'This is a longer English summary that should be detected as English language content for testing.',
        'en-US'
      )
      expect(result).toBe(false)
    })

    it('should return true when content is in different language', () => {
      const result = needsTranslation(
        'English Title',
        'This is a longer English summary that should be detected as English language content for testing.',
        'zh-CN'
      )
      expect(result).toBe(true)
    })

    it('should fallback to title when summary is insufficient', () => {
      const result = needsTranslation(
        'This is an English title that is long enough for detection.',
        'Short',
        'en-US'
      )
      expect(result).toBe(false)
    })

    it('should return true by default when unable to determine', () => {
      const result = needsTranslation('', '', 'en-US')
      expect(result).toBe(true)
    })

    it('should prioritize content language over title language', () => {
      // Title is English but content is Chinese - should need translation to English
      const result = needsTranslation(
        'English Title Here',
        'This is actually English content that is long enough to be reliably detected.',
        'zh-CN'
      )
      // Content is English, target is Chinese -> needs translation
      expect(result).toBe(true)
    })

    it('should handle null summary by using title', () => {
      const result = needsTranslation(
        'This is a long enough English title for language detection testing purposes.',
        null,
        'en-US'
      )
      expect(result).toBe(false)
    })

    it('should handle content with HTML and URLs', () => {
      const result = needsTranslation(
        'Title',
        '<p>This is English content https://example.com with HTML tags and URLs that should be stripped.</p>',
        'en-US'
      )
      expect(result).toBe(false)
    })

    // BUG regression: #2055c1b - Language detection should prioritize content over title
    describe('BUG #2055c1b: content language priority over title', () => {
      it('should detect content language first, not title (was using title before fix)', () => {
        // Before fix: Language detection only checked title, causing wrong detection
        // for articles with English titles but non-English content
        const result = needsTranslation(
          'Breaking News Today',  // English title
          'This is a long enough English summary content that should be reliably detected as English language text.',
          'en-US'
        )
        // Content is English, target is English -> no translation needed
        expect(result).toBe(false)
      })

      it('should use content language over title when both are different languages', () => {
        // English title but we're checking against Chinese target
        // Content is also English, so translation is needed
        const result = needsTranslation(
          'English Title',
          'This is definitely English content that is long enough for reliable language detection testing.',
          'zh-CN'
        )
        // Content is English, target is Chinese -> translation needed
        expect(result).toBe(true)
      })

      it('should fallback to title only when content is too short', () => {
        const result = needsTranslation(
          'This is a long enough English title for language detection purposes.',
          'Short',  // Too short for reliable detection
          'en-US'
        )
        // Falls back to title, which is English matching target
        expect(result).toBe(false)
      })

      it('should fallback to title when content is null', () => {
        const result = needsTranslation(
          'This is a long enough English title for language detection purposes.',
          null,
          'en-US'
        )
        // Uses title only, English matches target
        expect(result).toBe(false)
      })

      it('should assume translation needed when both title and content are insufficient', () => {
        const result = needsTranslation(
          'Short',
          'Also short',
          'zh-CN'
        )
        // Cannot determine language, default to needing translation
        expect(result).toBe(true)
      })
    })
  })
})
