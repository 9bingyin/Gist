import { translationActions } from "@/lib/stores/translation-store";

interface TranslateArticleParams {
  articleId: string;
  title: string;
  summary: string | null;
  content: string;
  isReadability?: boolean;
}

interface TranslateArticleResult {
  title: string | null;
  summary: string | null;
  content: string | null;
}

// Track in-flight requests to prevent duplicate calls
const inFlightRequests = new Map<string, Promise<TranslateArticleResult>>();

/**
 * Translate a full article (title, summary, content)
 * Results are automatically saved to the store and database
 */
export async function translateArticle(
  params: TranslateArticleParams,
  signal?: AbortSignal
): Promise<TranslateArticleResult> {
  const { articleId, title, summary, content, isReadability } = params;
  const requestKey = `${articleId}-${isReadability ? "readability" : "normal"}`;

  // Return existing in-flight request if any
  const existingRequest = inFlightRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    try {
      const response = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "full",
          articleId,
          title,
          summary,
          content,
          isReadability,
        }),
        signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Translation failed");
      }

      const result: {
        title: string | null;
        summary: string | null;
        content: string | null;
        language: string;
      } = await response.json();

      // Update the store with the translation result
      translationActions.set(articleId, result.language, {
        title: result.title,
        summary: result.summary,
        content: result.content,
      });

      return {
        title: result.title,
        summary: result.summary,
        content: result.content,
      };
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
  if (articles.length === 0) return;

  const response = await fetch("/api/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "batch",
      articles,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Batch translation failed");
  }

  // Read NDJSON stream
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data: {
          id: string;
          title: string;
          summary: string | null;
          language: string;
        } = JSON.parse(line);

        // Update store immediately for each translation
        translationActions.set(data.id, data.language, {
          title: data.title,
          summary: data.summary,
          content: null,
        });
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Process any remaining data in buffer
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      translationActions.set(data.id, data.language, {
        title: data.title,
        summary: data.summary,
        content: null,
      });
    } catch {
      // Ignore
    }
  }
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
