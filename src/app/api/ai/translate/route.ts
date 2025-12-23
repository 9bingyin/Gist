import { NextRequest, NextResponse } from "next/server";
import { getAiCacheBatch, setAiCache, type AiCacheType } from "@/lib/ai-cache";
import {
  getAiSettings,
  translateContent,
  formatAiError,
} from "@/lib/ai-translate";

export const maxDuration = 60;

type TranslationField = "title" | "summary" | "content";

interface TranslateRequest {
  articles: Array<{
    id: string;
    title: string;
    summary: string | null;
    content?: string;
    isReadability?: boolean;
  }>;
  fields: TranslationField[];
}

export async function POST(request: NextRequest) {
  try {
    const body: TranslateRequest = await request.json();
    const { articles, fields } = body;

    // Validate request
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json(
        { error: "Articles array is required" },
        { status: 400 }
      );
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json(
        { error: "Fields array is required" },
        { status: 400 }
      );
    }

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

    return handleTranslation(articles, fields, settings, request.signal);
  } catch (error) {
    console.error("AI translate error:", error);
    return NextResponse.json(
      { error: formatAiError(error) },
      { status: 500 }
    );
  }
}

// Unified translation handler with NDJSON streaming
async function handleTranslation(
  articles: TranslateRequest["articles"],
  fields: TranslationField[],
  settings: NonNullable<Awaited<ReturnType<typeof getAiSettings>>>,
  signal: AbortSignal
) {
  const language = settings.language;
  const batchArticles = articles.slice(0, 10);
  const articleIds = batchArticles.map((a) => a.id);
  const includesContent = fields.includes("content");

  // Determine cache type based on whether any article uses readability
  const hasReadability = batchArticles.some((a) => a.isReadability);
  const cacheType: AiCacheType = hasReadability ? "translate-readability" : "translate";

  // Get cached translations
  const cachedTranslations = await getAiCacheBatch(articleIds, cacheType, language);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendLine = (data: {
        id: string;
        title: string | null;
        summary: string | null;
        content: string | null;
        language: string;
        cached?: boolean;
      }) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      for (const article of batchArticles) {
        if (signal.aborted) break;

        const cached = cachedTranslations.get(article.id);

        // Check if all requested fields are cached
        const needsTitle = fields.includes("title") && !cached?.title;
        const needsSummary = fields.includes("summary") && article.summary && !cached?.summary;
        const needsContent = includesContent && article.content && !cached?.content;

        if (!needsTitle && !needsSummary && !needsContent && cached) {
          // All requested fields are cached
          sendLine({
            id: article.id,
            title: cached.title ?? null,
            summary: cached.summary ?? null,
            content: cached.content ?? null,
            language,
            cached: true,
          });
          continue;
        }

        try {
          // Translate missing fields
          const [translatedTitle, translatedSummary, translatedContent] = await Promise.all([
            needsTitle
              ? translateContent({ content: article.title, type: "title", settings, signal })
              : Promise.resolve(cached?.title ?? null),
            needsSummary
              ? translateContent({ content: article.summary!, type: "summary", settings, signal })
              : Promise.resolve(cached?.summary ?? null),
            needsContent
              ? translateContent({ content: article.content!, type: "content", settings, title: article.title, signal })
              : Promise.resolve(cached?.content ?? null),
          ]);

          // Merge with existing cache and save
          const newCache = {
            title: translatedTitle,
            summary: translatedSummary,
            content: translatedContent,
          };
          await setAiCache(article.id, cacheType, language, newCache);

          // Send result
          sendLine({
            id: article.id,
            title: translatedTitle,
            summary: translatedSummary,
            content: translatedContent,
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
