import { create } from "zustand";

export interface ArticleTranslation {
  title: string | null;
  summary: string | null;
  content: string | null;
}

// Helper to create cache key that includes readability mode
function getCacheKey(language: string, isReadability: boolean): string {
  return isReadability ? `${language}:readability` : language;
}

interface TranslationState {
  // data[articleId][cacheKey] = translation
  // cacheKey = language or language:readability
  data: Record<string, Record<string, ArticleTranslation>>;

  // Actions
  getTranslation: (
    articleId: string,
    language: string,
    isReadability?: boolean
  ) => ArticleTranslation | undefined;
  setTranslation: (
    articleId: string,
    language: string,
    translation: Partial<ArticleTranslation>,
    isReadability?: boolean
  ) => void;
  clearTranslation: (articleId: string) => void;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  data: {},

  getTranslation: (articleId: string, language: string, isReadability = false) => {
    const key = getCacheKey(language, isReadability);
    return get().data[articleId]?.[key];
  },

  setTranslation: (
    articleId: string,
    language: string,
    translation: Partial<ArticleTranslation>,
    isReadability = false
  ) => {
    const key = getCacheKey(language, isReadability);
    set((state) => {
      const articleData = state.data[articleId] ?? {};
      const existingTranslation = articleData[key] ?? {
        title: null,
        summary: null,
        content: null,
      };

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
      };
    });
  },

  clearTranslation: (articleId: string) => {
    set((state) => {
      const { [articleId]: _removed, ...rest } = state.data;
      void _removed;
      return { data: rest };
    });
  },
}));

// Helper for external use
export { getCacheKey };

// Selectors for optimized subscriptions
export const translationActions = {
  get: useTranslationStore.getState().getTranslation,
  set: useTranslationStore.getState().setTranslation,
  clear: useTranslationStore.getState().clearTranslation,
};
