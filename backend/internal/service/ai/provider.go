package ai

import (
	"context"
	"errors"
	"net/http"
)

// TextStreamEvent represents a single text delta or terminal error from a streaming provider.
type TextStreamEvent struct {
	Text string
	Err  error
}

// Provider defines the interface for AI providers.
type Provider interface {
	// Test sends a test message and returns the response.
	Test(ctx context.Context) (string, error)
	// Name returns the provider name.
	Name() string
	// SummarizeStream generates a summary using a single ordered event channel.
	// The channel is closed when streaming completes or terminates with an error.
	SummarizeStream(ctx context.Context, systemPrompt, content string) <-chan TextStreamEvent
	// Complete generates a response without streaming.
	Complete(ctx context.Context, systemPrompt, content string) (string, error)
}

// Config holds the configuration for an AI provider.
type Config struct {
	Provider       string // openai, anthropic, compatible
	APIKey         string
	BaseURL        string // required for openai/compatible, optional for anthropic
	Model          string
	RequestOptions map[string]any // extra request JSON parameters
	HTTPClient     *http.Client   // optional pooled/proxied HTTP client
}

// ProviderType constants.
const (
	ProviderOpenAI     = "openai"
	ProviderAnthropic  = "anthropic"
	ProviderCompatible = "compatible"
)

var (
	ErrInvalidProvider = errors.New("invalid provider")
	ErrMissingAPIKey   = errors.New("API key is required")
	ErrMissingBaseURL  = errors.New("base URL is required for openai and compatible providers")
	ErrMissingModel    = errors.New("model is required")
)

// NewProvider creates a new AI provider based on the config.
func NewProvider(cfg Config) (Provider, error) {
	if cfg.APIKey == "" {
		return nil, ErrMissingAPIKey
	}
	if cfg.Model == "" {
		return nil, ErrMissingModel
	}

	switch cfg.Provider {
	case ProviderOpenAI:
		if cfg.BaseURL == "" {
			return nil, ErrMissingBaseURL
		}
		return NewOpenAIProvider(cfg.APIKey, cfg.BaseURL, cfg.Model, cfg.RequestOptions, cfg.HTTPClient), nil
	case ProviderAnthropic:
		return NewAnthropicProvider(cfg.APIKey, cfg.BaseURL, cfg.Model, cfg.RequestOptions, cfg.HTTPClient), nil
	case ProviderCompatible:
		if cfg.BaseURL == "" {
			return nil, ErrMissingBaseURL
		}
		return NewCompatibleProvider(cfg.APIKey, cfg.BaseURL, cfg.Model, cfg.RequestOptions, cfg.HTTPClient), nil
	default:
		return nil, ErrInvalidProvider
	}
}
