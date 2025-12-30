package handler

import (
	"io"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
)

const maxOPMLSize = 5 << 20

type OPMLHandler struct {
	service service.OPMLService
}

func NewOPMLHandler(service service.OPMLService) *OPMLHandler {
	return &OPMLHandler{service: service}
}

func (h *OPMLHandler) RegisterRoutes(g *echo.Group) {
	g.POST("/opml/import", h.Import)
	g.GET("/opml/export", h.Export)
}

// Import imports subscriptions from an OPML file.
// @Summary Import OPML
// @Description Import feeds and folders from an OPML file or body
// @Tags opml
// @Accept multipart/form-data
// @Accept xml
// @Produce json
// @Param file formData file false "OPML file to import"
// @Success 200 {object} service.ImportResult
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

	result, err := h.service.Import(req.Context(), reader)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusOK, result)
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
