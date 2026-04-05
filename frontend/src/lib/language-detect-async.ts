type LanguageDetectModule = typeof import('./language-detect')

let languageDetectModulePromise: Promise<LanguageDetectModule> | null = null

async function getLanguageDetectModule() {
  if (!languageDetectModulePromise) {
    languageDetectModulePromise = import('./language-detect')
  }
  return languageDetectModulePromise
}

export async function detectLanguage(text: string): Promise<string | null> {
  const module = await getLanguageDetectModule()
  return module.detectLanguage(text)
}

export async function isTargetLanguage(
  text: string,
  targetLanguage: string
): Promise<boolean> {
  const module = await getLanguageDetectModule()
  return module.isTargetLanguage(text, targetLanguage)
}

export async function needsTranslation(
  title: string,
  summary: string | null,
  targetLanguage: string
): Promise<boolean> {
  const module = await getLanguageDetectModule()
  return module.needsTranslation(title, summary, targetLanguage)
}
