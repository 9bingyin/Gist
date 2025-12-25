import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai-translate";

interface CacheRequest {
  articleIds: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: CacheRequest = await request.json();
    const { articleIds } = body;

    if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      return NextResponse.json(
        { error: "articleIds array is required" },
        { status: 400 }
      );
    }

    const settings = await getAiSettings();
    if (!settings) {
      return NextResponse.json({
        translations: {},
        language: "en",
      });
    }

    // Get full translations (non-readability only, as readability translations
    // are fetched on-demand when user enables readability mode)
    const fullCaches = await prisma.aiCache.findMany({
      where: {
        articleId: { in: articleIds },
        type: "translate",
        language: settings.language,
      },
    });

    // Get lite translations (title + summary only)
    const liteCaches = await prisma.aiCache.findMany({
      where: {
        articleId: { in: articleIds },
        type: "translate-lite",
        language: settings.language,
      },
    });

    // Build translations map, preferring full over lite
    const translations: Record<
      string,
      { title: string | null; summary: string | null; content: string | null }
    > = {};

    // First add lite translations
    for (const cache of liteCaches) {
      const parsed = JSON.parse(cache.result) as {
        title: string;
        summary: string | null;
      };
      translations[cache.articleId] = {
        title: parsed.title,
        summary: parsed.summary,
        content: null,
      };
    }

    // Then override with full translations
    for (const cache of fullCaches) {
      const parsed = JSON.parse(cache.result) as {
        title: string | null;
        summary: string | null;
        content: string | null;
      };
      translations[cache.articleId] = {
        title: parsed.title,
        summary: parsed.summary,
        content: parsed.content,
      };
    }

    return NextResponse.json({
      translations,
      language: settings.language,
    });
  } catch (error) {
    console.error("Failed to get cached translations:", error);
    return NextResponse.json(
      { error: "Failed to get cached translations" },
      { status: 500 }
    );
  }
}
