package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/model"
	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
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

func toDomainRateLimitResponse(l model.DomainRateLimit) domainRateLimitResponse {
	return domainRateLimitResponse{
		ID:              idToString(l.ID),
		Host:            l.Host,
		IntervalSeconds: l.IntervalSeconds,
	}
}

// List godoc
// @Summary List all domain rate limits
// @Tags domain-rate-limits
// @Produce json
// @Success 200 {object} domainRateLimitListResponse
// @Router /domain-rate-limits [get]
func (h *DomainRateLimitHandler) List(c echo.Context) error {
	limits, err := h.service.List(c.Request().Context())
	if err != nil {
		return writeServiceError(c, err)
	}

	items := make([]domainRateLimitResponse, len(limits))
	for i, l := range limits {
		items[i] = toDomainRateLimitResponse(l)
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
// @Router /domain-rate-limits [post]
func (h *DomainRateLimitHandler) Create(c echo.Context) error {
	var req domainRateLimitRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request body"})
	}

	if req.Host == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "host is required"})
	}

	if req.IntervalSeconds < 0 {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "intervalSeconds must be non-negative"})
	}

	limit, err := h.service.SetInterval(c.Request().Context(), req.Host, req.IntervalSeconds)
	if err != nil {
		return writeServiceError(c, err)
	}

	logger.Info("domain rate limit created", "module", "handler", "action", "create", "resource", "domain_rate_limit", "result", "ok", "host", limit.Host, "interval_seconds", limit.IntervalSeconds)
	return c.JSON(http.StatusCreated, toDomainRateLimitResponse(limit))
}

// Update godoc
// @Summary Update a domain rate limit
// @Tags domain-rate-limits
// @Accept json
// @Produce json
// @Param host path string true "Host"
// @Param request body domainRateLimitRequest true "Domain rate limit"
// @Success 200 {object} domainRateLimitResponse
// @Router /domain-rate-limits/{host} [put]
func (h *DomainRateLimitHandler) Update(c echo.Context) error {
	host := c.Param("host")
	if host == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "host is required"})
	}

	var req domainRateLimitRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request body"})
	}

	if req.IntervalSeconds < 0 {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "intervalSeconds must be non-negative"})
	}

	limit, err := h.service.SetInterval(c.Request().Context(), host, req.IntervalSeconds)
	if err != nil {
		return writeServiceError(c, err)
	}

	logger.Info("domain rate limit updated", "module", "handler", "action", "update", "resource", "domain_rate_limit", "result", "ok", "host", limit.Host, "interval_seconds", limit.IntervalSeconds)
	return c.JSON(http.StatusOK, toDomainRateLimitResponse(limit))
}

// Delete godoc
// @Summary Delete a domain rate limit
// @Tags domain-rate-limits
// @Param host path string true "Host"
// @Success 204
// @Router /domain-rate-limits/{host} [delete]
func (h *DomainRateLimitHandler) Delete(c echo.Context) error {
	host := c.Param("host")
	if host == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "host is required"})
	}

	if err := h.service.DeleteInterval(c.Request().Context(), host); err != nil {
		return writeServiceError(c, err)
	}

	logger.Info("domain rate limit deleted", "module", "handler", "action", "delete", "resource", "domain_rate_limit", "result", "ok", "host", host)
	return c.NoContent(http.StatusNoContent)
}
