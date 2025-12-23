import { translationActions } from "@/lib/stores/translation-store";
import { readNdjsonStream } from "@/lib/stream";

type TranslationField = "title" | "summary" | "content";

interface TranslationResponse {
  id: string;
  title: string | null;
  summary: string | null;
  content: string | null;
  language: string;
}

// Track in-flight requests to prevent duplicate calls
const inFlightRequests = new Map<string, Promise<void>>();

/**
 * Core translation function using unified NDJSON streaming API
 */
async function translateArticles(
  articles: Array<{
    id: string;
    title: string;
    summary: string | null;
    content?: string;
    isReadability?: boolean;
  }>,
  fields: TranslationField[],
  signal?: AbortSignal
): Promise<void> {
  if (articles.length === 0) return;

  const response = await fetch("/api/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articles, fields }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Translation failed");
  }

  await readNdjsonStream<TranslationResponse>(response, (data) => {
    translationActions.set(data.id, data.language, {
      title: data.title,
      summary: data.summary,
      content: data.content,
    });
  });
}

interface TranslateArticleParams {
  articleId: string;
  title: string;
  summary: string | null;
  content: string;
  isReadability?: boolean;
}

/**
 * Translate a full article (title, summary, content)
 * Results are automatically saved to the store and database
 */
export async function translateArticle(
  params: TranslateArticleParams,
  signal?: AbortSignal
): Promise<void> {
  const { articleId, title, summary, content, isReadability } = params;
  const requestKey = `${articleId}-${isReadability ? "readability" : "normal"}`;

  // Return existing in-flight request if any
  const existingRequest = inFlightRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    try {
      await translateArticles(
        [{ id: articleId, title, summary, content, isReadability }],
        ["title", "summary", "content"],
        signal
      );
    } finally {
      inFlightRequests.delete(requestKey);
    }
  })();

  inFlightRequests.set(requestKey, request);
  return request;
}

/**
 * Translate multiple articles' titles and summaries (for list view)
 * Uses NDJSON streaming - updates store as each translation completes
 */
export async function translateArticlesBatch(
  articles: Array<{ id: string; title: string; summary: string | null }>,
  signal?: AbortSignal
): Promise<void> {
  return translateArticles(
    articles.map((a) => ({ id: a.id, title: a.title, summary: a.summary })),
    ["title", "summary"],
    signal
  );
}

/**
 * Load cached translations from database into store
 * Call this on app initialization to restore translations
 */
export async function loadCachedTranslations(
  articleIds: string[]
): Promise<void> {
  if (articleIds.length === 0) return;

  const response = await fetch("/api/ai/translate/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articleIds }),
  });

  if (!response.ok) return;

  const result: {
    translations: Record<
      string,
      { title: string | null; summary: string | null; content: string | null }
    >;
    language: string;
  } = await response.json();

  // Update the store with cached translations
  for (const [articleId, translation] of Object.entries(result.translations)) {
    translationActions.set(articleId, result.language, translation);
  }
}
