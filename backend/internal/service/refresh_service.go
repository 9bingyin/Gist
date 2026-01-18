//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
	"golang.org/x/sync/semaphore"

	"gist/backend/internal/config"
	"gist/backend/pkg/logger"
	"gist/backend/internal/model"
	"gist/backend/pkg/network"
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

// processParsedFeed handles the common logic after successfully parsing a feed.
// It clears error messages, updates ETag/LastModified, saves entries, and fetches icons.
func (s *refreshService) processParsedFeed(ctx context.Context, feed model.Feed, parsed *gofeed.Feed, resp *http.Response) error {
	// Clear error message on successful refresh
	feed.ErrorMessage = nil
	_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)

	// Update feed ETag and LastModified (only update non-empty values)
	newETag := strings.TrimSpace(resp.Header.Get("ETag"))
	newLastModified := strings.TrimSpace(resp.Header.Get("Last-Modified"))
	if newETag != "" || newLastModified != "" {
		if newETag != "" {
			feed.ETag = &newETag
		}
		if newLastModified != "" {
			feed.LastModified = &newLastModified
		}
		if _, err := s.feeds.Update(ctx, feed); err != nil {
			logger.Warn("update feed etag failed", "module", "service", "action", "update", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "error", err)
		}
	}

	// Save entries
	newCount, updatedCount := s.saveEntries(ctx, feed.ID, parsed.Items)
	if newCount > 0 || updatedCount > 0 {
		logger.Info("feed refreshed", "module", "service", "action", "refresh", "resource", "feed", "result", "ok", "feed_id", feed.ID, "feed_title", feed.Title, "new", newCount, "updated", updatedCount)
	}

	// Backfill siteURL if empty (for feeds added before siteURL was implemented)
	if (feed.SiteURL == nil || *feed.SiteURL == "") && parsed.Link != "" {
		newSiteURL := strings.TrimSpace(parsed.Link)
		if newSiteURL != "" {
			_ = s.feeds.UpdateSiteURL(ctx, feed.ID, newSiteURL)
			feed.SiteURL = &newSiteURL
		}
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

// saveEntries saves parsed feed items to the database.
// Returns the count of new and updated entries.
func (s *refreshService) saveEntries(ctx context.Context, feedID int64, items []*gofeed.Item) (newCount, updatedCount int) {
	dynamicTime := hasDynamicTime(items)
	for _, item := range items {
		entry := itemToEntry(feedID, item, dynamicTime)
		if entry.URL == nil || *entry.URL == "" {
			continue
		}

		exists, err := s.entries.ExistsByURL(ctx, feedID, *entry.URL)
		if err != nil {
			logger.Warn("check entry exists failed", "module", "service", "action", "list", "resource", "entry", "result", "failed", "error", err)
			continue
		}

		if err := s.entries.CreateOrUpdate(ctx, entry); err != nil {
			logger.Warn("save entry failed", "module", "service", "action", "save", "resource", "entry", "result", "failed", "error", err)
			continue
		}

		if exists {
			updatedCount++
		} else {
			newCount++
		}
	}
	return
}

var ErrAlreadyRefreshing = errors.New("refresh already in progress")

type RefreshService interface {
	RefreshAll(ctx context.Context) error
	RefreshFeed(ctx context.Context, feedID int64) error
	RefreshFeeds(ctx context.Context, feedIDs []int64) error
	IsRefreshing() bool
}

type refreshService struct {
	feeds         repository.FeedRepository
	entries       repository.EntryRepository
	settings      SettingsService
	icons         IconService
	clientFactory *network.ClientFactory
	anubis        *anubis.Solver
	rateLimitSvc  DomainRateLimitService
	mu            sync.Mutex
	isRefreshing  bool
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
		logger.Error("refresh list feeds", "module", "service", "action", "list", "resource", "feed", "result", "failed", "error", err)
		return err
	}

	logger.Info("refresh started", "module", "service", "action", "refresh", "resource", "feed", "result", "ok", "count", len(feeds))
	s.refreshFeedsWithRateLimit(ctx, feeds)
	logger.Info("refresh completed", "module", "service", "action", "refresh", "resource", "feed", "result", "ok", "count", len(feeds))
	return nil
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
		logger.Error("get feeds by ids", "module", "service", "action", "list", "resource", "feed", "result", "failed", "error", err)
		return err
	}

	if len(feeds) == 0 {
		return nil
	}

	s.refreshFeedsWithRateLimit(ctx, feeds)
	return nil
}

// refreshFeedsWithRateLimit refreshes multiple feeds with rate limiting and concurrency control.
func (s *refreshService) refreshFeedsWithRateLimit(ctx context.Context, feeds []model.Feed) {
	globalSem := semaphore.NewWeighted(maxConcurrentRefresh)

	hl := newHostRateLimiter(func(host string) time.Duration {
		if s.rateLimitSvc != nil {
			return s.rateLimitSvc.GetIntervalDuration(ctx, host)
		}
		return 0
	})

	var wg sync.WaitGroup
	for _, feed := range feeds {
		feed := feed
		wg.Add(1)
		go func() {
			defer wg.Done()

			host := network.ExtractHost(feed.URL)

			if host != "" {
				if err := hl.acquireSemaphore(ctx, host); err != nil {
					logger.Debug("refresh host acquire cancelled", "module", "service", "action", "refresh", "resource", "feed", "result", "cancelled", "host", host, "error", err)
					return
				}
				defer hl.releaseSemaphore(host)

				if err := hl.waitForInterval(ctx, host); err != nil {
					logger.Debug("refresh host wait cancelled", "module", "service", "action", "refresh", "resource", "feed", "result", "cancelled", "host", host, "error", err)
					return
				}
			}

			if err := globalSem.Acquire(ctx, 1); err != nil {
				logger.Debug("refresh global acquire cancelled", "module", "service", "action", "refresh", "resource", "feed", "result", "cancelled", "host", host, "error", err)
				return
			}
			defer globalSem.Release(1)

			if host != "" {
				hl.recordRequest(host)
			}

			if err := s.refreshFeedInternal(ctx, feed); err != nil {
				logger.Error("refresh feed failed", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "error", err)
			}
		}()
	}

	wg.Wait()
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
		host := network.ExtractHost(feed.URL)
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
		logger.Debug("feed not modified", "module", "service", "action", "refresh", "resource", "feed", "result", "skipped", "feed_id", feed.ID, "host", network.ExtractHost(feed.URL))
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
		return nil
	}

	// On HTTP error, try fallback UA if available
	if resp.StatusCode >= http.StatusBadRequest && allowFallback && s.settings != nil {
		fallbackUA := s.settings.GetFallbackUserAgent(ctx)
		if fallbackUA != "" {
			logger.Warn("retrying with fallback ua", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "status_code", resp.StatusCode)
			return s.refreshFeedWithCookie(ctx, feed, fallbackUA, cookie, false, retryCount)
		}
	}

	if resp.StatusCode >= http.StatusBadRequest {
		logger.Error("feed http error", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "status_code", resp.StatusCode)
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

	return s.processParsedFeed(ctx, feed, parsed, resp)
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
		logger.Error("feed http error", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "status_code", resp.StatusCode)
		errMsg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Error("feed refresh read failed", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "error", err)
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

	return s.processParsedFeed(ctx, feed, parsed, resp)
}
