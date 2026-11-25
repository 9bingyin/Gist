package scheduler

import (
	"context"
	"sync"
	"time"

	"gist/backend/internal/service"
	"gist/backend/pkg/logger"
)

const defaultRefreshInterval = 15 * time.Minute

type Scheduler struct {
	refreshService service.RefreshService
	interval       time.Duration
	ctx            context.Context
	cancel         context.CancelFunc
	wg             sync.WaitGroup
	startOnce      sync.Once
	stopOnce       sync.Once
}

func New(refreshService service.RefreshService, interval time.Duration) *Scheduler {
	if interval <= 0 {
		interval = defaultRefreshInterval
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Scheduler{
		refreshService: refreshService,
		interval:       interval,
		ctx:            ctx,
		cancel:         cancel,
	}
}

func (s *Scheduler) Start() {
	s.startOnce.Do(func() {
		s.wg.Add(1)
		go s.run()
		logger.Info("scheduler started", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "ok", "interval_ms", s.interval.Milliseconds())
	})
}

func (s *Scheduler) Stop() {
	s.stopOnce.Do(func() {
		s.cancel()
		s.wg.Wait()
		logger.Info("scheduler stopped", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "ok")
	})
}

func (s *Scheduler) run() {
	defer s.wg.Done()

	// Run immediately on start.
	s.refresh()

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.refresh()
		case <-s.ctx.Done():
			return
		}
	}
}

func (s *Scheduler) refresh() {
	if s.ctx.Err() != nil {
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, s.interval)
	defer cancel()

	logger.Info("scheduled feed refresh started", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "ok")
	if err := s.refreshService.RefreshAll(ctx); err != nil {
		if ctx.Err() != nil {
			logger.Warn("scheduled refresh cancelled", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "cancelled")
			return
		}
		logger.Error("scheduled refresh failed", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "failed", "error", err)
		return
	}
	logger.Info("scheduled feed refresh completed", "module", "scheduler", "action", "refresh", "resource", "feed", "result", "ok")
}
