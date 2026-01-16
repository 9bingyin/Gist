package ai

import (
	"context"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
)

// OpenAIProvider implements Provider for OpenAI API.
type OpenAIProvider struct {
	client          openai.Client
	model           string
	endpoint        string // "responses" or "chat/completions"
	thinking        bool
	reasoningEffort string
}

// NewOpenAIProvider creates a new OpenAI provider.
func NewOpenAIProvider(apiKey, baseURL, model, endpoint string, thinking bool, reasoningEffort string) (*OpenAIProvider, error) {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}

	// Default to responses if not specified
	if endpoint == "" {
		endpoint = "responses"
	}

	client := openai.NewClient(opts...)
	return &OpenAIProvider{
		client:          client,
		model:           model,
		endpoint:        endpoint,
		thinking:        thinking,
		reasoningEffort: reasoningEffort,
	}, nil
}

// Test sends a test message and returns the response.
func (p *OpenAIProvider) Test(ctx context.Context) (string, error) {
	if p.endpoint == "responses" {
		return p.testWithResponses(ctx)
	}
	return p.testWithChat(ctx)
}

// testWithResponses uses the Responses API for testing.
func (p *OpenAIProvider) testWithResponses(ctx context.Context) (string, error) {
	params := responses.ResponseNewParams{
		Model: shared.ResponsesModel(p.model),
		Input: responses.ResponseNewParamsInputUnion{
			OfInputItemList: responses.ResponseInputParam{
				responses.ResponseInputItemParamOfMessage("Hello world", responses.EasyInputMessageRoleUser),
			},
		},
	}

	// Responses API supports reasoning for all models
	if p.thinking && p.reasoningEffort != "" {
		params.Reasoning = shared.ReasoningParam{
			Effort: shared.ReasoningEffort(p.reasoningEffort),
		}
	}

	resp, err := p.client.Responses.New(ctx, params)
	if err != nil {
		return "", err
	}

	if len(resp.Output) == 0 {
		return "", nil
	}

	// Extract text from first output item
	for _, item := range resp.Output {
		if item.Type == "message" {
			// Access message content
			msg := item.AsMessage()
			for _, content := range msg.Content {
				if content.Type == "output_text" {
					// Access text content directly
					return content.Text, nil
				}
			}
		}
	}

	return "", nil
}

// testWithChat uses the Chat Completions API for testing.
func (p *OpenAIProvider) testWithChat(ctx context.Context) (string, error) {
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
	if p.endpoint == "responses" {
		return p.summarizeStreamWithResponses(ctx, systemPrompt, content)
	}
	return p.summarizeStreamWithChat(ctx, systemPrompt, content)
}

// summarizeStreamWithResponses uses the Responses API for streaming.
func (p *OpenAIProvider) summarizeStreamWithResponses(ctx context.Context, systemPrompt, content string) (<-chan string, <-chan error) {
	textCh := make(chan string)
	errCh := make(chan error, 1)

	go func() {
		defer close(textCh)
		defer close(errCh)

		// Build input messages
		inputItems := []responses.ResponseInputItemUnionParam{}
		if systemPrompt != "" {
			inputItems = append(inputItems, responses.ResponseInputItemParamOfMessage(systemPrompt, responses.EasyInputMessageRoleSystem))
		}
		inputItems = append(inputItems, responses.ResponseInputItemParamOfMessage(content, responses.EasyInputMessageRoleUser))

		params := responses.ResponseNewParams{
			Model: shared.ResponsesModel(p.model),
			Input: responses.ResponseNewParamsInputUnion{
				OfInputItemList: responses.ResponseInputParam(inputItems),
			},
		}

		// Responses API supports reasoning for all models
		if p.thinking && p.reasoningEffort != "" {
			params.Reasoning = shared.ReasoningParam{
				Effort: shared.ReasoningEffort(p.reasoningEffort),
			}
		}

		stream := p.client.Responses.NewStreaming(ctx, params)
		defer stream.Close()

		for stream.Next() {
			event := stream.Current()
			// Extract text from response.output_text.delta events
			if event.Type == "response.output_text.delta" {
				if event.Delta != "" {
					select {
					case textCh <- event.Delta:
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

// summarizeStreamWithChat uses the Chat Completions API for streaming.
func (p *OpenAIProvider) summarizeStreamWithChat(ctx context.Context, systemPrompt, content string) (<-chan string, <-chan error) {
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
func (p *OpenAIProvider) Complete(ctx context.Context, systemPrompt, content string) (string, error) {
	if p.endpoint == "responses" {
		return p.completeWithResponses(ctx, systemPrompt, content)
	}
	return p.completeWithChat(ctx, systemPrompt, content)
}

// completeWithResponses uses the Responses API for completion.
func (p *OpenAIProvider) completeWithResponses(ctx context.Context, systemPrompt, content string) (string, error) {
	// Build input messages
	inputItems := []responses.ResponseInputItemUnionParam{}
	if systemPrompt != "" {
		inputItems = append(inputItems, responses.ResponseInputItemParamOfMessage(systemPrompt, responses.EasyInputMessageRoleSystem))
	}
	inputItems = append(inputItems, responses.ResponseInputItemParamOfMessage(content, responses.EasyInputMessageRoleUser))

	params := responses.ResponseNewParams{
		Model: shared.ResponsesModel(p.model),
		Input: responses.ResponseNewParamsInputUnion{
			OfInputItemList: responses.ResponseInputParam(inputItems),
		},
	}

	// Responses API supports reasoning for all models
	if p.thinking && p.reasoningEffort != "" {
		params.Reasoning = shared.ReasoningParam{
			Effort: shared.ReasoningEffort(p.reasoningEffort),
		}
	}

	resp, err := p.client.Responses.New(ctx, params)
	if err != nil {
		return "", err
	}

	if len(resp.Output) == 0 {
		return "", nil
	}

	// Extract text from output items
	var result strings.Builder
	for _, item := range resp.Output {
		if item.Type == "message" {
			msg := item.AsMessage()
			for _, content := range msg.Content {
				if content.Type == "output_text" {
					result.WriteString(content.Text)
				}
			}
		}
	}

	return result.String(), nil
}

// completeWithChat uses the Chat Completions API for completion.
func (p *OpenAIProvider) completeWithChat(ctx context.Context, systemPrompt, content string) (string, error) {
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

	resp, err := p.client.Chat.Completions.New(ctx, params)
	if err != nil {
		return "", err
	}

	if len(resp.Choices) == 0 {
		return "", nil
	}
	return resp.Choices[0].Message.Content, nil
}
