"use client";

import { useCallback } from "react";
import {
  useTranslationStore,
  type ArticleTranslation,
} from "@/lib/stores/translation-store";

interface UseArticleTranslationOptions {
  articleId: string;
  language: string;
  enabled: boolean;
}

/**
 * Hook to get translation for an article
 * Subscribes to the translation store and returns the translation when available
 */
export function useArticleTranslation({
  articleId,
  language,
  enabled,
}: UseArticleTranslationOptions): ArticleTranslation | undefined {
  const translation = useTranslationStore(
    useCallback(
      (state) => state.data[articleId]?.[language],
      [articleId, language]
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
}: {
  articleId: string;
  language: string;
}): boolean {
  return useTranslationStore(
    useCallback(
      (state) => {
        const translation = state.data[articleId]?.[language];
        return !!(
          translation?.title ||
          translation?.summary ||
          translation?.content
        );
      },
      [articleId, language]
    )
  );
}
