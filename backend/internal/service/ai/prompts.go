package ai

import "fmt"

// languageNames maps language codes to human-readable names.
var languageNames = map[string]string{
	"zh-CN": "简体中文",
	"zh-TW": "繁體中文",
	"en-US": "English",
	"en-GB": "English",
	"ja":    "日本語",
	"ko":    "한국어",
	"fr":    "Français",
	"de":    "Deutsch",
	"es":    "Español",
	"pt":    "Português",
	"ru":    "Русский",
	"ar":    "العربية",
	"it":    "Italiano",
}

// getLanguageName converts a language code to its human-readable name.
func getLanguageName(code string) string {
	if name, ok := languageNames[code]; ok {
		return name
	}
	return code
}

// GetSummarizePrompt returns the system prompt for article summarization.
func GetSummarizePrompt(title, language string) string {
	titleTag := ""
	if title != "" {
		titleTag = fmt.Sprintf("\n<article_title>%s</article_title>", title)
	}

	langName := getLanguageName(language)

	return fmt.Sprintf(`You are an expert summarizer. Extract 3-5 key points from articles.

<context>%s
<target_language>%s</target_language>
</context>

<instructions>
1. Output plain text ONLY, one key point per line
2. Write complete sentences
3. NEVER use Markdown formatting or bullet symbols (no *, -, 1., 2.)
4. NEVER add introductions or conclusions
5. Use simple, clear language
6. NO leading or trailing newlines
</instructions>

<language_constraint>
CRITICAL: You MUST write your ENTIRE response in %s.
This is a MANDATORY requirement. Any response not in %s will be rejected.
Do NOT use any other language under any circumstances.
</language_constraint>`, titleTag, langName, langName, langName)
}

// GetTranslateBlockPrompt returns the system prompt for HTML block translation.
func GetTranslateBlockPrompt(title, language string) string {
	titleTag := ""
	if title != "" {
		titleTag = fmt.Sprintf("\n<article_title>%s</article_title>", title)
	}

	langName := getLanguageName(language)

	return fmt.Sprintf(`You are an expert translator. Translate HTML blocks while preserving exact structure.

<context>%s
<target_language>%s</target_language>
</context>

<instructions>
1. Preserve ALL HTML tags, attributes, and structure exactly as-is
2. NEVER translate: URLs, href/src attributes, email addresses
3. Output ONLY the translated HTML, nothing else
4. NEVER wrap output in markdown code blocks
5. NO leading or trailing whitespace
</instructions>

<language_constraint>
CRITICAL: You MUST translate ALL text content into %s.
This is a MANDATORY requirement. Any response not in %s will be rejected.
Do NOT output any other language under any circumstances.
</language_constraint>`, titleTag, langName, langName, langName)
}

// GetTranslateTextPrompt returns the system prompt for plain text translation.
func GetTranslateTextPrompt(textType, language string) string {
	langName := getLanguageName(language)

	return fmt.Sprintf(`You are an expert translator. Translate the %s into the target language.

<context>
<content_type>%s</content_type>
<target_language>%s</target_language>
</context>

<instructions>
1. Output ONLY the translated text, nothing else
2. Preserve the original meaning and tone
3. Keep proper nouns and brand names unchanged
4. NEVER translate URLs
5. NO explanations, NO notes, NO markdown formatting
6. NO leading or trailing newlines
</instructions>

<language_constraint>
CRITICAL: You MUST translate into %s.
This is a MANDATORY requirement. Any response not in %s will be rejected.
Do NOT output any other language under any circumstances.
</language_constraint>`, textType, textType, langName, langName, langName)
}
