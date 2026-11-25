package ai

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

const (
	// Conservative fallback when GET /v1/models/{model_id} is unavailable (e.g. third-party gateways).
	defaultAnthropicMaxTokens int64 = 16384
	defaultAnthropicTestToken int64 = 1024
	modelLookupTimeout              = 5 * time.Second
)

var anthropicMaxTokensCache sync.Map // key: baseURL + "|" + model -> int64

// AnthropicProvider implements Provider for Anthropic API.
type AnthropicProvider struct {
	client         anthropic.Client
	baseURL        string
	model          string
	requestOptions map[string]any
}

// NewAnthropicProvider creates a new Anthropic provider.
func NewAnthropicProvider(apiKey, baseURL, model string, requestOptions map[string]any, httpClient *http.Client) *AnthropicProvider {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	if httpClient != nil {
		opts = append(opts, option.WithHTTPClient(httpClient))
	}
	return &AnthropicProvider{
		client:         anthropic.NewClient(opts...),
		baseURL:        baseURL,
		model:          model,
		requestOptions: requestOptions,
	}
}

// resolveMaxTokens determines max_tokens for Anthropic Messages API (which is required by protocol):
// 1. Respects requestOptions["max_tokens"] if explicitly set (via applyRequestOptions).
// 2. Queries GET /v1/models/{model_id} (cached in memory) for the model's real max_tokens.
// 3. Falls back to a conservative default and ensures max_tokens > thinking.budget_tokens if enabled.
func (p *AnthropicProvider) resolveMaxTokens(ctx context.Context) int64 {
	if explicit, ok := extractInt64Option(p.requestOptions, "max_tokens"); ok && explicit > 0 {
		return explicit
	}

	cacheKey := p.baseURL + "|" + p.model
	if cached, ok := anthropicMaxTokensCache.Load(cacheKey); ok {
		if val, ok := cached.(int64); ok && val > 0 {
			return ensureAboveThinkingBudget(val, p.requestOptions)
		}
	}

	lookupCtx, cancel := context.WithTimeout(ctx, modelLookupTimeout)
	defer cancel()

	if info, err := p.client.Models.Get(lookupCtx, p.model, anthropic.ModelGetParams{}); err == nil && info != nil && info.MaxTokens > 0 {
		anthropicMaxTokensCache.Store(cacheKey, info.MaxTokens)
		return ensureAboveThinkingBudget(info.MaxTokens, p.requestOptions)
	}

	return ensureAboveThinkingBudget(defaultAnthropicMaxTokens, p.requestOptions)
}

func (p *AnthropicProvider) resolveTestMaxTokens() int64 {
	if explicit, ok := extractInt64Option(p.requestOptions, "max_tokens"); ok && explicit > 0 {
		return explicit
	}
	return ensureAboveThinkingBudget(defaultAnthropicTestToken, p.requestOptions)
}

func ensureAboveThinkingBudget(maxTokens int64, opts map[string]any) int64 {
	if len(opts) == 0 {
		return maxTokens
	}
	thinking, ok := opts["thinking"].(map[string]any)
	if !ok {
		return maxTokens
	}
	budget, ok := extractInt64Option(thinking, "budget_tokens")
	if !ok || budget <= 0 {
		return maxTokens
	}
	minRequired := budget + 1024
	if maxTokens < minRequired {
		return minRequired
	}
	return maxTokens
}

func extractInt64Option(m map[string]any, key string) (int64, bool) {
	if len(m) == 0 {
		return 0, false
	}
	raw, exists := m[key]
	if !exists {
		return 0, false
	}
	switch v := raw.(type) {
	case int:
		return int64(v), true
	case int64:
		return v, true
	case float64:
		return int64(v), true
	default:
		return 0, false
	}
}

// Test sends a test message and returns the response.
func (p *AnthropicProvider) Test(ctx context.Context) (string, error) {
	params := anthropic.MessageNewParams{
		Model: anthropic.Model(p.model),
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock("Hello world")),
		},
		MaxTokens: p.resolveTestMaxTokens(),
	}

	applyRequestOptions(&params, p.requestOptions)

	resp, err := p.client.Messages.New(ctx, params)
	if err != nil {
		return "", err
	}

	for _, block := range resp.Content {
		if v, ok := block.AsAny().(anthropic.TextBlock); ok {
			return v.Text, nil
		}
	}
	return "", nil
}

// Name returns the provider name.
func (p *AnthropicProvider) Name() string {
	return ProviderAnthropic
}

// SummarizeStream generates a summary using a single ordered event channel.
func (p *AnthropicProvider) SummarizeStream(ctx context.Context, systemPrompt, content string) <-chan TextStreamEvent {
	ch := make(chan TextStreamEvent, 16)

	go func() {
		defer close(ch)

		params := anthropic.MessageNewParams{
			Model: anthropic.Model(p.model),
			Messages: []anthropic.MessageParam{
				anthropic.NewUserMessage(anthropic.NewTextBlock(content)),
			},
			MaxTokens: p.resolveMaxTokens(ctx),
		}

		if systemPrompt != "" {
			params.System = []anthropic.TextBlockParam{
				{Text: systemPrompt},
			}
		}

		applyRequestOptions(&params, p.requestOptions)

		stream := p.client.Messages.NewStreaming(ctx, params)
		defer stream.Close()

		for stream.Next() {
			event := stream.Current()
			if eventVariant, ok := event.AsAny().(anthropic.ContentBlockDeltaEvent); ok {
				if deltaVariant, ok := eventVariant.Delta.AsAny().(anthropic.TextDelta); ok && deltaVariant.Text != "" {
					select {
					case ch <- TextStreamEvent{Text: deltaVariant.Text}:
					case <-ctx.Done():
						return
					}
				}
			}
		}

		if err := stream.Err(); err != nil {
			select {
			case ch <- TextStreamEvent{Err: err}:
			case <-ctx.Done():
			}
		}
	}()

	return ch
}

// Complete generates a response using streaming internally (Anthropic requires streaming for long operations).
func (p *AnthropicProvider) Complete(ctx context.Context, systemPrompt, content string) (string, error) {
	params := anthropic.MessageNewParams{
		Model: anthropic.Model(p.model),
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(content)),
		},
		MaxTokens: p.resolveMaxTokens(ctx),
	}

	if systemPrompt != "" {
		params.System = []anthropic.TextBlockParam{
			{Text: systemPrompt},
		}
	}

	applyRequestOptions(&params, p.requestOptions)

	var result strings.Builder
	stream := p.client.Messages.NewStreaming(ctx, params)
	defer stream.Close()

	for stream.Next() {
		event := stream.Current()
		if eventVariant, ok := event.AsAny().(anthropic.ContentBlockDeltaEvent); ok {
			if deltaVariant, ok := eventVariant.Delta.AsAny().(anthropic.TextDelta); ok {
				result.WriteString(deltaVariant.Text)
			}
		}
	}

	if err := stream.Err(); err != nil {
		return "", err
	}

	return result.String(), nil
}
