import { create } from 'zustand'

export interface ArticleTranslation {
  title: string | null
  summary: string | null
  content: string | null
}

// Helper to create cache key that includes readability mode
function getCacheKey(language: string, isReadability: boolean): string {
  return isReadability ? `${language}:readability` : language
}

interface TranslationState {
  // data[articleId][cacheKey] = translation
  // cacheKey = language or language:readability
  data: Record<string, Record<string, ArticleTranslation>>
  // Articles where user manually disabled translation
  disabled: Set<string>

  // Actions
  getTranslation: (
    articleId: string,
    language: string,
    isReadability?: boolean
  ) => ArticleTranslation | undefined
  setTranslation: (
    articleId: string,
    language: string,
    translation: Partial<ArticleTranslation>,
    isReadability?: boolean
  ) => void
  clearTranslation: (articleId: string) => void
  disableTranslation: (articleId: string) => void
  enableTranslation: (articleId: string) => void
  isDisabled: (articleId: string) => boolean
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  data: {},
  disabled: new Set<string>(),

  getTranslation: (
    articleId: string,
    language: string,
    isReadability = false
  ) => {
    // Return undefined if translation is disabled for this article
    if (get().disabled.has(articleId)) return undefined
    const key = getCacheKey(language, isReadability)
    return get().data[articleId]?.[key]
  },

  setTranslation: (
    articleId: string,
    language: string,
    translation: Partial<ArticleTranslation>,
    isReadability = false
  ) => {
    const key = getCacheKey(language, isReadability)
    set((state) => {
      const articleData = state.data[articleId] ?? {}
      const existingTranslation = articleData[key] ?? {
        title: null,
        summary: null,
        content: null,
      }

      return {
        data: {
          ...state.data,
          [articleId]: {
            ...articleData,
            [key]: {
              ...existingTranslation,
              ...translation,
            },
          },
        },
      }
    })
  },

  clearTranslation: (articleId: string) => {
    set((state) => {
      const { [articleId]: _removed, ...rest } = state.data
      void _removed
      return { data: rest }
    })
  },

  disableTranslation: (articleId: string) => {
    set((state) => {
      const newDisabled = new Set(state.disabled)
      newDisabled.add(articleId)
      // Also clear existing translation data
      const { [articleId]: _removed, ...rest } = state.data
      void _removed
      return { disabled: newDisabled, data: rest }
    })
  },

  enableTranslation: (articleId: string) => {
    set((state) => {
      const newDisabled = new Set(state.disabled)
      newDisabled.delete(articleId)
      return { disabled: newDisabled }
    })
  },

  isDisabled: (articleId: string) => {
    return get().disabled.has(articleId)
  },
}))

// Helper for external use
export { getCacheKey }

// Actions for external use (outside React components)
// Use dynamic getState() to avoid stale references
export const translationActions = {
  get: (articleId: string, language: string, isReadability?: boolean) =>
    useTranslationStore.getState().getTranslation(articleId, language, isReadability),
  set: (articleId: string, language: string, translation: Partial<ArticleTranslation>, isReadability?: boolean) =>
    useTranslationStore.getState().setTranslation(articleId, language, translation, isReadability),
  clear: (articleId: string) =>
    useTranslationStore.getState().clearTranslation(articleId),
  disable: (articleId: string) =>
    useTranslationStore.getState().disableTranslation(articleId),
  enable: (articleId: string) =>
    useTranslationStore.getState().enableTranslation(articleId),
  isDisabled: (articleId: string) =>
    useTranslationStore.getState().isDisabled(articleId),
}
