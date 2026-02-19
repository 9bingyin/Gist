//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"gist/backend/internal/repository"
	"gist/backend/internal/service/ai"
	"gist/backend/pkg/logger"
)

// AISettings holds the AI configuration.
type AISettings struct {
	Provider        string `json:"provider"`
	APIKey          string `json:"apiKey"`
	BaseURL         string `json:"baseUrl"`
	Model           string `json:"model"`
	Endpoint        string `json:"endpoint"`
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
	MarkReadOnScroll  bool   `json:"markReadOnScroll"`
}

// NetworkSettings holds network proxy configuration.
type NetworkSettings struct {
	Enabled  bool   `json:"enabled"`
	Type     string `json:"type"` // http, socks5
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	IPStack  string `json:"ipStack"` // default, ipv4, ipv6
}

// AppearanceSettings holds appearance configuration.
type AppearanceSettings struct {
	ContentTypes []string `json:"contentTypes"`
}

// Setting keys
const (
	keyAIProvider        = "ai.provider"
	keyAIAPIKey          = "ai.api_key"
	keyAIBaseURL         = "ai.base_url"
	keyAIModel           = "ai.model"
	keyAIEndpoint        = "ai.openai_endpoint"
	keyAIThinking        = "ai.thinking"
	keyAIThinkingBudget  = "ai.thinking_budget"
	keyAIReasoningEffort = "ai.reasoning_effort"
	keyAISummaryLanguage = "ai.summary_language"
	keyAIAutoTranslate   = "ai.auto_translate"
	keyAIAutoSummary     = "ai.auto_summary"
	keyAIRateLimit       = "ai.rate_limit"

	keyFallbackUserAgent = "general.fallback_user_agent"
	keyAutoReadability   = "general.auto_readability"
	keyMarkReadOnScroll  = "general.mark_read_on_scroll"

	keyNetworkEnabled  = "network.proxy_enabled"
	keyNetworkType     = "network.proxy_type"
	keyNetworkHost     = "network.proxy_host"
	keyNetworkPort     = "network.proxy_port"
	keyNetworkUsername = "network.proxy_username"
	keyNetworkPassword = "network.proxy_password"
	keyNetworkIPStack  = "network.ip_stack"

	keyAppearanceContentTypes = "appearance.content_types"
)

// SettingsService provides settings management.
type SettingsService interface {
	// GetAISettings returns the AI configuration with masked API keys.
	GetAISettings(ctx context.Context) (*AISettings, error)
	// SetAISettings updates the AI configuration.
	// If apiKey is empty string, it keeps the existing key.
	SetAISettings(ctx context.Context, settings *AISettings) error
	// TestAI tests the AI connection with the given configuration.
	TestAI(ctx context.Context, provider, apiKey, baseURL, model, endpoint string, thinking bool, thinkingBudget int, reasoningEffort string) (string, error)
	// GetGeneralSettings returns the general settings.
	GetGeneralSettings(ctx context.Context) (*GeneralSettings, error)
	// SetGeneralSettings updates the general settings.
	SetGeneralSettings(ctx context.Context, settings *GeneralSettings) error
	// GetFallbackUserAgent returns the fallback user agent if set.
	GetFallbackUserAgent(ctx context.Context) string
	// ClearAnubisCookies deletes all Anubis cookies from settings.
	ClearAnubisCookies(ctx context.Context) (int64, error)
	// GetNetworkSettings returns the network proxy configuration.
	GetNetworkSettings(ctx context.Context) (*NetworkSettings, error)
	// SetNetworkSettings updates the network proxy configuration.
	SetNetworkSettings(ctx context.Context, settings *NetworkSettings) error
	// GetProxyURL returns the formatted proxy URL (e.g., socks5://user:pass@host:port).
	// Returns empty string if proxy is disabled.
	GetProxyURL(ctx context.Context) string
	// GetIPStack returns the IP stack preference (default, ipv4, ipv6).
	GetIPStack(ctx context.Context) string
	// GetAppearanceSettings returns appearance settings.
	GetAppearanceSettings(ctx context.Context) (*AppearanceSettings, error)
	// SetAppearanceSettings updates appearance settings.
	SetAppearanceSettings(ctx context.Context, settings *AppearanceSettings) error
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
		Endpoint:        "responses",       // default endpoint
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
	if val, err := s.getString(ctx, keyAIEndpoint); err == nil && val != "" {
		settings.Endpoint = val
	}
	settings.Thinking = s.getBool(ctx, keyAIThinking)
	if val, err := s.getInt(ctx, keyAIThinkingBudget); err == nil && val > 0 {
		settings.ThinkingBudget = val
	}
	// Allow empty string to override default (for Compatible Budget mode)
	if setting, err := s.repo.Get(ctx, keyAIReasoningEffort); err == nil && setting != nil {
		settings.ReasoningEffort = setting.Value
	}
	if val, err := s.getString(ctx, keyAISummaryLanguage); err == nil && val != "" {
		settings.SummaryLanguage = val
	}
	settings.AutoTranslate = s.getBool(ctx, keyAIAutoTranslate)
	settings.AutoSummary = s.getBool(ctx, keyAIAutoSummary)
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
		logger.Warn("ai settings update api key failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set api key: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIBaseURL, settings.BaseURL); err != nil {
		logger.Warn("ai settings update base url failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set base url: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIModel, settings.Model); err != nil {
		logger.Warn("ai settings update model failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "model", settings.Model, "error", err)
		return fmt.Errorf("set model: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIEndpoint, settings.Endpoint); err != nil {
		logger.Warn("ai settings update endpoint failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "endpoint", settings.Endpoint, "error", err)
		return fmt.Errorf("set endpoint: %w", err)
	}
	thinkingVal := "false"
	if settings.Thinking {
		thinkingVal = "true"
	}
	if err := s.repo.Set(ctx, keyAIThinking, thinkingVal); err != nil {
		logger.Warn("ai settings update thinking failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set thinking: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIThinkingBudget, fmt.Sprintf("%d", settings.ThinkingBudget)); err != nil {
		logger.Warn("ai settings update thinking budget failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set thinking budget: %w", err)
	}
	if err := s.repo.Set(ctx, keyAIReasoningEffort, settings.ReasoningEffort); err != nil {
		logger.Warn("ai settings update reasoning effort failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set reasoning effort: %w", err)
	}
	if err := s.repo.Set(ctx, keyAISummaryLanguage, settings.SummaryLanguage); err != nil {
		logger.Warn("ai settings update summary language failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set summary language: %w", err)
	}
	autoTranslateVal := "false"
	if settings.AutoTranslate {
		autoTranslateVal = "true"
	}
	if err := s.repo.Set(ctx, keyAIAutoTranslate, autoTranslateVal); err != nil {
		logger.Warn("ai settings update auto translate failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set auto translate: %w", err)
	}
	autoSummaryVal := "false"
	if settings.AutoSummary {
		autoSummaryVal = "true"
	}
	if err := s.repo.Set(ctx, keyAIAutoSummary, autoSummaryVal); err != nil {
		logger.Warn("ai settings update auto summary failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set auto summary: %w", err)
	}
	// Set rate limit and update limiter
	rateLimit := settings.RateLimit
	if rateLimit <= 0 {
		rateLimit = ai.DefaultRateLimit
	}
	if err := s.repo.Set(ctx, keyAIRateLimit, fmt.Sprintf("%d", rateLimit)); err != nil {
		logger.Warn("ai settings update rate limit failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set rate limit: %w", err)
	}
	if s.rateLimiter != nil {
		s.rateLimiter.SetLimit(rateLimit)
	}
	logger.Info("ai settings updated", "module", "service", "action", "update", "resource", "settings", "result", "ok", "provider", settings.Provider, "model", settings.Model, "endpoint", settings.Endpoint, "rate_limit", rateLimit)
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
func (s *settingsService) TestAI(ctx context.Context, provider, apiKey, baseURL, model, endpoint string, thinking bool, thinkingBudget int, reasoningEffort string) (string, error) {
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
		Endpoint:        endpoint,
		Thinking:        thinking,
		ThinkingBudget:  thinkingBudget,
		ReasoningEffort: reasoningEffort,
	}

	p, err := ai.NewProvider(cfg)
	if err != nil {
		logger.Warn("ai settings test create provider failed", "module", "service", "action", "test", "resource", "settings", "result", "failed", "provider", provider, "model", model, "error", err)
		return "", err
	}

	response, err := p.Test(ctx)
	if err != nil {
		logger.Warn("ai settings test failed", "module", "service", "action", "test", "resource", "settings", "result", "failed", "provider", provider, "model", model, "error", err)
		return "", err
	}

	logger.Info("ai settings test ok", "module", "service", "action", "test", "resource", "settings", "result", "ok", "provider", provider, "model", model)
	return response, nil
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

// getBool gets a boolean value from settings.
func (s *settingsService) getBool(ctx context.Context, key string) bool {
	val, err := s.getString(ctx, key)
	return err == nil && val == "true"
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
	settings.AutoReadability = s.getBool(ctx, keyAutoReadability)
	settings.MarkReadOnScroll = s.getBool(ctx, keyMarkReadOnScroll)

	return settings, nil
}

// SetGeneralSettings updates the general settings.
func (s *settingsService) SetGeneralSettings(ctx context.Context, settings *GeneralSettings) error {
	if err := s.repo.Set(ctx, keyFallbackUserAgent, settings.FallbackUserAgent); err != nil {
		logger.Warn("general settings update fallback ua failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set fallback user agent: %w", err)
	}
	autoReadabilityVal := "false"
	if settings.AutoReadability {
		autoReadabilityVal = "true"
	}
	if err := s.repo.Set(ctx, keyAutoReadability, autoReadabilityVal); err != nil {
		logger.Warn("general settings update auto readability failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set auto readability: %w", err)
	}
	markReadOnScrollVal := "false"
	if settings.MarkReadOnScroll {
		markReadOnScrollVal = "true"
	}
	if err := s.repo.Set(ctx, keyMarkReadOnScroll, markReadOnScrollVal); err != nil {
		logger.Warn("general settings update mark read on scroll failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set mark read on scroll: %w", err)
	}
	logger.Info(
		"general settings updated",
		"module", "service",
		"action", "update",
		"resource", "settings",
		"result", "ok",
		"auto_readability", settings.AutoReadability,
		"mark_read_on_scroll", settings.MarkReadOnScroll,
	)
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

// ClearAnubisCookies deletes all Anubis cookies from settings.
func (s *settingsService) ClearAnubisCookies(ctx context.Context) (int64, error) {
	deleted, err := s.repo.DeleteByPrefix(ctx, "anubis.cookie.")
	if err != nil {
		logger.Warn("anubis cookies clear failed", "module", "service", "action", "clear", "resource", "settings", "result", "failed", "error", err)
		return 0, err
	}
	logger.Info("anubis cookies cleared", "module", "service", "action", "clear", "resource", "settings", "result", "ok", "count", deleted)
	return deleted, nil
}

// GetNetworkSettings returns the network proxy configuration.
func (s *settingsService) GetNetworkSettings(ctx context.Context) (*NetworkSettings, error) {
	settings := &NetworkSettings{
		Type:    "http",    // default
		IPStack: "default", // default
	}

	settings.Enabled = s.getBool(ctx, keyNetworkEnabled)
	if val, err := s.getString(ctx, keyNetworkType); err == nil && val != "" {
		settings.Type = val
	}
	if val, err := s.getString(ctx, keyNetworkHost); err == nil {
		settings.Host = val
	}
	if val, err := s.getInt(ctx, keyNetworkPort); err == nil && val > 0 {
		settings.Port = val
	}
	if val, err := s.getString(ctx, keyNetworkUsername); err == nil {
		settings.Username = val
	}
	if val, err := s.getString(ctx, keyNetworkPassword); err == nil && val != "" {
		settings.Password = maskAPIKey(val)
	}
	if val, err := s.getString(ctx, keyNetworkIPStack); err == nil && val != "" {
		settings.IPStack = val
	}

	return settings, nil
}

// SetNetworkSettings updates the network proxy configuration.
func (s *settingsService) SetNetworkSettings(ctx context.Context, settings *NetworkSettings) error {
	enabledVal := "false"
	if settings.Enabled {
		enabledVal = "true"
	}
	if err := s.repo.Set(ctx, keyNetworkEnabled, enabledVal); err != nil {
		logger.Warn("network settings update enabled failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set network enabled: %w", err)
	}

	if settings.Type != "" {
		if err := s.repo.Set(ctx, keyNetworkType, settings.Type); err != nil {
			logger.Warn("network settings update type failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
			return fmt.Errorf("set network type: %w", err)
		}
	}

	if err := s.repo.Set(ctx, keyNetworkHost, settings.Host); err != nil {
		logger.Warn("network settings update host failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set network host: %w", err)
	}

	if err := s.repo.Set(ctx, keyNetworkPort, fmt.Sprintf("%d", settings.Port)); err != nil {
		logger.Warn("network settings update port failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set network port: %w", err)
	}

	if err := s.repo.Set(ctx, keyNetworkUsername, settings.Username); err != nil {
		logger.Warn("network settings update username failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set network username: %w", err)
	}

	// Only update password if it's not masked
	if err := s.setAPIKey(ctx, keyNetworkPassword, settings.Password); err != nil {
		logger.Warn("network settings update password failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set network password: %w", err)
	}

	// Set IP stack preference
	ipStack := settings.IPStack
	if ipStack == "" {
		ipStack = "default"
	}
	if err := s.repo.Set(ctx, keyNetworkIPStack, ipStack); err != nil {
		logger.Warn("network settings update ip stack failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set ip stack: %w", err)
	}

	logger.Info("network settings updated", "module", "service", "action", "update", "resource", "settings", "result", "ok", "enabled", settings.Enabled, "type", settings.Type, "ip_stack", ipStack)
	return nil
}

// GetIPStack returns the IP stack preference (default, ipv4, ipv6).
func (s *settingsService) GetIPStack(ctx context.Context) string {
	val, err := s.getString(ctx, keyNetworkIPStack)
	if err != nil || val == "" {
		return "default"
	}
	return val
}

// GetProxyURL returns the formatted proxy URL (e.g., socks5://user:pass@host:port).
// Returns empty string if proxy is disabled or not configured.
func (s *settingsService) GetProxyURL(ctx context.Context) string {
	settings, err := s.repo.GetByPrefix(ctx, "network.")
	if err != nil {
		return ""
	}

	// Build map for quick lookup
	m := make(map[string]string, len(settings))
	for _, setting := range settings {
		m[setting.Key] = setting.Value
	}

	if m[keyNetworkEnabled] != "true" {
		return ""
	}

	host := m[keyNetworkHost]
	if host == "" {
		return ""
	}

	var port int
	if portStr := m[keyNetworkPort]; portStr != "" {
		fmt.Sscanf(portStr, "%d", &port)
	}
	if port <= 0 {
		return ""
	}

	proxyType := m[keyNetworkType]
	if proxyType == "" {
		proxyType = "http"
	}

	username := m[keyNetworkUsername]
	password := m[keyNetworkPassword]

	if username != "" && password != "" {
		return fmt.Sprintf("%s://%s:%s@%s:%d",
			proxyType,
			url.QueryEscape(username),
			url.QueryEscape(password),
			host,
			port,
		)
	}
	if username != "" {
		return fmt.Sprintf("%s://%s@%s:%d",
			proxyType,
			url.QueryEscape(username),
			host,
			port,
		)
	}
	return fmt.Sprintf("%s://%s:%d", proxyType, host, port)
}

func (s *settingsService) GetAppearanceSettings(ctx context.Context) (*AppearanceSettings, error) {
	settings := &AppearanceSettings{
		ContentTypes: append([]string(nil), defaultAppearanceContentTypes...),
	}
	raw, err := s.getString(ctx, keyAppearanceContentTypes)
	if err != nil || raw == "" {
		return settings, err
	}

	var contentTypes []string
	if err := json.Unmarshal([]byte(raw), &contentTypes); err != nil {
		return settings, nil
	}
	contentTypes = normalizeContentTypes(contentTypes)
	if len(contentTypes) == 0 {
		return settings, nil
	}
	settings.ContentTypes = contentTypes
	return settings, nil
}

func (s *settingsService) SetAppearanceSettings(ctx context.Context, settings *AppearanceSettings) error {
	contentTypes := normalizeContentTypes(settings.ContentTypes)
	if len(contentTypes) == 0 {
		return ErrInvalid
	}
	payload, err := json.Marshal(contentTypes)
	if err != nil {
		return fmt.Errorf("marshal content types: %w", err)
	}
	if err := s.repo.Set(ctx, keyAppearanceContentTypes, string(payload)); err != nil {
		return fmt.Errorf("set appearance content types: %w", err)
	}
	return nil
}

func normalizeContentTypes(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	ordered := make([]string, 0, len(values))
	for _, value := range values {
		if !isValidAppearanceContentType(value) {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		ordered = append(ordered, value)
	}
	return ordered
}

var defaultAppearanceContentTypes = []string{"article", "picture", "notification"}

func isValidAppearanceContentType(value string) bool {
	switch value {
	case "article", "picture", "notification":
		return true
	default:
		return false
	}
}
