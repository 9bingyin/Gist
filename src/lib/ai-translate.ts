/**
 * Shared AI translation utilities
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { prisma } from "@/lib/db";
import { getAiCache, setAiCache, AiCacheType } from "@/lib/ai-cache";
import { withRateLimit } from "@/lib/ai-rate-limiter";
import {
  getTranslateTextPrompt,
  getTranslateHtmlPrompt,
  type PromptPair,
} from "@/lib/ai-prompts";
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults";

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
    provider: settingsMap.aiProvider || DEFAULT_SETTINGS.aiProvider,
    baseUrl: settingsMap.aiBaseUrl || undefined,
    apiKey,
    model: settingsMap.aiModel || undefined,
    language: settingsMap.aiLanguage || DEFAULT_SETTINGS.aiLanguage,
    thinking: (settingsMap.aiThinking ?? DEFAULT_SETTINGS.aiThinking) === "true",
    thinkingEffort: (settingsMap.aiThinkingEffort || DEFAULT_SETTINGS.aiThinkingEffort) as ThinkingEffort,
  };
}

export type TranslateType = "title" | "summary" | "content";

interface TranslateOptions {
  content: string;
  type: TranslateType;
  settings: AiSettings;
  articleId?: string;
  cacheType?: AiCacheType;
  title?: string;
  signal?: AbortSignal;
}

/**
 * Translate a single piece of content
 */
export async function translateContent(
  options: TranslateOptions
): Promise<string> {
  const { content, type, settings, articleId, cacheType, title, signal } = options;

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
    // For HTML content, translate directly while preserving structure
    translatedContent = await translateHtmlContent(content, settings, title, signal);
  } else {
    // For title and summary, translate directly
    translatedContent = await translatePlainText(content, type, settings, signal);
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
  settings: AiSettings,
  signal?: AbortSignal
): Promise<string> {
  const promptPair = getTranslateTextPrompt(type, content, settings.language);
  const response = await callAiProvider(promptPair, settings, signal);
  return response.trim();
}

/**
 * Strip markdown code block wrapper if present
 * Handles ```html, ```xml, ``` etc.
 * Only strips if the inner content looks like HTML (starts with <)
 */
function stripMarkdownCodeBlock(text: string): string {
  const trimmed = text.trim();
  // Match ```lang or ``` at start and ``` at end
  const match = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/);
  if (match) {
    const inner = match[1].trim();
    // Only strip if inner content starts with < (looks like HTML)
    if (inner.startsWith("<")) {
      return inner;
    }
  }
  return trimmed;
}

/**
 * Translate HTML content directly - LLM preserves HTML structure
 */
async function translateHtmlContent(
  html: string,
  settings: AiSettings,
  title?: string,
  signal?: AbortSignal
): Promise<string> {
  // If no content or only whitespace, return original
  if (!html || !html.trim()) {
    return html;
  }

  // Build prompt for HTML translation
  const promptPair = getTranslateHtmlPrompt(html, settings.language, title);

  // Call AI to translate - system prompt instructs LLM to output clean HTML
  const response = await callAiProvider(promptPair, settings, signal);

  // Strip markdown code block wrapper if LLM added it despite instructions
  return stripMarkdownCodeBlock(response);
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
 * Check if error is a rate limit error (429)
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message;
    return message.includes("429") || message.includes("rate limit") || message.includes("Rate limit");
  }
  return false;
}

/**
 * Retry wrapper - retries on error except for rate limit (429)
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // Don't retry on rate limit errors
      if (isRateLimitError(error)) {
        throw error;
      }
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Call the AI provider with system + user prompt
 */
async function callAiProvider(
  promptPair: PromptPair,
  settings: AiSettings,
  signal?: AbortSignal
): Promise<string> {
  const { system, prompt } = promptPair;

  if (settings.provider === "openai") {
    const openai = createOpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined,
    });

    const modelName = settings.model || "gpt-4o-mini";

    const result = await withRetry(() =>
      withRateLimit(() =>
        generateText({
          model: openai(modelName),
          system,
          prompt,
          abortSignal: signal,
          maxRetries: 0,
          ...(settings.thinking && {
            providerOptions: {
              openai: {
                reasoningEffort: settings.thinkingEffort || "medium",
              },
            },
          }),
        })
      )
    );

    return result.text;
  } else if (settings.provider === "openai-compatible") {
    const compatible = createOpenAICompatible({
      name: "custom",
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || "http://localhost:11434/v1",
    });

    const modelName = settings.model || "llama3.2";

    const result = await withRetry(() =>
      withRateLimit(() =>
        generateText({
          model: compatible(modelName),
          system,
          prompt,
          abortSignal: signal,
          maxRetries: 0,
          ...(settings.thinking && {
            providerOptions: {
              openai: {
                reasoningEffort: settings.thinkingEffort || "medium",
              },
            },
          }),
        })
      )
    );

    return result.text;
  } else if (settings.provider === "anthropic") {
    const anthropic = createAnthropic({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined,
    });

    const modelName = settings.model || "claude-3-5-haiku-20241022";

    const result = await withRetry(() =>
      withRateLimit(() =>
        generateText({
          model: anthropic(modelName),
          system,
          prompt,
          abortSignal: signal,
          maxRetries: 0,
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
      )
    );

    return result.text;
  } else if (settings.provider === "openrouter") {
    const openrouter = createOpenRouter({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined,
    });

    const modelName = settings.model || "x-ai/grok-4.1-fast";

    const result = await withRetry(() =>
      withRateLimit(() =>
        generateText({
          model: openrouter(modelName),
          system,
          prompt,
          abortSignal: signal,
          maxRetries: 0,
          providerOptions: {
            openrouter: {
              reasoning: { enabled: settings.thinking ?? false },
            },
          },
        })
      )
    );

    return result.text;
  } else {
    throw new Error("Unsupported AI provider");
  }
}

/**
 * Format error message for API response
 * Returns original error message without translation
 */
export function formatAiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error occurred";
}
