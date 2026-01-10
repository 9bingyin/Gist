package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
	"golang.org/x/sync/semaphore"

	"gist/backend/internal/config"
	"gist/backend/internal/logger"
	"gist/backend/internal/model"
	"gist/backend/internal/network"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/anubis"
)

const refreshTimeout = 30 * time.Second

const (
	// maxConcurrentRefresh limits parallel feed refreshes to avoid overwhelming
	// the network and remote servers.
	maxConcurrentRefresh = 8
	// maxConcurrentPerHost limits parallel requests to the same host to be polite.
	maxConcurrentPerHost = 1
)

// hostRateLimiter manages per-host concurrency and rate limits.
type hostRateLimiter struct {
	mu          sync.Mutex
	semaphores  map[string]*semaphore.Weighted
	lastRequest map[string]time.Time
	getInterval func(host string) time.Duration
}

func newHostRateLimiter(getInterval func(host string) time.Duration) *hostRateLimiter {
	return &hostRateLimiter{
		semaphores:  make(map[string]*semaphore.Weighted),
		lastRequest: make(map[string]time.Time),
		getInterval: getInterval,
	}
}

// acquireSemaphore acquires the per-host semaphore to ensure serial execution for the same host.
// This does NOT occupy global concurrency slots, allowing different hosts to queue in parallel.
func (h *hostRateLimiter) acquireSemaphore(ctx context.Context, host string) error {
	h.mu.Lock()
	sem, ok := h.semaphores[host]
	if !ok {
		sem = semaphore.NewWeighted(maxConcurrentPerHost)
		h.semaphores[host] = sem
	}
	h.mu.Unlock()

	return sem.Acquire(ctx, 1)
}

// releaseSemaphore releases the per-host semaphore.
func (h *hostRateLimiter) releaseSemaphore(host string) {
	h.mu.Lock()
	if sem, ok := h.semaphores[host]; ok {
		sem.Release(1)
	}
	h.mu.Unlock()
}

// waitForInterval waits until the configured interval has passed since the last request.
// This should be called AFTER acquiring the per-host semaphore to ensure serial waiting.
func (h *hostRateLimiter) waitForInterval(ctx context.Context, host string) error {
	interval := h.getInterval(host)
	if interval <= 0 {
		return nil
	}

	h.mu.Lock()
	lastReq, exists := h.lastRequest[host]
	h.mu.Unlock()

	if exists {
		elapsed := time.Since(lastReq)
		if elapsed < interval {
			waitTime := interval - elapsed
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(waitTime):
			}
		}
	}
	return nil
}

// recordRequest records the current time as the last request time for the host.
func (h *hostRateLimiter) recordRequest(host string) {
	h.mu.Lock()
	h.lastRequest[host] = time.Now()
	h.mu.Unlock()
}

var ErrAlreadyRefreshing = errors.New("refresh already in progress")

type RefreshService interface {
	RefreshAll(ctx context.Context) error
	RefreshFeed(ctx context.Context, feedID int64) error
	RefreshFeeds(ctx context.Context, feedIDs []int64) error
	IsRefreshing() bool
}

type refreshService struct {
	feeds          repository.FeedRepository
	entries        repository.EntryRepository
	settings       SettingsService
	icons          IconService
	clientFactory  *network.ClientFactory
	anubis         *anubis.Solver
	rateLimitSvc   DomainRateLimitService
	mu             sync.Mutex
	isRefreshing   bool
}

func NewRefreshService(feeds repository.FeedRepository, entries repository.EntryRepository, settings SettingsService, icons IconService, clientFactory *network.ClientFactory, anubisSolver *anubis.Solver, rateLimitSvc DomainRateLimitService) RefreshService {
	return &refreshService{
		feeds:         feeds,
		entries:       entries,
		settings:      settings,
		icons:         icons,
		clientFactory: clientFactory,
		anubis:        anubisSolver,
		rateLimitSvc:  rateLimitSvc,
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

	// Global concurrency limit for actual network requests
	globalSem := semaphore.NewWeighted(maxConcurrentRefresh)

	// Per-host rate limiter to avoid overwhelming single servers
	hl := newHostRateLimiter(func(host string) time.Duration {
		if s.rateLimitSvc != nil {
			return s.rateLimitSvc.GetIntervalDuration(ctx, host)
		}
		return 0
	})

	// Use WaitGroup instead of errgroup to allow all goroutines to start immediately.
	// This prevents different hosts from blocking each other while waiting for rate limits.
	var wg sync.WaitGroup
	for _, feed := range feeds {
		feed := feed // capture loop variable
		wg.Add(1)
		go func() {
			defer wg.Done()

			// Extract host for per-host limiting
			host := extractHost(feed.URL)

			// Step 1: Acquire per-host semaphore (queue for same-host requests)
			// This does NOT occupy global slots, so different hosts can queue in parallel
			if host != "" {
				if err := hl.acquireSemaphore(ctx, host); err != nil {
					return // context cancelled
				}
				defer hl.releaseSemaphore(host)

				// Step 2: Wait for rate limit interval (still not occupying global slots)
				if err := hl.waitForInterval(ctx, host); err != nil {
					return // context cancelled
				}
			}

			// Step 3: Acquire global concurrency permit (only when actually making request)
			if err := globalSem.Acquire(ctx, 1); err != nil {
				return // context cancelled
			}
			defer globalSem.Release(1)

			// Step 4: Record request time for rate limiting
			if host != "" {
				hl.recordRequest(host)
			}

			// Step 5: Execute refresh
			if err := s.refreshFeedInternal(ctx, feed); err != nil {
				logger.Warn("refresh feed", "feedID", feed.ID, "title", feed.Title, "error", err)
			}
		}()
	}

	// Wait for all goroutines to complete
	wg.Wait()
	return nil
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

func (s *refreshService) RefreshFeeds(ctx context.Context, feedIDs []int64) error {
	if len(feedIDs) == 0 {
		return nil
	}

	// Get all feeds by IDs in a single query
	feeds, err := s.feeds.GetByIDs(ctx, feedIDs)
	if err != nil {
		logger.Error("get feeds by ids", "error", err)
		return err
	}

	if len(feeds) == 0 {
		return nil
	}

	// Global concurrency limit for actual network requests
	globalSem := semaphore.NewWeighted(maxConcurrentRefresh)

	// Per-host rate limiter to avoid overwhelming single servers
	hl := newHostRateLimiter(func(host string) time.Duration {
		if s.rateLimitSvc != nil {
			return s.rateLimitSvc.GetIntervalDuration(ctx, host)
		}
		return 0
	})

	// Use WaitGroup instead of errgroup to allow all goroutines to start immediately.
	// This prevents different hosts from blocking each other while waiting for rate limits.
	var wg sync.WaitGroup
	for _, feed := range feeds {
		feed := feed // capture loop variable
		wg.Add(1)
		go func() {
			defer wg.Done()

			// Extract host for per-host limiting
			host := extractHost(feed.URL)

			// Step 1: Acquire per-host semaphore (queue for same-host requests)
			if host != "" {
				if err := hl.acquireSemaphore(ctx, host); err != nil {
					return // context cancelled
				}
				defer hl.releaseSemaphore(host)

				// Step 2: Wait for rate limit interval
				if err := hl.waitForInterval(ctx, host); err != nil {
					return // context cancelled
				}
			}

			// Step 3: Acquire global concurrency permit
			if err := globalSem.Acquire(ctx, 1); err != nil {
				return // context cancelled
			}
			defer globalSem.Release(1)

			// Step 4: Record request time for rate limiting
			if host != "" {
				hl.recordRequest(host)
			}

			// Step 5: Execute refresh
			if err := s.refreshFeedInternal(ctx, feed); err != nil {
				logger.Warn("refresh feed", "feedID", feed.ID, "title", feed.Title, "error", err)
			}
		}()
	}

	wg.Wait()
	return nil
}

func (s *refreshService) refreshFeedInternal(ctx context.Context, feed model.Feed) error {
	return s.refreshFeedWithUA(ctx, feed, config.DefaultUserAgent, true)
}

func (s *refreshService) refreshFeedWithUA(ctx context.Context, feed model.Feed, userAgent string, allowFallback bool) error {
	return s.refreshFeedWithCookie(ctx, feed, userAgent, "", allowFallback, 0)
}

func (s *refreshService) refreshFeedWithCookie(ctx context.Context, feed model.Feed, userAgent string, cookie string, allowFallback bool, retryCount int) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}
	req.Header.Set("User-Agent", userAgent)

	// Add cached Anubis cookie if available
	if cookie == "" && s.anubis != nil {
		host := extractHost(feed.URL)
		if cachedCookie := s.anubis.GetCachedCookie(ctx, host); cachedCookie != "" {
			cookie = cachedCookie
		}
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	// Conditional GET
	if feed.ETag != nil && *feed.ETag != "" {
		req.Header.Set("If-None-Match", *feed.ETag)
	}
	if feed.LastModified != nil && *feed.LastModified != "" {
		req.Header.Set("If-Modified-Since", *feed.LastModified)
	}

	httpClient := s.clientFactory.NewHTTPClient(ctx, refreshTimeout)
	resp, err := httpClient.Do(req)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}
	defer resp.Body.Close()

	// Not modified, skip parsing but clear any previous error
	if resp.StatusCode == http.StatusNotModified {
		logger.Debug("feed not modified", "feedID", feed.ID, "title", feed.Title)
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
		return nil
	}

	// On HTTP error, try fallback UA if available
	if resp.StatusCode >= http.StatusBadRequest && allowFallback && s.settings != nil {
		fallbackUA := s.settings.GetFallbackUserAgent(ctx)
		if fallbackUA != "" {
			logger.Info("retrying with fallback UA", "feedID", feed.ID, "title", feed.Title, "statusCode", resp.StatusCode)
			return s.refreshFeedWithCookie(ctx, feed, fallbackUA, cookie, false, retryCount)
		}
	}

	if resp.StatusCode >= http.StatusBadRequest {
		logger.Info("feed HTTP error", "feedID", feed.ID, "title", feed.Title, "statusCode", resp.StatusCode)
		errMsg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return nil
	}

	// Read body into memory for Anubis detection and RSS parsing
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}

	parser := gofeed.NewParser()
	parsed, parseErr := parser.Parse(bytes.NewReader(body))
	if parseErr != nil {
		// Parse failed, check if it's an Anubis page
		if s.anubis != nil && anubis.IsAnubisPage(body) {
			// Check if it's a rejection (not solvable)
			if !anubis.IsAnubisChallenge(body) {
				errMsg := "upstream rejected"
				_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
				return errors.New(errMsg)
			}
			// It's a solvable challenge
			if retryCount >= 2 {
				// Too many retries, give up
				errMsg := fmt.Sprintf("anubis challenge persists after %d retries", retryCount)
				_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
				return errors.New(errMsg)
			}
			newCookie, solveErr := s.anubis.SolveFromBody(ctx, body, feed.URL, resp.Cookies())
			if solveErr != nil {
				errMsg := fmt.Sprintf("anubis solve failed: %v", solveErr)
				_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
				return solveErr
			}
			// Retry with fresh client to avoid connection reuse
			return s.refreshFeedWithFreshClient(ctx, feed, userAgent, newCookie, retryCount+1)
		}
		errMsg := parseErr.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return parseErr
	}

	// Clear error message on successful refresh (always clear, not just when feed.ErrorMessage != nil,
	// because the error might have been set earlier in this refresh cycle)
	_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
	feed.ErrorMessage = nil

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
			logger.Warn("update feed etag", "feedID", feed.ID, "error", err)
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
			logger.Warn("check entry exists", "error", err)
			continue
		}

		if err := s.entries.CreateOrUpdate(ctx, entry); err != nil {
			logger.Warn("save entry", "error", err)
			continue
		}

		if exists {
			updatedCount++
		} else {
			newCount++
		}
	}

	if newCount > 0 || updatedCount > 0 {
		logger.Info("feed refreshed", "feedID", feed.ID, "title", feed.Title, "new", newCount, "updated", updatedCount)
	}

	// Fetch icon if feed doesn't have one
	if s.icons != nil && (feed.IconPath == nil || *feed.IconPath == "") {
		imageURL := ""
		if parsed.Image != nil {
			imageURL = strings.TrimSpace(parsed.Image.URL)
		}
		siteURL := feed.URL
		if feed.SiteURL != nil && *feed.SiteURL != "" {
			siteURL = *feed.SiteURL
		}
		if iconPath, err := s.icons.FetchAndSaveIcon(ctx, imageURL, siteURL); err == nil && iconPath != "" {
			_ = s.feeds.UpdateIconPath(ctx, feed.ID, iconPath)
		}
	}

	return nil
}

// refreshFeedWithFreshClient creates a new http.Client to avoid connection reuse after Anubis
func (s *refreshService) refreshFeedWithFreshClient(ctx context.Context, feed model.Feed, userAgent string, cookie string, retryCount int) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}
	req.Header.Set("User-Agent", userAgent)
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	// Use fresh client to avoid connection reuse
	freshClient := s.clientFactory.NewHTTPClient(ctx, refreshTimeout)
	resp, err := freshClient.Do(req)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		logger.Info("feed HTTP error", "feedID", feed.ID, "title", feed.Title, "statusCode", resp.StatusCode)
		errMsg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}

	// Check if still getting Anubis (shouldn't happen with fresh connection)
	if s.anubis != nil && anubis.IsAnubisPage(body) {
		var errMsg string
		if !anubis.IsAnubisChallenge(body) {
			errMsg = "upstream rejected"
		} else {
			errMsg = fmt.Sprintf("anubis challenge persists after %d retries", retryCount)
		}
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return errors.New(errMsg)
	}

	parser := gofeed.NewParser()
	parsed, parseErr := parser.Parse(bytes.NewReader(body))
	if parseErr != nil {
		errMsg := parseErr.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return parseErr
	}

	// Clear error message on successful refresh (always clear, not just when feed.ErrorMessage != nil,
	// because the error might have been set earlier in this refresh cycle)
	_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
	feed.ErrorMessage = nil

	// Update feed ETag and LastModified
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
			logger.Warn("update feed etag", "feedID", feed.ID, "error", err)
		}
	}

	// Save entries
	newCount := 0
	updatedCount := 0
	dynamicTime := hasDynamicTime(parsed.Items)
	for _, item := range parsed.Items {
		entry := itemToEntry(feed.ID, item, dynamicTime)
		if entry.URL == nil || *entry.URL == "" {
			continue
		}

		exists, err := s.entries.ExistsByURL(ctx, feed.ID, *entry.URL)
		if err != nil {
			logger.Warn("check entry exists", "error", err)
			continue
		}

		if err := s.entries.CreateOrUpdate(ctx, entry); err != nil {
			logger.Warn("save entry", "error", err)
			continue
		}

		if exists {
			updatedCount++
		} else {
			newCount++
		}
	}

	if newCount > 0 || updatedCount > 0 {
		logger.Info("feed refreshed", "feedID", feed.ID, "title", feed.Title, "new", newCount, "updated", updatedCount)
	}

	// Fetch icon if feed doesn't have one
	if s.icons != nil && (feed.IconPath == nil || *feed.IconPath == "") {
		imageURL := ""
		if parsed.Image != nil {
			imageURL = strings.TrimSpace(parsed.Image.URL)
		}
		siteURL := feed.URL
		if feed.SiteURL != nil && *feed.SiteURL != "" {
			siteURL = *feed.SiteURL
		}
		if iconPath, err := s.icons.FetchAndSaveIcon(ctx, imageURL, siteURL); err == nil && iconPath != "" {
			_ = s.feeds.UpdateIconPath(ctx, feed.ID, iconPath)
		}
	}

	return nil
}
