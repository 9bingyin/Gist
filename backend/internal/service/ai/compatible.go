package ai

import (
	"context"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
)

// CompatibleProvider implements Provider for OpenAI-compatible APIs.
// This supports services like OpenRouter, Azure OpenAI, Ollama, etc.
type CompatibleProvider struct {
	client            openai.Client
	model             string
	thinkingSupported bool
	thinking          bool
	reasoningEffort   string
}

// NewCompatibleProvider creates a new OpenAI-compatible provider.
func NewCompatibleProvider(apiKey, baseURL, model string, thinkingSupported, thinking bool, reasoningEffort string) (*CompatibleProvider, error) {
	client := openai.NewClient(
		option.WithAPIKey(apiKey),
		option.WithBaseURL(baseURL),
	)
	return &CompatibleProvider{
		client:            client,
		model:             model,
		thinkingSupported: thinkingSupported,
		thinking:          thinking,
		reasoningEffort:   reasoningEffort,
	}, nil
}

// Test sends a test message and returns the response.
func (p *CompatibleProvider) Test(ctx context.Context) (string, error) {
	params := openai.ChatCompletionNewParams{
		Model: openai.ChatModel(p.model),
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("Hello world"),
		},
		MaxCompletionTokens: openai.Int(50),
	}

	// Only pass reasoning params when the model supports thinking and enabled
	if p.thinkingSupported && p.thinking && p.reasoningEffort != "" {
		params.ReasoningEffort = shared.ReasoningEffort(p.reasoningEffort)
	}

	resp, err := p.client.Chat.Completions.New(ctx, params)
	if err != nil {
		return "", err
	}

	if len(resp.Choices) == 0 {
		return "", nil
	}
	return resp.Choices[0].Message.Content, nil
}

// Name returns the provider name.
func (p *CompatibleProvider) Name() string {
	return ProviderCompatible
}

// SummarizeStream generates a summary using streaming.
func (p *CompatibleProvider) SummarizeStream(ctx context.Context, systemPrompt, content string) (<-chan string, <-chan error) {
	textCh := make(chan string)
	errCh := make(chan error, 1)

	go func() {
		defer close(textCh)
		defer close(errCh)

		messages := []openai.ChatCompletionMessageParamUnion{}
		if systemPrompt != "" {
			messages = append(messages, openai.SystemMessage(systemPrompt))
		}
		messages = append(messages, openai.UserMessage(content))

		params := openai.ChatCompletionNewParams{
			Model:    openai.ChatModel(p.model),
			Messages: messages,
		}

		// Only pass reasoning params when the model supports thinking and enabled
		if p.thinkingSupported && p.thinking && p.reasoningEffort != "" {
			params.ReasoningEffort = shared.ReasoningEffort(p.reasoningEffort)
		}

		stream := p.client.Chat.Completions.NewStreaming(ctx, params)
		defer stream.Close()

		for stream.Next() {
			chunk := stream.Current()
			for _, choice := range chunk.Choices {
				if choice.Delta.Content != "" {
					select {
					case textCh <- choice.Delta.Content:
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

// Complete generates a response without streaming.
func (p *CompatibleProvider) Complete(ctx context.Context, systemPrompt, content string) (string, error) {
	messages := []openai.ChatCompletionMessageParamUnion{}
	if systemPrompt != "" {
		messages = append(messages, openai.SystemMessage(systemPrompt))
	}
	messages = append(messages, openai.UserMessage(content))

	params := openai.ChatCompletionNewParams{
		Model:    openai.ChatModel(p.model),
		Messages: messages,
	}

	// Only pass reasoning params when the model supports thinking and enabled
	if p.thinkingSupported && p.thinking && p.reasoningEffort != "" {
		params.ReasoningEffort = shared.ReasoningEffort(p.reasoningEffort)
	}

	resp, err := p.client.Chat.Completions.New(ctx, params)
	if err != nil {
		return "", err
	}

	if len(resp.Choices) == 0 {
		return "", nil
	}
	return resp.Choices[0].Message.Content, nil
}
