package http_test

import (
	"net/http"
	"testing"

	"gist/backend/internal/handler"
	gh "gist/backend/internal/http"
	"gist/backend/internal/service/mock"
	"gist/backend/pkg/network"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestNewRouter_RegistersRoutes(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

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

	folderHandler := handler.NewFolderHandler(folderService)
	feedHandler := handler.NewFeedHandler(feedService, refreshService)
	entryHandler := handler.NewEntryHandler(entryService, readabilityService)
	opmlHandler := handler.NewOPMLHandler(opmlService, importTaskService)
	iconHandler := handler.NewIconHandler(iconService)
	proxyHandler := handler.NewProxyHandler(proxyService)
	settingsHandler := handler.NewSettingsHandler(settingsService, network.NewClientFactoryForTest(&http.Client{}))
	aiHandler := handler.NewAIHandler(aiService)
	authHandler := handler.NewAuthHandler(authService)
	domainRateLimitHandler := handler.NewDomainRateLimitHandler(domainRateLimitService)

	e := gh.NewRouter(
		folderHandler,
		feedHandler,
		entryHandler,
		opmlHandler,
		iconHandler,
		proxyHandler,
		settingsHandler,
		aiHandler,
		authHandler,
		domainRateLimitHandler,
		authService,
		"",
		true,
	)

	require.NotNil(t, e)
	require.True(t, hasRoute(e, http.MethodGet, "/swagger/*"))
	require.True(t, hasRoute(e, http.MethodGet, "/api/feeds"))
	require.True(t, hasRoute(e, http.MethodGet, "/icons/:filename"))
	require.True(t, hasRoute(e, http.MethodGet, "/api/proxy/image/:encoded"))
}

func TestNewRouter_SwaggerDisabled(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

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

	folderHandler := handler.NewFolderHandler(folderService)
	feedHandler := handler.NewFeedHandler(feedService, refreshService)
	entryHandler := handler.NewEntryHandler(entryService, readabilityService)
	opmlHandler := handler.NewOPMLHandler(opmlService, importTaskService)
	iconHandler := handler.NewIconHandler(iconService)
	proxyHandler := handler.NewProxyHandler(proxyService)
	settingsHandler := handler.NewSettingsHandler(settingsService, network.NewClientFactoryForTest(&http.Client{}))
	aiHandler := handler.NewAIHandler(aiService)
	authHandler := handler.NewAuthHandler(authService)
	domainRateLimitHandler := handler.NewDomainRateLimitHandler(domainRateLimitService)

	e := gh.NewRouter(
		folderHandler,
		feedHandler,
		entryHandler,
		opmlHandler,
		iconHandler,
		proxyHandler,
		settingsHandler,
		aiHandler,
		authHandler,
		domainRateLimitHandler,
		authService,
		"",
		false,
	)

	require.NotNil(t, e)
	require.False(t, hasRoute(e, http.MethodGet, "/swagger/*"))
	require.True(t, hasRoute(e, http.MethodGet, "/api/feeds"))
	require.True(t, hasRoute(e, http.MethodGet, "/icons/:filename"))
	require.True(t, hasRoute(e, http.MethodGet, "/api/proxy/image/:encoded"))
}

func hasRoute(e *echo.Echo, method, path string) bool {
	for _, r := range e.Routes() {
		if r.Method == method && r.Path == path {
			return true
		}
	}
	return false
}
