package handler

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

func safeHost(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return parsed.Host
}

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
		logger.Debug("proxy image missing url", "module", "handler", "action", "request", "resource", "proxy", "result", "failed")
		return Error(c, http.StatusBadRequest, "URL is required")
	}

	// Decode Base64 URL-safe
	decoded, err := base64.URLEncoding.DecodeString(encoded)
	if err != nil {
		logger.Debug("proxy image invalid encoding", "module", "handler", "action", "request", "resource", "proxy", "result", "failed", "error", err)
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
		logger.Warn("proxy image fetch failed", "module", "handler", "action", "fetch", "resource", "proxy", "result", "failed", "host", safeHost(imageURL), "error", err)
		return h.handleServiceError(c, err)
	}

	logger.Debug("proxy image fetched", "module", "handler", "action", "fetch", "resource", "proxy", "result", "ok", "host", safeHost(imageURL), "content_type", strings.ToLower(result.ContentType))
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
	case errors.Is(err, service.ErrUpstreamRejected):
		// Upstream rejected the request, return 502 and prevent caching
		c.Response().Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		return Error(c, http.StatusBadGateway, "Upstream rejected")
	default:
		return Error(c, http.StatusInternalServerError, "Failed to fetch image")
	}
}
