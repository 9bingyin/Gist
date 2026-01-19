package handler_test

import (
	"net/http"
	"testing"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/handler"
	"gist/backend/pkg/network"
)

func assertRoute(t *testing.T, routes []*echo.Route, method, path string) {
	t.Helper()
	for _, r := range routes {
		if r.Method == method && r.Path == path {
			return
		}
	}
	t.Fatalf("route not found: %s %s", method, path)
}

func TestHandler_RegisterRoutes(t *testing.T) {
	e := newTestEcho()
	g := e.Group("")

	handler.NewAIHandler(nil).RegisterRoutes(g)

	authHandler := handler.NewAuthHandler(nil)
	authHandler.RegisterPublicRoutes(g)
	authHandler.RegisterProtectedRoutes(g)

	handler.NewDomainRateLimitHandler(nil).RegisterRoutes(g)
	handler.NewEntryHandler(nil, nil).RegisterRoutes(g)
	handler.NewFeedHandler(nil, nil).RegisterRoutes(g)
	handler.NewFolderHandler(nil).RegisterRoutes(g)
	handler.NewProxyHandler(nil).RegisterRoutes(g)
	handler.NewOPMLHandler(nil, nil).RegisterRoutes(g)
	handler.NewSettingsHandler(nil, network.NewClientFactoryForTest(&http.Client{})).RegisterRoutes(g)

	iconHandler := handler.NewIconHandler(nil)
	iconHandler.RegisterRoutes(e)
	iconHandler.RegisterAPIRoutes(g)

	routes := e.Routes()

	assertRoute(t, routes, http.MethodPost, "/ai/summarize")
	assertRoute(t, routes, http.MethodPost, "/ai/translate")
	assertRoute(t, routes, http.MethodPost, "/ai/translate/batch")
	assertRoute(t, routes, http.MethodDelete, "/ai/cache")

	assertRoute(t, routes, http.MethodGet, "/auth/status")
	assertRoute(t, routes, http.MethodPost, "/auth/register")
	assertRoute(t, routes, http.MethodPost, "/auth/login")
	assertRoute(t, routes, http.MethodGet, "/auth/me")
	assertRoute(t, routes, http.MethodPut, "/auth/profile")
	assertRoute(t, routes, http.MethodPost, "/auth/logout")

	assertRoute(t, routes, http.MethodGet, "/domain-rate-limits")
	assertRoute(t, routes, http.MethodPost, "/domain-rate-limits")
	assertRoute(t, routes, http.MethodPut, "/domain-rate-limits/:host")
	assertRoute(t, routes, http.MethodDelete, "/domain-rate-limits/:host")

	assertRoute(t, routes, http.MethodGet, "/entries")
	assertRoute(t, routes, http.MethodGet, "/entries/:id")
	assertRoute(t, routes, http.MethodPatch, "/entries/:id/read")
	assertRoute(t, routes, http.MethodPatch, "/entries/:id/starred")
	assertRoute(t, routes, http.MethodPost, "/entries/:id/fetch-readable")
	assertRoute(t, routes, http.MethodPost, "/entries/mark-read")
	assertRoute(t, routes, http.MethodDelete, "/entries/readability-cache")
	assertRoute(t, routes, http.MethodDelete, "/entries/cache")
	assertRoute(t, routes, http.MethodGet, "/unread-counts")
	assertRoute(t, routes, http.MethodGet, "/starred-count")

	assertRoute(t, routes, http.MethodPost, "/feeds")
	assertRoute(t, routes, http.MethodPost, "/feeds/refresh")
	assertRoute(t, routes, http.MethodGet, "/feeds/preview")
	assertRoute(t, routes, http.MethodGet, "/feeds")
	assertRoute(t, routes, http.MethodPut, "/feeds/:id")
	assertRoute(t, routes, http.MethodPatch, "/feeds/:id/type")
	assertRoute(t, routes, http.MethodDelete, "/feeds/:id")
	assertRoute(t, routes, http.MethodDelete, "/feeds")

	assertRoute(t, routes, http.MethodPost, "/folders")
	assertRoute(t, routes, http.MethodGet, "/folders")
	assertRoute(t, routes, http.MethodPut, "/folders/:id")
	assertRoute(t, routes, http.MethodPatch, "/folders/:id/type")
	assertRoute(t, routes, http.MethodDelete, "/folders/:id")
	assertRoute(t, routes, http.MethodDelete, "/folders")

	assertRoute(t, routes, http.MethodGet, "/icons/:filename")
	assertRoute(t, routes, http.MethodDelete, "/icons/cache")

	assertRoute(t, routes, http.MethodPost, "/opml/import")
	assertRoute(t, routes, http.MethodDelete, "/opml/import")
	assertRoute(t, routes, http.MethodGet, "/opml/import/status")
	assertRoute(t, routes, http.MethodGet, "/opml/export")

	assertRoute(t, routes, http.MethodGet, "/proxy/image/:encoded")

	assertRoute(t, routes, http.MethodGet, "/settings/ai")
	assertRoute(t, routes, http.MethodPut, "/settings/ai")
	assertRoute(t, routes, http.MethodPost, "/settings/ai/test")
	assertRoute(t, routes, http.MethodGet, "/settings/general")
	assertRoute(t, routes, http.MethodPut, "/settings/general")
	assertRoute(t, routes, http.MethodGet, "/settings/network")
	assertRoute(t, routes, http.MethodPut, "/settings/network")
	assertRoute(t, routes, http.MethodPost, "/settings/network/test")
	assertRoute(t, routes, http.MethodGet, "/settings/appearance")
	assertRoute(t, routes, http.MethodPut, "/settings/appearance")
	assertRoute(t, routes, http.MethodDelete, "/settings/anubis-cookies")
}
