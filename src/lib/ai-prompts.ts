/**
 * AI Prompts - Centralized prompt templates for AI features
 */

/**
 * Translation prompt for title or summary
 */
export function getTranslateTextPrompt(
  type: "title" | "summary",
  content: string,
  language: string
): string {
  const typeLabel = type === "title" ? "Title" : "Summary";
  return `Translate the following ${typeLabel.toLowerCase()} into ${language}. Return only the translated text, no explanations.

${typeLabel}: ${content}`;
}

/**
 * Translation prompt for numbered text segments (HTML content)
 */
export function getTranslateSegmentsPrompt(
  texts: string[],
  language: string
): string {
  const numberedTexts = texts.map((text, i) => `[${i}] ${text}`).join("\n");

  return `Translate the following numbered text segments into ${language}.

Rules:
- Keep the same numbering format [N] for each line
- Only translate the text after the number
- Preserve any leading/trailing whitespace in the original text
- Do not add explanations

Text segments:
${numberedTexts}`;
}

/**
 * Summarization prompt for article content
 */
export function getSummarizePrompt(
  content: string,
  title: string | undefined,
  language: string
): string {
  const languageInstruction = language
    ? `You must answer in ${language}.`
    : "";

  return `${languageInstruction}

<task>
Summarize the following article by extracting 3-5 key points. Each point should be a concise statement of important information or main ideas.
Use simple, clear language that is easy to understand for general readers.
</task>

<requirements>
- Output in plain text format only
- Do NOT use Markdown formatting
- Do NOT use any prefixes: no asterisks (*), hyphens (-), numbers (1., 2.), or bullet symbols
- Start each point on a new line without any prefix
- Each point should be a complete sentence
- Focus on factual information and main ideas
- Use plain, accessible language - avoid jargon and technical terms when possible
- Write in a conversational, easy-to-understand style
</requirements>

<article>
${title ? `<title>${title}</title>\n\n` : ""}<content>
${content}
</content>
</article>

<output_format>
Return only the key points, one per line, without any prefixes or formatting symbols.
</output_format>`;
}

/**
 * Test connection prompt with language instruction
 */
export function getTestPrompt(prompt: string, language: string): string {
  const languageInstruction = language
    ? `You must answer me in ${language}. `
    : "";
  return languageInstruction + prompt;
}
