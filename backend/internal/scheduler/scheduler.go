package scheduler

import (
	"context"
	"sync"
	"time"

	"gist/backend/internal/logger"
	"gist/backend/internal/service"
)

type Scheduler struct {
	refreshService service.RefreshService
	interval       time.Duration
	stopCh         chan struct{}
	wg             sync.WaitGroup
}

func New(refreshService service.RefreshService, interval time.Duration) *Scheduler {
	return &Scheduler{
		refreshService: refreshService,
		interval:       interval,
		stopCh:         make(chan struct{}),
	}
}

func (s *Scheduler) Start() {
	s.wg.Add(1)
	go s.run()
	logger.Info("scheduler started", "interval", s.interval)
}

func (s *Scheduler) Stop() {
	close(s.stopCh)
	s.wg.Wait()
	logger.Info("scheduler stopped")
}

func (s *Scheduler) run() {
	defer s.wg.Done()

	// Run immediately on start
	s.refresh()

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.refresh()
		case <-s.stopCh:
			return
		}
	}
}

func (s *Scheduler) refresh() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	logger.Info("starting scheduled feed refresh")
	if err := s.refreshService.RefreshAll(ctx); err != nil {
		logger.Error("scheduled refresh", "error", err)
	}
	logger.Info("scheduled feed refresh completed")
}
