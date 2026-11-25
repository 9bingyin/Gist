package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	"gist/backend/internal/config"
	"gist/backend/internal/db"
	"gist/backend/internal/handler"
	transport "gist/backend/internal/http"
	"gist/backend/internal/repository"
	"gist/backend/internal/scheduler"
	"gist/backend/internal/service"
	"gist/backend/internal/service/ai"
	"gist/backend/internal/service/anubis"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
	"gist/backend/pkg/snowflake"
)

// @title Gist API
// @version 1.0
// @description This is a modern RSS reader API.
// @BasePath /api
func main() {
	if err := run(); err != nil {
		logger.Error("server exited with error", "module", "server", "action", "start", "resource", "server", "result", "failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()

	logger.Init(logger.ParseLevel(cfg.LogLevel))

	if err := snowflake.Init(1); err != nil {
		return err
	}

	dbConn, err := db.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer dbConn.Close()

	folderRepo := repository.NewFolderRepository(dbConn)
	feedRepo := repository.NewFeedRepository(dbConn)
	entryRepo := repository.NewEntryRepository(dbConn)
	settingsRepo := repository.NewSettingsRepository(dbConn)
	aiSummaryRepo := repository.NewAISummaryRepository(dbConn)
	aiTranslationRepo := repository.NewAITranslationRepository(dbConn)
	aiListTranslationRepo := repository.NewAIListTranslationRepository(dbConn)
	domainRateLimitRepo := repository.NewDomainRateLimitRepository(dbConn)

	// Initialize rate limiter with stored setting
	initialRateLimit := ai.DefaultRateLimit
	if setting, err := settingsRepo.Get(context.Background(), "ai.rate_limit"); err == nil && setting != nil {
		if val, parseErr := strconv.Atoi(setting.Value); parseErr == nil && val > 0 {
			initialRateLimit = val
		}
	}
	rateLimiter := ai.NewRateLimiter(initialRateLimit)

	settingsService := service.NewSettingsService(settingsRepo, rateLimiter)

	// Initialize client factory for proxy and IP stack support
	clientFactory := network.NewClientFactory(settingsService, settingsService)
	settingsService.SetClientFactory(clientFactory)

	// Initialize Anubis solver for bypassing Anubis protection
	anubisStore := anubis.NewStore(settingsRepo)
	settingsService.SetAnubisStore(anubisStore)
	anubisSolver := anubis.NewSolver(clientFactory, anubisStore)

	iconService := service.NewIconService(cfg.DataDir, feedRepo, clientFactory, anubisSolver)

	// Backfill icons for existing feeds (run in background)
	backfillCtx, cancelBackfill := context.WithCancel(context.Background())
	var backfillWG sync.WaitGroup
	backfillWG.Go(func() {
		if err := iconService.BackfillIcons(backfillCtx); err != nil && !errors.Is(err, context.Canceled) {
			logger.Warn("backfill icons", "module", "server", "action", "backfill", "resource", "icon", "result", "failed", "error", err)
		}
	})

	folderService := service.NewFolderService(folderRepo, feedRepo)
	feedService := service.NewFeedService(feedRepo, folderRepo, entryRepo, iconService, settingsService, clientFactory, anubisSolver)
	entryService := service.NewEntryService(entryRepo, feedRepo, folderRepo)
	readabilityService := service.NewReadabilityService(entryRepo, clientFactory, anubisSolver)
	domainRateLimitService := service.NewDomainRateLimitService(domainRateLimitRepo)
	refreshService := service.NewRefreshService(feedRepo, entryRepo, settingsService, iconService, clientFactory, anubisSolver, domainRateLimitService)
	opmlService := service.NewOPMLService(folderService, feedService, refreshService, iconService, folderRepo, feedRepo)

	proxyService := service.NewProxyService(clientFactory, anubisSolver)
	aiService := service.NewAIService(aiSummaryRepo, aiTranslationRepo, aiListTranslationRepo, settingsRepo, rateLimiter, entryRepo, feedRepo, clientFactory)
	authService := service.NewAuthService(settingsRepo)

	folderHandler := handler.NewFolderHandler(folderService)
	feedHandler := handler.NewFeedHandler(feedService, refreshService)
	entryHandler := handler.NewEntryHandler(entryService, readabilityService)
	importTaskService := service.NewImportTaskService()
	opmlHandler := handler.NewOPMLHandler(opmlService, importTaskService)
	iconHandler := handler.NewIconHandler(iconService)
	proxyHandler := handler.NewProxyHandler(proxyService)
	settingsHandler := handler.NewSettingsHandler(settingsService)
	aiHandler := handler.NewAIHandler(aiService)
	authHandler := handler.NewAuthHandler(authService)
	domainRateLimitHandler := handler.NewDomainRateLimitHandler(domainRateLimitService)

	router := transport.NewRouter(transport.RouterDeps{
		FolderHandler:          folderHandler,
		FeedHandler:            feedHandler,
		EntryHandler:           entryHandler,
		OPMLHandler:            opmlHandler,
		IconHandler:            iconHandler,
		ProxyHandler:           proxyHandler,
		SettingsHandler:        settingsHandler,
		AIHandler:              aiHandler,
		AuthHandler:            authHandler,
		DomainRateLimitHandler: domainRateLimitHandler,
		AuthService:            authService,
		StaticDir:              cfg.StaticDir,
		EnableSwagger:          cfg.EnableSwagger,
	})
	pprofServer := startPprofServer(cfg.PprofAddr)

	// Start background scheduler (15 minutes interval)
	sched := scheduler.New(refreshService, 15*time.Minute)
	sched.Start()

	sigCtx, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()

	serverErrCh := make(chan error, 1)
	go func() {
		err := router.Start(cfg.Addr)
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrCh <- err
			return
		}
		serverErrCh <- nil
	}()

	var startErr error
	select {
	case <-sigCtx.Done():
		logger.Info("shutting down", "module", "server", "action", "shutdown", "resource", "server", "result", "ok")
	case startErr = <-serverErrCh:
		if startErr != nil {
			logger.Error("start server failed", "module", "server", "action", "start", "resource", "server", "result", "failed", "error", startErr)
		}
	}

	// Shutdown in strict dependency order so all HTTP requests and background
	// tasks finish before defer dbConn.Close() executes.
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()

	if err := router.Shutdown(shutdownCtx); err != nil {
		logger.Error("server shutdown", "module", "server", "action", "shutdown", "resource", "server", "result", "failed", "error", err)
	}
	if startErr == nil {
		<-serverErrCh
	}

	if pprofServer != nil {
		if err := pprofServer.Shutdown(shutdownCtx); err != nil {
			logger.Error("pprof shutdown", "module", "server", "action", "shutdown", "resource", "pprof", "result", "failed", "error", err)
		}
	}

	waitWithTimeout(shutdownCtx, "scheduler", sched.Stop)
	waitWithTimeout(shutdownCtx, "opml_import", opmlHandler.Shutdown)
	waitWithTimeout(shutdownCtx, "refresh_service", refreshService.Shutdown)

	cancelBackfill()
	waitWithTimeout(shutdownCtx, "icon_backfill", backfillWG.Wait)

	logger.Info("server stopped", "module", "server", "action", "shutdown", "resource", "server", "result", "ok")
	return startErr
}

func waitWithTimeout(ctx context.Context, name string, fn func()) {
	done := make(chan struct{})
	go func() {
		fn()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		logger.Warn("shutdown wait timeout", "module", "server", "action", "shutdown", "resource", name, "result", "failed")
	}
}

func startPprofServer(addr string) *http.Server {
	if addr == "" {
		return nil
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("pprof server started", "module", "server", "action", "start", "resource", "pprof", "result", "ok", "addr", addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("pprof server failed", "module", "server", "action", "start", "resource", "pprof", "result", "failed", "addr", addr, "error", err)
		}
	}()

	return server
}
