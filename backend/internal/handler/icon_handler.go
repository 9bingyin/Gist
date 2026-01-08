package handler

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
)

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

// GetIcon serves icon files.
// Icons are named by domain (e.g., "example.com.png"), not by feed ID.
func (h *IconHandler) GetIcon(c echo.Context) error {
	filename := c.Param("filename")
	if filename == "" {
		return c.NoContent(http.StatusNotFound)
	}

	// Sanitize filename to prevent path traversal
	filename = filepath.Base(filename)
	fullPath := h.iconService.GetIconPath(filename)

	// Check if file exists
	if _, err := os.Stat(fullPath); err == nil {
		return c.File(fullPath)
	}

	// Icon not found - frontend will show fallback
	return c.NoContent(http.StatusNotFound)
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
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

	return c.JSON(http.StatusOK, iconClearResponse{Deleted: deleted})
}
