package handler

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
)

const cacheMaxAge = 86400 // 1 day

type ProxyHandler struct {
	proxyService service.ProxyService
}

func NewProxyHandler(proxyService service.ProxyService) *ProxyHandler {
	return &ProxyHandler{
		proxyService: proxyService,
	}
}

func (h *ProxyHandler) RegisterRoutes(g *echo.Group) {
	g.GET("/proxy/image/:encoded", h.ProxyImage)
}

// ProxyImage godoc
// @Summary Proxy external image
// @Description Proxies external images to avoid triggering anti-crawling mechanisms
// @Tags proxy
// @Produce octet-stream
// @Param encoded path string true "Base64 URL-safe encoded image URL"
// @Param ref query string false "Base64 URL-safe encoded article URL (used as Referer for CDN anti-hotlinking)"
// @Success 200 {file} binary
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Failure 504 {object} errorResponse
// @Router /api/proxy/image/{encoded} [get]
func (h *ProxyHandler) ProxyImage(c echo.Context) error {
	encoded := c.Param("encoded")
	if encoded == "" {
		return Error(c, http.StatusBadRequest, "URL is required")
	}

	// Decode Base64 URL-safe
	decoded, err := base64.URLEncoding.DecodeString(encoded)
	if err != nil {
		return Error(c, http.StatusBadRequest, "Invalid encoding")
	}
	imageURL := string(decoded)

	// Decode referer URL if provided (for CDN anti-hotlinking)
	var refererURL string
	if refEncoded := c.QueryParam("ref"); refEncoded != "" {
		if refDecoded, err := base64.URLEncoding.DecodeString(refEncoded); err == nil {
			refererURL = string(refDecoded)
		}
	}

	result, err := h.proxyService.FetchImage(c.Request().Context(), imageURL, refererURL)
	if err != nil {
		return h.handleServiceError(c, err)
	}

	c.Response().Header().Set("Content-Type", result.ContentType)
	c.Response().Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", cacheMaxAge))
	c.Response().Header().Set("X-Content-Type-Options", "nosniff")

	return c.Blob(http.StatusOK, result.ContentType, result.Data)
}

func (h *ProxyHandler) handleServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, service.ErrInvalidURL):
		return Error(c, http.StatusBadRequest, "Invalid URL")
	case errors.Is(err, service.ErrInvalidProtocol):
		return Error(c, http.StatusBadRequest, "Invalid protocol")
	case errors.Is(err, service.ErrRequestTimeout):
		return Error(c, http.StatusGatewayTimeout, "Request timeout")
	default:
		return Error(c, http.StatusInternalServerError, "Failed to fetch image")
	}
}
