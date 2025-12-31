package ai

import (
	"context"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// AnthropicProvider implements Provider for Anthropic API.
type AnthropicProvider struct {
	client         anthropic.Client
	model          string
	thinking       bool
	thinkingBudget int
}

// NewAnthropicProvider creates a new Anthropic provider.
func NewAnthropicProvider(apiKey, baseURL, model string, thinking bool, thinkingBudget int) (*AnthropicProvider, error) {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	client := anthropic.NewClient(opts...)
	return &AnthropicProvider{
		client:         client,
		model:          model,
		thinking:       thinking,
		thinkingBudget: thinkingBudget,
	}, nil
}

// Test sends a test message and returns the response.
func (p *AnthropicProvider) Test(ctx context.Context) (string, error) {
	params := anthropic.MessageNewParams{
		Model: anthropic.Model(p.model),
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock("Hello world")),
		},
	}

	// Configure extended thinking using SDK native types
	if p.thinking && p.thinkingBudget > 0 {
		params.MaxTokens = int64(p.thinkingBudget + 1024)
		params.Thinking = anthropic.ThinkingConfigParamOfEnabled(int64(p.thinkingBudget))
	} else {
		params.MaxTokens = 50
		// Explicitly disable thinking (API defaults to enabled for some models)
		disabled := anthropic.NewThinkingConfigDisabledParam()
		params.Thinking = anthropic.ThinkingConfigParamUnion{
			OfDisabled: &disabled,
		}
	}

	resp, err := p.client.Messages.New(ctx, params)
	if err != nil {
		return "", err
	}

	// Extract text content from response (skip thinking blocks)
	for _, block := range resp.Content {
		switch v := block.AsAny().(type) {
		case anthropic.TextBlock:
			return v.Text, nil
		}
	}
	return "", nil
}

// Name returns the provider name.
func (p *AnthropicProvider) Name() string {
	return ProviderAnthropic
}

// SummarizeStream generates a summary using streaming.
func (p *AnthropicProvider) SummarizeStream(ctx context.Context, systemPrompt, content string) (<-chan string, <-chan error) {
	textCh := make(chan string)
	errCh := make(chan error, 1)

	go func() {
		defer close(textCh)
		defer close(errCh)

		params := anthropic.MessageNewParams{
			Model: anthropic.Model(p.model),
			Messages: []anthropic.MessageParam{
				anthropic.NewUserMessage(anthropic.NewTextBlock(content)),
			},
		}

		if systemPrompt != "" {
			params.System = []anthropic.TextBlockParam{
				{Text: systemPrompt},
			}
		}

		// Configure extended thinking
		// Max output tokens: Claude 3.5 Sonnet supports 8192, Claude 4 models may support more
		// Using 64000 as a safe upper limit that works with most models
		if p.thinking && p.thinkingBudget > 0 {
			params.MaxTokens = int64(p.thinkingBudget + 64000)
			params.Thinking = anthropic.ThinkingConfigParamOfEnabled(int64(p.thinkingBudget))
		} else {
			params.MaxTokens = 64000
			disabled := anthropic.NewThinkingConfigDisabledParam()
			params.Thinking = anthropic.ThinkingConfigParamUnion{
				OfDisabled: &disabled,
			}
		}

		stream := p.client.Messages.NewStreaming(ctx, params)

		for stream.Next() {
			event := stream.Current()

			switch eventVariant := event.AsAny().(type) {
			case anthropic.ContentBlockDeltaEvent:
				switch deltaVariant := eventVariant.Delta.AsAny().(type) {
				case anthropic.TextDelta:
					select {
					case textCh <- deltaVariant.Text:
					case <-ctx.Done():
						return
					}
				}
			}
		}

		if err := stream.Err(); err != nil {
			select {
			case errCh <- err:
			default:
			}
		}
	}()

	return textCh, errCh
}
