import { prisma } from "@/lib/db";

export type AiCacheType =
  | "translate"
  | "translate-readability"
  | "summarize"
  | "summarize-readability"
  | string; // Allow dynamic types

interface TranslateResult {
  title: string | null;
  summary: string | null;
  content: string | null;
}

interface SummarizeResult {
  summary: string;
}

interface SegmentResult {
  content: string;
}

type CacheResult = TranslateResult | SummarizeResult | SegmentResult;

/**
 * Get cached AI result
 */
export async function getAiCache<T extends CacheResult>(
  articleId: string,
  type: AiCacheType,
  language: string,
): Promise<T | null> {
  try {
    const cache = await prisma.aiCache.findUnique({
      where: {
        articleId_type_language: {
          articleId,
          type,
          language,
        },
      },
    });

    if (cache) {
      return JSON.parse(cache.result) as T;
    }
    return null;
  } catch (error) {
    console.error("Failed to get AI cache:", error);
    return null;
  }
}

/**
 * Set AI cache
 */
export async function setAiCache(
  articleId: string,
  type: AiCacheType,
  language: string,
  result: CacheResult,
): Promise<void> {
  try {
    await prisma.aiCache.upsert({
      where: {
        articleId_type_language: {
          articleId,
          type,
          language,
        },
      },
      update: {
        result: JSON.stringify(result),
      },
      create: {
        articleId,
        type,
        language,
        result: JSON.stringify(result),
      },
    });
  } catch (error) {
    console.error("Failed to set AI cache:", error);
  }
}

/**
 * Get multiple cached translations
 */
export async function getAiCacheBatch(
  articleIds: string[],
  type: AiCacheType,
  language: string,
): Promise<Map<string, TranslateResult>> {
  try {
    const caches = await prisma.aiCache.findMany({
      where: {
        articleId: { in: articleIds },
        type,
        language,
      },
    });

    const result = new Map<string, TranslateResult>();
    for (const cache of caches) {
      const parsed = JSON.parse(cache.result) as TranslateResult;
      result.set(cache.articleId, parsed);
    }
    return result;
  } catch (error) {
    console.error("Failed to get AI cache batch:", error);
    return new Map();
  }
}

/**
 * Clear AI cache for an article
 */
export async function clearAiCache(articleId: string): Promise<void> {
  try {
    await prisma.aiCache.deleteMany({
      where: { articleId },
    });
  } catch (error) {
    console.error("Failed to clear AI cache:", error);
  }
}

/**
 * Clear all AI cache
 */
export async function clearAllAiCache(): Promise<number> {
  try {
    const result = await prisma.aiCache.deleteMany({});
    return result.count;
  } catch (error) {
    console.error("Failed to clear all AI cache:", error);
    return 0;
  }
}
