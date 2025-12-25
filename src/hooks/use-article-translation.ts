"use client";

import { useCallback } from "react";
import {
  useTranslationStore,
  getCacheKey,
  type ArticleTranslation,
} from "@/lib/stores/translation-store";

interface UseArticleTranslationOptions {
  articleId: string;
  language: string;
  enabled: boolean;
  isReadability?: boolean;
}

/**
 * Hook to get translation for an article
 * Subscribes to the translation store and returns the translation when available
 */
export function useArticleTranslation({
  articleId,
  language,
  enabled,
  isReadability = false,
}: UseArticleTranslationOptions): ArticleTranslation | undefined {
  const translation = useTranslationStore(
    useCallback(
      (state) => {
        const key = getCacheKey(language, isReadability);
        return state.data[articleId]?.[key];
      },
      [articleId, language, isReadability]
    )
  );

  // Check enabled at component level, not in selector
  // This ensures component re-renders when enabled changes
  if (!enabled) return undefined;
  return translation;
}

/**
 * Hook to check if translation exists for an article
 */
export function useHasTranslation({
  articleId,
  language,
  isReadability = false,
}: {
  articleId: string;
  language: string;
  isReadability?: boolean;
}): boolean {
  return useTranslationStore(
    useCallback(
      (state) => {
        const key = getCacheKey(language, isReadability);
        const translation = state.data[articleId]?.[key];
        return !!(
          translation?.title ||
          translation?.summary ||
          translation?.content
        );
      },
      [articleId, language, isReadability]
    )
  );
}
