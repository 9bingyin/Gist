package scheduler

import (
	"context"
	"sync"
	"time"

	"gist/backend/pkg/logger"
	"gist/backend/internal/service"
)

type Scheduler struct {
	refreshService service.RefreshService
	interval       time.Duration
	stopCh         chan struct{}
	wg             sync.WaitGroup
	cancelFunc     context.CancelFunc // cancels the current refresh operation
	mu             sync.Mutex         // protects cancelFunc
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
	logger.Info("scheduler started", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "ok", "interval_ms", s.interval.Milliseconds())
}

func (s *Scheduler) Stop() {
	// Cancel any ongoing refresh operation first
	s.mu.Lock()
	if s.cancelFunc != nil {
		s.cancelFunc()
	}
	s.mu.Unlock()

	close(s.stopCh)
	s.wg.Wait()
	logger.Info("scheduler stopped", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "ok")
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
	// Use the same timeout as the refresh interval
	ctx, cancel := context.WithTimeout(context.Background(), s.interval)

	// Store cancel function so Stop() can cancel ongoing refresh
	s.mu.Lock()
	s.cancelFunc = cancel
	s.mu.Unlock()

	defer func() {
		cancel()
		s.mu.Lock()
		s.cancelFunc = nil
		s.mu.Unlock()
	}()

	logger.Info("scheduled feed refresh started", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "ok")
	if err := s.refreshService.RefreshAll(ctx); err != nil {
		if ctx.Err() != nil {
			logger.Warn("scheduled refresh cancelled", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "cancelled")
			return
		}
		logger.Error("scheduled refresh failed", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "failed", "error", err)
	}
	logger.Info("scheduled feed refresh completed", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "ok")
}
