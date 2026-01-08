package http

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	echoSwagger "github.com/swaggo/echo-swagger"

	_ "gist/backend/docs"
	"gist/backend/internal/handler"
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
	staticDir string,
) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())
	e.Use(middleware.Logger())

	e.GET("/swagger/*", echoSwagger.WrapHandler)

	api := e.Group("/api")
	folderHandler.RegisterRoutes(api)
	feedHandler.RegisterRoutes(api)
	entryHandler.RegisterRoutes(api)
	opmlHandler.RegisterRoutes(api)
	proxyHandler.RegisterRoutes(api)
	settingsHandler.RegisterRoutes(api)
	aiHandler.RegisterRoutes(api)
	iconHandler.RegisterAPIRoutes(api)

	// Icon routes with cache recovery
	iconHandler.RegisterRoutes(e)

	registerStatic(e, staticDir)

	return e
}
