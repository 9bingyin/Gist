package ai

import (
	"context"
	"strings"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/openai/openai-go/shared"
)

// OpenAIProvider implements Provider for OpenAI API.
type OpenAIProvider struct {
	client          openai.Client
	model           string
	thinking        bool
	reasoningEffort string
}

// NewOpenAIProvider creates a new OpenAI provider.
func NewOpenAIProvider(apiKey, baseURL, model string, thinking bool, reasoningEffort string) (*OpenAIProvider, error) {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}

	client := openai.NewClient(opts...)
	return &OpenAIProvider{
		client:          client,
		model:           model,
		thinking:        thinking,
		reasoningEffort: reasoningEffort,
	}, nil
}

// Test sends a test message and returns the response.
func (p *OpenAIProvider) Test(ctx context.Context) (string, error) {
	params := openai.ChatCompletionNewParams{
		Model: openai.ChatModel(p.model),
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("Hello world"),
		},
	}

	// For reasoning models (o1, o3, gpt-5), use reasoning_effort
	if p.thinking && p.isReasoningModel() && p.reasoningEffort != "" {
		params.ReasoningEffort = shared.ReasoningEffort(p.reasoningEffort)
	} else {
		params.MaxTokens = openai.Int(50)
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

// isReasoningModel checks if the model supports reasoning_effort parameter.
// Supports: o1, o3, o4, gpt-5 series
func (p *OpenAIProvider) isReasoningModel() bool {
	model := strings.ToLower(p.model)
	return strings.HasPrefix(model, "o1") ||
		strings.HasPrefix(model, "o3") ||
		strings.HasPrefix(model, "o4") ||
		strings.HasPrefix(model, "gpt-5")
}

// Name returns the provider name.
func (p *OpenAIProvider) Name() string {
	return ProviderOpenAI
}

// SummarizeStream generates a summary using streaming.
func (p *OpenAIProvider) SummarizeStream(ctx context.Context, systemPrompt, content string) (<-chan string, <-chan error) {
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

		// For reasoning models (o1, o3, gpt-5), use reasoning_effort
		if p.thinking && p.isReasoningModel() && p.reasoningEffort != "" {
			params.ReasoningEffort = shared.ReasoningEffort(p.reasoningEffort)
		}

		stream := p.client.Chat.Completions.NewStreaming(ctx, params)

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
