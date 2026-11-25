package handler

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

const iconSVGSandboxCSP = "default-src 'none'; sandbox"

type IconHandler struct {
	iconService service.IconService
}

func NewIconHandler(iconService service.IconService) *IconHandler {
	return &IconHandler{
		iconService: iconService,
	}
}

type iconClearResponse struct {
	Deleted int64 `json:"deleted"`
}

func (h *IconHandler) RegisterRoutes(e *echo.Echo) {
	e.GET("/icons/:filename", h.GetIcon)
}

func (h *IconHandler) RegisterAPIRoutes(g *echo.Group) {
	g.DELETE("/icons/cache", h.ClearIconCache)
}

// GetIcon serves icon files with strict path, directory, and SVG sandbox protections.
func (h *IconHandler) GetIcon(c echo.Context) error {
	rawFilename := c.Param("filename")
	if rawFilename == "" || rawFilename == "." || rawFilename == ".." || strings.ContainsAny(rawFilename, `/\`) {
		return c.NoContent(http.StatusNotFound)
	}

	filename := filepath.Base(rawFilename)
	if filename == "." || filename == ".." || filename == "" {
		return c.NoContent(http.StatusNotFound)
	}

	fullPath := h.iconService.GetIconPath(filename)
	if fullPath == "" {
		return c.NoContent(http.StatusNotFound)
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		logger.Debug("icon not found", "module", "handler", "action", "fetch", "resource", "icon", "result", "failed", "filename", filename)
		return c.NoContent(http.StatusNotFound)
	}

	headers := c.Response().Header()
	headers.Set("X-Content-Type-Options", "nosniff")
	headers.Set("Cache-Control", fmt.Sprintf("public, max-age=%d", cacheMaxAge))
	if strings.EqualFold(filepath.Ext(filename), ".svg") {
		headers.Set("Content-Security-Policy", iconSVGSandboxCSP)
	}

	logger.Debug("icon served", "module", "handler", "action", "fetch", "resource", "icon", "result", "ok", "filename", filename)
	return c.File(fullPath)
}

// ClearIconCache deletes all icon files and clears icon_path in database.
// @Summary Clear icon cache
// @Description Delete all feed icon files and clear icon_path references in database
// @Tags icons
// @Produce json
// @Success 200 {object} iconClearResponse
// @Failure 500 {object} errorResponse
// @Router /icons/cache [delete]
func (h *IconHandler) ClearIconCache(c echo.Context) error {
	deleted, err := h.iconService.ClearAllIcons(c.Request().Context())
	if err != nil {
		return writeServiceError(c, err)
	}

	return c.JSON(http.StatusOK, iconClearResponse{Deleted: deleted})
}
