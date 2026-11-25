package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

type AIHandler struct {
	service service.AIService
}

type summarizeRequest struct {
	EntryID       string `json:"entryId"`
	Content       string `json:"content"`
	Title         string `json:"title"`
	IsReadability bool   `json:"isReadability"`
}

type summarizeResponse struct {
	Summary string `json:"summary"`
	Cached  bool   `json:"cached"`
}

type translateRequest struct {
	EntryID       string `json:"entryId"`
	Content       string `json:"content"`
	Title         string `json:"title"`
	IsReadability bool   `json:"isReadability"`
}

type translateResponse struct {
	Content string `json:"content"`
	Cached  bool   `json:"cached"`
}

func NewAIHandler(service service.AIService) *AIHandler {
	return &AIHandler{service: service}
}

func (h *AIHandler) RegisterRoutes(g *echo.Group) {
	g.POST("/ai/summarize", h.Summarize)
	g.POST("/ai/translate", h.Translate)
	g.POST("/ai/translate/batch", h.TranslateBatch)
	g.DELETE("/ai/cache", h.ClearCache)
}

type summarizeChunkEvent struct {
	Chunk string `json:"chunk"`
}

type summarizeDoneEvent struct {
	Done bool `json:"done"`
}

type summarizeErrorEvent struct {
	Error string `json:"error"`
}

// Summarize generates an AI summary of the content.
// @Summary Generate AI summary
// @Description Generate an AI summary of the article content. Returns cached result if available, otherwise streams summary events via SSE.
// @Tags ai
// @Accept json
// @Produce json
// @Produce text/event-stream
// @Param request body summarizeRequest true "Summarize request"
// @Success 200 {object} summarizeResponse "Cached summary"
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /ai/summarize [post]
func (h *AIHandler) Summarize(c echo.Context) error {
	var req summarizeRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if req.Content == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "content is required"})
	}

	entryID, err := strconv.ParseInt(req.EntryID, 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid entry ID"})
	}

	ctx := c.Request().Context()

	cached, err := h.service.GetCachedSummary(ctx, entryID, req.IsReadability)
	if err != nil {
		logger.Warn("ai summarize cache lookup failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
	}
	if cached != nil {
		return c.JSON(http.StatusOK, summarizeResponse{
			Summary: cached.Summary,
			Cached:  true,
		})
	}

	eventCh, err := h.service.Summarize(ctx, entryID, req.Content, req.Title, req.IsReadability)
	if err != nil {
		logger.Error("ai summarize start failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: safeAIStartError(err)})
	}

	res := c.Response()
	res.Header().Set("Content-Type", "text/event-stream")
	res.Header().Set("Cache-Control", "no-cache")
	res.Header().Set("X-Accel-Buffering", "no")
	res.WriteHeader(http.StatusOK)

	for {
		select {
		case ev, ok := <-eventCh:
			if !ok {
				_ = writeSSEJSON(res, summarizeDoneEvent{Done: true})
				return nil
			}
			if ev.Err != nil {
				logger.Error("ai summarize stream error", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", ev.Err)
				_ = writeSSEJSON(res, summarizeErrorEvent{Error: safeAIStartError(ev.Err)})
				return nil
			}
			if ev.Text != "" {
				if err := writeSSEJSON(res, summarizeChunkEvent{Chunk: ev.Text}); err != nil {
					return nil
				}
			}
		case <-ctx.Done():
			return nil
		}
	}
}

type translateInitEvent struct {
	Blocks []translateBlockData `json:"blocks"`
}

type translateBlockData struct {
	Index         int    `json:"index"`
	HTML          string `json:"html"`
	NeedTranslate bool   `json:"needTranslate"`
}

type translateBlockEvent struct {
	Index int    `json:"index"`
	HTML  string `json:"html"`
}

type translateDoneEvent struct {
	Done bool `json:"done"`
}

type translateErrorEvent struct {
	Error string `json:"error"`
}

// Translate generates an AI translation of the content.
// @Summary Generate AI translation
// @Description Translate article content. Returns cached result if available, otherwise streams block translations via SSE.
// @Tags ai
// @Accept json
// @Produce json
// @Produce text/event-stream
// @Param request body translateRequest true "Translate request"
// @Success 200 {object} translateResponse
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /ai/translate [post]
func (h *AIHandler) Translate(c echo.Context) error {
	var req translateRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if req.Content == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "content is required"})
	}

	entryID, err := strconv.ParseInt(req.EntryID, 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid entry ID"})
	}

	ctx := c.Request().Context()

	cached, err := h.service.GetCachedTranslation(ctx, entryID, req.IsReadability)
	if err != nil {
		logger.Warn("ai translate cache lookup failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
	}
	if cached != nil {
		return c.JSON(http.StatusOK, translateResponse{
			Content: cached.Content,
			Cached:  true,
		})
	}

	blockInfos, eventCh, err := h.service.TranslateBlocks(ctx, entryID, req.Content, req.Title, req.IsReadability)
	if err != nil {
		logger.Error("ai translate start failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: safeAIStartError(err)})
	}

	res := c.Response()
	res.Header().Set("Content-Type", "text/event-stream")
	res.Header().Set("Cache-Control", "no-cache")
	res.Header().Set("X-Accel-Buffering", "no")
	res.WriteHeader(http.StatusOK)

	initBlocks := make([]translateBlockData, len(blockInfos))
	for i, b := range blockInfos {
		initBlocks[i] = translateBlockData{
			Index:         b.Index,
			HTML:          b.HTML,
			NeedTranslate: b.NeedTranslate,
		}
	}
	if err := writeSSEJSON(res, translateInitEvent{Blocks: initBlocks}); err != nil {
		return nil
	}

	for {
		select {
		case ev, ok := <-eventCh:
			if !ok {
				_ = writeSSEJSON(res, translateDoneEvent{Done: true})
				return nil
			}
			if ev.Err != nil {
				logger.Error("ai translate stream error", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", ev.Err)
				if err := writeSSEJSON(res, translateErrorEvent{Error: "translation failed"}); err != nil {
					return nil
				}
				continue
			}
			if ev.Result != nil {
				if err := writeSSEJSON(res, translateBlockEvent{Index: ev.Result.Index, HTML: ev.Result.HTML}); err != nil {
					return nil
				}
			}
		case <-ctx.Done():
			return nil
		}
	}
}

func writeSSEJSON(res *echo.Response, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(res, "data: %s\n\n", data); err != nil {
		return err
	}
	res.Flush()
	return nil
}

type batchTranslateRequest struct {
	Articles []struct {
		ID      string `json:"id"`
		Title   string `json:"title"`
		Summary string `json:"summary"`
	} `json:"articles"`
}

// TranslateBatch translates multiple articles' titles and summaries.
// @Summary Batch translate articles
// @Description Translate multiple articles' titles and summaries. Returns NDJSON stream.
// @Tags ai
// @Accept json
// @Produce application/x-ndjson
// @Param request body batchTranslateRequest true "Batch translate request"
// @Success 200 {object} service.BatchTranslateResult
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /ai/translate/batch [post]
func (h *AIHandler) TranslateBatch(c echo.Context) error {
	var req batchTranslateRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if len(req.Articles) == 0 {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "articles is required"})
	}

	seen := make(map[int64]struct{}, len(req.Articles))
	articles := make([]service.BatchArticleInput, 0, len(req.Articles))
	for _, a := range req.Articles {
		trimmedID := strings.TrimSpace(a.ID)
		parsedID, err := strconv.ParseInt(trimmedID, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid article ID"})
		}
		if _, dup := seen[parsedID]; dup {
			continue
		}
		seen[parsedID] = struct{}{}
		articles = append(articles, service.BatchArticleInput{
			ID:      trimmedID,
			Title:   a.Title,
			Summary: a.Summary,
		})
	}

	ctx := c.Request().Context()
	eventCh, err := h.service.TranslateBatch(ctx, articles)
	if err != nil {
		logger.Error("ai batch translate start failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "count", len(articles), "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: safeAIStartError(err)})
	}

	res := c.Response()
	res.Header().Set("Content-Type", "application/x-ndjson")
	res.Header().Set("Cache-Control", "no-cache")
	res.Header().Set("X-Accel-Buffering", "no")
	res.WriteHeader(http.StatusOK)

	for {
		select {
		case ev, ok := <-eventCh:
			if !ok {
				return nil
			}
			if ev.Err != nil {
				logger.Error("ai batch translate stream error", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "error", ev.Err)
				continue
			}
			if ev.Result != nil {
				data, err := json.Marshal(ev.Result)
				if err != nil {
					continue
				}
				if _, err := res.Write(data); err != nil {
					return nil
				}
				if _, err := res.Write([]byte("\n")); err != nil {
					return nil
				}
				res.Flush()
			}
		case <-ctx.Done():
			return nil
		}
	}
}

type clearCacheResponse struct {
	Summaries        int64 `json:"summaries"`
	Translations     int64 `json:"translations"`
	ListTranslations int64 `json:"listTranslations"`
}

// ClearCache deletes all AI cache data.
// @Summary Clear AI cache
// @Description Delete all AI-generated summaries and translations cache.
// @Tags ai
// @Produce json
// @Success 200 {object} clearCacheResponse
// @Failure 500 {object} errorResponse
// @Router /ai/cache [delete]
func (h *AIHandler) ClearCache(c echo.Context) error {
	summaries, translations, listTranslations, err := h.service.ClearAllCache(c.Request().Context())
	if err != nil {
		logger.Error("ai cache clear failed", "module", "handler", "action", "clear", "resource", "ai", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to clear AI cache"})
	}

	return c.JSON(http.StatusOK, clearCacheResponse{
		Summaries:        summaries,
		Translations:     translations,
		ListTranslations: listTranslations,
	})
}

func safeAIStartError(err error) string {
	msg := err.Error()
	if strings.Contains(msg, "not configured") || strings.Contains(msg, "is required") {
		return msg
	}
	return "AI request failed"
}
