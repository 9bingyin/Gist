package service

import (
	"context"
	"fmt"

	"gist/backend/internal/repository"
	"gist/backend/internal/service/ai"
)

// AISettings holds the AI configuration.
type AISettings struct {
	Provider        string `json:"provider"`
	APIKey          string `json:"apiKey"`
	BaseURL         string `json:"baseUrl"`
	Model           string `json:"model"`
	Thinking        bool   `json:"thinking"`
	ThinkingBudget  int    `json:"thinkingBudget"`
	ReasoningEffort string `json:"reasoningEffort"`
	SummaryLanguage string `json:"summaryLanguage"`
	AutoTranslate   bool   `json:"autoTranslate"`
	AutoSummary     bool   `json:"autoSummary"`
	RateLimit       int    `json:"rateLimit"`
}

// GeneralSettings holds general application settings.
type GeneralSettings struct {
	FallbackUserAgent string `json:"fallbackUserAgent"`
	AutoReadability   bool   `json:"autoReadability"`
}

// Setting keys
const (
	keyAIProvider        = "ai.provider"
	keyAIAPIKey          = "ai.api_key"
	keyAIBaseURL         = "ai.base_url"
	keyAIModel           = "ai.model"
	keyAIThinking        = "ai.thinking"
	keyAIThinkingBudget  = "ai.thinking_budget"
	keyAIReasoningEffort = "ai.reasoning_effort"
	keyAISummaryLanguage = "ai.summary_language"
	keyAIAutoTranslate   = "ai.auto_translate"
	keyAIAutoSummary     = "ai.auto_summary"
	keyAIRateLimit       = "ai.rate_limit"

	keyFallbackUserAgent = "general.fallback_user_agent"
	keyAutoReadability   = "general.auto_readability"
)

// SettingsService provides settings management.
type SettingsService interface {
	// GetAISettings returns the AI configuration with masked API keys.
	GetAISettings(ctx context.Context) (*AISettings, error)
	// SetAISettings updates the AI configuration.
	// If apiKey is empty string, it keeps the existing key.
	SetAISettings(ctx context.Context, settings *AISettings) error
	// TestAI tests the AI connection with the given configuration.
	TestAI(ctx context.Context, provider, apiKey, baseURL, model string, thinking bool, thinkingBudget int, reasoningEffort string) (string, error)
	// GetGeneralSettings returns the general settings.
	GetGeneralSettings(ctx context.Context) (*GeneralSettings, error)
	// SetGeneralSettings updates the general settings.
	SetGeneralSettings(ctx context.Context, settings *GeneralSettings) error
	// GetFallbackUserAgent returns the fallback user agent if set.
	GetFallbackUserAgent(ctx context.Context) string
}

type settingsService struct {
	repo        repository.SettingsRepository
	rateLimiter *ai.RateLimiter
}

// NewSettingsService creates a new settings service.
func NewSettingsService(repo repository.SettingsRepository, rateLimiter *ai.RateLimiter) SettingsService {
	return &settingsService{repo: repo, rateLimiter: rateLimiter}
}

// GetAISettings returns the AI configuration with masked API keys.
func (s *settingsService) GetAISettings(ctx context.Context) (*AISettings, error) {
	settings := &AISettings{
		Provider:        ai.ProviderOpenAI, // default
		ThinkingBudget:  10000,             // default budget
		ReasoningEffort: "medium",          // default effort
		SummaryLanguage: "zh-CN",           // default language
	}

	if val, err := s.getString(ctx, keyAIProvider); err == nil && val != "" {
		settings.Provider = val
	}
	if val, err := s.getString(ctx, keyAIAPIKey); err == nil && val != "" {
		settings.APIKey = maskAPIKey(val)
	}
	if val, err := s.getString(ctx, keyAIBaseURL); err == nil {
		settings.BaseURL = val
	}
	if val, err := s.getString(ctx, keyAIModel); err == nil {
		settings.Model = val
	}
	if val, err := s.getString(ctx, keyAIThinking); err == nil && val == "true" {
		settings.Thinking = true
	}
	if val, err := s.getInt(ctx, keyAIThinkingBudget); err == nil && val > 0 {
		settings.ThinkingBudget = val
	}
	// Allow empty string to override default (for Compatible Budget mode)
	if val, err := s.getString(ctx, keyAIReasoningEffort); err == nil {
		settings.ReasoningEffort = val
	}
	if val, err := s.getString(ctx, keyAISummaryLanguage); err == nil && val != "" {
		settings.SummaryLanguage = val
	}
	if val, err := s.getString(ctx, keyAIAutoTranslate); err == nil && val == "true" {
		settings.AutoTranslate = true
	}
	if val, err := s.getString(ctx, keyAIAutoSummary); err == nil && val == "true" {
		settings.AutoSummary = true
	}
	if val, err := s.getInt(ctx, keyAIRateLimit); err == nil && val > 0 {
		settings.RateLimit = val
	} else {
		settings.RateLimit = ai.DefaultRateLimit
	}

	return settings, nil
}

// SetAISettings updates the AI configuration.
func (s *settingsService) SetAISettings(ctx context.Context, settings *AISettings) error {
	if settings.Provider != "" {
		if err := s.repo.Set(ctx, keyAIProvider, settings.Provider); err != nil {
			return fmt.Errorf("set provider: %w", err)
		}
	}
	if err := s.setAPIKey(ctx, keyAIAPIKey, settings.APIKey); err != nil {
		return fmt.Errorf("set api key: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIBaseURL, settings.BaseURL); err != nil {
		return fmt.Errorf("set base url: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIModel, settings.Model); err != nil {
		return fmt.Errorf("set model: %w", err)
	}
	thinkingVal := "false"
	if settings.Thinking {
		thinkingVal = "true"
	}
	if err := s.repo.Set(ctx, keyAIThinking, thinkingVal); err != nil {
		return fmt.Errorf("set thinking: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIThinkingBudget, fmt.Sprintf("%d", settings.ThinkingBudget)); err != nil {
		return fmt.Errorf("set thinking budget: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIReasoningEffort, settings.ReasoningEffort); err != nil {
		return fmt.Errorf("set reasoning effort: %w", err)
	}
	if err := s.repo.Set(ctx, keyAISummaryLanguage, settings.SummaryLanguage); err != nil {
		return fmt.Errorf("set summary language: %w", err)
	}
	autoTranslateVal := "false"
	if settings.AutoTranslate {
		autoTranslateVal = "true"
	}
	if err := s.repo.Set(ctx, keyAIAutoTranslate, autoTranslateVal); err != nil {
		return fmt.Errorf("set auto translate: %w", err)
	}
	autoSummaryVal := "false"
	if settings.AutoSummary {
		autoSummaryVal = "true"
	}
	if err := s.repo.Set(ctx, keyAIAutoSummary, autoSummaryVal); err != nil {
		return fmt.Errorf("set auto summary: %w", err)
	}
	// Set rate limit and update limiter
	rateLimit := settings.RateLimit
	if rateLimit <= 0 {
		rateLimit = ai.DefaultRateLimit
	}
	if err := s.repo.Set(ctx, keyAIRateLimit, fmt.Sprintf("%d", rateLimit)); err != nil {
		return fmt.Errorf("set rate limit: %w", err)
	}
	if s.rateLimiter != nil {
		s.rateLimiter.SetLimit(rateLimit)
	}
	return nil
}

// maskAPIKey returns a masked version of the API key for display.
func maskAPIKey(apiKey string) string {
	if apiKey == "" {
		return ""
	}
	if len(apiKey) <= 8 {
		return "***"
	}
	// Find prefix (e.g., "sk-" for OpenAI)
	prefixEnd := 0
	for i, c := range apiKey {
		if c == '-' {
			prefixEnd = i + 1
			break
		}
		if i >= 4 {
			break
		}
	}
	prefix := apiKey[:prefixEnd]
	suffix := apiKey[len(apiKey)-3:]
	return prefix + "***" + suffix
}

// isMaskedKey checks if a string looks like a masked API key.
func isMaskedKey(key string) bool {
	if len(key) == 0 || len(key) >= 20 {
		return false
	}
	for i := 0; i <= len(key)-3; i++ {
		if key[i:i+3] == "***" {
			return true
		}
	}
	return false
}

// TestAI tests the AI connection with the given configuration.
func (s *settingsService) TestAI(ctx context.Context, provider, apiKey, baseURL, model string, thinking bool, thinkingBudget int, reasoningEffort string) (string, error) {
	// If apiKey looks like a masked key, try to get the stored key
	if isMaskedKey(apiKey) {
		storedKey, err := s.getString(ctx, keyAIAPIKey)
		if err != nil {
			return "", fmt.Errorf("get stored api key: %w", err)
		}
		apiKey = storedKey
	}

	cfg := ai.Config{
		Provider:        provider,
		APIKey:          apiKey,
		BaseURL:         baseURL,
		Model:           model,
		Thinking:        thinking,
		ThinkingBudget:  thinkingBudget,
		ReasoningEffort: reasoningEffort,
	}

	p, err := ai.NewProvider(cfg)
	if err != nil {
		return "", err
	}

	return p.Test(ctx)
}

// getString gets a plain string value from settings.
func (s *settingsService) getString(ctx context.Context, key string) (string, error) {
	setting, err := s.repo.Get(ctx, key)
	if err != nil {
		return "", err
	}
	if setting == nil {
		return "", nil
	}
	return setting.Value, nil
}

// getInt gets an integer value from settings.
func (s *settingsService) getInt(ctx context.Context, key string) (int, error) {
	val, err := s.getString(ctx, key)
	if err != nil || val == "" {
		return 0, err
	}
	var result int
	_, err = fmt.Sscanf(val, "%d", &result)
	return result, err
}

// setAPIKey sets an API key.
// If the value is empty or looks like a masked key, it keeps the existing key.
func (s *settingsService) setAPIKey(ctx context.Context, key, value string) error {
	if value == "" || isMaskedKey(value) {
		return nil
	}
	return s.repo.Set(ctx, key, value)
}

// GetGeneralSettings returns the general settings.
func (s *settingsService) GetGeneralSettings(ctx context.Context) (*GeneralSettings, error) {
	settings := &GeneralSettings{}

	if val, err := s.getString(ctx, keyFallbackUserAgent); err == nil {
		settings.FallbackUserAgent = val
	}
	if val, err := s.getString(ctx, keyAutoReadability); err == nil && val == "true" {
		settings.AutoReadability = true
	}

	return settings, nil
}

// SetGeneralSettings updates the general settings.
func (s *settingsService) SetGeneralSettings(ctx context.Context, settings *GeneralSettings) error {
	if err := s.repo.Set(ctx, keyFallbackUserAgent, settings.FallbackUserAgent); err != nil {
		return fmt.Errorf("set fallback user agent: %w", err)
	}
	autoReadabilityVal := "false"
	if settings.AutoReadability {
		autoReadabilityVal = "true"
	}
	if err := s.repo.Set(ctx, keyAutoReadability, autoReadabilityVal); err != nil {
		return fmt.Errorf("set auto readability: %w", err)
	}
	return nil
}

// GetFallbackUserAgent returns the fallback user agent if set.
// Returns empty string if disabled (user hasn't set one).
func (s *settingsService) GetFallbackUserAgent(ctx context.Context) string {
	val, err := s.getString(ctx, keyFallbackUserAgent)
	if err != nil || val == "" {
		return ""
	}
	return val
}
