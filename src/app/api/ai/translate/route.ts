import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { getAiCache, setAiCache } from "@/lib/ai-cache";
import { withRateLimit } from "@/lib/ai-rate-limiter";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleId, content, title, summary, isReadability } = body;

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

    // Use different cache type for readability content
    const cacheType = isReadability ? "translate-readability" : "translate";

    // Check cache first
    if (articleId) {
      const cached = await getAiCache<{
        title: string | null;
        summary: string | null;
        content: string;
      }>(articleId, cacheType, language);
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

    const prompt = `<task>
Translate the following article into ${language}. Preserve the original HTML structure and formatting.
</task>

<requirements>
- Translate all text content into ${language}
- Keep all HTML tags intact (e.g., <p>, <h1>, <a>, <img>, etc.)
- Preserve all HTML attributes (href, src, class, etc.) unchanged
- Maintain the original paragraph structure and formatting
- Do not add any explanations or notes
</requirements>

<article>
${title ? `<title>${title}</title>\n\n` : ""}${summary ? `<summary>${summary}</summary>\n\n` : ""}<content>
${content}
</content>
</article>

<output_format>
Return a JSON object with the following fields:
- "title": the translated title (if title was provided, otherwise omit this field)
- "summary": the translated summary (if summary was provided, otherwise omit this field)
- "content": the translated HTML content

Example:
{"title": "translated title here", "summary": "translated summary here", "content": "<p>translated content here</p>"}
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
    let result = {
      title: null as string | null,
      summary: null as string | null,
      content: response,
    };
    try {
      // Try to extract JSON from the response (AI might include extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          title: parsed.title || null,
          summary: parsed.summary || null,
          content: parsed.content || response,
        };
      }
    } catch {
      // If JSON parsing fails, use raw response as content
    }

    // Save to cache
    if (articleId) {
      await setAiCache(articleId, cacheType, language, result);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI translate error:", error);

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

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
