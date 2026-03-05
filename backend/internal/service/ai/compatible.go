package ai

import (
	"context"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

// CompatibleProvider implements Provider for OpenAI-compatible APIs.
// This supports services like OpenRouter, Azure OpenAI, Ollama, etc.
type CompatibleProvider struct {
	client            openai.Client
	model             string
	thinkingSupported bool
	thinking          bool
	thinkingBudget    int
	reasoningEffort   string
}

// NewCompatibleProvider creates a new OpenAI-compatible provider.
func NewCompatibleProvider(apiKey, baseURL, model string, thinkingSupported, thinking bool, thinkingBudget int, reasoningEffort string) (*CompatibleProvider, error) {
	client := openai.NewClient(
		option.WithAPIKey(apiKey),
		option.WithBaseURL(baseURL),
	)
	return &CompatibleProvider{
		client:            client,
		model:             model,
		thinkingSupported: thinkingSupported,
		thinking:          thinking,
		thinkingBudget:    thinkingBudget,
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
	}

	var opts []option.RequestOption

	// Only pass reasoning params when the model supports thinking
	if p.thinkingSupported {
		if p.thinking {
			reasoning := map[string]interface{}{}
			if p.reasoningEffort != "" {
				reasoning["effort"] = p.reasoningEffort
			} else if p.thinkingBudget > 0 {
				reasoning["max_tokens"] = p.thinkingBudget
			}
			if len(reasoning) > 0 {
				opts = append(opts, option.WithJSONSet("reasoning", reasoning))
			} else {
				params.MaxTokens = openai.Int(50)
			}
		} else {
			params.MaxTokens = openai.Int(50)
			// Explicitly disable reasoning
			opts = append(opts, option.WithJSONSet("reasoning", map[string]interface{}{
				"enabled": false,
			}))
		}
	} else {
		// Model does not support thinking, do not pass any reasoning params
		params.MaxTokens = openai.Int(50)
	}

	resp, err := p.client.Chat.Completions.New(ctx, params, opts...)
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

		var opts []option.RequestOption

		// Only pass reasoning params when the model supports thinking
		if p.thinkingSupported {
			if p.thinking {
				reasoning := map[string]interface{}{}
				if p.reasoningEffort != "" {
					reasoning["effort"] = p.reasoningEffort
				} else if p.thinkingBudget > 0 {
					reasoning["max_tokens"] = p.thinkingBudget
				}
				if len(reasoning) > 0 {
					opts = append(opts, option.WithJSONSet("reasoning", reasoning))
				}
			} else {
				opts = append(opts, option.WithJSONSet("reasoning", map[string]interface{}{
					"enabled": false,
				}))
			}
		}

		stream := p.client.Chat.Completions.NewStreaming(ctx, params, opts...)
		defer stream.Close() // Close HTTP connection when done or cancelled

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

	var opts []option.RequestOption

	// Only pass reasoning params when the model supports thinking
	if p.thinkingSupported {
		if p.thinking {
			reasoning := map[string]interface{}{}
			if p.reasoningEffort != "" {
				reasoning["effort"] = p.reasoningEffort
			} else if p.thinkingBudget > 0 {
				reasoning["max_tokens"] = p.thinkingBudget
			}
			if len(reasoning) > 0 {
				opts = append(opts, option.WithJSONSet("reasoning", reasoning))
			}
		} else {
			opts = append(opts, option.WithJSONSet("reasoning", map[string]interface{}{
				"enabled": false,
			}))
		}
	}

	resp, err := p.client.Chat.Completions.New(ctx, params, opts...)
	if err != nil {
		return "", err
	}

	if len(resp.Choices) == 0 {
		return "", nil
	}
	return resp.Choices[0].Message.Content, nil
}
