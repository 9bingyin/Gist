package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

// Request/Response types

type aiTestRequest struct {
	Provider       string         `json:"provider"`
	APIKey         string         `json:"apiKey"`
	BaseURL        string         `json:"baseUrl"`
	Model          string         `json:"model"`
	RequestOptions map[string]any `json:"requestOptions"`
}

type aiTestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

type networkTestRequest struct {
	Enabled  bool   `json:"enabled"`
	Type     string `json:"type"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type networkTestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

type deletedCountResponse struct {
	Deleted int64 `json:"deleted"`
}

type SettingsHandler struct {
	service service.SettingsService
}

func isBaseURLRequiredForProvider(provider string) bool {
	return provider == "openai" || provider == "compatible"
}

func NewSettingsHandler(service service.SettingsService) *SettingsHandler {
	return &SettingsHandler{service: service}
}

func (h *SettingsHandler) RegisterRoutes(g *echo.Group) {
	g.GET("/settings/ai", h.GetAISettings)
	g.PUT("/settings/ai", h.UpdateAISettings)
	g.POST("/settings/ai/test", h.TestAI)
	g.GET("/settings/general", h.GetGeneralSettings)
	g.PUT("/settings/general", h.UpdateGeneralSettings)
	g.GET("/settings/network", h.GetNetworkSettings)
	g.PUT("/settings/network", h.UpdateNetworkSettings)
	g.POST("/settings/network/test", h.TestNetworkProxy)
	g.GET("/settings/appearance", h.GetAppearanceSettings)
	g.PUT("/settings/appearance", h.UpdateAppearanceSettings)
	g.DELETE("/settings/anubis-cookies", h.ClearAnubisCookies)
}

// GetAISettings returns the AI configuration.
// @Summary Get AI settings
// @Description Get the AI provider configuration with masked API keys
// @Tags settings
// @Produce json
// @Success 200 {object} service.AISettings
// @Failure 500 {object} errorResponse
// @Router /settings/ai [get]
func (h *SettingsHandler) GetAISettings(c echo.Context) error {
	settings, err := h.service.GetAISettings(c.Request().Context())
	if err != nil {
		logger.Error("ai settings get failed", "module", "handler", "action", "list", "resource", "settings", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get settings"})
	}

	return c.JSON(http.StatusOK, settings)
}

// UpdateAISettings updates the AI configuration.
// @Summary Update AI settings
// @Description Update the AI provider configuration.
// @Tags settings
// @Accept json
// @Produce json
// @Param settings body service.AISettings true "AI settings"
// @Success 200 {object} service.AISettings
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /settings/ai [put]
func (h *SettingsHandler) UpdateAISettings(c echo.Context) error {
	var req service.AISettings
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	if req.Provider == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "provider is required"})
	}
	if req.Model == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "model is required"})
	}
	if isBaseURLRequiredForProvider(req.Provider) && req.BaseURL == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "baseUrl is required"})
	}

	if err := h.service.SetAISettings(c.Request().Context(), &req); err != nil {
		logger.Error("ai settings update failed", "module", "handler", "action", "update", "resource", "settings", "result", "failed", "provider", req.Provider, "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to save settings"})
	}

	logger.Info("ai settings updated", "module", "handler", "action", "update", "resource", "settings", "result", "ok", "provider", req.Provider)
	return h.GetAISettings(c)
}

// TestAI tests the AI connection.
// @Summary Test AI connection
// @Description Test the AI provider connection with a "Hello world" message
// @Tags settings
// @Accept json
// @Produce json
// @Param config body aiTestRequest true "AI test configuration"
// @Success 200 {object} aiTestResponse
// @Failure 400 {object} errorResponse
// @Router /settings/ai/test [post]
func (h *SettingsHandler) TestAI(c echo.Context) error {
	var req aiTestRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if req.Provider == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "provider is required"})
	}
	if req.Model == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "model is required"})
	}
	if isBaseURLRequiredForProvider(req.Provider) && req.BaseURL == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "baseUrl is required"})
	}

	response, err := h.service.TestAI(c.Request().Context(), req.Provider, req.APIKey, req.BaseURL, req.Model, req.RequestOptions)
	if err != nil {
		logger.Warn("ai settings test failed", "module", "handler", "action", "test", "resource", "settings", "result", "failed", "provider", req.Provider, "error", err)
		return c.JSON(http.StatusOK, aiTestResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	logger.Info("ai settings test ok", "module", "handler", "action", "test", "resource", "settings", "result", "ok", "provider", req.Provider)
	return c.JSON(http.StatusOK, aiTestResponse{
		Success: true,
		Message: response,
	})
}

// GetGeneralSettings returns the general settings.
// @Summary Get general settings
// @Description Get general application settings including fallback user agent, auto readability, and mark-read-on-scroll
// @Tags settings
// @Produce json
// @Success 200 {object} service.GeneralSettings
// @Failure 500 {object} errorResponse
// @Router /settings/general [get]
func (h *SettingsHandler) GetGeneralSettings(c echo.Context) error {
	settings, err := h.service.GetGeneralSettings(c.Request().Context())
	if err != nil {
		logger.Error("general settings get failed", "module", "handler", "action", "list", "resource", "settings", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get settings"})
	}

	return c.JSON(http.StatusOK, settings)
}

// UpdateGeneralSettings updates the general settings.
// @Summary Update general settings
// @Description Update general application settings
// @Tags settings
// @Accept json
// @Produce json
// @Param settings body service.GeneralSettings true "General settings"
// @Success 200 {object} service.GeneralSettings
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /settings/general [put]
func (h *SettingsHandler) UpdateGeneralSettings(c echo.Context) error {
	var req service.GeneralSettings
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if err := h.service.SetGeneralSettings(c.Request().Context(), &req); err != nil {
		logger.Error("general settings update failed", "module", "handler", "action", "update", "resource", "settings", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to save settings"})
	}

	logger.Info("general settings updated", "module", "handler", "action", "update", "resource", "settings", "result", "ok")
	return h.GetGeneralSettings(c)
}

// ClearAnubisCookies deletes all Anubis cookies from settings.
// @Summary Clear Anubis cookies
// @Description Delete all Anubis challenge cookies used for bypassing protection
// @Tags settings
// @Produce json
// @Success 200 {object} deletedCountResponse
// @Failure 500 {object} errorResponse
// @Router /settings/anubis-cookies [delete]
func (h *SettingsHandler) ClearAnubisCookies(c echo.Context) error {
	deleted, err := h.service.ClearAnubisCookies(c.Request().Context())
	if err != nil {
		logger.Error("anubis cookies clear failed", "module", "handler", "action", "clear", "resource", "settings", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to clear anubis cookies"})
	}

	logger.Info("anubis cookies cleared", "module", "handler", "action", "clear", "resource", "settings", "result", "ok", "count", deleted)
	return c.JSON(http.StatusOK, deletedCountResponse{Deleted: deleted})
}

// GetNetworkSettings returns the network proxy configuration.
// @Summary Get network settings
// @Description Get the network proxy configuration with masked password
// @Tags settings
// @Produce json
// @Success 200 {object} service.NetworkSettings
// @Failure 500 {object} errorResponse
// @Router /settings/network [get]
func (h *SettingsHandler) GetNetworkSettings(c echo.Context) error {
	settings, err := h.service.GetNetworkSettings(c.Request().Context())
	if err != nil {
		logger.Error("network settings get failed", "module", "handler", "action", "list", "resource", "settings", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get settings"})
	}

	return c.JSON(http.StatusOK, settings)
}

// UpdateNetworkSettings updates the network proxy configuration.
// @Summary Update network settings
// @Description Update the network proxy configuration.
// @Tags settings
// @Accept json
// @Produce json
// @Param settings body service.NetworkSettings true "Network settings"
// @Success 200 {object} service.NetworkSettings
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /settings/network [put]
func (h *SettingsHandler) UpdateNetworkSettings(c echo.Context) error {
	var req service.NetworkSettings
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if err := h.service.SetNetworkSettings(c.Request().Context(), &req); err != nil {
		logger.Error("network settings update failed", "module", "handler", "action", "update", "resource", "settings", "result", "failed", "enabled", req.Enabled, "type", req.Type, "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to save settings"})
	}

	logger.Info("network settings updated", "module", "handler", "action", "update", "resource", "settings", "result", "ok", "enabled", req.Enabled, "type", req.Type)
	return h.GetNetworkSettings(c)
}

// GetAppearanceSettings returns the appearance settings.
// @Summary Get appearance settings
// @Description Get appearance settings including visible content types
// @Tags settings
// @Produce json
// @Success 200 {object} service.AppearanceSettings
// @Failure 500 {object} errorResponse
// @Router /settings/appearance [get]
func (h *SettingsHandler) GetAppearanceSettings(c echo.Context) error {
	settings, err := h.service.GetAppearanceSettings(c.Request().Context())
	if err != nil {
		logger.Error("appearance settings get failed", "module", "handler", "action", "list", "resource", "settings", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get settings"})
	}

	return c.JSON(http.StatusOK, settings)
}

// UpdateAppearanceSettings updates the appearance settings.
// @Summary Update appearance settings
// @Description Update appearance settings including visible content types
// @Tags settings
// @Accept json
// @Produce json
// @Param settings body service.AppearanceSettings true "Appearance settings"
// @Success 200 {object} service.AppearanceSettings
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /settings/appearance [put]
func (h *SettingsHandler) UpdateAppearanceSettings(c echo.Context) error {
	var req service.AppearanceSettings
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if err := h.service.SetAppearanceSettings(c.Request().Context(), &req); err != nil {
		return writeServiceError(c, err)
	}

	logger.Info("appearance settings updated", "module", "handler", "action", "update", "resource", "settings", "result", "ok")
	return h.GetAppearanceSettings(c)
}

// TestNetworkProxy tests the network proxy connection.
// @Summary Test network proxy
// @Description Test the network proxy connection by accessing https://captive.apple.com/
// @Tags settings
// @Accept json
// @Produce json
// @Param config body networkTestRequest true "Network test configuration"
// @Success 200 {object} networkTestResponse
// @Failure 400 {object} errorResponse
// @Router /settings/network/test [post]
func (h *SettingsHandler) TestNetworkProxy(c echo.Context) error {
	var req networkTestRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if !req.Enabled {
		return c.JSON(http.StatusOK, networkTestResponse{
			Success: true,
			Message: "Proxy is disabled, direct connection will be used",
		})
	}

	if req.Host == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "host is required"})
	}
	if req.Port <= 0 {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "valid port is required"})
	}

	proxyType := req.Type
	if proxyType == "" {
		proxyType = "http"
	}

	err := h.service.TestNetworkProxy(c.Request().Context(), &service.NetworkSettings{
		Enabled:  req.Enabled,
		Type:     proxyType,
		Host:     req.Host,
		Port:     req.Port,
		Username: req.Username,
		Password: req.Password,
	})
	if err != nil {
		logger.Warn("network proxy test failed", "module", "handler", "action", "test", "resource", "settings", "result", "failed", "type", proxyType, "host", req.Host, "error", err)
		return c.JSON(http.StatusOK, networkTestResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	logger.Info("network proxy test ok", "module", "handler", "action", "test", "resource", "settings", "result", "ok", "type", proxyType, "host", req.Host)
	return c.JSON(http.StatusOK, networkTestResponse{
		Success: true,
		Message: "Proxy connection successful",
	})
}
