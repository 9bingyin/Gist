package handler

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v4"

	"gist/backend/pkg/logger"
	"gist/backend/internal/service"
)

type DomainRateLimitHandler struct {
	service service.DomainRateLimitService
}

// Request/Response types

type domainRateLimitResponse struct {
	ID              string `json:"id"`
	Host            string `json:"host"`
	IntervalSeconds int    `json:"intervalSeconds"`
}

type domainRateLimitRequest struct {
	Host            string `json:"host"`
	IntervalSeconds int    `json:"intervalSeconds"`
}

type domainRateLimitListResponse struct {
	Items []domainRateLimitResponse `json:"items"`
}

func NewDomainRateLimitHandler(svc service.DomainRateLimitService) *DomainRateLimitHandler {
	return &DomainRateLimitHandler{service: svc}
}

func (h *DomainRateLimitHandler) RegisterRoutes(g *echo.Group) {
	g.GET("/domain-rate-limits", h.List)
	g.POST("/domain-rate-limits", h.Create)
	g.PUT("/domain-rate-limits/:host", h.Update)
	g.DELETE("/domain-rate-limits/:host", h.Delete)
}

// List godoc
// @Summary List all domain rate limits
// @Tags domain-rate-limits
// @Produce json
// @Success 200 {object} domainRateLimitListResponse
// @Router /api/domain-rate-limits [get]
func (h *DomainRateLimitHandler) List(c echo.Context) error {
	ctx := c.Request().Context()

	limits, err := h.service.List(ctx)
	if err != nil {
		logger.Error("domain rate limit list failed", "module", "handler", "action", "list", "resource", "domain_rate_limit", "result", "failed", "error", err)
		return writeServiceError(c, err)
	}

	items := make([]domainRateLimitResponse, len(limits))
	for i, l := range limits {
		items[i] = domainRateLimitResponse{
			ID:              l.ID,
			Host:            l.Host,
			IntervalSeconds: l.IntervalSeconds,
		}
	}

	return c.JSON(http.StatusOK, domainRateLimitListResponse{
		Items: items,
	})
}

// Create godoc
// @Summary Create a domain rate limit
// @Tags domain-rate-limits
// @Accept json
// @Produce json
// @Param request body domainRateLimitRequest true "Domain rate limit"
// @Success 201 {object} domainRateLimitResponse
// @Router /api/domain-rate-limits [post]
func (h *DomainRateLimitHandler) Create(c echo.Context) error {
	var req domainRateLimitRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.Host == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "host is required"})
	}

	if req.IntervalSeconds < 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "intervalSeconds must be non-negative"})
	}

	ctx := c.Request().Context()
	if err := h.service.SetInterval(ctx, req.Host, req.IntervalSeconds); err != nil {
		logger.Error("domain rate limit create failed", "module", "handler", "action", "create", "resource", "domain_rate_limit", "result", "failed", "host", req.Host, "error", err)
		return writeServiceError(c, err)
	}

	// Fetch the created/updated record
	limits, err := h.service.List(ctx)
	if err != nil {
		return writeServiceError(c, err)
	}

	for _, l := range limits {
		if l.Host == req.Host {
			logger.Info("domain rate limit created", "module", "handler", "action", "create", "resource", "domain_rate_limit", "result", "ok", "host", l.Host, "interval_seconds", l.IntervalSeconds)
			return c.JSON(http.StatusCreated, domainRateLimitResponse{
				ID:              l.ID,
				Host:            l.Host,
				IntervalSeconds: l.IntervalSeconds,
			})
		}
	}

	logger.Info("domain rate limit created", "module", "handler", "action", "create", "resource", "domain_rate_limit", "result", "ok", "host", req.Host, "interval_seconds", req.IntervalSeconds)
	return c.JSON(http.StatusCreated, domainRateLimitResponse{
		Host:            req.Host,
		IntervalSeconds: req.IntervalSeconds,
	})
}

// Update godoc
// @Summary Update a domain rate limit
// @Tags domain-rate-limits
// @Accept json
// @Produce json
// @Param host path string true "Host"
// @Param request body domainRateLimitRequest true "Domain rate limit"
// @Success 200 {object} domainRateLimitResponse
// @Router /api/domain-rate-limits/{host} [put]
func (h *DomainRateLimitHandler) Update(c echo.Context) error {
	host := c.Param("host")
	if host == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "host is required"})
	}

	var req domainRateLimitRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.IntervalSeconds < 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "intervalSeconds must be non-negative"})
	}

	ctx := c.Request().Context()
	if err := h.service.SetInterval(ctx, host, req.IntervalSeconds); err != nil {
		logger.Error("domain rate limit update failed", "module", "handler", "action", "update", "resource", "domain_rate_limit", "result", "failed", "host", host, "error", err)
		return writeServiceError(c, err)
	}

	logger.Info("domain rate limit updated", "module", "handler", "action", "update", "resource", "domain_rate_limit", "result", "ok", "host", host, "interval_seconds", req.IntervalSeconds)
	return c.JSON(http.StatusOK, domainRateLimitResponse{
		Host:            host,
		IntervalSeconds: req.IntervalSeconds,
	})
}

// Delete godoc
// @Summary Delete a domain rate limit
// @Tags domain-rate-limits
// @Param host path string true "Host"
// @Success 204
// @Router /api/domain-rate-limits/{host} [delete]
func (h *DomainRateLimitHandler) Delete(c echo.Context) error {
	host := c.Param("host")
	if host == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "host is required"})
	}

	ctx := c.Request().Context()
	if err := h.service.DeleteInterval(ctx, host); err != nil {
		if err == sql.ErrNoRows {
			logger.Warn("domain rate limit delete not found", "module", "handler", "action", "delete", "resource", "domain_rate_limit", "result", "failed", "host", host, "error", "not found")
			return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
		}
		logger.Error("domain rate limit delete failed", "module", "handler", "action", "delete", "resource", "domain_rate_limit", "result", "failed", "host", host, "error", err)
		return writeServiceError(c, err)
	}

	logger.Info("domain rate limit deleted", "module", "handler", "action", "delete", "resource", "domain_rate_limit", "result", "ok", "host", host)
	return c.NoContent(http.StatusNoContent)
}
