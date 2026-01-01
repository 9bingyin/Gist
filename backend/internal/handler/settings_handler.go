package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
)

type SettingsHandler struct {
	service service.SettingsService
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

func NewSettingsHandler(service service.SettingsService) *SettingsHandler {
	return &SettingsHandler{service: service}
}

func (h *SettingsHandler) RegisterRoutes(g *echo.Group) {
	g.GET("/settings/ai", h.GetAISettings)
	g.PUT("/settings/ai", h.UpdateAISettings)
	g.POST("/settings/ai/test", h.TestAI)
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
