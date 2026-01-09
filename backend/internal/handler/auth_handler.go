package handler

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/service"
)

// authCookieName must match the one in middleware.go
const authCookieName = "gist_auth"

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
}

// RegisterProtectedRoutes registers routes that require authentication.
func (h *AuthHandler) RegisterProtectedRoutes(g *echo.Group) {
	g.GET("/auth/me", h.GetCurrentUser)
	g.PUT("/auth/profile", h.UpdateProfile)
	g.POST("/auth/logout", h.Logout)
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
		c.Logger().Error(err)
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
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	resp, err := h.service.Register(c.Request().Context(), req.Username, req.Nickname, req.Email, req.Password)
	if err != nil {
		return h.handleAuthError(c, err)
	}

	// Set auth cookie for browser resource requests (images, etc.)
	setAuthCookie(c, resp.Token)

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
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	resp, err := h.service.Login(c.Request().Context(), req.Identifier, req.Password)
	if err != nil {
		return h.handleAuthError(c, err)
	}

	// Set auth cookie for browser resource requests (images, etc.)
	setAuthCookie(c, resp.Token)

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
			return c.JSON(http.StatusUnauthorized, errorResponse{Error: "not authenticated"})
		}
		c.Logger().Error(err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get user"})
	}

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
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	result, err := h.service.UpdateProfile(c.Request().Context(), req.Nickname, req.Email, req.CurrentPassword, req.NewPassword)
	if err != nil {
		return h.handleAuthError(c, err)
	}

	// Update auth cookie if new token was generated
	if result.Token != nil {
		setAuthCookie(c, *result.Token)
	}

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
// @Security BearerAuth
// @Success 200 {object} map[string]string
// @Router /auth/logout [post]
func (h *AuthHandler) Logout(c echo.Context) error {
	clearAuthCookie(c)
	return c.JSON(http.StatusOK, map[string]string{"message": "logged out"})
}

func (h *AuthHandler) handleAuthError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, service.ErrUserExists):
		return c.JSON(http.StatusConflict, errorResponse{Error: "user already exists"})
	case errors.Is(err, service.ErrUserNotFound):
		return c.JSON(http.StatusUnauthorized, errorResponse{Error: "user not found"})
	case errors.Is(err, service.ErrInvalidPassword):
		return c.JSON(http.StatusUnauthorized, errorResponse{Error: "invalid credentials"})
	case errors.Is(err, service.ErrUsernameRequired):
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "username is required"})
	case errors.Is(err, service.ErrInvalidUsername):
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "username must be lowercase letters and numbers only"})
	case errors.Is(err, service.ErrEmailRequired):
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "email is required"})
	case errors.Is(err, service.ErrPasswordRequired):
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "password is required"})
	case errors.Is(err, service.ErrPasswordTooShort):
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "password must be at least 6 characters"})
	case errors.Is(err, service.ErrCurrentPasswordRequired):
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "current password is required"})
	case errors.Is(err, service.ErrSamePassword):
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "new password must be different from current password"})
	default:
		c.Logger().Error(err)
		return c.JSON(http.StatusInternalServerError, errorResponse{Error: "internal error"})
	}
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

// setAuthCookie sets the authentication cookie for browser resource requests.
func setAuthCookie(c echo.Context, token string) {
	cookie := &http.Cookie{
		Name:     authCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   c.Request().TLS != nil, // Secure if HTTPS
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 60 * 60, // 30 days (same as JWT expiry)
	}
	c.SetCookie(cookie)
}

// clearAuthCookie clears the authentication cookie.
func clearAuthCookie(c echo.Context) {
	cookie := &http.Cookie{
		Name:     authCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1, // Delete cookie
	}
	c.SetCookie(cookie)
}
