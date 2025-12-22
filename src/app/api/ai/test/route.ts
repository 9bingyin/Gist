import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { getTestPrompt } from "@/lib/ai-prompts";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, baseUrl, apiKey, model, language, prompt } = body;

    // Get thinking settings from database
    const thinkingSettings = await prisma.setting.findMany({
      where: {
        key: {
          in: ["aiThinking", "aiThinkingEffort"],
        },
      },
    });
    const thinkingMap: Record<string, string> = {};
    for (const s of thinkingSettings) {
      thinkingMap[s.key] = s.value;
    }
    const thinking = thinkingMap.aiThinking === "true";
    const thinkingEffort = (thinkingMap.aiThinkingEffort || "medium") as "low" | "medium" | "high";

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 },
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 },
      );
    }

    // Add language instruction to prompt
    const fullPrompt = getTestPrompt(prompt, language);

    // Map thinking effort to Anthropic budget tokens
    const getThinkingBudgetTokens = (effort: string) => {
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

    let response: string;

    if (provider === "openai") {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });

      const modelName = model || "gpt-4o-mini";

      try {
        const result = await generateText({
          model: openai(modelName),
          prompt: fullPrompt,
          ...(thinking && {
            providerOptions: {
              openai: {
                reasoningEffort: thinkingEffort || "medium",
              },
            },
          }),
        });

        response = result.text;
      } catch (err) {
        console.error("OpenAI API error:", err);
        throw new Error(
          err instanceof Error
            ? `OpenAI error: ${err.message}`
            : "Failed to generate text with OpenAI",
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
        const result = await generateText({
          model: compatible(modelName),
          prompt: fullPrompt,
          ...(thinking && {
            providerOptions: {
              openai: {
                reasoningEffort: thinkingEffort || "medium",
              },
            },
          }),
        });

        response = result.text;
      } catch (err) {
        console.error("OpenAI Compatible API error:", err);
        throw new Error(
          err instanceof Error
            ? `OpenAI Compatible error: ${err.message}`
            : "Failed to generate text with OpenAI Compatible API",
        );
      }
    } else if (provider === "anthropic") {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: baseUrl || undefined,
      });

      const modelName = model || "claude-3-5-haiku-20241022";

      try {
        const result = await generateText({
          model: anthropic(modelName),
          prompt: fullPrompt,
          ...(thinking && {
            providerOptions: {
              anthropic: {
                thinking: {
                  type: "enabled" as const,
                  budgetTokens: getThinkingBudgetTokens(thinkingEffort || "medium"),
                },
              },
            },
          }),
        });

        response = result.text;
      } catch (err) {
        console.error("Anthropic API error:", err);
        throw new Error(
          err instanceof Error
            ? `Anthropic error: ${err.message}`
            : "Failed to generate text with Anthropic",
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported provider" },
        { status: 400 },
      );
    }

    return NextResponse.json({ response });
  } catch (error) {
    console.error("AI test error:", error);

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
