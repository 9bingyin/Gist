type LanguageDetectModule = typeof import("./language-detect");

let languageDetectModulePromise: Promise<LanguageDetectModule> | null = null;

async function getLanguageDetectModule() {
  if (!languageDetectModulePromise) {
    languageDetectModulePromise = import("./language-detect");
  }
  return languageDetectModulePromise;
}

export async function needsTranslation(
  title: string,
  summary: string | null,
  targetLanguage: string,
): Promise<boolean> {
  const module = await getLanguageDetectModule();
  return module.needsTranslation(title, summary, targetLanguage);
}
