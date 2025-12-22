import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { getAiCache, setAiCache } from "@/lib/ai-cache";
import { withRateLimit } from "@/lib/ai-rate-limiter";
import { getSummarizePrompt } from "@/lib/ai-prompts";
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults";
import { formatAiError, withRetry } from "@/lib/ai-translate";

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

    const provider = settingsMap.aiProvider || DEFAULT_SETTINGS.aiProvider;
    const baseUrl = settingsMap.aiBaseUrl || undefined;
    const apiKey = settingsMap.aiApiKey;
    const model = settingsMap.aiModel || undefined;
    const language = settingsMap.aiLanguage || DEFAULT_SETTINGS.aiLanguage;
    const thinking = (settingsMap.aiThinking ?? DEFAULT_SETTINGS.aiThinking) === "true";
    const thinkingEffort = (settingsMap.aiThinkingEffort || DEFAULT_SETTINGS.aiThinkingEffort) as
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

    // Create system + user prompt pair for summarization
    const promptPair = getSummarizePrompt(content, title, language);

    let response: string;

    if (provider === "openai") {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });

      const modelName = model || "gpt-4o-mini";

      try {
        const result = await withRetry(() =>
          withRateLimit(() =>
            generateText({
              model: openai(modelName),
              system: promptPair.system,
              prompt: promptPair.prompt,
              maxRetries: 0,
              ...(thinking && {
                providerOptions: {
                  openai: {
                    reasoningEffort: thinkingEffort,
                  },
                },
              }),
            }),
          ),
        );

        response = result.text;
      } catch (err) {
        console.error("OpenAI API error:", err);
        throw err;
      }
    } else if (provider === "openai-compatible") {
      const compatible = createOpenAICompatible({
        name: "custom",
        apiKey,
        baseURL: baseUrl || "http://localhost:11434/v1",
      });

      const modelName = model || "llama3.2";

      try {
        const result = await withRetry(() =>
          withRateLimit(() =>
            generateText({
              model: compatible(modelName),
              system: promptPair.system,
              prompt: promptPair.prompt,
              maxRetries: 0,
              ...(thinking && {
                providerOptions: {
                  openai: {
                    reasoningEffort: thinkingEffort,
                  },
                },
              }),
            }),
          ),
        );

        response = result.text;
      } catch (err) {
        console.error("OpenAI Compatible API error:", err);
        throw err;
      }
    } else if (provider === "anthropic") {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: baseUrl || undefined,
      });

      const modelName = model || "claude-3-5-haiku-20241022";

      try {
        const result = await withRetry(() =>
          withRateLimit(() =>
            generateText({
              model: anthropic(modelName),
              system: promptPair.system,
              prompt: promptPair.prompt,
              maxRetries: 0,
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
          ),
        );

        response = result.text;
      } catch (err) {
        console.error("Anthropic API error:", err);
        throw err;
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
    return NextResponse.json({ error: formatAiError(error) }, { status: 500 });
  }
}
