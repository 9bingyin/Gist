package ai_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"gist/backend/internal/service/ai"
)

func TestGetSummarizePrompt_UsesLanguageName(t *testing.T) {
	prompt := ai.GetSummarizePrompt("Title", "en-US")
	require.Contains(t, prompt, "<article_title>Title</article_title>")
	require.Contains(t, prompt, "<target_language>English</target_language>")
}

func TestGetTranslateBlockPrompt_UsesLanguageName(t *testing.T) {
	prompt := ai.GetTranslateBlockPrompt("Title", "zh-CN")
	require.Contains(t, prompt, "<article_title>Title</article_title>")
	require.Contains(t, prompt, "<target_language>简体中文</target_language>")
}

func TestGetTranslateTextPrompt_UnknownLanguage(t *testing.T) {
	prompt := ai.GetTranslateTextPrompt("summary", "xx-XX")
	require.Contains(t, prompt, "<target_language>xx-XX</target_language>")
}

func TestOpenAIProvider_IsReasoningModel(t *testing.T) {
	provider, err := ai.NewOpenAIProvider("key", "", "gpt-5-mini", "", false, "")
	require.NoError(t, err)
	require.True(t, ai.IsReasoningModelForTest(provider))
}

func TestAnthropicProvider_Name(t *testing.T) {
	provider, err := ai.NewAnthropicProvider("key", "", "claude-3", false, 0)
	require.NoError(t, err)
	require.Equal(t, ai.ProviderAnthropic, provider.Name())
}

func TestAnthropicProvider_WithBaseURL(t *testing.T) {
	provider, err := ai.NewAnthropicProvider("key", "https://example.com", "claude-3", false, 0)
	require.NoError(t, err)
	require.Equal(t, ai.ProviderAnthropic, provider.Name())
}
