//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"gist/backend/internal/repository"
	"gist/backend/internal/service/ai"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const proxyTestURL = "https://captive.apple.com/"

// AISettings holds the AI configuration.
type AISettings struct {
	Provider        string         `json:"provider"`
	APIKey          string         `json:"apiKey"`
	BaseURL         string         `json:"baseUrl"`
	Model           string         `json:"model"`
	RequestOptions  map[string]any `json:"requestOptions"`
	SummaryLanguage string         `json:"summaryLanguage"`
	AutoTranslate   bool           `json:"autoTranslate"`
	AutoSummary     bool           `json:"autoSummary"`
	RateLimit       int            `json:"rateLimit"`
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
	Type     string `json:"type"` // http, https, socks5, socks5h
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

// Setting keys.
const (
	keyAIProvider        = "ai.provider"
	keyAIAPIKey          = "ai.api_key"
	keyAIBaseURL         = "ai.base_url"
	keyAIModel           = "ai.model"
	keyAIRequestOptions  = "ai.request_options"
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

// AnubisCookieClearer clears cached and persisted Anubis cookies.
type AnubisCookieClearer interface {
	ClearAll(ctx context.Context) (int64, error)
}

// SettingsService provides settings management.
type SettingsService interface {
	GetAISettings(ctx context.Context) (*AISettings, error)
	SetAISettings(ctx context.Context, settings *AISettings) error
	TestAI(ctx context.Context, provider, apiKey, baseURL, model string, requestOptions map[string]any) (string, error)
	GetGeneralSettings(ctx context.Context) (*GeneralSettings, error)
	SetGeneralSettings(ctx context.Context, settings *GeneralSettings) error
	GetFallbackUserAgent(ctx context.Context) string
	ClearAnubisCookies(ctx context.Context) (int64, error)
	GetNetworkSettings(ctx context.Context) (*NetworkSettings, error)
	SetNetworkSettings(ctx context.Context, settings *NetworkSettings) error
	TestNetworkProxy(ctx context.Context, settings *NetworkSettings) error
	GetProxyURL(ctx context.Context) string
	GetIPStack(ctx context.Context) string
	GetAppearanceSettings(ctx context.Context) (*AppearanceSettings, error)
	SetAppearanceSettings(ctx context.Context, settings *AppearanceSettings) error
	SetClientFactory(factory *network.ClientFactory)
	SetAnubisStore(clearer AnubisCookieClearer)
}

type settingsService struct {
	repo          repository.SettingsRepository
	rateLimiter   *ai.RateLimiter
	clientFactory *network.ClientFactory
	anubisClearer AnubisCookieClearer

	netMu          sync.RWMutex
	netCacheLoaded bool
	cachedProxyURL string
	cachedIPStack  string
}

// NewSettingsService creates a new settings service.
func NewSettingsService(repo repository.SettingsRepository, rateLimiter *ai.RateLimiter) SettingsService {
	return &settingsService{repo: repo, rateLimiter: rateLimiter}
}

func (s *settingsService) SetClientFactory(factory *network.ClientFactory) {
	s.clientFactory = factory
}

func (s *settingsService) SetAnubisStore(clearer AnubisCookieClearer) {
	s.anubisClearer = clearer
}

func (s *settingsService) getPrefixMap(ctx context.Context, prefix string) (map[string]string, error) {
	items, err := s.repo.GetByPrefix(ctx, prefix)
	if err != nil {
		return nil, err
	}
	m := make(map[string]string, len(items))
	for _, item := range items {
		m[item.Key] = item.Value
	}
	return m, nil
}

// GetAISettings returns the AI configuration with masked API keys.
func (s *settingsService) GetAISettings(ctx context.Context) (*AISettings, error) {
	m, err := s.getPrefixMap(ctx, "ai.")
	if err != nil {
		return nil, fmt.Errorf("get ai settings: %w", err)
	}

	settings := &AISettings{
		Provider:        ai.ProviderOpenAI,
		SummaryLanguage: "zh-CN",
		RateLimit:       ai.DefaultRateLimit,
	}

	if val := m[keyAIProvider]; val != "" {
		settings.Provider = val
	}
	if val := m[keyAIAPIKey]; val != "" {
		settings.APIKey = maskAPIKey(val)
	}
	settings.BaseURL = m[keyAIBaseURL]
	settings.Model = m[keyAIModel]

	if rawOpts := m[keyAIRequestOptions]; rawOpts != "" {
		var opts map[string]any
		if err := json.Unmarshal([]byte(rawOpts), &opts); err != nil {
			return nil, fmt.Errorf("unmarshal request options: %w", err)
		}
		settings.RequestOptions = opts
	}

	if val := m[keyAISummaryLanguage]; val != "" {
		settings.SummaryLanguage = val
	}
	settings.AutoTranslate = m[keyAIAutoTranslate] == "true"
	settings.AutoSummary = m[keyAIAutoSummary] == "true"
	if val, err := strconv.Atoi(m[keyAIRateLimit]); err == nil && val > 0 {
		settings.RateLimit = val
	}

	return settings, nil
}

// SetAISettings updates the AI configuration in a single transaction.
// Passing the exact mask of the currently stored API key preserves the stored key;
// passing an empty string clears it.
func (s *settingsService) SetAISettings(ctx context.Context, settings *AISettings) error {
	requestOptions, err := json.Marshal(settings.RequestOptions)
	if err != nil {
		return fmt.Errorf("marshal request options: %w", err)
	}
	if string(requestOptions) == "null" {
		requestOptions = []byte("{}")
	}

	rateLimit := settings.RateLimit
	if rateLimit <= 0 {
		rateLimit = ai.DefaultRateLimit
	}

	storedKey, err := s.getString(ctx, keyAIAPIKey)
	if err != nil {
		return fmt.Errorf("get stored api key: %w", err)
	}

	updates := map[string]string{
		keyAIBaseURL:         settings.BaseURL,
		keyAIModel:           settings.Model,
		keyAIRequestOptions:  string(requestOptions),
		keyAISummaryLanguage: settings.SummaryLanguage,
		keyAIAutoTranslate:   strconv.FormatBool(settings.AutoTranslate),
		keyAIAutoSummary:     strconv.FormatBool(settings.AutoSummary),
		keyAIRateLimit:       strconv.Itoa(rateLimit),
	}
	if settings.Provider != "" {
		updates[keyAIProvider] = settings.Provider
	}

	// Preserve existing secret only when the submitted value equals the exact mask of the stored secret.
	// An empty string explicitly clears the secret.
	if newKey, changed := resolveSecretUpdate(settings.APIKey, storedKey); changed {
		updates[keyAIAPIKey] = newKey
	}

	if err := s.repo.SetMany(ctx, updates); err != nil {
		logger.Warn("ai settings update failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set ai settings: %w", err)
	}

	if s.rateLimiter != nil {
		s.rateLimiter.SetLimit(rateLimit)
	}
	logger.Info("ai settings updated", "module", "service", "action", "update", "resource", "settings", "result", "ok", "provider", settings.Provider, "model", settings.Model, "rate_limit", rateLimit)
	return nil
}

// maskAPIKey returns a masked version of a secret for display.
func maskAPIKey(secret string) string {
	if secret == "" {
		return ""
	}
	if len(secret) <= 8 {
		return "***"
	}
	prefixEnd := 0
	for i, c := range secret {
		if c == '-' {
			prefixEnd = i + 1
			break
		}
		if i >= 4 {
			break
		}
	}
	return secret[:prefixEnd] + "***" + secret[len(secret)-3:]
}

// resolveSecretUpdate checks whether submitted matches the exact mask of stored.
// If so, the secret is unchanged (changed=false). Otherwise the submitted value
// (including empty string to clear) is persisted (changed=true).
func resolveSecretUpdate(submitted, stored string) (value string, changed bool) {
	if stored != "" && submitted == maskAPIKey(stored) {
		return stored, false
	}
	return submitted, true
}

// TestAI tests the AI connection with the given configuration.
func (s *settingsService) TestAI(ctx context.Context, provider, apiKey, baseURL, model string, requestOptions map[string]any) (string, error) {
	storedKey, err := s.getString(ctx, keyAIAPIKey)
	if err != nil {
		return "", fmt.Errorf("get stored api key: %w", err)
	}
	if storedKey != "" && apiKey == maskAPIKey(storedKey) {
		apiKey = storedKey
	}

	cfg := ai.Config{
		Provider:       provider,
		APIKey:         apiKey,
		BaseURL:        baseURL,
		Model:          model,
		RequestOptions: requestOptions,
	}
	if s.clientFactory != nil {
		cfg.HTTPClient = s.clientFactory.NewHTTPClient(ctx, 30*time.Second)
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

// GetGeneralSettings returns the general settings.
func (s *settingsService) GetGeneralSettings(ctx context.Context) (*GeneralSettings, error) {
	m, err := s.getPrefixMap(ctx, "general.")
	if err != nil {
		return nil, fmt.Errorf("get general settings: %w", err)
	}
	return &GeneralSettings{
		FallbackUserAgent: m[keyFallbackUserAgent],
		AutoReadability:   m[keyAutoReadability] == "true",
		MarkReadOnScroll:  m[keyMarkReadOnScroll] == "true",
	}, nil
}

// SetGeneralSettings updates the general settings in a single transaction.
func (s *settingsService) SetGeneralSettings(ctx context.Context, settings *GeneralSettings) error {
	if err := s.repo.SetMany(ctx, map[string]string{
		keyFallbackUserAgent: settings.FallbackUserAgent,
		keyAutoReadability:   strconv.FormatBool(settings.AutoReadability),
		keyMarkReadOnScroll:  strconv.FormatBool(settings.MarkReadOnScroll),
	}); err != nil {
		logger.Warn("general settings update failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set general settings: %w", err)
	}
	logger.Info("general settings updated", "module", "service", "action", "update", "resource", "settings", "result", "ok", "auto_readability", settings.AutoReadability, "mark_read_on_scroll", settings.MarkReadOnScroll)
	return nil
}

// GetFallbackUserAgent returns the fallback user agent if set.
func (s *settingsService) GetFallbackUserAgent(ctx context.Context) string {
	val, err := s.getString(ctx, keyFallbackUserAgent)
	if err != nil {
		return ""
	}
	return val
}

// ClearAnubisCookies deletes all Anubis cookies from both in-memory cache and settings storage.
func (s *settingsService) ClearAnubisCookies(ctx context.Context) (int64, error) {
	var (
		deleted int64
		err     error
	)
	if s.anubisClearer != nil {
		deleted, err = s.anubisClearer.ClearAll(ctx)
	} else {
		deleted, err = s.repo.DeleteByPrefix(ctx, "anubis.cookie.")
	}
	if err != nil {
		logger.Warn("anubis cookies clear failed", "module", "service", "action", "clear", "resource", "settings", "result", "failed", "error", err)
		return 0, err
	}
	logger.Info("anubis cookies cleared", "module", "service", "action", "clear", "resource", "settings", "result", "ok", "count", deleted)
	return deleted, nil
}

// GetNetworkSettings returns the network proxy configuration with masked password.
func (s *settingsService) GetNetworkSettings(ctx context.Context) (*NetworkSettings, error) {
	m, err := s.getPrefixMap(ctx, "network.")
	if err != nil {
		return nil, fmt.Errorf("get network settings: %w", err)
	}

	settings := &NetworkSettings{
		Enabled:  m[keyNetworkEnabled] == "true",
		Type:     "http",
		Host:     m[keyNetworkHost],
		Username: m[keyNetworkUsername],
		IPStack:  "default",
	}
	if val := m[keyNetworkType]; val != "" {
		settings.Type = val
	}
	if port, err := strconv.Atoi(m[keyNetworkPort]); err == nil && port > 0 {
		settings.Port = port
	}
	if val := m[keyNetworkPassword]; val != "" {
		settings.Password = maskAPIKey(val)
	}
	if val := m[keyNetworkIPStack]; val != "" {
		settings.IPStack = val
	}

	return settings, nil
}

// SetNetworkSettings updates the network proxy configuration in a single transaction
// and invalidates cached network transports.
func (s *settingsService) SetNetworkSettings(ctx context.Context, settings *NetworkSettings) error {
	storedPassword, err := s.getString(ctx, keyNetworkPassword)
	if err != nil {
		return fmt.Errorf("get stored proxy password: %w", err)
	}

	ipStack := settings.IPStack
	if ipStack == "" {
		ipStack = "default"
	}

	updates := map[string]string{
		keyNetworkEnabled:  strconv.FormatBool(settings.Enabled),
		keyNetworkHost:     strings.TrimSpace(settings.Host),
		keyNetworkPort:     strconv.Itoa(settings.Port),
		keyNetworkUsername: settings.Username,
		keyNetworkIPStack:  ipStack,
	}
	if settings.Type != "" {
		updates[keyNetworkType] = strings.ToLower(strings.TrimSpace(settings.Type))
	}
	if newPwd, changed := resolveSecretUpdate(settings.Password, storedPassword); changed {
		updates[keyNetworkPassword] = newPwd
	}

	if err := s.repo.SetMany(ctx, updates); err != nil {
		logger.Warn("network settings update failed", "module", "service", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return fmt.Errorf("set network settings: %w", err)
	}

	s.invalidateNetworkCache()
	if s.clientFactory != nil {
		s.clientFactory.InvalidateTransports()
	}

	logger.Info("network settings updated", "module", "service", "action", "update", "resource", "settings", "result", "ok", "enabled", settings.Enabled, "type", settings.Type, "ip_stack", ipStack)
	return nil
}

// TestNetworkProxy safely builds the proxy URL (resolving masked saved passwords) and tests connectivity.
func (s *settingsService) TestNetworkProxy(ctx context.Context, settings *NetworkSettings) error {
	if !settings.Enabled {
		return nil
	}

	proxyType := strings.ToLower(strings.TrimSpace(settings.Type))
	if proxyType == "" {
		proxyType = "http"
	}
	switch proxyType {
	case "http", "https", "socks5", "socks5h":
	default:
		return fmt.Errorf("%w: unsupported proxy type %q", ErrInvalid, settings.Type)
	}

	host := strings.TrimSpace(settings.Host)
	if host == "" {
		return fmt.Errorf("%w: host is required", ErrInvalid)
	}
	if settings.Port <= 0 || settings.Port > 65535 {
		return fmt.Errorf("%w: port must be between 1 and 65535", ErrInvalid)
	}

	password := settings.Password
	if password != "" {
		storedPassword, err := s.getString(ctx, keyNetworkPassword)
		if err != nil {
			return fmt.Errorf("get stored proxy password: %w", err)
		}
		if storedPassword != "" && password == maskAPIKey(storedPassword) {
			password = storedPassword
		}
	}

	proxyURL := buildProxyURL(proxyType, host, settings.Port, settings.Username, password)
	if s.clientFactory == nil {
		return errors.New("client factory is not initialized")
	}
	if err := s.clientFactory.TestProxyWithConfig(ctx, proxyURL, proxyTestURL); err != nil {
		logger.Warn("network proxy test failed", "module", "service", "action", "test", "resource", "settings", "result", "failed", "type", proxyType, "host", host, "error", err)
		return err
	}
	logger.Info("network proxy test ok", "module", "service", "action", "test", "resource", "settings", "result", "ok", "type", proxyType, "host", host)
	return nil
}

func (s *settingsService) invalidateNetworkCache() {
	s.netMu.Lock()
	s.netCacheLoaded = false
	s.cachedProxyURL = ""
	s.cachedIPStack = ""
	s.netMu.Unlock()
}

func (s *settingsService) loadNetworkCache(ctx context.Context) (proxyURL, ipStack string) {
	s.netMu.RLock()
	if s.netCacheLoaded {
		p, ip := s.cachedProxyURL, s.cachedIPStack
		s.netMu.RUnlock()
		return p, ip
	}
	s.netMu.RUnlock()

	m, err := s.getPrefixMap(ctx, "network.")
	if err != nil {
		return "", "default"
	}

	ipStack = m[keyNetworkIPStack]
	if ipStack == "" {
		ipStack = "default"
	}

	if m[keyNetworkEnabled] == "true" {
		host := strings.TrimSpace(m[keyNetworkHost])
		port, _ := strconv.Atoi(m[keyNetworkPort])
		if host != "" && port > 0 && port <= 65535 {
			proxyType := strings.ToLower(strings.TrimSpace(m[keyNetworkType]))
			if proxyType == "" {
				proxyType = "http"
			}
			proxyURL = buildProxyURL(proxyType, host, port, m[keyNetworkUsername], m[keyNetworkPassword])
		}
	}

	s.netMu.Lock()
	s.cachedProxyURL = proxyURL
	s.cachedIPStack = ipStack
	s.netCacheLoaded = true
	s.netMu.Unlock()

	return proxyURL, ipStack
}

// GetIPStack returns the IP stack preference (default, ipv4, ipv6).
func (s *settingsService) GetIPStack(ctx context.Context) string {
	_, ipStack := s.loadNetworkCache(ctx)
	return ipStack
}

// GetProxyURL returns the formatted proxy URL or empty string if proxy is disabled.
func (s *settingsService) GetProxyURL(ctx context.Context) string {
	proxyURL, _ := s.loadNetworkCache(ctx)
	return proxyURL
}

func buildProxyURL(scheme, host string, port int, username, password string) string {
	u := &url.URL{
		Scheme: scheme,
		Host:   net.JoinHostPort(host, strconv.Itoa(port)),
	}
	if username != "" && password != "" {
		u.User = url.UserPassword(username, password)
	} else if username != "" {
		u.User = url.User(username)
	}
	return u.String()
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
