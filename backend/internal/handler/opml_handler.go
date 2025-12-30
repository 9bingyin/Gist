package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
)

const maxOPMLSize = 5 << 20

type OPMLHandler struct {
	service     service.OPMLService
	taskManager service.ImportTaskService
}

func NewOPMLHandler(opmlService service.OPMLService, taskManager service.ImportTaskService) *OPMLHandler {
	return &OPMLHandler{
		service:     opmlService,
		taskManager: taskManager,
	}
}

func (h *OPMLHandler) RegisterRoutes(g *echo.Group) {
	g.POST("/opml/import", h.Import)
	g.DELETE("/opml/import", h.CancelImport)
	g.GET("/opml/import/status", h.ImportStatus)
	g.GET("/opml/export", h.Export)
}

// Import imports subscriptions from an OPML file.
// @Summary Import OPML
// @Description Start importing feeds and folders from an OPML file
// @Tags opml
// @Accept multipart/form-data
// @Accept xml
// @Produce json
// @Param file formData file false "OPML file to import"
// @Success 200 {object} importStartedResponse
// @Failure 400 {object} errorResponse
// @Failure 413 {object} errorResponse
// @Router /opml/import [post]
func (h *OPMLHandler) Import(c echo.Context) error {
	req := c.Request()
	req.Body = http.MaxBytesReader(c.Response().Writer, req.Body, maxOPMLSize)

	var reader io.Reader
	contentType := req.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/") {
		file, err := c.FormFile("file")
		if err != nil {
			if err == http.ErrMissingFile {
				return c.JSON(http.StatusBadRequest, errorResponse{Error: "missing file"})
			}
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
		}
		if file.Size > maxOPMLSize {
			return c.JSON(http.StatusRequestEntityTooLarge, errorResponse{Error: "file too large"})
		}
		src, err := file.Open()
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
		}
		defer src.Close()
		reader = io.LimitReader(src, maxOPMLSize)
	} else {
		reader = io.LimitReader(req.Body, maxOPMLSize)
	}

	// Read file content into memory for background processing
	content, err := io.ReadAll(reader)
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "read file failed"})
	}

	// Start background import
	go h.runImport(content)

	return c.JSON(http.StatusOK, importStartedResponse{Status: "started"})
}

func (h *OPMLHandler) runImport(content []byte) {
	reader := bytes.NewReader(content)

	// Pre-count total feeds for progress
	preReader := bytes.NewReader(content)
	total := h.countFeedsInOPML(preReader)

	// Start task and get cancellable context
	_, ctx := h.taskManager.Start(total)

	onProgress := func(p service.ImportProgress) {
		h.taskManager.Update(p.Current, p.Feed)
	}

	result, err := h.service.Import(ctx, reader, onProgress)
	if err != nil {
		// Check if cancelled
		if ctx.Err() != nil {
			return // Already marked as cancelled
		}
		h.taskManager.Fail(err)
		return
	}

	// Check if cancelled before marking complete
	if ctx.Err() != nil {
		return
	}
	h.taskManager.Complete(result)
}

func (h *OPMLHandler) countFeedsInOPML(reader io.Reader) int {
	// Simple count by parsing - if fails, return 0
	content, err := io.ReadAll(reader)
	if err != nil {
		return 0
	}
	// Count occurrences of xmlUrl attribute (rough estimate)
	return bytes.Count(bytes.ToLower(content), []byte("xmlurl"))
}

// CancelImport cancels the current import task.
// @Summary Cancel Import
// @Description Cancel the current import task
// @Tags opml
// @Produce json
// @Success 200 {object} importCancelledResponse
// @Router /opml/import [delete]
func (h *OPMLHandler) CancelImport(c echo.Context) error {
	cancelled := h.taskManager.Cancel()
	return c.JSON(http.StatusOK, importCancelledResponse{Cancelled: cancelled})
}

// ImportStatus returns the current import task status via SSE.
// @Summary Import Status
// @Description Get current import task status via SSE stream
// @Tags opml
// @Produce text/event-stream
// @Success 200 {object} service.ImportTask
// @Router /opml/import/status [get]
func (h *OPMLHandler) ImportStatus(c echo.Context) error {
	res := c.Response()
	res.Header().Set("Content-Type", "text/event-stream")
	res.Header().Set("Cache-Control", "no-cache")
	res.Header().Set("Connection", "keep-alive")
	res.WriteHeader(http.StatusOK)

	ctx := c.Request().Context()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// Send initial status immediately
	h.sendTaskStatus(res)

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			task := h.taskManager.Get()
			h.sendTaskStatus(res)

			// Stop streaming if task is done, error, or cancelled
			if task != nil && (task.Status == "done" || task.Status == "error" || task.Status == "cancelled") {
				return nil
			}
		}
	}
}

func (h *OPMLHandler) sendTaskStatus(res *echo.Response) {
	task := h.taskManager.Get()
	if task == nil {
		data, _ := json.Marshal(importIdleResponse{Status: "idle"})
		fmt.Fprintf(res, "data: %s\n\n", data)
	} else {
		data, _ := json.Marshal(task)
		fmt.Fprintf(res, "data: %s\n\n", data)
	}
	res.Flush()
}

// Export exports subscriptions to an OPML file.
// @Summary Export OPML
// @Description Export all feeds and folders to an OPML file
// @Tags opml
// @Produce xml
// @Success 200 {string} string "OPML file content"
// @Router /opml/export [get]
func (h *OPMLHandler) Export(c echo.Context) error {
	payload, err := h.service.Export(c.Request().Context())
	if err != nil {
		return writeServiceError(c, err)
	}
	c.Response().Header().Set("Content-Disposition", `attachment; filename="gist.opml"`)
	return c.Blob(http.StatusOK, "application/xml", payload)
}
