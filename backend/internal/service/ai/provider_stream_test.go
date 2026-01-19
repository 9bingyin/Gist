package ai_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"gist/backend/internal/service/ai"
)

func TestOpenAIProvider_ChatEndpoints(t *testing.T) {
	server := newOpenAITestServer(t)
	defer server.Close()

	provider, err := ai.NewOpenAIProvider("key", server.URL+"/v1/", "gpt-4o-mini", "chat/completions", false, "")
	require.NoError(t, err)

	testAndCompleteProvider(t, provider, "chat-response")
	streamText := readStream(t, provider, "sys", "content")
	require.Equal(t, "chat-stream", streamText)
}

func TestOpenAIProvider_ResponsesEndpoints(t *testing.T) {
	server := newOpenAITestServer(t)
	defer server.Close()

	provider, err := ai.NewOpenAIProvider("key", server.URL+"/v1/", "gpt-4o-mini", "responses", false, "")
	require.NoError(t, err)

	testAndCompleteProvider(t, provider, "response-text")
	streamText := readStream(t, provider, "sys", "content")
	require.Equal(t, "response-stream", streamText)
}

func TestCompatibleProvider_ChatEndpoints(t *testing.T) {
	server := newOpenAITestServer(t)
	defer server.Close()

	provider, err := ai.NewCompatibleProvider("key", server.URL+"/v1/", "gpt-4o-mini", false, 0, "")
	require.NoError(t, err)

	testAndCompleteProvider(t, provider, "chat-response")
	streamText := readStream(t, provider, "sys", "content")
	require.Equal(t, "chat-stream", streamText)
}

func TestAnthropicProvider_MessageEndpoints(t *testing.T) {
	server := newAnthropicTestServer(t)
	defer server.Close()

	provider, err := ai.NewAnthropicProvider("key", server.URL+"/", "claude-3-sonnet", false, 0)
	require.NoError(t, err)

	testProvider(t, provider, "claude-response")

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err = provider.Complete(ctx, "sys", "content")
	require.Error(t, err)
	streamText := readStream(t, provider, "sys", "content")
	require.Equal(t, "claude-stream", streamText)
}

func testAndCompleteProvider(t *testing.T, provider ai.Provider, expected string) {
	t.Helper()
	testProvider(t, provider, expected)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	got, err := provider.Complete(ctx, "sys", "content")
	require.NoError(t, err)
	require.Equal(t, expected, got)
}

func testProvider(t *testing.T, provider ai.Provider, expected string) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	got, err := provider.Test(ctx)
	require.NoError(t, err)
	require.Equal(t, expected, got)
}

func readStream(t *testing.T, provider ai.Provider, systemPrompt, content string) string {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	textCh, errCh := provider.SummarizeStream(ctx, systemPrompt, content)

	var sb strings.Builder
	for text := range textCh {
		sb.WriteString(text)
	}
	if err, ok := <-errCh; ok && err != nil {
		require.NoError(t, err)
	}
	return sb.String()
}

func newOpenAITestServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := readBody(t, r)
		stream := isStreamRequest(body)

		switch r.URL.Path {
		case "/v1/chat/completions":
			if stream {
				writeOpenAIChatStream(w)
				return
			}
			writeOpenAIChatResponse(w)
			return
		case "/v1/responses":
			if stream {
				writeOpenAIResponseStream(w)
				return
			}
			writeOpenAIResponse(w)
			return
		default:
			http.NotFound(w, r)
		}
	}))
}

func newAnthropicTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			http.NotFound(w, r)
			return
		}

		body := readBody(t, r)
		if isStreamRequest(body) {
			writeAnthropicStream(w)
			return
		}
		writeAnthropicMessage(w)
	}))
}

func readBody(t *testing.T, r *http.Request) []byte {
	t.Helper()
	body, err := io.ReadAll(r.Body)
	require.NoError(t, err)
	_ = r.Body.Close()
	return body
}

func isStreamRequest(body []byte) bool {
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return false
	}
	stream, _ := payload["stream"].(bool)
	return stream
}

func writeOpenAIChatResponse(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	resp := map[string]interface{}{
		"id":      "chatcmpl-1",
		"object":  "chat.completion",
		"created": 1,
		"model":   "gpt-4o-mini",
		"choices": []interface{}{
			map[string]interface{}{
				"index":         0,
				"finish_reason": "stop",
				"message": map[string]interface{}{
					"role":    "assistant",
					"content": "chat-response",
					"refusal": "",
				},
				"logprobs": map[string]interface{}{
					"content": []interface{}{},
					"refusal": []interface{}{},
				},
			},
		},
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func writeOpenAIChatStream(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	data := `{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"gpt-4o-mini","choices":[{"delta":{"content":"chat-stream"},"finish_reason":"stop","index":0}]}`
	_, _ = io.WriteString(w, "data: "+data+"\n\n")
	_, _ = io.WriteString(w, "data: [DONE]\n\n")
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}

func writeOpenAIResponse(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	resp := map[string]interface{}{
		"id":                 "resp-1",
		"created_at":         1,
		"error":              map[string]interface{}{"code": "server_error", "message": ""},
		"incomplete_details": map[string]interface{}{"reason": ""},
		"instructions":       "",
		"metadata":           map[string]interface{}{},
		"model":              "gpt-4o-mini",
		"object":             "response",
		"output": []interface{}{
			map[string]interface{}{
				"id":     "item-1",
				"type":   "message",
				"role":   "assistant",
				"status": "completed",
				"content": []interface{}{
					map[string]interface{}{
						"type":        "output_text",
						"text":        "response-text",
						"annotations": []interface{}{},
						"logprobs":    []interface{}{},
					},
				},
			},
		},
		"parallel_tool_calls": false,
		"temperature":         0,
		"tool_choice":         "auto",
		"tools":               []interface{}{},
		"top_p":               1,
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func writeOpenAIResponseStream(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	data := `{"type":"response.output_text.delta","delta":"response-stream"}`
	_, _ = io.WriteString(w, "data: "+data+"\n\n")
	_, _ = io.WriteString(w, "data: [DONE]\n\n")
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}

func writeAnthropicMessage(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	resp := map[string]interface{}{
		"id":            "msg-1",
		"type":          "message",
		"role":          "assistant",
		"model":         "claude-3-sonnet",
		"content":       []interface{}{map[string]interface{}{"type": "text", "text": "claude-response"}},
		"stop_reason":   "end_turn",
		"stop_sequence": "",
		"usage": map[string]interface{}{
			"cache_creation": map[string]interface{}{
				"ephemeral_1h_input_tokens": 0,
				"ephemeral_5m_input_tokens": 0,
			},
			"cache_creation_input_tokens": 0,
			"cache_read_input_tokens":     0,
			"input_tokens":                1,
			"output_tokens":               1,
			"server_tool_use":             map[string]interface{}{"web_search_requests": 0},
			"service_tier":                "standard",
		},
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func writeAnthropicStream(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	event := `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"claude-stream"}}`
	_, _ = io.WriteString(w, "event: content_block_delta\n")
	_, _ = io.WriteString(w, "data: "+event+"\n\n")
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}
