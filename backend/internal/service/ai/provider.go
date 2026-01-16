package ai

import (
	"context"
	"errors"
)

// Provider defines the interface for AI providers.
type Provider interface {
	// Test sends a test message and returns the response.
	Test(ctx context.Context) (string, error)
	// Name returns the provider name.
	Name() string
	// SummarizeStream generates a summary using streaming.
	// Returns two channels: one for text chunks, one for errors.
	// The text channel is closed when streaming is complete.
	SummarizeStream(ctx context.Context, systemPrompt, content string) (<-chan string, <-chan error)
	// Complete generates a response without streaming.
	Complete(ctx context.Context, systemPrompt, content string) (string, error)
}

// Config holds the configuration for an AI provider.
type Config struct {
	Provider        string // openai, anthropic, compatible
	APIKey          string
	BaseURL         string // optional for openai, required for compatible
	Model           string
	Endpoint        string // OpenAI only: responses or chat/completions
	Thinking        bool   // enable thinking/reasoning
	ThinkingBudget  int    // Anthropic/Compatible budget_tokens
	ReasoningEffort string // OpenAI/Compatible effort: low/medium/high/xhigh/minimal/none
}

// ProviderType constants
const (
	ProviderOpenAI     = "openai"
	ProviderAnthropic  = "anthropic"
	ProviderCompatible = "compatible"
)

var (
	ErrInvalidProvider = errors.New("invalid provider")
	ErrMissingAPIKey   = errors.New("API key is required")
	ErrMissingBaseURL  = errors.New("base URL is required for compatible provider")
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
		return NewOpenAIProvider(cfg.APIKey, cfg.BaseURL, cfg.Model, cfg.Endpoint, cfg.Thinking, cfg.ReasoningEffort)
	case ProviderAnthropic:
		return NewAnthropicProvider(cfg.APIKey, cfg.BaseURL, cfg.Model, cfg.Thinking, cfg.ThinkingBudget)
	case ProviderCompatible:
		if cfg.BaseURL == "" {
			return nil, ErrMissingBaseURL
		}
		return NewCompatibleProvider(cfg.APIKey, cfg.BaseURL, cfg.Model, cfg.Thinking, cfg.ThinkingBudget, cfg.ReasoningEffort)
	default:
		return nil, ErrInvalidProvider
	}
}
