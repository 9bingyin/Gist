package service

import (
	"context"
	"errors"
	"testing"

	"gist/backend/internal/service/ai"
)

func TestSettingsService_GetAISettings_Defaults(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	settings, err := svc.GetAISettings(context.Background())
	if err != nil {
		t.Fatalf("GetAISettings failed: %v", err)
	}
	if settings.Provider != ai.ProviderOpenAI {
		t.Fatalf("expected default provider, got %s", settings.Provider)
	}
	if settings.ThinkingBudget != 10000 {
		t.Fatalf("expected default thinking budget, got %d", settings.ThinkingBudget)
	}
	if settings.ReasoningEffort != "medium" {
		t.Fatalf("expected default reasoning effort, got %s", settings.ReasoningEffort)
	}
	if settings.SummaryLanguage != "zh-CN" {
		t.Fatalf("expected default summary language, got %s", settings.SummaryLanguage)
	}
	if settings.RateLimit != ai.DefaultRateLimit {
		t.Fatalf("expected default rate limit, got %d", settings.RateLimit)
	}
}

func TestSettingsService_GetAISettings_MaskedKey(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data[keyAIProvider] = ai.ProviderOpenAI
	repo.data[keyAIAPIKey] = "sk-test-1234567890"
	repo.data[keyAIBaseURL] = "https://api.example.com"
	repo.data[keyAIModel] = "gpt-4"
	repo.data[keyAIThinking] = "true"
	repo.data[keyAIThinkingBudget] = "9000"
	repo.data[keyAIReasoningEffort] = "high"
	repo.data[keyAISummaryLanguage] = "en-US"
	repo.data[keyAIAutoTranslate] = "true"
	repo.data[keyAIAutoSummary] = "true"
	repo.data[keyAIRateLimit] = "5"

	svc := NewSettingsService(repo, ai.NewRateLimiter(0))
	settings, err := svc.GetAISettings(context.Background())
	if err != nil {
		t.Fatalf("GetAISettings failed: %v", err)
	}
	if settings.APIKey == "sk-test-1234567890" || settings.APIKey == "" {
		t.Fatalf("expected masked api key, got %s", settings.APIKey)
	}
	if settings.Provider != ai.ProviderOpenAI || settings.Model != "gpt-4" {
		t.Fatalf("unexpected provider/model")
	}
	if !settings.Thinking || settings.ThinkingBudget != 9000 {
		t.Fatalf("unexpected thinking settings")
	}
	if settings.RateLimit != 5 {
		t.Fatalf("unexpected rate limit: %d", settings.RateLimit)
	}
}

func TestSettingsService_SetAISettings_StoresAndUpdatesLimiter(t *testing.T) {
	repo := newSettingsRepoStub()
	limiter := ai.NewRateLimiter(1)
	svc := NewSettingsService(repo, limiter)

	settings := &AISettings{
		Provider:        ai.ProviderOpenAI,
		APIKey:          "sk-realkey-123",
		BaseURL:         "https://api.example.com",
		Model:           "gpt-4",
		Thinking:        true,
		ThinkingBudget:  5000,
		ReasoningEffort: "high",
		SummaryLanguage: "en-US",
		AutoTranslate:   true,
		AutoSummary:     true,
		RateLimit:       20,
	}

	if err := svc.SetAISettings(context.Background(), settings); err != nil {
		t.Fatalf("SetAISettings failed: %v", err)
	}
	if repo.data[keyAIAPIKey] != "sk-realkey-123" {
		t.Fatalf("expected api key to be stored")
	}
	if limiter.GetLimit() != 20 {
		t.Fatalf("expected rate limiter to update")
	}

	repo.data[keyAIAPIKey] = "sk-existing"
	settings.APIKey = "***"
	settings.RateLimit = 0
	if err := svc.SetAISettings(context.Background(), settings); err != nil {
		t.Fatalf("SetAISettings with masked key failed: %v", err)
	}
	if repo.data[keyAIAPIKey] != "sk-existing" {
		t.Fatalf("masked api key should not overwrite existing key")
	}
	if limiter.GetLimit() != ai.DefaultRateLimit {
		t.Fatalf("expected default rate limit when value <= 0")
	}
}

func TestSettingsService_GeneralSettings(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	err := svc.SetGeneralSettings(context.Background(), &GeneralSettings{
		FallbackUserAgent: "UA-Test",
		AutoReadability:   true,
	})
	if err != nil {
		t.Fatalf("SetGeneralSettings failed: %v", err)
	}

	settings, err := svc.GetGeneralSettings(context.Background())
	if err != nil {
		t.Fatalf("GetGeneralSettings failed: %v", err)
	}
	if settings.FallbackUserAgent != "UA-Test" || !settings.AutoReadability {
		t.Fatalf("unexpected general settings")
	}

	ua := svc.GetFallbackUserAgent(context.Background())
	if ua != "UA-Test" {
		t.Fatalf("unexpected fallback user agent: %s", ua)
	}
}

func TestSettingsService_ClearAnubisCookies(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data["anubis.cookie.example.com"] = "cookie"
	repo.data["anubis.cookie.test.com"] = "cookie"
	repo.data["other.key"] = "value"

	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	deleted, err := svc.ClearAnubisCookies(context.Background())
	if err != nil {
		t.Fatalf("ClearAnubisCookies failed: %v", err)
	}
	if deleted != 2 {
		t.Fatalf("expected 2 cookies deleted, got %d", deleted)
	}
	if _, ok := repo.data["other.key"]; !ok {
		t.Fatalf("unexpected deletion of non-cookie key")
	}
}

func TestSettingsService_TestAI_InvalidConfig(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	_, err := svc.TestAI(context.Background(), ai.ProviderOpenAI, "", "", "", false, 0, "")
	if err == nil {
		t.Fatalf("expected error for missing api key and model")
	}

	repo.data[keyAIAPIKey] = ""
	_, err = svc.TestAI(context.Background(), ai.ProviderOpenAI, "***", "", "gpt-4", false, 0, "")
	if err == nil || !errors.Is(err, ai.ErrMissingAPIKey) {
		t.Fatalf("expected missing api key error, got %v", err)
	}
}

func TestMaskAPIKey(t *testing.T) {
	if maskAPIKey("") != "" {
		t.Fatalf("empty key should return empty mask")
	}
	if maskAPIKey("short") != "***" {
		t.Fatalf("short key should be fully masked")
	}
	masked := maskAPIKey("sk-test-1234567890")
	if masked == "sk-test-1234567890" || masked == "" {
		t.Fatalf("expected masked key")
	}
	if !isMaskedKey(masked) {
		t.Fatalf("expected masked key to be detected")
	}
}
