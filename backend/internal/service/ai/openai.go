package ai

import (
	"context"
	"net/http"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
)

// OpenAIProvider implements Provider for OpenAI Responses API.
type OpenAIProvider struct {
	client         openai.Client
	model          string
	requestOptions map[string]any
}

// NewOpenAIProvider creates a new OpenAI provider.
func NewOpenAIProvider(apiKey, baseURL, model string, requestOptions map[string]any, httpClient *http.Client) *OpenAIProvider {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	if httpClient != nil {
		opts = append(opts, option.WithHTTPClient(httpClient))
	}

	return &OpenAIProvider{
		client:         openai.NewClient(opts...),
		model:          model,
		requestOptions: requestOptions,
	}
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

	applyRequestOptions(&params, p.requestOptions)

	resp, err := p.client.Responses.New(ctx, params)
	if err != nil {
		return "", err
	}

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

// SummarizeStream generates a summary using a single ordered event channel.
func (p *OpenAIProvider) SummarizeStream(ctx context.Context, systemPrompt, content string) <-chan TextStreamEvent {
	ch := make(chan TextStreamEvent, 16)

	go func() {
		defer close(ch)

		params := responses.ResponseNewParams{
			Model: shared.ResponsesModel(p.model),
			Input: responses.ResponseNewParamsInputUnion{
				OfInputItemList: responses.ResponseInputParam{
					responses.ResponseInputItemParamOfMessage(content, responses.EasyInputMessageRoleUser),
				},
			},
		}

		if systemPrompt != "" {
			params.Instructions = openai.String(systemPrompt)
		}

		applyRequestOptions(&params, p.requestOptions)

		stream := p.client.Responses.NewStreaming(ctx, params)
		defer stream.Close()

		for stream.Next() {
			event := stream.Current()
			if event.Type == "response.output_text.delta" && event.Delta != "" {
				select {
				case ch <- TextStreamEvent{Text: event.Delta}:
				case <-ctx.Done():
					return
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
func (p *OpenAIProvider) Complete(ctx context.Context, systemPrompt, content string) (string, error) {
	params := responses.ResponseNewParams{
		Model: shared.ResponsesModel(p.model),
		Input: responses.ResponseNewParamsInputUnion{
			OfInputItemList: responses.ResponseInputParam{
				responses.ResponseInputItemParamOfMessage(content, responses.EasyInputMessageRoleUser),
			},
		},
	}

	if systemPrompt != "" {
		params.Instructions = openai.String(systemPrompt)
	}

	applyRequestOptions(&params, p.requestOptions)

	resp, err := p.client.Responses.New(ctx, params)
	if err != nil {
		return "", err
	}

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

type extraFieldsSetter interface {
	SetExtraFields(map[string]any)
}

func applyRequestOptions(params extraFieldsSetter, options map[string]any) {
	if len(options) == 0 {
		return
	}
	params.SetExtraFields(options)
}
