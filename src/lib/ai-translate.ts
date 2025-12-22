/**
 * Shared AI translation utilities
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { getAiCache, setAiCache, AiCacheType } from "@/lib/ai-cache";
import { withRateLimit } from "@/lib/ai-rate-limiter";

export interface AiSettings {
  provider: string;
  baseUrl?: string;
  apiKey: string;
  model?: string;
  language: string;
}

/**
 * Get AI settings from database
 */
export async function getAiSettings(): Promise<AiSettings | null> {
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

  const apiKey = settingsMap.aiApiKey;
  if (!apiKey) {
    return null;
  }

  return {
    provider: settingsMap.aiProvider || "openai",
    baseUrl: settingsMap.aiBaseUrl || undefined,
    apiKey,
    model: settingsMap.aiModel || undefined,
    language: settingsMap.aiLanguage || "Chinese",
  };
}

export type TranslateType = "title" | "summary" | "content";

interface TranslateOptions {
  content: string;
  type: TranslateType;
  settings: AiSettings;
  articleId?: string;
  cacheType?: AiCacheType;
}

/**
 * Translate a single piece of content
 */
export async function translateContent(
  options: TranslateOptions
): Promise<string> {
  const { content, type, settings, articleId, cacheType } = options;

  if (!content || content.trim().length === 0) {
    return "";
  }

  // Check cache first
  if (articleId && cacheType) {
    const cached = await getAiCache<{ content: string }>(
      articleId,
      cacheType,
      settings.language
    );
    if (cached) {
      return cached.content;
    }
  }

  // Build prompt based on type
  let prompt: string;

  if (type === "title") {
    prompt = `Translate the following title into ${settings.language}. Return only the translated text, no explanations.

Title: ${content}`;
  } else if (type === "summary") {
    prompt = `Translate the following summary into ${settings.language}. Return only the translated text, no explanations.

Summary: ${content}`;
  } else {
    // Content - preserve HTML
    prompt = `Translate the following HTML content into ${settings.language}.

Requirements:
- Translate all text content into ${settings.language}
- Keep all HTML tags intact (e.g., <p>, <h1>, <a>, <img>, etc.)
- Preserve all HTML attributes (href, src, class, etc.) unchanged
- Return only the translated HTML, no explanations

Content:
${content}`;
  }

  let response: string;

  if (settings.provider === "openai") {
    const openai = createOpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined,
    });

    const modelName = settings.model || "gpt-4o-mini";

    const result = await withRateLimit(() =>
      generateText({
        model: openai(modelName),
        prompt,
      })
    );

    response = result.text;
  } else if (settings.provider === "openai-compatible") {
    const compatible = createOpenAICompatible({
      name: "custom",
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || "http://localhost:11434/v1",
    });

    const modelName = settings.model || "llama3.2";

    const result = await withRateLimit(() =>
      generateText({
        model: compatible(modelName),
        prompt,
      })
    );

    response = result.text;
  } else if (settings.provider === "anthropic") {
    const anthropic = createAnthropic({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined,
    });

    const modelName = settings.model || "claude-3-5-haiku-20241022";

    const result = await withRateLimit(() =>
      generateText({
        model: anthropic(modelName),
        prompt,
      })
    );

    response = result.text;
  } else {
    throw new Error("Unsupported AI provider");
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
  if (articleId && cacheType) {
    await setAiCache(articleId, cacheType, settings.language, {
      content: translatedContent,
    });
  }

  return translatedContent;
}

/**
 * Format error message for API response
 */
export function formatAiError(error: unknown): string {
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
    } else if (errorMessage.includes("Invalid time value")) {
      errorMessage =
        "API response format error. Please check your API key and base URL.";
    }
  }

  return errorMessage;
}
