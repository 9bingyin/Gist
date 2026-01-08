package handler

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/network"
	"gist/backend/internal/service"
)

type SettingsHandler struct {
	service       service.SettingsService
	clientFactory *network.ClientFactory
}

// Request/Response types

type aiSettingsResponse struct {
	Provider        string `json:"provider"`
	APIKey          string `json:"apiKey"`
	BaseURL         string `json:"baseUrl"`
	Model           string `json:"model"`
	Thinking        bool   `json:"thinking"`
	ThinkingBudget  int    `json:"thinkingBudget"`
	ReasoningEffort string `json:"reasoningEffort"`
	SummaryLanguage string `json:"summaryLanguage"`
	AutoTranslate   bool   `json:"autoTranslate"`
	AutoSummary     bool   `json:"autoSummary"`
	RateLimit       int    `json:"rateLimit"`
}

type aiSettingsRequest struct {
	Provider        string `json:"provider"`
	APIKey          string `json:"apiKey"`
	BaseURL         string `json:"baseUrl"`
	Model           string `json:"model"`
	Thinking        bool   `json:"thinking"`
	ThinkingBudget  int    `json:"thinkingBudget"`
	ReasoningEffort string `json:"reasoningEffort"`
	SummaryLanguage string `json:"summaryLanguage"`
	AutoTranslate   bool   `json:"autoTranslate"`
	AutoSummary     bool   `json:"autoSummary"`
	RateLimit       int    `json:"rateLimit"`
}

type aiTestRequest struct {
	Provider        string `json:"provider"`
	APIKey          string `json:"apiKey"`
	BaseURL         string `json:"baseUrl"`
	Model           string `json:"model"`
	Thinking        bool   `json:"thinking"`
	ThinkingBudget  int    `json:"thinkingBudget"`
	ReasoningEffort string `json:"reasoningEffort"`
}

type aiTestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

type generalSettingsResponse struct {
	FallbackUserAgent string `json:"fallbackUserAgent"`
	AutoReadability   bool   `json:"autoReadability"`
}

type generalSettingsRequest struct {
	FallbackUserAgent string `json:"fallbackUserAgent"`
	AutoReadability   bool   `json:"autoReadability"`
}

type networkSettingsResponse struct {
	Enabled  bool   `json:"enabled"`
	Type     string `json:"type"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type networkSettingsRequest struct {
	Enabled  bool   `json:"enabled"`
	Type     string `json:"type"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
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

func NewSettingsHandler(service service.SettingsService, clientFactory *network.ClientFactory) *SettingsHandler {
	return &SettingsHandler{service: service, clientFactory: clientFactory}
}

type deletedCountResponse struct {
	Deleted int64 `json:"deleted"`
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
	g.DELETE("/settings/anubis-cookies", h.ClearAnubisCookies)
}

// GetAISettings returns the AI configuration.
// @Summary Get AI settings
// @Description Get the AI provider configuration with masked API keys
// @Tags settings
// @Produce json
// @Success 200 {object} aiSettingsResponse
// @Failure 500 {object} errorResponse
// @Router /settings/ai [get]
func (h *SettingsHandler) GetAISettings(c echo.Context) error {
	settings, err := h.service.GetAISettings(c.Request().Context())
	if err != nil {
		c.Logger().Error(err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get settings"})
	}

	return c.JSON(http.StatusOK, aiSettingsResponse{
		Provider:        settings.Provider,
		APIKey:          settings.APIKey,
		BaseURL:         settings.BaseURL,
		Model:           settings.Model,
		Thinking:        settings.Thinking,
		ThinkingBudget:  settings.ThinkingBudget,
		ReasoningEffort: settings.ReasoningEffort,
		SummaryLanguage: settings.SummaryLanguage,
		AutoTranslate:   settings.AutoTranslate,
		AutoSummary:     settings.AutoSummary,
		RateLimit:       settings.RateLimit,
	})
}

// UpdateAISettings updates the AI configuration.
// @Summary Update AI settings
// @Description Update the AI provider configuration. Empty apiKey keeps existing key.
// @Tags settings
// @Accept json
// @Produce json
// @Param settings body aiSettingsRequest true "AI settings"
// @Success 200 {object} aiSettingsResponse
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /settings/ai [put]
func (h *SettingsHandler) UpdateAISettings(c echo.Context) error {
	var req aiSettingsRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	settings := &service.AISettings{
		Provider:        req.Provider,
		APIKey:          req.APIKey,
		BaseURL:         req.BaseURL,
		Model:           req.Model,
		Thinking:        req.Thinking,
		ThinkingBudget:  req.ThinkingBudget,
		ReasoningEffort: req.ReasoningEffort,
		SummaryLanguage: req.SummaryLanguage,
		AutoTranslate:   req.AutoTranslate,
		AutoSummary:     req.AutoSummary,
		RateLimit:       req.RateLimit,
	}

	if err := h.service.SetAISettings(c.Request().Context(), settings); err != nil {
		c.Logger().Error(err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to save settings"})
	}

	// Return updated settings (with masked keys)
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

	response, err := h.service.TestAI(c.Request().Context(), req.Provider, req.APIKey, req.BaseURL, req.Model, req.Thinking, req.ThinkingBudget, req.ReasoningEffort)
	if err != nil {
		return c.JSON(http.StatusOK, aiTestResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(http.StatusOK, aiTestResponse{
		Success: true,
		Message: response,
	})
}

// GetGeneralSettings returns the general settings.
// @Summary Get general settings
// @Description Get general application settings including fallback user agent and auto readability
// @Tags settings
// @Produce json
// @Success 200 {object} generalSettingsResponse
// @Failure 500 {object} errorResponse
// @Router /settings/general [get]
func (h *SettingsHandler) GetGeneralSettings(c echo.Context) error {
	settings, err := h.service.GetGeneralSettings(c.Request().Context())
	if err != nil {
		c.Logger().Error(err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get settings"})
	}

	return c.JSON(http.StatusOK, generalSettingsResponse{
		FallbackUserAgent: settings.FallbackUserAgent,
		AutoReadability:   settings.AutoReadability,
	})
}

// UpdateGeneralSettings updates the general settings.
// @Summary Update general settings
// @Description Update general application settings
// @Tags settings
// @Accept json
// @Produce json
// @Param settings body generalSettingsRequest true "General settings"
// @Success 200 {object} generalSettingsResponse
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /settings/general [put]
func (h *SettingsHandler) UpdateGeneralSettings(c echo.Context) error {
	var req generalSettingsRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	settings := &service.GeneralSettings{
		FallbackUserAgent: req.FallbackUserAgent,
		AutoReadability:   req.AutoReadability,
	}

	if err := h.service.SetGeneralSettings(c.Request().Context(), settings); err != nil {
		c.Logger().Error(err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to save settings"})
	}

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
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: err.Error()})
	}

	return c.JSON(http.StatusOK, deletedCountResponse{Deleted: deleted})
}

// GetNetworkSettings returns the network proxy configuration.
// @Summary Get network settings
// @Description Get the network proxy configuration with masked password
// @Tags settings
// @Produce json
// @Success 200 {object} networkSettingsResponse
// @Failure 500 {object} errorResponse
// @Router /settings/network [get]
func (h *SettingsHandler) GetNetworkSettings(c echo.Context) error {
	settings, err := h.service.GetNetworkSettings(c.Request().Context())
	if err != nil {
		c.Logger().Error(err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get settings"})
	}

	return c.JSON(http.StatusOK, networkSettingsResponse{
		Enabled:  settings.Enabled,
		Type:     settings.Type,
		Host:     settings.Host,
		Port:     settings.Port,
		Username: settings.Username,
		Password: settings.Password,
	})
}

// UpdateNetworkSettings updates the network proxy configuration.
// @Summary Update network settings
// @Description Update the network proxy configuration. Empty password keeps existing password.
// @Tags settings
// @Accept json
// @Produce json
// @Param settings body networkSettingsRequest true "Network settings"
// @Success 200 {object} networkSettingsResponse
// @Failure 400 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /settings/network [put]
func (h *SettingsHandler) UpdateNetworkSettings(c echo.Context) error {
	var req networkSettingsRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	settings := &service.NetworkSettings{
		Enabled:  req.Enabled,
		Type:     req.Type,
		Host:     req.Host,
		Port:     req.Port,
		Username: req.Username,
		Password: req.Password,
	}

	if err := h.service.SetNetworkSettings(c.Request().Context(), settings); err != nil {
		c.Logger().Error(err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to save settings"})
	}

	return h.GetNetworkSettings(c)
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

	// Build proxy URL from request
	proxyType := req.Type
	if proxyType == "" {
		proxyType = "http"
	}
	var proxyURL string
	if req.Username != "" && req.Password != "" {
		proxyURL = proxyType + "://" + req.Username + ":" + req.Password + "@" + req.Host + ":" + itoa(req.Port)
	} else {
		proxyURL = proxyType + "://" + req.Host + ":" + itoa(req.Port)
	}

	// Test proxy connection using https://captive.apple.com/
	const testURL = "https://captive.apple.com/"
	err := h.clientFactory.TestProxyWithConfig(c.Request().Context(), proxyURL, testURL)
	if err != nil {
		return c.JSON(http.StatusOK, networkTestResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(http.StatusOK, networkTestResponse{
		Success: true,
		Message: "Proxy connection successful",
	})
}

func itoa(i int) string {
	return strconv.Itoa(i)
}
