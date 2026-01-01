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

func (h *IconHandler) RegisterRoutes(e *echo.Echo) {
	e.GET("/icons/:filename", h.GetIcon)
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
