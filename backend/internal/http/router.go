package http

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	echoSwagger "github.com/swaggo/echo-swagger"

	_ "gist/backend/docs"
	"gist/backend/internal/handler"
	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

// RouterDeps bundles all dependencies required to construct the HTTP router.
type RouterDeps struct {
	FolderHandler          *handler.FolderHandler
	FeedHandler            *handler.FeedHandler
	EntryHandler           *handler.EntryHandler
	OPMLHandler            *handler.OPMLHandler
	IconHandler            *handler.IconHandler
	ProxyHandler           *handler.ProxyHandler
	SettingsHandler        *handler.SettingsHandler
	AIHandler              *handler.AIHandler
	AuthHandler            *handler.AuthHandler
	DomainRateLimitHandler *handler.DomainRateLimitHandler
	AuthService            service.AuthService
	StaticDir              string
	EnableSwagger          bool
}

func NewRouter(deps RouterDeps) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	// Register logger before Recover so panics caught by Recover are logged with status 500.
	e.Use(RequestLoggerMiddleware())
	e.Use(middleware.Recover())

	logger.Info("router initialized", "module", "http", "action", "request", "resource", "http", "result", "ok", "static_dir", deps.StaticDir)

	if deps.EnableSwagger {
		e.GET("/swagger/*", echoSwagger.WrapHandler)
	}

	// Public API routes (no auth required)
	publicAPI := e.Group("/api")
	deps.AuthHandler.RegisterPublicRoutes(publicAPI)

	// Protected API routes (auth required)
	api := e.Group("/api")
	api.Use(JWTAuthMiddleware(deps.AuthService))

	deps.FolderHandler.RegisterRoutes(api)
	deps.FeedHandler.RegisterRoutes(api)
	deps.EntryHandler.RegisterRoutes(api)
	deps.OPMLHandler.RegisterRoutes(api)
	deps.ProxyHandler.RegisterRoutes(api)
	deps.SettingsHandler.RegisterRoutes(api)
	deps.AIHandler.RegisterRoutes(api)
	deps.IconHandler.RegisterAPIRoutes(api)
	deps.AuthHandler.RegisterProtectedRoutes(api)
	deps.DomainRateLimitHandler.RegisterRoutes(api)

	// Icon routes with cache recovery
	deps.IconHandler.RegisterRoutes(e)

	registerStatic(e, deps.StaticDir)

	return e
}
