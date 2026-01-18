package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"gist/backend/pkg/logger"
	"gist/backend/internal/service"
)

// AuthCookieName is the name of the authentication cookie.
const AuthCookieName = "gist_auth"

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
			latency := time.Since(start)
			remoteIP := c.RealIP()
			userAgent := req.UserAgent()

			status := res.Status
			action := "request"
			resource := "http"
			result := "ok"
			if status >= 400 {
				result = "failed"
			}
			if status >= 500 {
				logger.Error("http request",
					"module", "http",
					"action", action,
					"resource", resource,
					"result", result,
					"method", req.Method,
					"path", req.URL.Path,
					"status_code", status,
					"duration_ms", latency.Milliseconds(),
					"remote_ip", remoteIP,
					"user_agent", userAgent,
				)
			} else if status >= 400 {
				logger.Warn("http request",
					"module", "http",
					"action", action,
					"resource", resource,
					"result", result,
					"method", req.Method,
					"path", req.URL.Path,
					"status_code", status,
					"duration_ms", latency.Milliseconds(),
					"remote_ip", remoteIP,
					"user_agent", userAgent,
				)
			} else {
				logger.Debug("http request",
					"module", "http",
					"action", action,
					"resource", resource,
					"result", result,
					"method", req.Method,
					"path", req.URL.Path,
					"status_code", status,
					"duration_ms", latency.Milliseconds(),
					"remote_ip", remoteIP,
					"user_agent", userAgent,
				)
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
				if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
					token = parts[1]
				}
			}

			// Fallback to cookie (for image/resource requests)
			if token == "" {
				if cookie, err := c.Cookie(AuthCookieName); err == nil && cookie.Value != "" {
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
			valid, err := authService.ValidateToken(token)
			if err != nil || !valid {
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
