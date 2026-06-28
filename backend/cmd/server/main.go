package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
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
	cfg := config.Load()

	logger.Init(logger.ParseLevel(cfg.LogLevel))

	if err := snowflake.Init(1); err != nil {
		logger.Error("init snowflake", "error", err)
		os.Exit(1)
	}

	dbConn, err := db.Open(cfg.DBPath)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
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
		var val int
		fmt.Sscanf(setting.Value, "%d", &val)
		if val > 0 {
			initialRateLimit = val
		}
	}
	rateLimiter := ai.NewRateLimiter(initialRateLimit)

	settingsService := service.NewSettingsService(settingsRepo, rateLimiter)

	// Initialize client factory for proxy and IP stack support
	clientFactory := network.NewClientFactory(settingsService, settingsService)

	// Initialize Anubis solver for bypassing Anubis protection
	anubisStore := anubis.NewStore(settingsRepo)
	anubisSolver := anubis.NewSolver(clientFactory, anubisStore)

	iconService := service.NewIconService(cfg.DataDir, feedRepo, clientFactory, anubisSolver)

	// Backfill icons for existing feeds (run in background)
	backfillCtx, cancelBackfill := context.WithCancel(context.Background())
	var backfillWG sync.WaitGroup
	backfillWG.Add(1)
	go func() {
		defer backfillWG.Done()
		if err := iconService.BackfillIcons(backfillCtx); err != nil && !errors.Is(err, context.Canceled) {
			logger.Warn("backfill icons", "error", err)
		}
	}()

	folderService := service.NewFolderService(folderRepo, feedRepo)
	feedService := service.NewFeedService(feedRepo, folderRepo, entryRepo, iconService, settingsService, clientFactory, anubisSolver)
	entryService := service.NewEntryService(entryRepo, feedRepo, folderRepo)
	readabilityService := service.NewReadabilityService(entryRepo, clientFactory, anubisSolver)
	domainRateLimitService := service.NewDomainRateLimitService(domainRateLimitRepo)
	refreshService := service.NewRefreshService(feedRepo, entryRepo, settingsService, iconService, clientFactory, anubisSolver, domainRateLimitService)
	opmlService := service.NewOPMLService(folderService, feedService, refreshService, iconService, folderRepo, feedRepo)

	proxyService := service.NewProxyService(clientFactory, anubisSolver)
	aiService := service.NewAIServiceWithFeedContext(aiSummaryRepo, aiTranslationRepo, aiListTranslationRepo, settingsRepo, rateLimiter, entryRepo, feedRepo)
	authService := service.NewAuthService(settingsRepo)

	folderHandler := handler.NewFolderHandler(folderService)
	feedHandler := handler.NewFeedHandler(feedService, refreshService)
	entryHandler := handler.NewEntryHandler(entryService, readabilityService)
	importTaskService := service.NewImportTaskService()
	opmlHandler := handler.NewOPMLHandler(opmlService, importTaskService)
	iconHandler := handler.NewIconHandler(iconService)
	proxyHandler := handler.NewProxyHandler(proxyService)
	settingsHandler := handler.NewSettingsHandler(settingsService, clientFactory)
	aiHandler := handler.NewAIHandler(aiService)
	authHandler := handler.NewAuthHandler(authService)
	domainRateLimitHandler := handler.NewDomainRateLimitHandler(domainRateLimitService)

	router := transport.NewRouter(folderHandler, feedHandler, entryHandler, opmlHandler, iconHandler, proxyHandler, settingsHandler, aiHandler, authHandler, domainRateLimitHandler, authService, cfg.StaticDir, cfg.EnableSwagger)
	pprofServer := startPprofServer(cfg.PprofAddr)

	// Start background scheduler (15 minutes interval)
	sched := scheduler.New(refreshService, 15*time.Minute)
	sched.Start()

	// Handle graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		logger.Info("shutting down...")

		// Create a deadline for shutdown
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		sched.Stop()
		readabilityService.Close()
		proxyService.Close()
		cancelBackfill()

		// Wait for backfill task to exit within shutdown deadline.
		backfillDone := make(chan struct{})
		go func() {
			backfillWG.Wait()
			close(backfillDone)
		}()
		select {
		case <-backfillDone:
		case <-ctx.Done():
			logger.Warn("backfill stop timeout")
		}

		if pprofServer != nil {
			if err := pprofServer.Shutdown(ctx); err != nil {
				logger.Error("pprof shutdown", "module", "server", "action", "shutdown", "resource", "pprof", "result", "failed", "error", err)
			}
		}
		// Gracefully shutdown the HTTP server
		if err := router.Shutdown(ctx); err != nil {
			logger.Error("server shutdown", "error", err)
		}
	}()

	if err := router.Start(cfg.Addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("start server", "error", err)
		os.Exit(1)
	}

	logger.Info("server stopped")
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
