import { NextRequest, NextResponse } from "next/server";
import { getAiCache, getAiCacheBatch, setAiCacheBatch, AiCacheType } from "@/lib/ai-cache";
import {
  getAiSettings,
  translateContent,
  formatAiError,
} from "@/lib/ai-translate";

export const maxDuration = 60;

// Segment mode request
interface SegmentRequest {
  mode: "segment";
  articleId: string;
  segmentIndex: number;
  content: string;
  type: "title" | "summary" | "content";
  isReadability?: boolean;
}

// Batch mode request
interface BatchRequest {
  mode: "batch";
  articles: Array<{
    id: string;
    title: string;
    summary: string | null;
  }>;
}

type TranslateRequest = SegmentRequest | BatchRequest;

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

    if (body.mode === "segment") {
      return handleSegmentMode(body, settings);
    } else if (body.mode === "batch") {
      return handleBatchMode(body, settings);
    } else {
      return NextResponse.json(
        { error: "Invalid mode. Use 'segment' or 'batch'." },
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

// Handle segment translation mode
async function handleSegmentMode(
  body: SegmentRequest,
  settings: Awaited<ReturnType<typeof getAiSettings>>
) {
  const { articleId, segmentIndex, content, type, isReadability } = body;

  if (!content || content.trim().length === 0) {
    return NextResponse.json(
      { error: "Content is required" },
      { status: 400 }
    );
  }

  if (!settings) {
    return NextResponse.json(
      { error: "AI settings not available" },
      { status: 400 }
    );
  }

  // Segment cache type includes segment index
  const cacheType: AiCacheType = isReadability
    ? `translate-segment-readability-${segmentIndex}`
    : `translate-segment-${segmentIndex}`;

  // Check cache first
  if (articleId) {
    const cached = await getAiCache<{ content: string }>(
      articleId,
      cacheType,
      settings.language
    );
    if (cached) {
      return NextResponse.json({
        segmentIndex,
        content: cached.content,
        cached: true,
      });
    }
  }

  // Translate the segment
  const translatedContent = await translateContent({
    content,
    type,
    settings,
    articleId,
    cacheType,
  });

  return NextResponse.json({
    segmentIndex,
    content: translatedContent,
    cached: false,
  });
}

// Handle batch translation mode
async function handleBatchMode(
  body: BatchRequest,
  settings: Awaited<ReturnType<typeof getAiSettings>>
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

  // Limit batch size to prevent too many parallel requests
  const batchArticles = articles.slice(0, 10);

  // Check cache first
  const articleIds = batchArticles.map((a) => a.id);
  const cachedTranslations = await getAiCacheBatch(
    articleIds,
    "translate-lite",
    settings.language
  );

  // Filter out already cached articles
  const uncachedArticles = batchArticles.filter(
    (a) => !cachedTranslations.has(a.id)
  );

  // If all articles are cached, return cached results
  if (uncachedArticles.length === 0) {
    const results: Record<string, { title: string; summary: string | null }> =
      {};
    cachedTranslations.forEach((value, key) => {
      results[key] = value;
    });
    return NextResponse.json({ translations: results });
  }

  // Translate each article's title and summary in parallel
  const translationPromises = uncachedArticles.map(async (article) => {
    const [translatedTitle, translatedSummary] = await Promise.all([
      translateContent({
        content: article.title,
        type: "title",
        settings,
      }),
      article.summary
        ? translateContent({
            content: article.summary,
            type: "summary",
            settings,
          })
        : Promise.resolve(null),
    ]);

    return {
      id: article.id,
      title: translatedTitle,
      summary: translatedSummary,
    };
  });

  const translatedArticles = await Promise.all(translationPromises);

  // Build new translations map
  const newTranslations = new Map<
    string,
    { title: string; summary: string | null }
  >();
  for (const article of translatedArticles) {
    if (article.title) {
      newTranslations.set(article.id, {
        title: article.title,
        summary: article.summary,
      });
    }
  }

  // Save new translations to cache
  if (newTranslations.size > 0) {
    await setAiCacheBatch(newTranslations, "translate-lite", settings.language);
  }

  // Merge cached and new translations
  const results: Record<string, { title: string; summary: string | null }> =
    {};
  cachedTranslations.forEach((value, key) => {
    results[key] = value;
  });
  newTranslations.forEach((value, key) => {
    results[key] = value;
  });

  return NextResponse.json({ translations: results });
}
