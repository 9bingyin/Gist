package scheduler

import (
	"context"
	"log"
	"sync"
	"time"

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
	log.Printf("scheduler started with interval %v", s.interval)
}

func (s *Scheduler) Stop() {
	close(s.stopCh)
	s.wg.Wait()
	log.Println("scheduler stopped")
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

	log.Println("starting scheduled feed refresh")
	if err := s.refreshService.RefreshAll(ctx); err != nil {
		log.Printf("scheduled refresh error: %v", err)
	}
	log.Println("scheduled feed refresh completed")
}
