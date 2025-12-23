import { create } from "zustand";

export interface ArticleTranslation {
  title: string | null;
  summary: string | null;
  content: string | null;
}

interface TranslationState {
  // data[articleId][language] = translation
  data: Record<string, Record<string, ArticleTranslation>>;

  // Actions
  getTranslation: (
    articleId: string,
    language: string
  ) => ArticleTranslation | undefined;
  setTranslation: (
    articleId: string,
    language: string,
    translation: Partial<ArticleTranslation>
  ) => void;
  clearTranslation: (articleId: string) => void;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  data: {},

  getTranslation: (articleId: string, language: string) => {
    return get().data[articleId]?.[language];
  },

  setTranslation: (
    articleId: string,
    language: string,
    translation: Partial<ArticleTranslation>
  ) => {
    set((state) => {
      const articleData = state.data[articleId] ?? {};
      const existingTranslation = articleData[language] ?? {
        title: null,
        summary: null,
        content: null,
      };

      return {
        data: {
          ...state.data,
          [articleId]: {
            ...articleData,
            [language]: {
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

// Selectors for optimized subscriptions
export const translationActions = {
  get: useTranslationStore.getState().getTranslation,
  set: useTranslationStore.getState().setTranslation,
  clear: useTranslationStore.getState().clearTranslation,
};
