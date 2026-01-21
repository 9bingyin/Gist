package http

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	echoSwagger "github.com/swaggo/echo-swagger"

	_ "gist/backend/docs"
	"gist/backend/internal/handler"
	"gist/backend/pkg/logger"
	"gist/backend/internal/service"
)

func NewRouter(
	folderHandler *handler.FolderHandler,
	feedHandler *handler.FeedHandler,
	entryHandler *handler.EntryHandler,
	opmlHandler *handler.OPMLHandler,
	iconHandler *handler.IconHandler,
	proxyHandler *handler.ProxyHandler,
	settingsHandler *handler.SettingsHandler,
	aiHandler *handler.AIHandler,
	authHandler *handler.AuthHandler,
	domainRateLimitHandler *handler.DomainRateLimitHandler,
	authService service.AuthService,
	staticDir string,
	enableSwagger bool,
) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())
	e.Use(RequestLoggerMiddleware())

	logger.Info("router initialized", "module", "http", "action", "request", "resource", "http", "result", "ok", "static_dir", staticDir)

	if enableSwagger {
		e.GET("/swagger/*", echoSwagger.WrapHandler)
	}

	// Public API routes (no auth required)
	publicAPI := e.Group("/api")
	authHandler.RegisterPublicRoutes(publicAPI)

	// Protected API routes (auth required)
	api := e.Group("/api")
	api.Use(JWTAuthMiddleware(authService))

	folderHandler.RegisterRoutes(api)
	feedHandler.RegisterRoutes(api)
	entryHandler.RegisterRoutes(api)
	opmlHandler.RegisterRoutes(api)
	proxyHandler.RegisterRoutes(api)
	settingsHandler.RegisterRoutes(api)
	aiHandler.RegisterRoutes(api)
	iconHandler.RegisterAPIRoutes(api)
	authHandler.RegisterProtectedRoutes(api)
	domainRateLimitHandler.RegisterRoutes(api)

	// Icon routes with cache recovery
	iconHandler.RegisterRoutes(e)

	registerStatic(e, staticDir)

	return e
}
