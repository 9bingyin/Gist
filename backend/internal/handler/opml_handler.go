package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

type OPMLHandler struct {
	service     service.OPMLService
	taskManager service.ImportTaskService
	wg          sync.WaitGroup
}

func NewOPMLHandler(opmlService service.OPMLService, taskManager service.ImportTaskService) *OPMLHandler {
	return &OPMLHandler{
		service:     opmlService,
		taskManager: taskManager,
	}
}

// Shutdown cancels any active import task and waits for background import goroutines to exit.
func (h *OPMLHandler) Shutdown() {
	if h.taskManager != nil {
		h.taskManager.Shutdown()
	}
	h.wg.Wait()
	if h.service != nil {
		h.service.Shutdown()
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
// @Router /opml/import [post]
func (h *OPMLHandler) Import(c echo.Context) error {
	req := c.Request()

	var reader io.Reader
	contentType := req.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/") {
		file, err := c.FormFile("file")
		if err != nil {
			if errors.Is(err, http.ErrMissingFile) {
				return c.JSON(http.StatusBadRequest, errorResponse{Error: "missing file"})
			}
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
		}
		src, err := file.Open()
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
		}
		defer src.Close()
		reader = src
	} else {
		reader = req.Body
	}

	content, err := io.ReadAll(reader)
	if err != nil {
		logger.Warn("opml import read failed", "module", "handler", "action", "import", "resource", "opml", "result", "failed", "error", err)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "read file failed"})
	}

	// Register task synchronously before returning so immediate SSE status subscriptions observe it.
	taskID, taskCtx := h.taskManager.Start(0)

	logger.Info("opml import started", "module", "handler", "action", "import", "resource", "opml", "result", "ok", "task_id", taskID, "bytes", len(content))
	h.wg.Go(func() {
		h.runImport(taskID, taskCtx, content)
	})

	return c.JSON(http.StatusOK, importStartedResponse{Status: "started"})
}

func (h *OPMLHandler) runImport(taskID string, ctx context.Context, content []byte) {
	onProgress := func(p service.ImportProgress) {
		if p.Status == "started" {
			h.taskManager.SetTotal(taskID, p.Total)
			return
		}
		h.taskManager.Update(taskID, p.Current, p.Feed)
	}

	result, err := h.service.Import(ctx, bytes.NewReader(content), onProgress)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		h.taskManager.Fail(taskID, err)
		return
	}

	if ctx.Err() != nil {
		return
	}
	h.taskManager.Complete(taskID, result)
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
	res.Header().Set("X-Accel-Buffering", "no")
	res.WriteHeader(http.StatusOK)

	ctx := c.Request().Context()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// Send initial frame and stop immediately if already terminal.
	task := h.taskManager.Get()
	if err := writeTaskStatus(res, task); err != nil {
		return nil
	}
	if isTerminalImportTask(task) {
		return nil
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			task := h.taskManager.Get()
			if err := writeTaskStatus(res, task); err != nil {
				return nil
			}
			if isTerminalImportTask(task) {
				return nil
			}
		}
	}
}

func isTerminalImportTask(task *service.ImportTask) bool {
	if task == nil {
		return false
	}
	return task.Status == "done" || task.Status == "error" || task.Status == "cancelled"
}

func writeTaskStatus(res *echo.Response, task *service.ImportTask) error {
	var (
		data []byte
		err  error
	)
	if task == nil {
		data, err = json.Marshal(importIdleResponse{Status: "idle"})
	} else {
		data, err = json.Marshal(task)
	}
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(res, "data: %s\n\n", data); err != nil {
		return err
	}
	res.Flush()
	return nil
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
