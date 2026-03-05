package ai

import (
	"context"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
)

// OpenAIProvider implements Provider for OpenAI Responses API.
type OpenAIProvider struct {
	client            openai.Client
	model             string
	thinkingSupported bool
	thinking          bool
	reasoningEffort   string
}

// NewOpenAIProvider creates a new OpenAI provider.
func NewOpenAIProvider(apiKey, baseURL, model string, thinkingSupported, thinking bool, reasoningEffort string) (*OpenAIProvider, error) {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}

	client := openai.NewClient(opts...)
	return &OpenAIProvider{
		client:            client,
		model:             model,
		thinkingSupported: thinkingSupported,
		thinking:          thinking,
		reasoningEffort:   reasoningEffort,
	}, nil
}

// Test sends a test message and returns the response.
func (p *OpenAIProvider) Test(ctx context.Context) (string, error) {
	params := responses.ResponseNewParams{
		Model: shared.ResponsesModel(p.model),
		Input: responses.ResponseNewParamsInputUnion{
			OfInputItemList: responses.ResponseInputParam{
				responses.ResponseInputItemParamOfMessage("Hello world", responses.EasyInputMessageRoleUser),
			},
		},
	}

	// Only pass reasoning params when the model supports thinking
	if p.thinkingSupported && p.thinking && p.reasoningEffort != "" {
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
			msg := item.AsMessage()
			for _, content := range msg.Content {
				if content.Type == "output_text" {
					return content.Text, nil
				}
			}
		}
	}

	return "", nil
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

		// Only pass reasoning params when the model supports thinking
		if p.thinkingSupported && p.thinking && p.reasoningEffort != "" {
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

// Complete generates a response without streaming.
func (p *OpenAIProvider) Complete(ctx context.Context, systemPrompt, content string) (string, error) {
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

	// Only pass reasoning params when the model supports thinking
	if p.thinkingSupported && p.thinking && p.reasoningEffort != "" {
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
