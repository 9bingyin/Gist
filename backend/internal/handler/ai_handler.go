package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

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
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if req.Content == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "content is required"})
	}

	// Parse entry ID
	entryID, err := strconv.ParseInt(req.EntryID, 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid entry ID"})
	}

	ctx := c.Request().Context()

	// Check cache first
	cached, err := h.service.GetCachedSummary(ctx, entryID, req.IsReadability)
	if err != nil {
		c.Logger().Errorf("get cached summary: %v", err)
	}
	if cached != nil {
		return c.JSON(http.StatusOK, summarizeResponse{
			Summary: cached.Summary,
			Cached:  true,
		})
	}

	// Generate summary with streaming
	textCh, errCh, err := h.service.Summarize(ctx, entryID, req.Content, req.Title, req.IsReadability)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

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
						c.Logger().Errorf("summarize error: %v", err)
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
						c.Logger().Errorf("save summary: %v", err)
					}
				}

				return nil
			}

			fullText.WriteString(text)

			// Write chunk to stream (plain text, not SSE format for simpler client handling)
			if _, err := c.Response().Write([]byte(text)); err != nil {
				return nil
			}
			c.Response().Flush()

		case <-ctx.Done():
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
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if req.Content == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "content is required"})
	}

	// Parse entry ID
	entryID, err := strconv.ParseInt(req.EntryID, 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid entry ID"})
	}

	ctx := c.Request().Context()

	// Check cache first
	cached, err := h.service.GetCachedTranslation(ctx, entryID, req.IsReadability)
	if err != nil {
		c.Logger().Errorf("get cached translation: %v", err)
	}
	if cached != nil {
		return c.JSON(http.StatusOK, translateResponse{
			Content: cached.Content,
			Cached:  true,
		})
	}

	// Start block translation
	blockInfos, resultCh, errCh, err := h.service.TranslateBlocks(ctx, entryID, req.Content, req.Title, req.IsReadability)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

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
				return nil
			}

			// Send translated block result
			event := translateBlockEvent{Index: result.Index, HTML: result.HTML}
			data, _ := json.Marshal(event)
			fmt.Fprintf(c.Response(), "data: %s\n\n", data)
			c.Response().Flush()

		case err := <-errCh:
			if err != nil {
				c.Logger().Errorf("translate error: %v", err)
				errorEvent := translateErrorEvent{Error: err.Error()}
				data, _ := json.Marshal(errorEvent)
				fmt.Fprintf(c.Response(), "data: %s\n\n", data)
				c.Response().Flush()
				// Continue to receive remaining results
			}

		case <-ctx.Done():
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
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if len(req.Articles) == 0 {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "articles is required"})
	}

	// Limit batch size
	if len(req.Articles) > 100 {
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
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

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
				return nil
			}

			// Send result as NDJSON
			data, _ := json.Marshal(result)
			c.Response().Write(data)
			c.Response().Write([]byte("\n"))
			c.Response().Flush()

		case err := <-errCh:
			if err != nil {
				c.Logger().Errorf("batch translate error: %v", err)
				// Continue to receive remaining results
			}

		case <-ctx.Done():
			return nil
		}
	}
}
