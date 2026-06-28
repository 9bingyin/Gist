package ai

import (
	"context"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// AnthropicProvider implements Provider for Anthropic API.
type AnthropicProvider struct {
	client         anthropic.Client
	model          string
	requestOptions map[string]any
}

// NewAnthropicProvider creates a new Anthropic provider.
func NewAnthropicProvider(apiKey, baseURL, model string, requestOptions map[string]any) (*AnthropicProvider, error) {
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
		requestOptions: requestOptions,
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

	params.MaxTokens = 50
	applyRequestOptions(&params, p.requestOptions)

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

		params.MaxTokens = 64000
		applyRequestOptions(&params, p.requestOptions)

		stream := p.client.Messages.NewStreaming(ctx, params)
		defer stream.Close() // Close HTTP connection when done or cancelled

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

// Complete generates a response using streaming internally.
// Anthropic API requires streaming for operations that may take longer than 10 minutes,
// so we use streaming and collect the full response.
func (p *AnthropicProvider) Complete(ctx context.Context, systemPrompt, content string) (string, error) {
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

	params.MaxTokens = 64000
	applyRequestOptions(&params, p.requestOptions)

	var result strings.Builder
	stream := p.client.Messages.NewStreaming(ctx, params)
	defer stream.Close()

	for stream.Next() {
		event := stream.Current()
		switch eventVariant := event.AsAny().(type) {
		case anthropic.ContentBlockDeltaEvent:
			switch deltaVariant := eventVariant.Delta.AsAny().(type) {
			case anthropic.TextDelta:
				result.WriteString(deltaVariant.Text)
			}
		}
	}

	if err := stream.Err(); err != nil {
		return "", err
	}

	return result.String(), nil
}
