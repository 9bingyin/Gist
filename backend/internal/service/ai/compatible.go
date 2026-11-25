package ai

import (
	"context"
	"net/http"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

// CompatibleProvider implements Provider for OpenAI-compatible APIs.
// This supports services like OpenRouter, Azure OpenAI, Ollama, etc.
type CompatibleProvider struct {
	client         openai.Client
	model          string
	requestOptions map[string]any
}

// NewCompatibleProvider creates a new OpenAI-compatible provider.
func NewCompatibleProvider(apiKey, baseURL, model string, requestOptions map[string]any, httpClient *http.Client) *CompatibleProvider {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
		option.WithBaseURL(baseURL),
	}
	if httpClient != nil {
		opts = append(opts, option.WithHTTPClient(httpClient))
	}

	return &CompatibleProvider{
		client:         openai.NewClient(opts...),
		model:          model,
		requestOptions: requestOptions,
	}
}

// Test sends a test message and returns the response.
// Does not hardcode MaxCompletionTokens so reasoning/thinking models are not truncated.
func (p *CompatibleProvider) Test(ctx context.Context) (string, error) {
	params := openai.ChatCompletionNewParams{
		Model: openai.ChatModel(p.model),
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("Hello world"),
		},
	}

	applyRequestOptions(&params, p.requestOptions)

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

// SummarizeStream generates a summary using a single ordered event channel.
func (p *CompatibleProvider) SummarizeStream(ctx context.Context, systemPrompt, content string) <-chan TextStreamEvent {
	ch := make(chan TextStreamEvent, 16)

	go func() {
		defer close(ch)

		messages := make([]openai.ChatCompletionMessageParamUnion, 0, 2)
		if systemPrompt != "" {
			messages = append(messages, openai.SystemMessage(systemPrompt))
		}
		messages = append(messages, openai.UserMessage(content))

		params := openai.ChatCompletionNewParams{
			Model:    openai.ChatModel(p.model),
			Messages: messages,
		}

		applyRequestOptions(&params, p.requestOptions)

		stream := p.client.Chat.Completions.NewStreaming(ctx, params)
		defer stream.Close()

		for stream.Next() {
			chunk := stream.Current()
			for _, choice := range chunk.Choices {
				if choice.Delta.Content != "" {
					select {
					case ch <- TextStreamEvent{Text: choice.Delta.Content}:
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

// Complete generates a response without streaming.
func (p *CompatibleProvider) Complete(ctx context.Context, systemPrompt, content string) (string, error) {
	messages := make([]openai.ChatCompletionMessageParamUnion, 0, 2)
	if systemPrompt != "" {
		messages = append(messages, openai.SystemMessage(systemPrompt))
	}
	messages = append(messages, openai.UserMessage(content))

	params := openai.ChatCompletionNewParams{
		Model:    openai.ChatModel(p.model),
		Messages: messages,
	}

	applyRequestOptions(&params, p.requestOptions)

	resp, err := p.client.Chat.Completions.New(ctx, params)
	if err != nil {
		return "", err
	}

	if len(resp.Choices) == 0 {
		return "", nil
	}
	return resp.Choices[0].Message.Content, nil
}
