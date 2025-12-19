import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { parse as parseJson } from "best-effort-json-parser";
import striptags from "striptags";
import { prisma } from "@/lib/db";
import { getAiCacheBatch, setAiCacheBatch } from "@/lib/ai-cache";
import { withRateLimit } from "@/lib/ai-rate-limiter";

export const maxDuration = 60;

interface ArticleToTranslate {
  id: string;
  title: string;
  summary: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articles } = body as { articles: ArticleToTranslate[] };

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json(
        { error: "Articles array is required" },
        { status: 400 },
      );
    }

    // Limit batch size to prevent token overflow
    const batchArticles = articles.slice(0, 10);

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

    // Check cache first
    const articleIds = batchArticles.map((a) => a.id);
    const cachedTranslations = await getAiCacheBatch(
      articleIds,
      "translate-lite",
      language,
    );

    // Filter out already cached articles
    const uncachedArticles = batchArticles.filter(
      (a) => !cachedTranslations.has(a.id),
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

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "AI API key is not configured. Please configure it in Settings.",
        },
        { status: 400 },
      );
    }

    // Build articles content for translation (only uncached)
    const articlesContent = uncachedArticles
      .map((article, index) => {
        const summaryPart = article.summary
          ? `\n<summary>${striptags(article.summary).slice(0, 200)}</summary>`
          : "";
        return `<article id="${index}">
<title>${article.title}</title>${summaryPart}
</article>`;
      })
      .join("\n\n");

    const prompt = `<task>
Translate the following article titles and summaries into ${language}.
</task>

<requirements>
- Translate all text content into ${language}
- Return a JSON array with the translated results
- Each object should have: id (number), title (string), summary (string or null)
- Do not add any explanations or notes
- Keep the same order as input
</requirements>

<articles>
${articlesContent}
</articles>

<output_format>
Return a JSON array:
[{"id": 0, "title": "translated title", "summary": "translated summary or null"}, ...]
</output_format>`;

    let response: string;

    if (provider === "openai") {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });

      const modelName = model || "gpt-4o-mini";

      try {
        const result = await withRateLimit(() =>
          generateText({
            model: openai(modelName),
            prompt,
          }),
        );

        response = result.text;
      } catch (err) {
        console.error("OpenAI API error:", err);
        throw new Error(
          err instanceof Error
            ? `OpenAI error: ${err.message}`
            : "Failed to translate with OpenAI",
        );
      }
    } else if (provider === "openai-compatible") {
      const compatible = createOpenAICompatible({
        name: "custom",
        apiKey,
        baseURL: baseUrl || "http://localhost:11434/v1",
      });

      const modelName = model || "llama3.2";

      try {
        const result = await withRateLimit(() =>
          generateText({
            model: compatible(modelName),
            prompt,
          }),
        );

        response = result.text;
      } catch (err) {
        console.error("OpenAI Compatible API error:", err);
        throw new Error(
          err instanceof Error
            ? `OpenAI Compatible error: ${err.message}`
            : "Failed to translate with OpenAI Compatible API",
        );
      }
    } else if (provider === "anthropic") {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: baseUrl || undefined,
      });

      const modelName = model || "claude-3-5-haiku-20241022";

      try {
        const result = await withRateLimit(() =>
          generateText({
            model: anthropic(modelName),
            prompt,
          }),
        );

        response = result.text;
      } catch (err) {
        console.error("Anthropic API error:", err);
        throw new Error(
          err instanceof Error
            ? `Anthropic error: ${err.message}`
            : "Failed to translate with Anthropic",
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported AI provider" },
        { status: 400 },
      );
    }

    // Parse JSON response from AI
    const newTranslations = new Map<
      string,
      { title: string; summary: string | null }
    >();
    try {
      // Try to extract JSON array from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = parseJson(jsonMatch[0]) as Array<{
          id: number;
          title: string;
          summary: string | null;
        }>;

        // Map back to original article IDs
        for (const item of parsed) {
          const originalArticle = uncachedArticles[item.id];
          if (originalArticle) {
            newTranslations.set(originalArticle.id, {
              title: item.title,
              summary: item.summary,
            });
          }
        }
      }
    } catch {
      // If JSON parsing fails, continue with empty new translations
    }

    // Save new translations to cache
    if (newTranslations.size > 0) {
      await setAiCacheBatch(newTranslations, "translate-lite", language);
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
  } catch (error) {
    console.error("AI translate-lite error:", error);

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
