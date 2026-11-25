package http_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"gist/backend/internal/handler"
	gh "gist/backend/internal/http"
	"gist/backend/internal/service/mock"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func newTestRouter(t *testing.T, enableSwagger bool) *echo.Echo {
	t.Helper()
	ctrl := gomock.NewController(t)
	t.Cleanup(ctrl.Finish)

	folderService := mock.NewMockFolderService(ctrl)
	feedService := mock.NewMockFeedService(ctrl)
	entryService := mock.NewMockEntryService(ctrl)
	opmlService := mock.NewMockOPMLService(ctrl)
	iconService := mock.NewMockIconService(ctrl)
	proxyService := mock.NewMockProxyService(ctrl)
	settingsService := mock.NewMockSettingsService(ctrl)
	aiService := mock.NewMockAIService(ctrl)
	authService := mock.NewMockAuthService(ctrl)
	domainRateLimitService := mock.NewMockDomainRateLimitService(ctrl)
	refreshService := mock.NewMockRefreshService(ctrl)
	readabilityService := mock.NewMockReadabilityService(ctrl)
	importTaskService := mock.NewMockImportTaskService(ctrl)

	return gh.NewRouter(gh.RouterDeps{
		FolderHandler:          handler.NewFolderHandler(folderService),
		FeedHandler:            handler.NewFeedHandler(feedService, refreshService),
		EntryHandler:           handler.NewEntryHandler(entryService, readabilityService),
		OPMLHandler:            handler.NewOPMLHandler(opmlService, importTaskService),
		IconHandler:            handler.NewIconHandler(iconService),
		ProxyHandler:           handler.NewProxyHandler(proxyService),
		SettingsHandler:        handler.NewSettingsHandler(settingsService),
		AIHandler:              handler.NewAIHandler(aiService),
		AuthHandler:            handler.NewAuthHandler(authService),
		DomainRateLimitHandler: handler.NewDomainRateLimitHandler(domainRateLimitService),
		AuthService:            authService,
		StaticDir:              "",
		EnableSwagger:          enableSwagger,
	})
}

func TestNewRouter_RegistersRoutes(t *testing.T) {
	e := newTestRouter(t, true)

	require.NotNil(t, e)
	require.True(t, hasRoute(e, http.MethodGet, "/swagger/*"))
	require.True(t, hasRoute(e, http.MethodGet, "/api/feeds"))
	require.True(t, hasRoute(e, http.MethodGet, "/icons/:filename"))
	require.True(t, hasRoute(e, http.MethodGet, "/api/proxy/image/:encoded"))
}

func TestNewRouter_SwaggerDisabled(t *testing.T) {
	e := newTestRouter(t, false)

	require.NotNil(t, e)
	require.False(t, hasRoute(e, http.MethodGet, "/swagger/*"))
	require.True(t, hasRoute(e, http.MethodGet, "/api/feeds"))
	require.True(t, hasRoute(e, http.MethodGet, "/icons/:filename"))
	require.True(t, hasRoute(e, http.MethodGet, "/api/proxy/image/:encoded"))
}

func TestNewRouter_UsesDirectPeerIP(t *testing.T) {
	e := newTestRouter(t, false)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "192.0.2.10:54321"
	req.Header.Set(echo.HeaderXForwardedFor, "192.0.2.20")
	req.Header.Set(echo.HeaderXRealIP, "192.0.2.30")

	ctx := e.NewContext(req, httptest.NewRecorder())
	require.Equal(t, "192.0.2.10", ctx.RealIP())
}

func TestNewRouter_LogoutRouteIsPublic(t *testing.T) {
	e := newTestRouter(t, false)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	cookies := rec.Result().Cookies()
	var authCookie *http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == gh.AuthCookieName {
			authCookie = cookie
			break
		}
	}
	require.NotNil(t, authCookie)
	require.Equal(t, -1, authCookie.MaxAge)
}

func TestNewRouter_RecoverPanicReturns500(t *testing.T) {
	e := newTestRouter(t, false)
	e.GET("/panic-test", func(c echo.Context) error {
		panic("boom")
	})

	req := httptest.NewRequest(http.MethodGet, "/panic-test", nil)
	rec := httptest.NewRecorder()

	require.NotPanics(t, func() {
		e.ServeHTTP(rec, req)
	})
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func hasRoute(e *echo.Echo, method, path string) bool {
	for _, r := range e.Routes() {
		if r.Method == method && r.Path == path {
			return true
		}
	}
	return false
}
