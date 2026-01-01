package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/semaphore"

	"gist/backend/internal/config"
	"gist/backend/internal/model"
	"gist/backend/internal/repository"
)

const (
	// maxConcurrentRefresh limits parallel feed refreshes to avoid overwhelming
	// the network and remote servers.
	maxConcurrentRefresh = 8
	// maxConcurrentPerHost limits parallel requests to the same host to be polite.
	maxConcurrentPerHost = 1
)

// hostLimiter manages per-host concurrency limits.
type hostLimiter struct {
	mu       sync.Mutex
	limiters map[string]*semaphore.Weighted
}

func newHostLimiter() *hostLimiter {
	return &hostLimiter{
		limiters: make(map[string]*semaphore.Weighted),
	}
}

func (h *hostLimiter) acquire(ctx context.Context, host string) error {
	h.mu.Lock()
	sem, ok := h.limiters[host]
	if !ok {
		sem = semaphore.NewWeighted(maxConcurrentPerHost)
		h.limiters[host] = sem
	}
	h.mu.Unlock()
	return sem.Acquire(ctx, 1)
}

func (h *hostLimiter) release(host string) {
	h.mu.Lock()
	if sem, ok := h.limiters[host]; ok {
		sem.Release(1)
	}
	h.mu.Unlock()
}

var ErrAlreadyRefreshing = errors.New("refresh already in progress")

type RefreshService interface {
	RefreshAll(ctx context.Context) error
	RefreshFeed(ctx context.Context, feedID int64) error
	IsRefreshing() bool
}

type refreshService struct {
	feeds        repository.FeedRepository
	entries      repository.EntryRepository
	settings     SettingsService
	httpClient   *http.Client
	mu           sync.Mutex
	isRefreshing bool
}

func NewRefreshService(feeds repository.FeedRepository, entries repository.EntryRepository, settings SettingsService, httpClient *http.Client) RefreshService {
	client := httpClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &refreshService{
		feeds:      feeds,
		entries:    entries,
		settings:   settings,
		httpClient: client,
	}
}

func (s *refreshService) RefreshAll(ctx context.Context) error {
	s.mu.Lock()
	if s.isRefreshing {
		s.mu.Unlock()
		return ErrAlreadyRefreshing
	}
	s.isRefreshing = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.isRefreshing = false
		s.mu.Unlock()
	}()

	feeds, err := s.feeds.List(ctx, nil)
	if err != nil {
		return err
	}

	// Use errgroup for parallel refresh with concurrency limit
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(maxConcurrentRefresh)

	// Per-host limiter to avoid overwhelming single servers
	hl := newHostLimiter()

	for _, feed := range feeds {
		feed := feed // capture loop variable
		g.Go(func() error {
			// Extract host for per-host limiting
			host := extractHost(feed.URL)
			if host != "" {
				if err := hl.acquire(ctx, host); err != nil {
					return nil // context cancelled
				}
				defer hl.release(host)
			}

			if err := s.refreshFeedInternal(ctx, feed); err != nil {
				log.Printf("refresh feed %d (%s): %v", feed.ID, feed.Title, err)
				// Don't return error to continue refreshing other feeds
			}
			return nil
		})
	}

	// Wait for all goroutines to complete
	return g.Wait()
}

// extractHost returns the host from a URL string.
func extractHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Host
}

func (s *refreshService) IsRefreshing() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.isRefreshing
}

func (s *refreshService) RefreshFeed(ctx context.Context, feedID int64) error {
	feed, err := s.feeds.GetByID(ctx, feedID)
	if err != nil {
		return err
	}
	return s.refreshFeedInternal(ctx, feed)
}

func (s *refreshService) refreshFeedInternal(ctx context.Context, feed model.Feed) error {
	return s.refreshFeedWithUA(ctx, feed, config.DefaultUserAgent, true)
}

func (s *refreshService) refreshFeedWithUA(ctx context.Context, feed model.Feed, userAgent string, allowFallback bool) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}
	req.Header.Set("User-Agent", userAgent)

	// Conditional GET
	if feed.ETag != nil && *feed.ETag != "" {
		req.Header.Set("If-None-Match", *feed.ETag)
	}
	if feed.LastModified != nil && *feed.LastModified != "" {
		req.Header.Set("If-Modified-Since", *feed.LastModified)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}
	defer resp.Body.Close()

	// Not modified, skip parsing but clear error if any
	if resp.StatusCode == http.StatusNotModified {
		log.Printf("feed %d (%s): not modified", feed.ID, feed.Title)
		if feed.ErrorMessage != nil {
			_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
		}
		return nil
	}

	// On HTTP error, try fallback UA if available
	if resp.StatusCode >= http.StatusBadRequest && allowFallback && s.settings != nil {
		fallbackUA := s.settings.GetFallbackUserAgent(ctx)
		if fallbackUA != "" {
			log.Printf("feed %d (%s): HTTP %d, retrying with fallback UA", feed.ID, feed.Title, resp.StatusCode)
			return s.refreshFeedWithUA(ctx, feed, fallbackUA, false)
		}
	}

	if resp.StatusCode >= http.StatusBadRequest {
		log.Printf("feed %d (%s): HTTP %d", feed.ID, feed.Title, resp.StatusCode)
		errMsg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return nil
	}

	parser := gofeed.NewParser()
	parsed, err := parser.Parse(resp.Body)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}

	// Clear error message on successful refresh
	if feed.ErrorMessage != nil {
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
	}

	// Update feed ETag and LastModified (only update non-empty values to preserve existing ones)
	newETag := strings.TrimSpace(resp.Header.Get("ETag"))
	newLastModified := strings.TrimSpace(resp.Header.Get("Last-Modified"))
	needsUpdate := false
	if newETag != "" {
		feed.ETag = &newETag
		needsUpdate = true
	}
	if newLastModified != "" {
		feed.LastModified = &newLastModified
		needsUpdate = true
	}
	if needsUpdate {
		if _, err := s.feeds.Update(ctx, feed); err != nil {
			log.Printf("update feed %d etag: %v", feed.ID, err)
		}
	}

	// Save entries (CreateOrUpdate handles duplicates via ON CONFLICT)
	newCount := 0
	updatedCount := 0
	dynamicTime := hasDynamicTime(parsed.Items)
	for _, item := range parsed.Items {
		entry := itemToEntry(feed.ID, item, dynamicTime)
		if entry.URL == nil || *entry.URL == "" {
			continue
		}

		// Check if entry already exists
		exists, err := s.entries.ExistsByURL(ctx, feed.ID, *entry.URL)
		if err != nil {
			log.Printf("check entry exists: %v", err)
			continue
		}

		if err := s.entries.CreateOrUpdate(ctx, entry); err != nil {
			log.Printf("save entry: %v", err)
			continue
		}

		if exists {
			updatedCount++
		} else {
			newCount++
		}
	}

	if newCount > 0 || updatedCount > 0 {
		log.Printf("feed %d (%s): %d new, %d updated", feed.ID, feed.Title, newCount, updatedCount)
	}
	return nil
}

