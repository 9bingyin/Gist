package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gist/backend/internal/config"
	"gist/backend/internal/db"
	"gist/backend/internal/handler"
	transport "gist/backend/internal/http"
	"gist/backend/internal/repository"
	"gist/backend/internal/scheduler"
	"gist/backend/internal/service"
)

// @title Gist API
// @version 1.0
// @description This is a modern RSS reader API.
// @BasePath /api
func main() {
	cfg := config.Load()

	dbConn, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer dbConn.Close()

	folderRepo := repository.NewFolderRepository(dbConn)
	feedRepo := repository.NewFeedRepository(dbConn)
	entryRepo := repository.NewEntryRepository(dbConn)

	folderService := service.NewFolderService(folderRepo)
	feedService := service.NewFeedService(feedRepo, folderRepo, entryRepo, nil)
	entryService := service.NewEntryService(entryRepo, feedRepo, folderRepo)
	readabilityService := service.NewReadabilityService(entryRepo)
	opmlService := service.NewOPMLService(dbConn, folderRepo, feedRepo)
	refreshService := service.NewRefreshService(feedRepo, entryRepo, nil)

	folderHandler := handler.NewFolderHandler(folderService)
	feedHandler := handler.NewFeedHandler(feedService)
	entryHandler := handler.NewEntryHandler(entryService, readabilityService)
	opmlHandler := handler.NewOPMLHandler(opmlService)

	router := transport.NewRouter(folderHandler, feedHandler, entryHandler, opmlHandler, cfg.StaticDir)

	// Start background scheduler (15 minutes interval)
	sched := scheduler.New(refreshService, 15*time.Minute)
	sched.Start()

	// Handle graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("shutting down...")
		sched.Stop()
		os.Exit(0)
	}()

	if err := router.Start(cfg.Addr); err != nil {
		log.Fatalf("start server: %v", err)
	}
}
