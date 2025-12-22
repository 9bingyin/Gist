import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { getAiCache, setAiCache } from "@/lib/ai-cache";
import { withRateLimit } from "@/lib/ai-rate-limiter";

export const maxDuration = 30;

interface SegmentRequest {
  articleId: string;
  segmentIndex: number;
  content: string;
  type: "title" | "summary" | "content";
  isReadability?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: SegmentRequest = await request.json();
    const { articleId, segmentIndex, content, type, isReadability } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Get AI settings from database
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ["aiProvider", "aiBaseUrl", "aiApiKey", "aiModel", "aiLanguage"],
        },
      },
    });

    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }

    const provider = settingsMap.aiProvider || "openai";
    const baseUrl = settingsMap.aiBaseUrl || undefined;
    const apiKey = settingsMap.aiApiKey;
    const model = settingsMap.aiModel || undefined;
    const language = settingsMap.aiLanguage || "Chinese";

    // Segment cache type includes segment index
    const cacheType = isReadability
      ? `translate-segment-readability-${segmentIndex}`
      : `translate-segment-${segmentIndex}`;

    // Check cache first
    if (articleId) {
      const cached = await getAiCache<{ content: string }>(
        articleId,
        cacheType as import("@/lib/ai-cache").AiCacheType,
        language
      );
      if (cached) {
        return NextResponse.json({
          segmentIndex,
          content: cached.content,
          cached: true,
        });
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "AI API key is not configured. Please configure it in Settings.",
        },
        { status: 400 }
      );
    }

    // Build prompt based on segment type
    let prompt: string;

    if (type === "title") {
      prompt = `Translate the following title into ${language}. Return only the translated text, no explanations.

Title: ${content}`;
    } else if (type === "summary") {
      prompt = `Translate the following summary into ${language}. Return only the translated text, no explanations.

Summary: ${content}`;
    } else {
      // Content segment - preserve HTML
      prompt = `Translate the following HTML content into ${language}.

Requirements:
- Translate all text content into ${language}
- Keep all HTML tags intact (e.g., <p>, <h1>, <a>, <img>, etc.)
- Preserve all HTML attributes (href, src, class, etc.) unchanged
- Return only the translated HTML, no explanations

Content:
${content}`;
    }

    let response: string;

    if (provider === "openai") {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });

      const modelName = model || "gpt-4o-mini";

      const result = await withRateLimit(() =>
        generateText({
          model: openai(modelName),
          prompt,
        })
      );

      response = result.text;
    } else if (provider === "openai-compatible") {
      const compatible = createOpenAICompatible({
        name: "custom",
        apiKey,
        baseURL: baseUrl || "http://localhost:11434/v1",
      });

      const modelName = model || "llama3.2";

      const result = await withRateLimit(() =>
        generateText({
          model: compatible(modelName),
          prompt,
        })
      );

      response = result.text;
    } else if (provider === "anthropic") {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: baseUrl || undefined,
      });

      const modelName = model || "claude-3-5-haiku-20241022";

      const result = await withRateLimit(() =>
        generateText({
          model: anthropic(modelName),
          prompt,
        })
      );

      response = result.text;
    } else {
      return NextResponse.json(
        { error: "Unsupported AI provider" },
        { status: 400 }
      );
    }

    // Clean up response (remove any markdown code blocks if present)
    let translatedContent = response.trim();
    if (translatedContent.startsWith("```html")) {
      translatedContent = translatedContent.slice(7);
    }
    if (translatedContent.startsWith("```")) {
      translatedContent = translatedContent.slice(3);
    }
    if (translatedContent.endsWith("```")) {
      translatedContent = translatedContent.slice(0, -3);
    }
    translatedContent = translatedContent.trim();

    // Save to cache
    if (articleId) {
      await setAiCache(articleId, cacheType as import("@/lib/ai-cache").AiCacheType, language, {
        content: translatedContent,
      });
    }

    return NextResponse.json({
      segmentIndex,
      content: translatedContent,
      cached: false,
    });
  } catch (error) {
    console.error("AI translate-segment error:", error);

    let errorMessage = "Unknown error occurred";

    if (error instanceof Error) {
      errorMessage = error.message;

      if (
        errorMessage.includes("401") ||
        errorMessage.includes("Unauthorized")
      ) {
        errorMessage = "Invalid API key";
      } else if (
        errorMessage.includes("404") ||
        errorMessage.includes("model")
      ) {
        errorMessage = "Invalid model name or model not found";
      } else if (errorMessage.includes("429")) {
        errorMessage = "Rate limit exceeded";
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
