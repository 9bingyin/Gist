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
import {
  extractTextsFromHtml,
  parseTranslationResponse,
} from "@/lib/html-text-extractor";
import {
  getTranslateTextPrompt,
  getTranslateSegmentsPrompt,
} from "@/lib/ai-prompts";

export type ThinkingEffort = "low" | "medium" | "high";

export interface AiSettings {
  provider: string;
  baseUrl?: string;
  apiKey: string;
  model?: string;
  language: string;
  thinking?: boolean;
  thinkingEffort?: ThinkingEffort;
}

/**
 * Get AI settings from database
 */
export async function getAiSettings(): Promise<AiSettings | null> {
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
    thinking: settingsMap.aiThinking === "true",
    thinkingEffort: (settingsMap.aiThinkingEffort as ThinkingEffort) || "medium",
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

  let translatedContent: string;

  if (type === "content") {
    // For HTML content, extract text nodes, translate them, and replace back
    translatedContent = await translateHtmlContent(content, settings);
  } else {
    // For title and summary, translate directly
    translatedContent = await translatePlainText(content, type, settings);
  }

  // Save to cache
  if (articleId && cacheType) {
    await setAiCache(articleId, cacheType, settings.language, {
      content: translatedContent,
    });
  }

  return translatedContent;
}

/**
 * Translate plain text (title or summary)
 */
async function translatePlainText(
  content: string,
  type: "title" | "summary",
  settings: AiSettings
): Promise<string> {
  const prompt = getTranslateTextPrompt(type, content, settings.language);
  const response = await callAiProvider(prompt, settings);
  return cleanResponse(response);
}

/**
 * Translate HTML content by extracting text nodes
 */
async function translateHtmlContent(
  html: string,
  settings: AiSettings
): Promise<string> {
  // Extract text nodes from HTML
  const { texts, replaceTexts } = extractTextsFromHtml(html);

  // If no text to translate, return original HTML
  if (texts.length === 0 || texts.every((t) => !t.trim())) {
    return html;
  }

  // Build prompt with numbered text segments
  const prompt = getTranslateSegmentsPrompt(texts, settings.language);

  // Call AI to translate
  const response = await callAiProvider(prompt, settings);

  // Parse response back to array
  const translations = parseTranslationResponse(response, texts.length);

  // Replace text nodes with translations
  return replaceTexts(translations);
}

/**
 * Map thinking effort to Anthropic budget tokens
 */
function getThinkingBudgetTokens(effort: ThinkingEffort): number {
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
}

/**
 * Call the AI provider with the given prompt
 */
async function callAiProvider(prompt: string, settings: AiSettings): Promise<string> {
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
        ...(settings.thinking && {
          providerOptions: {
            openai: {
              reasoningEffort: settings.thinkingEffort || "medium",
            },
          },
        }),
      })
    );

    return result.text;
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
        ...(settings.thinking && {
          providerOptions: {
            openai: {
              reasoningEffort: settings.thinkingEffort || "medium",
            },
          },
        }),
      })
    );

    return result.text;
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
        ...(settings.thinking && {
          providerOptions: {
            anthropic: {
              thinking: {
                type: "enabled" as const,
                budgetTokens: getThinkingBudgetTokens(settings.thinkingEffort || "medium"),
              },
            },
          },
        }),
      })
    );

    return result.text;
  } else {
    throw new Error("Unsupported AI provider");
  }
}

/**
 * Clean up AI response (remove markdown code blocks)
 */
function cleanResponse(response: string): string {
  let cleaned = response.trim();
  if (cleaned.startsWith("```html")) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
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
