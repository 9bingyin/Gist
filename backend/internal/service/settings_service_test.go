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

	_, err := svc.TestAI(context.Background(), ai.ProviderOpenAI, "", "", "", "responses", false, 0, "")
	if err == nil {
		t.Fatalf("expected error for missing api key and model")
	}

	repo.data[keyAIAPIKey] = ""
	_, err = svc.TestAI(context.Background(), ai.ProviderOpenAI, "***", "", "gpt-4", "responses", false, 0, "")
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

func TestSettingsService_GetNetworkSettings_Defaults(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	settings, err := svc.GetNetworkSettings(context.Background())
	if err != nil {
		t.Fatalf("GetNetworkSettings failed: %v", err)
	}
	if settings.Enabled {
		t.Fatalf("expected default enabled to be false")
	}
	if settings.Type != "http" {
		t.Fatalf("expected default type to be http, got %s", settings.Type)
	}
	if settings.Host != "" {
		t.Fatalf("expected default host to be empty")
	}
	if settings.Port != 0 {
		t.Fatalf("expected default port to be 0")
	}
}

func TestSettingsService_AppearanceSettings_Defaults(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	settings, err := svc.GetAppearanceSettings(context.Background())
	if err != nil {
		t.Fatalf("GetAppearanceSettings failed: %v", err)
	}
	if len(settings.ContentTypes) != len(defaultAppearanceContentTypes) {
		t.Fatalf("expected %d content types, got %d", len(defaultAppearanceContentTypes), len(settings.ContentTypes))
	}
	if settings.ContentTypes[0] != defaultAppearanceContentTypes[0] {
		t.Fatalf("expected default content types to start with %s", defaultAppearanceContentTypes[0])
	}
}

func TestSettingsService_AppearanceSettings_Validate(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	if err := svc.SetAppearanceSettings(context.Background(), &AppearanceSettings{ContentTypes: []string{}}); err == nil {
		t.Fatalf("expected error for empty content types")
	}

	if err := svc.SetAppearanceSettings(context.Background(), &AppearanceSettings{ContentTypes: []string{"picture", "picture", "invalid", "article"}}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	settings, err := svc.GetAppearanceSettings(context.Background())
	if err != nil {
		t.Fatalf("GetAppearanceSettings failed: %v", err)
	}
	if len(settings.ContentTypes) != 2 {
		t.Fatalf("expected 2 content types, got %d", len(settings.ContentTypes))
	}
	if settings.ContentTypes[0] != "picture" || settings.ContentTypes[1] != "article" {
		t.Fatalf("unexpected content types order")
	}
}

func TestSettingsService_GetNetworkSettings_StoredValues(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data[keyNetworkEnabled] = "true"
	repo.data[keyNetworkType] = "socks5"
	repo.data[keyNetworkHost] = "127.0.0.1"
	repo.data[keyNetworkPort] = "7890"
	repo.data[keyNetworkUsername] = "user"
	repo.data[keyNetworkPassword] = "secret123"

	svc := NewSettingsService(repo, ai.NewRateLimiter(0))
	settings, err := svc.GetNetworkSettings(context.Background())
	if err != nil {
		t.Fatalf("GetNetworkSettings failed: %v", err)
	}
	if !settings.Enabled {
		t.Fatalf("expected enabled to be true")
	}
	if settings.Type != "socks5" {
		t.Fatalf("expected type to be socks5, got %s", settings.Type)
	}
	if settings.Host != "127.0.0.1" {
		t.Fatalf("expected host to be 127.0.0.1, got %s", settings.Host)
	}
	if settings.Port != 7890 {
		t.Fatalf("expected port to be 7890, got %d", settings.Port)
	}
	if settings.Username != "user" {
		t.Fatalf("expected username to be user, got %s", settings.Username)
	}
	// Password should be masked
	if settings.Password == "secret123" || settings.Password == "" {
		t.Fatalf("expected password to be masked, got %s", settings.Password)
	}
}

func TestSettingsService_SetNetworkSettings(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	settings := &NetworkSettings{
		Enabled:  true,
		Type:     "socks5",
		Host:     "proxy.example.com",
		Port:     1080,
		Username: "admin",
		Password: "password123",
	}

	if err := svc.SetNetworkSettings(context.Background(), settings); err != nil {
		t.Fatalf("SetNetworkSettings failed: %v", err)
	}

	if repo.data[keyNetworkEnabled] != "true" {
		t.Fatalf("expected enabled to be stored as true")
	}
	if repo.data[keyNetworkType] != "socks5" {
		t.Fatalf("expected type to be stored as socks5")
	}
	if repo.data[keyNetworkHost] != "proxy.example.com" {
		t.Fatalf("expected host to be stored")
	}
	if repo.data[keyNetworkPort] != "1080" {
		t.Fatalf("expected port to be stored as 1080")
	}
	if repo.data[keyNetworkPassword] != "password123" {
		t.Fatalf("expected password to be stored")
	}
}

func TestSettingsService_SetNetworkSettings_MaskedPassword(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data[keyNetworkPassword] = "existing-password"

	svc := NewSettingsService(repo, ai.NewRateLimiter(0))

	settings := &NetworkSettings{
		Enabled:  true,
		Type:     "http",
		Host:     "proxy.example.com",
		Port:     8080,
		Password: "***", // masked password
	}

	if err := svc.SetNetworkSettings(context.Background(), settings); err != nil {
		t.Fatalf("SetNetworkSettings failed: %v", err)
	}

	// Password should not be overwritten when masked
	if repo.data[keyNetworkPassword] != "existing-password" {
		t.Fatalf("masked password should not overwrite existing password")
	}
}

func TestSettingsService_GetProxyURL(t *testing.T) {
	tests := []struct {
		name      string
		enabled   string
		proxyType string
		host      string
		port      string
		username  string
		password  string
		expected  string
	}{
		{
			name:     "disabled proxy",
			enabled:  "false",
			expected: "",
		},
		{
			name:     "empty host",
			enabled:  "true",
			host:     "",
			expected: "",
		},
		{
			name:      "http proxy without auth",
			enabled:   "true",
			proxyType: "http",
			host:      "127.0.0.1",
			port:      "8080",
			expected:  "http://127.0.0.1:8080",
		},
		{
			name:      "socks5 proxy without auth",
			enabled:   "true",
			proxyType: "socks5",
			host:      "localhost",
			port:      "1080",
			expected:  "socks5://localhost:1080",
		},
		{
			name:      "http proxy with auth",
			enabled:   "true",
			proxyType: "http",
			host:      "proxy.example.com",
			port:      "3128",
			username:  "user",
			password:  "pass",
			expected:  "http://user:pass@proxy.example.com:3128",
		},
		{
			name:      "socks5 proxy with username only",
			enabled:   "true",
			proxyType: "socks5",
			host:      "socks.example.com",
			port:      "1080",
			username:  "user",
			expected:  "socks5://user@socks.example.com:1080",
		},
		{
			name:      "default type is http",
			enabled:   "true",
			proxyType: "",
			host:      "localhost",
			port:      "8080",
			expected:  "http://localhost:8080",
		},
		{
			name:      "port 0 returns empty",
			enabled:   "true",
			proxyType: "http",
			host:      "localhost",
			port:      "",
			expected:  "", // port <= 0 is invalid
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newSettingsRepoStub()
			if tt.enabled != "" {
				repo.data[keyNetworkEnabled] = tt.enabled
			}
			if tt.proxyType != "" {
				repo.data[keyNetworkType] = tt.proxyType
			}
			if tt.host != "" {
				repo.data[keyNetworkHost] = tt.host
			}
			if tt.port != "" {
				repo.data[keyNetworkPort] = tt.port
			}
			if tt.username != "" {
				repo.data[keyNetworkUsername] = tt.username
			}
			if tt.password != "" {
				repo.data[keyNetworkPassword] = tt.password
			}

			svc := NewSettingsService(repo, ai.NewRateLimiter(0))
			result := svc.GetProxyURL(context.Background())

			if result != tt.expected {
				t.Errorf("GetProxyURL() = %q, want %q", result, tt.expected)
			}
		})
	}
}
