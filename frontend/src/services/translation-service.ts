import { streamBatchTranslate, type BatchTranslateArticle } from "@/api";
import { translationActions } from "@/stores/translation-store";

// Track articles currently being translated by batch token so stale batches never
// clear active tracking for a newer batch.
const inFlightBatchTokens = new Map<string, symbol>();

/**
 * Translate multiple articles' titles and summaries.
 * Callers supply their own AbortSignal so independent channels (list vs detail)
 * do not cancel each other.
 */
export async function translateArticlesBatch(
  articles: Array<{ id: string; title: string; summary: string | null }>,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted || articles.length === 0) return;

  const articlesToTranslate = articles.filter(
    (a) => !inFlightBatchTokens.has(a.id),
  );

  if (articlesToTranslate.length === 0) return;

  const batchToken = Symbol("batch-translate");
  for (const article of articlesToTranslate) {
    inFlightBatchTokens.set(article.id, batchToken);
  }

  try {
    const apiArticles: BatchTranslateArticle[] = articlesToTranslate.map(
      (a) => ({
        id: a.id,
        title: a.title,
        summary: a.summary ?? "",
      }),
    );

    for await (const result of streamBatchTranslate(apiArticles, signal)) {
      if (signal?.aborted) break;
      translationActions.set(result.id, targetLanguage, {
        title: result.title,
        summary: result.summary,
      });
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    throw error;
  } finally {
    for (const article of articlesToTranslate) {
      if (inFlightBatchTokens.get(article.id) === batchToken) {
        inFlightBatchTokens.delete(article.id);
      }
    }
  }
}
