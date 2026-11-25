package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/handler"
	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

// AuthCookieName re-exports the shared authentication cookie name for callers/tests.
const AuthCookieName = handler.AuthCookieName

// RequestLoggerMiddleware logs HTTP requests using logger.
func RequestLoggerMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()

			err := next(c)
			if err != nil {
				c.Error(err)
			}

			req := c.Request()
			res := c.Response()
			status := res.Status
			result := "ok"
			if status >= 400 {
				result = "failed"
			}

			fields := []any{
				"module", "http",
				"action", "request",
				"resource", "http",
				"result", result,
				"method", req.Method,
				"path", req.URL.Path,
				"status_code", status,
				"duration_ms", time.Since(start).Milliseconds(),
				"remote_ip", c.RealIP(),
				"user_agent", req.UserAgent(),
			}

			switch {
			case status >= 500:
				logger.Error("http request", fields...)
			case status >= 400:
				logger.Warn("http request", fields...)
			default:
				logger.Debug("http request", fields...)
			}

			return nil
		}
	}
}

// JWTAuthMiddleware creates a middleware that validates JWT tokens.
// It checks both Authorization header (for API calls) and Cookie (for browser resource requests like images).
func JWTAuthMiddleware(authService service.AuthService) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			var token string

			// Try Authorization header first
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
					token = parts[1]
				}
			}

			// Fallback to cookie (for image/resource requests)
			if token == "" {
				if cookie, err := c.Cookie(handler.AuthCookieName); err == nil && cookie.Value != "" {
					token = cookie.Value
				}
			}

			if token == "" {
				logger.Warn("auth missing",
					"module", "http",
					"action", "request",
					"resource", "auth",
					"result", "failed",
					"method", c.Request().Method,
					"path", c.Request().URL.Path,
					"remote_ip", c.RealIP(),
				)
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "missing authentication",
				})
			}

			// Validate token
			valid, err := authService.ValidateToken(c.Request().Context(), token)
			if err != nil || !valid {
				handler.ClearAuthCookie(c)
				logger.Warn("auth invalid",
					"module", "http",
					"action", "request",
					"resource", "auth",
					"result", "failed",
					"method", c.Request().Method,
					"path", c.Request().URL.Path,
					"remote_ip", c.RealIP(),
				)
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "invalid token",
				})
			}

			return next(c)
		}
	}
}
