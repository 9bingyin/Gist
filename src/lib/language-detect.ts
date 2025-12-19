import { franc } from "franc-min";

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

/**
 * Detect the language of text
 * Returns language name or null if uncertain
 */
export function detectLanguage(text: string): string | null {
  if (!text || text.length < 10) return null;

  // Clean text for better detection
  const cleanText = text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
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
export function isTargetLanguage(text: string, targetLanguage: string): boolean {
  const detected = detectLanguage(text);

  if (!detected) return false;

  return detected.toLowerCase() === targetLanguage.toLowerCase();
}

/**
 * Check if an article needs translation based on title and summary
 */
export function needsTranslation(
  title: string,
  summary: string | null,
  targetLanguage: string
): boolean {
  // Combine title and summary for better detection
  const textToCheck = summary ? `${title} ${summary}` : title;

  const detected = detectLanguage(textToCheck);

  // If can't detect, assume needs translation
  if (!detected) return true;

  // Check if detected language matches target
  return detected.toLowerCase() !== targetLanguage.toLowerCase();
}
