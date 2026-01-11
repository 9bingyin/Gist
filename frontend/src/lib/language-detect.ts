import { eld } from 'eld/small'
import { stripHtml } from './html-utils'

/**
 * Language detection using ELD (Efficient Language Detector)
 * Returns ISO 639-1 codes (zh, en, ja, etc.)
 */

// Map target language codes to ISO 639-1 codes
const TARGET_TO_ISO: Record<string, string> = {
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  'en-US': 'en',
  'en': 'en',
  'ja': 'ja',
  'ko': 'ko',
  'fr': 'fr',
  'de': 'de',
  'es': 'es',
  'ru': 'ru',
  'ar': 'ar',
  'pt': 'pt',
  'it': 'it',
}

/**
 * Clean text for language detection by removing HTML and URLs
 */
function cleanTextForDetection(text: string): string {
  return stripHtml(text)
    .replace(/https?:\/\/\S+/g, '')
    .trim()
}

/**
 * Detect the language of text
 * Returns ISO 639-1 code or null if uncertain
 */
export function detectLanguage(text: string): string | null {
  if (!text || text.length < 10) return null

  const cleanText = cleanTextForDetection(text)
  if (cleanText.length < 10) return null

  const result = eld.detect(cleanText)

  // Return null if language is undetermined or unreliable
  if (!result.language || !result.isReliable()) {
    return null
  }

  return result.language
}

/**
 * Get normalized ISO 639-1 code from target language code
 */
export function getTargetLanguageCode(targetLanguage: string): string {
  return TARGET_TO_ISO[targetLanguage] || targetLanguage
}

/**
 * Check if text is already in the target language
 */
export function isTargetLanguage(
  text: string,
  targetLanguage: string
): boolean {
  const detected = detectLanguage(text)
  if (!detected) return false

  const targetCode = getTargetLanguageCode(targetLanguage)
  return detected === targetCode
}

/**
 * Check if an article needs translation based on title and summary
 * Priority: content language > title language
 */
export function needsTranslation(
  title: string,
  summary: string | null,
  targetLanguage: string
): boolean {
  const targetCode = getTargetLanguageCode(targetLanguage)

  // 1. Priority: Check content language (if available and sufficient)
  if (summary) {
    const cleanSummary = cleanTextForDetection(summary)

    if (cleanSummary.length >= 20) {
      const result = eld.detect(cleanSummary)
      
      // Content matches target language -> no translation needed
      if (result.language === targetCode) {
        return false
      }
      
      // Content reliably detected as different language -> needs translation
      if (result.isReliable()) {
        return true
      }
    }
  }

  // 2. Fallback: Check title language (if content is insufficient or unreliable)
  if (title) {
    const cleanTitle = cleanTextForDetection(title)

    if (cleanTitle.length >= 10) {
      const result = eld.detect(cleanTitle)
      
      // Title matches target language -> no translation needed
      if (result.language === targetCode) {
        return false
      }
    }
  }

  // 3. Default: Assume needs translation if unable to determine
  return true
}
