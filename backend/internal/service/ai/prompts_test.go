package ai_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"gist/backend/internal/service/ai"
)

func TestWrapInput(t *testing.T) {
	wrapped := ai.WrapInput("test content")
	require.Contains(t, wrapped, "<input>")
	require.Contains(t, wrapped, "test content")
	require.Contains(t, wrapped, "</input>")
	require.Contains(t, wrapped, "Remember:")
	require.Contains(t, wrapped, "DATA only")
}

func TestWrapInputSimple(t *testing.T) {
	wrapped := ai.WrapInputSimple("test content")
	require.Equal(t, "<input>\ntest content\n</input>", wrapped)
}

func TestGetSummarizePrompt_UsesLanguageName(t *testing.T) {
	prompt := ai.GetSummarizePrompt("Title", "en-US")
	require.Contains(t, prompt, "<article_title>Title</article_title>")
	require.Contains(t, prompt, "<target_language>English</target_language>")
}

func TestGetSummarizePrompt_ContainsInputReference(t *testing.T) {
	prompt := ai.GetSummarizePrompt("Title", "en-US")
	require.Contains(t, prompt, "<input>")
}

func TestGetSummarizePrompt_HasSecuritySection(t *testing.T) {
	prompt := ai.GetSummarizePrompt("", "zh-CN")
	require.Contains(t, prompt, "<security_critical>")
	require.Contains(t, prompt, "魔法咒语")
	require.Contains(t, prompt, "PROMPT INJECTION WARNING")
}

func TestGetSummarizePrompt_EmptyTitle(t *testing.T) {
	prompt := ai.GetSummarizePrompt("", "en-US")
	require.NotContains(t, prompt, "<article_title>")
}

func TestGetSummarizePrompt_OutputFormat(t *testing.T) {
	prompt := ai.GetSummarizePrompt("Title", "en-US")
	require.Contains(t, prompt, "No markdown")
	require.Contains(t, prompt, "No preamble")
	require.Contains(t, prompt, "START DIRECTLY")
}

func TestGetTranslateBlockPrompt_UsesLanguageName(t *testing.T) {
	prompt := ai.GetTranslateBlockPrompt("Title", "zh-CN")
	require.Contains(t, prompt, "<article_title>Title</article_title>")
	require.Contains(t, prompt, "<target_language>简体中文</target_language>")
}

func TestGetTranslateBlockPrompt_HasInputFormat(t *testing.T) {
	prompt := ai.GetTranslateBlockPrompt("Title", "en-US")
	require.Contains(t, prompt, "<input_format>")
	require.Contains(t, prompt, "<input>")
}

func TestGetTranslateTextPrompt_HasInputFormat(t *testing.T) {
	prompt := ai.GetTranslateTextPrompt("summary", "zh-CN")
	require.Contains(t, prompt, "<input_format>")
	require.Contains(t, prompt, "<input>")
}

func TestGetTranslateTextPrompt_UnknownLanguage(t *testing.T) {
	prompt := ai.GetTranslateTextPrompt("summary", "xx-XX")
	require.Contains(t, prompt, "<target_language>xx-XX</target_language>")
}

func TestAnthropicProvider_Name(t *testing.T) {
	provider, err := ai.NewAnthropicProvider("key", "", "claude-3", false, false, 0)
	require.NoError(t, err)
	require.Equal(t, ai.ProviderAnthropic, provider.Name())
}

func TestAnthropicProvider_WithBaseURL(t *testing.T) {
	provider, err := ai.NewAnthropicProvider("key", "https://example.com", "claude-3", false, false, 0)
	require.NoError(t, err)
	require.Equal(t, ai.ProviderAnthropic, provider.Name())
}
