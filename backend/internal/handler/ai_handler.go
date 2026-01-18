package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

	"gist/backend/pkg/logger"
	"gist/backend/internal/service"
)

type AIHandler struct {
	service service.AIService
}

// Request/Response types

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

// Summarize generates an AI summary of the content.
// @Summary Generate AI summary
// @Description Generate an AI summary of the article content. Returns cached result if available, otherwise streams the response.
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
		logger.Debug("ai summarize invalid request", "module", "handler", "action", "request", "resource", "ai", "result", "failed", "error", err)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if req.Content == "" {
		logger.Debug("ai summarize missing content", "module", "handler", "action", "request", "resource", "ai", "result", "failed")
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "content is required"})
	}

	// Parse entry ID
	entryID, err := strconv.ParseInt(req.EntryID, 10, 64)
	if err != nil {
		logger.Debug("ai summarize invalid entry id", "module", "handler", "action", "request", "resource", "ai", "result", "failed", "entry_id", req.EntryID)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid entry ID"})
	}

	ctx := c.Request().Context()

	// Check cache first
	cached, err := h.service.GetCachedSummary(ctx, entryID, req.IsReadability)
	if err != nil {
		logger.Warn("ai summarize cache lookup failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
	}
	if cached != nil {
		logger.Info("ai summarize cache hit", "module", "handler", "action", "fetch", "resource", "ai", "result", "ok", "entry_id", entryID, "cache", "hit")
		return c.JSON(http.StatusOK, summarizeResponse{
			Summary: cached.Summary,
			Cached:  true,
		})
	}

	// Generate summary with streaming
	textCh, errCh, err := h.service.Summarize(ctx, entryID, req.Content, req.Title, req.IsReadability)
	if err != nil {
		logger.Error("ai summarize start failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

	logger.Info("ai summarize started", "module", "handler", "action", "fetch", "resource", "ai", "result", "ok", "entry_id", entryID)

	// Set headers for SSE
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().WriteHeader(http.StatusOK)

	var fullText strings.Builder

	// Stream the response
	for {
		select {
		case text, ok := <-textCh:
			if !ok {
				// Channel closed, check for errors
				select {
				case err := <-errCh:
					if err != nil {
						logger.Error("ai summarize stream error", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
						// Write error to stream
						fmt.Fprintf(c.Response(), "event: error\ndata: %s\n\n", err.Error())
						c.Response().Flush()
						return nil
					}

				default:
				}

				// Save to cache if we got content
				if fullText.Len() > 0 {
					if err := h.service.SaveSummary(ctx, entryID, req.IsReadability, fullText.String()); err != nil {
						logger.Warn("ai summarize cache save failed", "module", "handler", "action", "save", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
					} else {
						logger.Info("ai summarize cached", "module", "handler", "action", "save", "resource", "ai", "result", "ok", "entry_id", entryID)
					}
				}

				logger.Info("ai summarize completed", "module", "handler", "action", "fetch", "resource", "ai", "result", "ok", "entry_id", entryID)
				return nil
			}

			fullText.WriteString(text)

			// Write chunk to stream (plain text, not SSE format for simpler client handling)
			if _, err := c.Response().Write([]byte(text)); err != nil {
				return nil
			}
			c.Response().Flush()

		case <-ctx.Done():
			logger.Warn("ai summarize cancelled", "module", "handler", "action", "fetch", "resource", "ai", "result", "cancelled", "entry_id", entryID)
			return nil
		}
	}
}

// translateInitEvent represents the initial event with all original blocks.
type translateInitEvent struct {
	Blocks []translateBlockData `json:"blocks"`
}

type translateBlockData struct {
	Index         int    `json:"index"`
	HTML          string `json:"html"`
	NeedTranslate bool   `json:"needTranslate"`
}

// translateBlockEvent represents an SSE event for translated block.
type translateBlockEvent struct {
	Index int    `json:"index"`
	HTML  string `json:"html"`
}

// translateDoneEvent represents the completion of translation.
type translateDoneEvent struct {
	Done bool `json:"done"`
}

// translateErrorEvent represents an error during translation.
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
		logger.Debug("ai translate invalid request", "module", "handler", "action", "request", "resource", "ai", "result", "failed", "error", err)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if req.Content == "" {
		logger.Debug("ai translate missing content", "module", "handler", "action", "request", "resource", "ai", "result", "failed")
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "content is required"})
	}

	// Parse entry ID
	entryID, err := strconv.ParseInt(req.EntryID, 10, 64)
	if err != nil {
		logger.Debug("ai translate invalid entry id", "module", "handler", "action", "request", "resource", "ai", "result", "failed", "entry_id", req.EntryID)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid entry ID"})
	}

	ctx := c.Request().Context()

	// Check cache first
	cached, err := h.service.GetCachedTranslation(ctx, entryID, req.IsReadability)
	if err != nil {
		logger.Warn("ai translate cache lookup failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
	}
	if cached != nil {
		logger.Info("ai translate cache hit", "module", "handler", "action", "fetch", "resource", "ai", "result", "ok", "entry_id", entryID, "cache", "hit")
		return c.JSON(http.StatusOK, translateResponse{
			Content: cached.Content,
			Cached:  true,
		})
	}

	// Start block translation
	blockInfos, resultCh, errCh, err := h.service.TranslateBlocks(ctx, entryID, req.Content, req.Title, req.IsReadability)
	if err != nil {
		logger.Error("ai translate start failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

	logger.Info("ai translate started", "module", "handler", "action", "fetch", "resource", "ai", "result", "ok", "entry_id", entryID)

	// Set headers for SSE
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().WriteHeader(http.StatusOK)

	// Send init event with all original blocks
	initBlocks := make([]translateBlockData, len(blockInfos))
	for i, b := range blockInfos {
		initBlocks[i] = translateBlockData{
			Index:         b.Index,
			HTML:          b.HTML,
			NeedTranslate: b.NeedTranslate,
		}
	}
	initEvent := translateInitEvent{Blocks: initBlocks}
	initData, _ := json.Marshal(initEvent)
	fmt.Fprintf(c.Response(), "data: %s\n\n", initData)
	c.Response().Flush()

	// Stream the translation results
	for {
		select {
		case result, ok := <-resultCh:
			if !ok {
				// Channel closed, send done event
				doneEvent := translateDoneEvent{Done: true}
				data, _ := json.Marshal(doneEvent)
				fmt.Fprintf(c.Response(), "data: %s\n\n", data)
				c.Response().Flush()
				logger.Info("ai translate completed", "module", "handler", "action", "fetch", "resource", "ai", "result", "ok", "entry_id", entryID)
				return nil
			}

			// Send translated block result
			event := translateBlockEvent{Index: result.Index, HTML: result.HTML}
			data, _ := json.Marshal(event)
			fmt.Fprintf(c.Response(), "data: %s\n\n", data)
			c.Response().Flush()

		case err := <-errCh:
			if err != nil {
				logger.Error("ai translate stream error", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
				errorEvent := translateErrorEvent{Error: err.Error()}
				data, _ := json.Marshal(errorEvent)
				fmt.Fprintf(c.Response(), "data: %s\n\n", data)
				c.Response().Flush()
				// Continue to receive remaining results
			}

		case <-ctx.Done():
			logger.Warn("ai translate cancelled", "module", "handler", "action", "fetch", "resource", "ai", "result", "cancelled", "entry_id", entryID)
			return nil
		}
	}
}

// batchTranslateRequest represents the request body for batch translation.
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
		logger.Debug("ai batch translate invalid request", "module", "handler", "action", "request", "resource", "ai", "result", "failed", "error", err)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if len(req.Articles) == 0 {
		logger.Debug("ai batch translate missing articles", "module", "handler", "action", "request", "resource", "ai", "result", "failed")
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "articles is required"})
	}

	// Limit batch size
	if len(req.Articles) > 100 {
		logger.Debug("ai batch translate too many articles", "module", "handler", "action", "request", "resource", "ai", "result", "failed", "count", len(req.Articles))
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "maximum 100 articles per batch"})
	}

	ctx := c.Request().Context()

	// Convert to service input
	articles := make([]service.BatchArticleInput, len(req.Articles))
	for i, a := range req.Articles {
		articles[i] = service.BatchArticleInput{
			ID:      a.ID,
			Title:   a.Title,
			Summary: a.Summary,
		}
	}

	// Start batch translation
	resultCh, errCh, err := h.service.TranslateBatch(ctx, articles)
	if err != nil {
		logger.Error("ai batch translate start failed", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "count", len(articles), "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

	logger.Info("ai batch translate started", "module", "handler", "action", "fetch", "resource", "ai", "result", "ok", "count", len(articles))

	// Set headers for NDJSON streaming
	c.Response().Header().Set("Content-Type", "application/x-ndjson")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().WriteHeader(http.StatusOK)

	// Stream the results
	for {
		select {
		case result, ok := <-resultCh:
			if !ok {
				// Channel closed, done
				logger.Info("ai batch translate completed", "module", "handler", "action", "fetch", "resource", "ai", "result", "ok", "count", len(articles))
				return nil
			}

			// Send result as NDJSON
			data, _ := json.Marshal(result)
			c.Response().Write(data)
			c.Response().Write([]byte("\n"))
			c.Response().Flush()

		case err := <-errCh:
			if err != nil {
				logger.Error("ai batch translate stream error", "module", "handler", "action", "fetch", "resource", "ai", "result", "failed", "error", err)
				// Continue to receive remaining results
			}

		case <-ctx.Done():
			logger.Warn("ai batch translate cancelled", "module", "handler", "action", "fetch", "resource", "ai", "result", "cancelled", "count", len(articles))
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
	ctx := c.Request().Context()

	summaries, translations, listTranslations, err := h.service.ClearAllCache(ctx)
	if err != nil {
		logger.Error("ai cache clear failed", "module", "handler", "action", "clear", "resource", "ai", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

	logger.Info("ai cache cleared", "module", "handler", "action", "clear", "resource", "ai", "result", "ok", "summaries", summaries, "translations", translations, "list_translations", listTranslations)
	return c.JSON(http.StatusOK, clearCacheResponse{
		Summaries:        summaries,
		Translations:     translations,
		ListTranslations: listTranslations,
	})
}
