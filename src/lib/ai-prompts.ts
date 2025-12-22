/**
 * AI Prompts - Centralized prompt templates for AI features
 */

export interface PromptPair {
  system: string;
  prompt: string;
}

/**
 * Translation prompt for title or summary
 */
export function getTranslateTextPrompt(
  type: "title" | "summary",
  content: string,
  language: string
): PromptPair {
  const typeLabel = type === "title" ? "Title" : "Summary";
  return {
    system: `You are an expert translator. Translate the ${typeLabel.toLowerCase()} into ${language}.

CRITICAL: You MUST output in ${language}. This is NON-NEGOTIABLE. Any response not in ${language} is a FAILURE.

Rules:
- Output ONLY the translated text in ${language}, nothing else
- Preserve the original meaning and tone
- Keep proper nouns and brand names unchanged
- NEVER translate URLs
- NO explanations, NO notes, NO markdown formatting
- NO leading or trailing newlines`,
    prompt: content,
  };
}

/**
 * Translation prompt for HTML content - preserves HTML structure
 */
export function getTranslateHtmlPrompt(
  htmlContent: string,
  language: string
): PromptPair {
  return {
    system: `You are an expert translator. Translate HTML content into ${language} while preserving the exact HTML structure.

CRITICAL: You MUST translate ALL text content into ${language}. This is NON-NEGOTIABLE. Any text not in ${language} is a FAILURE.

Rules:
- Preserve ALL HTML tags, attributes, and structure exactly as-is
- Translate ALL text content between tags into ${language}
- NEVER translate: URLs, href/src attributes, content inside <pre> tags (code blocks), email addresses
- Output ONLY the translated HTML, nothing else
- NEVER wrap output in markdown code blocks
- NEVER add any explanations or comments
- NO leading or trailing newlines`,
    prompt: htmlContent,
  };
}

/**
 * Summarization prompt for article content
 */
export function getSummarizePrompt(
  content: string,
  title: string | undefined,
  language: string
): PromptPair {
  return {
    system: `You are an expert summarizer. Extract 3-5 key points from articles.

CRITICAL: You MUST write the summary in ${language}. This is NON-NEGOTIABLE. Any response not in ${language} is a FAILURE.

Rules:
- Output plain text ONLY in ${language}, one key point per line
- Write complete sentences in ${language}
- NEVER use Markdown formatting or bullet symbols (no *, -, 1., 2.)
- NEVER add introductions like "Here are the key points:"
- NEVER add conclusions at the end
- Use simple, clear language
- NO leading or trailing newlines`,
    prompt: title ? `Title: ${title}\n\n${content}` : content,
  };
}

/**
 * Test connection prompt with language instruction
 */
export function getTestPrompt(userPrompt: string, language: string): PromptPair {
  return {
    system: language
      ? `You MUST answer in ${language}. This is NON-NEGOTIABLE. Any response not in ${language} is a FAILURE.`
      : "You are a helpful assistant.",
    prompt: userPrompt,
  };
}
