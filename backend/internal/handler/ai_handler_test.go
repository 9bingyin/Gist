package handler_test

import (
	"gist/backend/internal/handler"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/model"
	"gist/backend/internal/service"
	"gist/backend/internal/service/mock"
)

func TestAIHandler_Summarize_CacheHit(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAIService(ctrl)
	h := handler.NewAIHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"entryId": "123",
		"content": "test content",
		"title":   "test title",
	}
	req := newJSONRequest(http.MethodPost, "/ai/summarize", reqBody)
	c, rec := newTestContext(e, req)

	cached := &model.AISummary{
		Summary: "cached summary",
	}

	mockService.EXPECT().
		GetCachedSummary(gomock.Any(), int64(123), false).
		Return(cached, nil)

	err := h.Summarize(c)
	require.NoError(t, err)

	var resp handler.SummarizeResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "cached summary", resp.Summary)
	require.True(t, resp.Cached)
}

func TestAIHandler_Summarize_InvalidRequest(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAIService(ctrl)
	h := handler.NewAIHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"entryId": "123",
	}
	req := newJSONRequest(http.MethodPost, "/ai/summarize", reqBody)
	c, rec := newTestContext(e, req)

	err := h.Summarize(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAIHandler_Translate_CacheHit(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAIService(ctrl)
	h := handler.NewAIHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"entryId": "123",
		"content": "test content",
		"title":   "test title",
	}
	req := newJSONRequest(http.MethodPost, "/ai/translate", reqBody)
	c, rec := newTestContext(e, req)

	cached := &model.AITranslation{
		Content: "translated content",
	}

	mockService.EXPECT().
		GetCachedTranslation(gomock.Any(), int64(123), false).
		Return(cached, nil)

	err := h.Translate(c)
	require.NoError(t, err)

	var resp handler.TranslateResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "translated content", resp.Content)
	require.True(t, resp.Cached)
}

func TestAIHandler_TranslateBatch_InvalidRequest(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAIService(ctrl)
	h := handler.NewAIHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"articles": []interface{}{},
	}
	req := newJSONRequest(http.MethodPost, "/ai/translate/batch", reqBody)
	c, rec := newTestContext(e, req)

	err := h.TranslateBatch(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAIHandler_ClearCache_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAIService(ctrl)
	h := handler.NewAIHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/ai/cache", nil)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		ClearAllCache(gomock.Any()).
		Return(int64(10), int64(5), int64(3), nil)

	err := h.ClearCache(c)
	require.NoError(t, err)

	var resp handler.ClearCacheResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, int64(10), resp.Summaries)
	require.Equal(t, int64(5), resp.Translations)
	require.Equal(t, int64(3), resp.ListTranslations)
}

func TestAIHandler_Summarize_StreamResponse(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAIService(ctrl)
	h := handler.NewAIHandlerHelper(mockService)

	// Mock service return nil (cache miss)
	mockService.EXPECT().
		GetCachedSummary(gomock.Any(), int64(123), false).
		Return(nil, nil)

	// Mock service return channel
	resultChan := make(chan string, 3)
	resultChan <- "First chunk"
	resultChan <- "Second chunk"
	resultChan <- "Final chunk"
	close(resultChan)

	mockService.EXPECT().
		Summarize(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
		Return(resultChan, make(<-chan error), nil)

	mockService.EXPECT().
		SaveSummary(gomock.Any(), int64(123), false, "First chunkSecond chunkFinal chunk").
		Return(nil)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"entryId": "123",
		"content": "test content",
		"title":   "test title",
	}
	req := newJSONRequest(http.MethodPost, "/ai/summarize", reqBody)
	c, rec := newTestContext(e, req)

	err := h.Summarize(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Header().Get("Content-Type"), "text/event-stream")

	body := rec.Body.String()
	require.Contains(t, body, "First chunk")
	require.Contains(t, body, "Second chunk")
	require.Contains(t, body, "Final chunk")
}

func TestAIHandler_Translate_StreamResponse(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAIService(ctrl)
	h := handler.NewAIHandlerHelper(mockService)

	// Mock service return nil (cache miss)
	mockService.EXPECT().
		GetCachedTranslation(gomock.Any(), int64(123), false).
		Return(nil, nil)

	// Mock service return channel
	resultChan := make(chan service.TranslateBlockResult, 2)
	resultChan <- service.TranslateBlockResult{Index: 0, HTML: "Translated chunk 1"}
	resultChan <- service.TranslateBlockResult{Index: 1, HTML: "Translated chunk 2"}
	close(resultChan)

	mockService.EXPECT().
		TranslateBlocks(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
		Return([]service.TranslateBlockInfo{{Index: 0}, {Index: 1}}, resultChan, make(<-chan error), nil)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"entryId": "123",
		"content": "test content",
		"title":   "test title",
	}
	req := newJSONRequest(http.MethodPost, "/ai/translate", reqBody)
	c, rec := newTestContext(e, req)

	err := h.Translate(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Header().Get("Content-Type"), "text/event-stream")

	body := rec.Body.String()
	require.Contains(t, body, "data: {\"index\":0,\"html\":\"Translated chunk 1\"}")
	require.Contains(t, body, "data: {\"index\":1,\"html\":\"Translated chunk 2\"}")
}
