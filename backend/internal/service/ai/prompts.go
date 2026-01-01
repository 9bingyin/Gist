package ai

import "fmt"

// GetSummarizePrompt returns the system prompt for article summarization.
func GetSummarizePrompt(title, language string) string {
	titleTag := ""
	if title != "" {
		titleTag = fmt.Sprintf("\n<article_title>%s</article_title>", title)
	}

	return fmt.Sprintf(`You are an expert summarizer. Extract 3-5 key points from articles.

<context>%s
<target_language>%s</target_language>
</context>

<instructions>
1. You MUST write in the language specified in <target_language>. Responses in other languages are invalid
2. Output plain text ONLY, one key point per line
3. Write complete sentences
4. NEVER use Markdown formatting or bullet symbols (no *, -, 1., 2.)
5. NEVER add introductions or conclusions
6. Use simple, clear language
7. NO leading or trailing newlines
</instructions>`, titleTag, language)
}

// GetTranslateBlockPrompt returns the system prompt for HTML block translation.
func GetTranslateBlockPrompt(title, language string) string {
	titleTag := ""
	if title != "" {
		titleTag = fmt.Sprintf("\n<article_title>%s</article_title>", title)
	}

	return fmt.Sprintf(`You are an expert translator. Translate HTML blocks while preserving exact structure.

<context>%s
<target_language>%s</target_language>
</context>

<instructions>
1. You MUST translate ALL text into the language specified in <target_language>. Responses in other languages are invalid
2. Preserve ALL HTML tags, attributes, and structure exactly as-is
3. NEVER translate: URLs, href/src attributes, email addresses
4. Output ONLY the translated HTML, nothing else
5. NEVER wrap output in markdown code blocks
6. NO leading or trailing whitespace
</instructions>`, titleTag, language)
}

// GetTranslateTextPrompt returns the system prompt for plain text translation.
func GetTranslateTextPrompt(textType, language string) string {
	return fmt.Sprintf(`You are an expert translator. Translate the %s into the target language.

<context>
<content_type>%s</content_type>
<target_language>%s</target_language>
</context>

<instructions>
1. You MUST translate into the language specified in <target_language>. Responses in other languages are invalid
2. Output ONLY the translated text, nothing else
3. Preserve the original meaning and tone
4. Keep proper nouns and brand names unchanged
5. NEVER translate URLs
6. NO explanations, NO notes, NO markdown formatting
7. NO leading or trailing newlines
</instructions>`, textType, textType, language)
}
