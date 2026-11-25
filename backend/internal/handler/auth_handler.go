package handler

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

// AuthCookieName is the name of the authentication cookie shared with HTTP middleware.
const AuthCookieName = "gist_auth"

type AuthHandler struct {
	service service.AuthService
}

func NewAuthHandler(service service.AuthService) *AuthHandler {
	return &AuthHandler{service: service}
}

// Request/Response types

type authStatusResponse struct {
	Exists bool `json:"exists"`
}

type registerRequest struct {
	Username string `json:"username"`
	Nickname string `json:"nickname"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

type updateProfileRequest struct {
	Nickname        string `json:"nickname"`
	Email           string `json:"email"`
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type authResponse struct {
	Token string        `json:"token"`
	User  *userResponse `json:"user"`
}

type updateProfileResponse struct {
	User  *userResponse `json:"user"`
	Token *string       `json:"token,omitempty"`
}

type userResponse struct {
	Username  string `json:"username"`
	Nickname  string `json:"nickname"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatarUrl"`
}

// RegisterPublicRoutes registers routes that don't require authentication.
func (h *AuthHandler) RegisterPublicRoutes(g *echo.Group) {
	g.GET("/auth/status", h.GetStatus)
	g.POST("/auth/register", h.Register)
	g.POST("/auth/login", h.Login)
	g.POST("/auth/logout", h.Logout)
}

// RegisterProtectedRoutes registers routes that require authentication.
func (h *AuthHandler) RegisterProtectedRoutes(g *echo.Group) {
	g.GET("/auth/me", h.GetCurrentUser)
	g.PUT("/auth/profile", h.UpdateProfile)
}

// GetStatus checks if a user has been registered.
// @Summary Check user status
// @Description Check if a user has been registered
// @Tags auth
// @Produce json
// @Success 200 {object} authStatusResponse
// @Failure 500 {object} errorResponse
// @Router /auth/status [get]
func (h *AuthHandler) GetStatus(c echo.Context) error {
	exists, err := h.service.CheckUserExists(c.Request().Context())
	if err != nil {
		logger.Error("auth status check failed", "module", "handler", "action", "list", "resource", "auth", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to check status"})
	}

	return c.JSON(http.StatusOK, authStatusResponse{Exists: exists})
}

// Register creates a new user.
// @Summary Register user
// @Description Register a new user (only if none exists)
// @Tags auth
// @Accept json
// @Produce json
// @Param request body registerRequest true "Registration info"
// @Success 200 {object} authResponse
// @Failure 400 {object} errorResponse
// @Failure 409 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /auth/register [post]
func (h *AuthHandler) Register(c echo.Context) error {
	var req registerRequest
	if err := c.Bind(&req); err != nil {
		logger.Warn("auth request invalid", "module", "handler", "action", "create", "resource", "auth", "result", "failed", "error", err)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	resp, err := h.service.Register(c.Request().Context(), req.Username, req.Nickname, req.Email, req.Password)
	if err != nil {
		return h.handleAuthError(c, "create", req.Username, err)
	}

	// Set auth cookie for browser resource requests (images, etc.)
	SetAuthCookie(c, resp.Token)

	logger.Info("auth register", "module", "handler", "action", "create", "resource", "auth", "result", "ok", "actor", resp.User.Username)
	return c.JSON(http.StatusOK, authResponse{
		Token: resp.Token,
		User:  toUserResponse(resp.User),
	})
}

// Login authenticates a user.
// @Summary Login
// @Description Authenticate a user with username or email and get a JWT token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body loginRequest true "Login credentials"
// @Success 200 {object} authResponse
// @Failure 400 {object} errorResponse
// @Failure 401 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /auth/login [post]
func (h *AuthHandler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		logger.Warn("auth request invalid", "module", "handler", "action", "login", "resource", "auth", "result", "failed", "error", err)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	resp, err := h.service.Login(c.Request().Context(), req.Identifier, req.Password)
	if err != nil {
		return h.handleAuthError(c, "login", req.Identifier, err)
	}

	// Set auth cookie for browser resource requests (images, etc.)
	SetAuthCookie(c, resp.Token)

	logger.Info("auth login", "module", "handler", "action", "login", "resource", "auth", "result", "ok", "actor", resp.User.Username)
	return c.JSON(http.StatusOK, authResponse{
		Token: resp.Token,
		User:  toUserResponse(resp.User),
	})
}

// GetCurrentUser returns the current authenticated user.
// @Summary Get current user
// @Description Get the currently authenticated user's info
// @Tags auth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} userResponse
// @Failure 401 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /auth/me [get]
func (h *AuthHandler) GetCurrentUser(c echo.Context) error {
	user, err := h.service.GetCurrentUser(c.Request().Context())
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			logger.Warn("auth me not authenticated", "module", "handler", "action", "list", "resource", "auth", "result", "failed")
			return c.JSON(http.StatusUnauthorized, errorResponse{Error: "not authenticated"})
		}
		logger.Error("auth me failed", "module", "handler", "action", "list", "resource", "auth", "result", "failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get user"})
	}

	logger.Debug("auth me", "module", "handler", "action", "list", "resource", "auth", "result", "ok", "actor", user.Username)
	return c.JSON(http.StatusOK, toUserResponse(user))
}

// UpdateProfile updates the user's profile.
// @Summary Update profile
// @Description Update user nickname, email and/or password. Returns new token when password is changed.
// @Tags auth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body updateProfileRequest true "Profile update"
// @Success 200 {object} updateProfileResponse
// @Failure 400 {object} errorResponse
// @Failure 401 {object} errorResponse
// @Failure 500 {object} errorResponse
// @Router /auth/profile [put]
func (h *AuthHandler) UpdateProfile(c echo.Context) error {
	var req updateProfileRequest
	if err := c.Bind(&req); err != nil {
		logger.Warn("auth request invalid", "module", "handler", "action", "update", "resource", "auth", "result", "failed", "error", err)
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	result, err := h.service.UpdateProfile(c.Request().Context(), req.Nickname, req.Email, req.CurrentPassword, req.NewPassword)
	if err != nil {
		return h.handleAuthError(c, "update", "", err)
	}

	// Update auth cookie if new token was generated
	if result.Token != nil {
		SetAuthCookie(c, *result.Token)
	}

	logger.Info("auth profile updated", "module", "handler", "action", "update", "resource", "auth", "result", "ok", "actor", result.User.Username)
	return c.JSON(http.StatusOK, updateProfileResponse{
		User:  toUserResponse(result.User),
		Token: result.Token,
	})
}

// Logout clears the authentication cookie.
// @Summary Logout
// @Description Clear authentication cookie and log out the user
// @Tags auth
// @Produce json
// @Success 200 {object} map[string]string
// @Router /auth/logout [post]
func (h *AuthHandler) Logout(c echo.Context) error {
	ClearAuthCookie(c)
	logger.Info("auth logout", "module", "handler", "action", "logout", "resource", "auth", "result", "ok")
	return c.JSON(http.StatusOK, map[string]string{"message": "logged out"})
}

func (h *AuthHandler) handleAuthError(c echo.Context, action, actor string, err error) error {
	var status int
	var message string

	switch {
	case errors.Is(err, service.ErrUserExists):
		status, message = http.StatusConflict, "user already exists"
	case errors.Is(err, service.ErrUserNotFound):
		status, message = http.StatusUnauthorized, "user not found"
	case errors.Is(err, service.ErrInvalidPassword):
		status, message = http.StatusUnauthorized, "invalid credentials"
	case errors.Is(err, service.ErrUsernameRequired):
		status, message = http.StatusBadRequest, "username is required"
	case errors.Is(err, service.ErrInvalidUsername):
		status, message = http.StatusBadRequest, "username must not contain whitespace or control characters"
	case errors.Is(err, service.ErrEmailRequired):
		status, message = http.StatusBadRequest, "email is required"
	case errors.Is(err, service.ErrPasswordRequired):
		status, message = http.StatusBadRequest, "password is required"
	case errors.Is(err, service.ErrPasswordTooShort):
		status, message = http.StatusBadRequest, "password must be at least 6 characters"
	case errors.Is(err, service.ErrPasswordTooLong):
		status, message = http.StatusBadRequest, "password must be at most 72 bytes"
	case errors.Is(err, service.ErrCurrentPasswordRequired):
		status, message = http.StatusBadRequest, "current password is required"
	case errors.Is(err, service.ErrSamePassword):
		status, message = http.StatusBadRequest, "new password must be different from current password"
	default:
		fields := []any{"module", "handler", "action", action, "resource", "auth", "result", "failed", "error", err}
		if actor != "" {
			fields = append(fields, "actor", actor)
		}
		logger.Error("auth request failed", fields...)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "internal error"})
	}

	fields := []any{"module", "handler", "action", action, "resource", "auth", "result", "failed", "error", err}
	if actor != "" {
		fields = append(fields, "actor", actor)
	}
	logger.Warn("auth request rejected", fields...)
	return c.JSON(status, errorResponse{Error: message})
}

func toUserResponse(user *service.User) *userResponse {
	if user == nil {
		return nil
	}
	return &userResponse{
		Username:  user.Username,
		Nickname:  user.Nickname,
		Email:     user.Email,
		AvatarURL: user.AvatarURL,
	}
}

// SetAuthCookie sets the authentication cookie for browser resource requests.
func SetAuthCookie(c echo.Context, token string) {
	cookie := &http.Cookie{
		Name:     AuthCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   c.Scheme() == "https",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 60 * 60, // 30 days (same as JWT expiry)
	}
	c.SetCookie(cookie)
}

// ClearAuthCookie clears the authentication cookie with matching attributes.
func ClearAuthCookie(c echo.Context) {
	cookie := &http.Cookie{
		Name:     AuthCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   c.Scheme() == "https",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	}
	c.SetCookie(cookie)
}
