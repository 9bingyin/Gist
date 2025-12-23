import { NextRequest, NextResponse } from "next/server";
import { getAiCache, getAiCacheBatch, setAiCache, setAiCacheBatch, AiCacheType } from "@/lib/ai-cache";
import {
  getAiSettings,
  translateContent,
  formatAiError,
} from "@/lib/ai-translate";

export const maxDuration = 60;

// Full article translation request
interface FullRequest {
  mode: "full";
  articleId: string;
  title: string;
  summary: string | null;
  content: string;
  isReadability?: boolean;
}

// Batch mode request (for list view - title + summary only)
interface BatchRequest {
  mode: "batch";
  articles: Array<{
    id: string;
    title: string;
    summary: string | null;
  }>;
}

type TranslateRequest = FullRequest | BatchRequest;

export async function POST(request: NextRequest) {
  try {
    const body: TranslateRequest = await request.json();

    // Get AI settings
    const settings = await getAiSettings();
    if (!settings) {
      return NextResponse.json(
        {
          error:
            "AI API key is not configured. Please configure it in Settings.",
        },
        { status: 400 }
      );
    }

    if (body.mode === "full") {
      return handleFullMode(body, settings, request.signal);
    } else if (body.mode === "batch") {
      return handleBatchMode(body, settings, request.signal);
    } else {
      return NextResponse.json(
        { error: "Invalid mode. Use 'full' or 'batch'." },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("AI translate error:", error);
    return NextResponse.json(
      { error: formatAiError(error) },
      { status: 500 }
    );
  }
}

// Handle full article translation
async function handleFullMode(
  body: FullRequest,
  settings: Awaited<ReturnType<typeof getAiSettings>>,
  signal: AbortSignal
) {
  const { articleId, title, summary, content, isReadability } = body;

  if (!settings) {
    return NextResponse.json(
      { error: "AI settings not available" },
      { status: 400 }
    );
  }

  const cacheType: AiCacheType = isReadability ? "translate-readability" : "translate";

  // Check cache first
  const cached = await getAiCache<{ title: string | null; summary: string | null; content: string | null }>(
    articleId,
    cacheType,
    settings.language
  );

  if (cached) {
    return NextResponse.json({
      title: cached.title,
      summary: cached.summary,
      content: cached.content,
      language: settings.language,
      cached: true,
    });
  }

  // Translate title, summary, and content in parallel
  const [translatedTitle, translatedSummary, translatedContent] = await Promise.all([
    title
      ? translateContent({
          content: title,
          type: "title",
          settings,
          signal,
        })
      : Promise.resolve(null),
    summary
      ? translateContent({
          content: summary,
          type: "summary",
          settings,
          signal,
        })
      : Promise.resolve(null),
    content
      ? translateContent({
          content,
          type: "content",
          settings,
          title,
          signal,
        })
      : Promise.resolve(null),
  ]);

  // Save to cache
  await setAiCache(articleId, cacheType, settings.language, {
    title: translatedTitle,
    summary: translatedSummary,
    content: translatedContent,
  });

  return NextResponse.json({
    title: translatedTitle,
    summary: translatedSummary,
    content: translatedContent,
    language: settings.language,
    cached: false,
  });
}

// Handle batch translation mode with NDJSON streaming (title + summary only, for list view)
async function handleBatchMode(
  body: BatchRequest,
  settings: Awaited<ReturnType<typeof getAiSettings>>,
  signal: AbortSignal
) {
  const { articles } = body;

  if (!articles || !Array.isArray(articles) || articles.length === 0) {
    return NextResponse.json(
      { error: "Articles array is required" },
      { status: 400 }
    );
  }

  if (!settings) {
    return NextResponse.json(
      { error: "AI settings not available" },
      { status: 400 }
    );
  }

  const language = settings.language;
  const batchArticles = articles.slice(0, 10);
  const articleIds = batchArticles.map((a) => a.id);
  const cachedTranslations = await getAiCacheBatch(
    articleIds,
    "translate-lite",
    language
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send NDJSON line
      const sendLine = (data: { id: string; title: string; summary: string | null; language: string; cached?: boolean }) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      // First, send all cached results immediately
      for (const [id, translation] of cachedTranslations) {
        sendLine({
          id,
          title: translation.title,
          summary: translation.summary,
          language,
          cached: true,
        });
      }

      // Then translate uncached articles one by one
      const uncachedArticles = batchArticles.filter(
        (a) => !cachedTranslations.has(a.id)
      );

      for (const article of uncachedArticles) {
        if (signal.aborted) break;

        try {
          const [translatedTitle, translatedSummary] = await Promise.all([
            translateContent({
              content: article.title,
              type: "title",
              settings,
              signal,
            }),
            article.summary
              ? translateContent({
                  content: article.summary,
                  type: "summary",
                  settings,
                  signal,
                })
              : Promise.resolve(null),
          ]);

          // Save to cache
          await setAiCacheBatch(
            new Map([[article.id, { title: translatedTitle, summary: translatedSummary }]]),
            "translate-lite",
            language
          );

          // Send result immediately
          sendLine({
            id: article.id,
            title: translatedTitle,
            summary: translatedSummary,
            language,
          });
        } catch (error) {
          if (signal.aborted) break;
          console.error(`Translation error for article ${article.id}:`, error);
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
