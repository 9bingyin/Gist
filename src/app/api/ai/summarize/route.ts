import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { getAiCache, setAiCache } from "@/lib/ai-cache";
import { withRateLimit } from "@/lib/ai-rate-limiter";
import { getSummarizePrompt } from "@/lib/ai-prompts";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleId, content, title, isReadability } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    // Get AI settings from database
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            "aiProvider",
            "aiBaseUrl",
            "aiApiKey",
            "aiModel",
            "aiLanguage",
            "aiThinking",
            "aiThinkingEffort",
          ],
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
    const language = settingsMap.aiLanguage || "English";
    const thinking = settingsMap.aiThinking === "true";
    const thinkingEffort = (settingsMap.aiThinkingEffort || "medium") as
      | "low"
      | "medium"
      | "high";

    // Map thinking effort to Anthropic budget tokens
    const getThinkingBudgetTokens = (effort: "low" | "medium" | "high") => {
      switch (effort) {
        case "low":
          return 5000;
        case "medium":
          return 15000;
        case "high":
          return 30000;
        default:
          return 15000;
      }
    };

    // Use different cache type for readability content
    const cacheType = isReadability ? "summarize-readability" : "summarize";

    // Check cache first
    if (articleId) {
      const cached = await getAiCache<{ summary: string }>(
        articleId,
        cacheType,
        language,
      );
      if (cached) {
        return NextResponse.json(cached);
      }
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

    // Create prompt for summarization
    const prompt = getSummarizePrompt(content, title, language);

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
            ...(thinking && {
              providerOptions: {
                openai: {
                  reasoningEffort: thinkingEffort,
                },
              },
            }),
          }),
        );

        response = result.text;
      } catch (err) {
        console.error("OpenAI API error:", err);
        throw new Error(
          err instanceof Error
            ? `OpenAI error: ${err.message}`
            : "Failed to generate summary with OpenAI",
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
            ...(thinking && {
              providerOptions: {
                openai: {
                  reasoningEffort: thinkingEffort,
                },
              },
            }),
          }),
        );

        response = result.text;
      } catch (err) {
        console.error("OpenAI Compatible API error:", err);
        throw new Error(
          err instanceof Error
            ? `OpenAI Compatible error: ${err.message}`
            : "Failed to generate summary with OpenAI Compatible API",
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
            ...(thinking && {
              providerOptions: {
                anthropic: {
                  thinking: {
                    type: "enabled" as const,
                    budgetTokens: getThinkingBudgetTokens(thinkingEffort),
                  },
                },
              },
            }),
          }),
        );

        response = result.text;
      } catch (err) {
        console.error("Anthropic API error:", err);
        throw new Error(
          err instanceof Error
            ? `Anthropic error: ${err.message}`
            : "Failed to generate summary with Anthropic",
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported AI provider" },
        { status: 400 },
      );
    }

    const result = { summary: response };

    // Save to cache
    if (articleId) {
      await setAiCache(articleId, cacheType, language, result);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI summarize error:", error);

    let errorMessage = "Unknown error occurred";

    if (error instanceof Error) {
      errorMessage = error.message;

      // Handle common error patterns
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
      } else if (errorMessage.includes("Invalid time value")) {
        errorMessage =
          "API response format error. Please check your API key and base URL.";
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
