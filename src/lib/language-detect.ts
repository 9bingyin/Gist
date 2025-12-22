import { franc } from "franc-min";
import striptags from "striptags";

/**
 * Language detection using franc-min
 * Maps ISO 639-3 codes to our supported language names
 */

// Map ISO 639-3 codes to our language names
const ISO_TO_LANGUAGE: Record<string, string> = {
  cmn: "Chinese", // Mandarin Chinese
  zho: "Chinese", // Chinese (generic)
  jpn: "Japanese",
  kor: "Korean",
  eng: "English",
  fra: "French",
  deu: "German",
  spa: "Spanish",
};

// Map our language names to ISO 639-3 codes for matching
const LANGUAGE_TO_ISO: Record<string, string[]> = {
  chinese: ["cmn", "zho"],
  japanese: ["jpn"],
  korean: ["kor"],
  english: ["eng"],
  french: ["fra"],
  german: ["deu"],
  spanish: ["spa"],
};

// Language aliases for matching (lowercase)
const LANGUAGE_ALIASES: Record<string, string> = {
  // Chinese
  "chinese": "chinese",
  "中文": "chinese",
  "简体中文": "chinese",
  "繁體中文": "chinese",
  "simplified chinese": "chinese",
  "traditional chinese": "chinese",
  // Japanese
  "japanese": "japanese",
  "日本語": "japanese",
  // Korean
  "korean": "korean",
  "한국어": "korean",
  // English
  "english": "english",
  // French
  "french": "french",
  "français": "french",
  // German
  "german": "german",
  "deutsch": "german",
  // Spanish
  "spanish": "spanish",
  "español": "spanish",
};

/**
 * Normalize language name for comparison
 */
function normalizeLanguage(lang: string): string {
  const lower = lang.toLowerCase().trim();
  return LANGUAGE_ALIASES[lower] || lower;
}

/**
 * Detect the language of text
 * Returns language name or null if uncertain
 */
export function detectLanguage(text: string): string | null {
  if (!text || text.length < 10) return null;

  // Clean text for better detection
  const cleanText = striptags(text)
    .replace(/https?:\/\/\S+/g, "") // Remove URLs
    .trim();

  if (cleanText.length < 10) return null;

  const detected = franc(cleanText);

  if (detected === "und") {
    // Undetermined
    return null;
  }

  return ISO_TO_LANGUAGE[detected] || null;
}

/**
 * Check if text is already in the target language
 */
export function isTargetLanguage(
  text: string,
  targetLanguage: string,
): boolean {
  const detected = detectLanguage(text);

  if (!detected) return false;

  return normalizeLanguage(detected) === normalizeLanguage(targetLanguage);
}

/**
 * Check if an article needs translation based on title and summary
 */
export function needsTranslation(
  title: string,
  summary: string | null,
  targetLanguage: string,
): boolean {
  // Combine title and summary for better detection
  const textToCheck = summary ? `${title} ${summary}` : title;

  const detected = detectLanguage(textToCheck);

  // If can't detect, assume needs translation
  if (!detected) return true;

  // Check if detected language matches target (using normalized names)
  return normalizeLanguage(detected) !== normalizeLanguage(targetLanguage);
}
