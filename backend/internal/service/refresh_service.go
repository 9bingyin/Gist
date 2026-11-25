//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
	"golang.org/x/sync/semaphore"

	"gist/backend/internal/config"
	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const (
	refreshTimeout       = 30 * time.Second
	maxConcurrentRefresh = 8
	maxConcurrentPerHost = 1
)

// hostRateLimiter manages per-host serialization and request intervals across all refreshes.
type hostRateLimiter struct {
	mu          sync.Mutex
	semaphores  map[string]*semaphore.Weighted
	lastRequest map[string]time.Time
}

func newHostRateLimiter() *hostRateLimiter {
	return &hostRateLimiter{
		semaphores:  make(map[string]*semaphore.Weighted),
		lastRequest: make(map[string]time.Time),
	}
}

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

func (h *hostRateLimiter) releaseSemaphore(host string) {
	h.mu.Lock()
	if sem, ok := h.semaphores[host]; ok {
		sem.Release(1)
	}
	h.mu.Unlock()
}

func (h *hostRateLimiter) waitForInterval(ctx context.Context, host string, interval time.Duration) error {
	if interval <= 0 {
		return nil
	}

	h.mu.Lock()
	lastReq, exists := h.lastRequest[host]
	h.mu.Unlock()

	if exists {
		elapsed := time.Since(lastReq)
		if elapsed < interval {
			timer := time.NewTimer(interval - elapsed)
			defer timer.Stop()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-timer.C:
			}
		}
	}
	return nil
}

func (h *hostRateLimiter) recordRequest(host string) {
	h.mu.Lock()
	h.lastRequest[host] = time.Now()
	h.mu.Unlock()
}

var ErrAlreadyRefreshing = errors.New("refresh already in progress")

// RefreshStatus holds the current state of the feed refresh process.
type RefreshStatus struct {
	IsRefreshing    bool
	LastRefreshedAt *time.Time
}

type RefreshService interface {
	RefreshAll(ctx context.Context) error
	StartRefreshAll() error
	RefreshFeed(ctx context.Context, feedID int64) error
	RefreshFeeds(ctx context.Context, feedIDs []int64) error
	IsRefreshing() bool
	GetRefreshStatus() RefreshStatus
	Shutdown()
}

type refreshService struct {
	feeds           repository.FeedRepository
	entries         repository.EntryRepository
	settings        SettingsService
	icons           IconService
	clientFactory   *network.ClientFactory
	anubis          AnubisSolver
	rateLimitSvc    DomainRateLimitService
	globalSem       *semaphore.Weighted
	hostLimiter     *hostRateLimiter
	bgCtx           context.Context
	bgCancel        context.CancelFunc
	bgWG            sync.WaitGroup
	mu              sync.Mutex
	isRefreshing    bool
	lastRefreshedAt *time.Time
}

func NewRefreshService(
	feeds repository.FeedRepository,
	entries repository.EntryRepository,
	settings SettingsService,
	icons IconService,
	clientFactory *network.ClientFactory,
	anubisSolver AnubisSolver,
	rateLimitSvc DomainRateLimitService,
) RefreshService {
	bgCtx, bgCancel := context.WithCancel(context.Background())
	return &refreshService{
		feeds:         feeds,
		entries:       entries,
		settings:      settings,
		icons:         icons,
		clientFactory: clientFactory,
		anubis:        anubisSolver,
		rateLimitSvc:  rateLimitSvc,
		globalSem:     semaphore.NewWeighted(maxConcurrentRefresh),
		hostLimiter:   newHostRateLimiter(),
		bgCtx:         bgCtx,
		bgCancel:      bgCancel,
	}
}

func (s *refreshService) Shutdown() {
	s.bgCancel()
	s.bgWG.Wait()
}

// StartRefreshAll triggers an asynchronous RefreshAll bound to the service lifecycle context.
// Returns ErrAlreadyRefreshing if a refresh is already running.
func (s *refreshService) StartRefreshAll() error {
	s.mu.Lock()
	if s.isRefreshing {
		s.mu.Unlock()
		return ErrAlreadyRefreshing
	}
	s.isRefreshing = true
	s.mu.Unlock()

	s.bgWG.Go(func() {
		if err := s.runRefreshAllLocked(s.bgCtx); err != nil && !errors.Is(err, context.Canceled) {
			logger.Error("background refresh all failed", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "error", err)
		}
	})
	return nil
}

func (s *refreshService) RefreshAll(ctx context.Context) error {
	s.mu.Lock()
	if s.isRefreshing {
		s.mu.Unlock()
		return ErrAlreadyRefreshing
	}
	s.isRefreshing = true
	s.mu.Unlock()

	return s.runRefreshAllLocked(ctx)
}

func (s *refreshService) runRefreshAllLocked(ctx context.Context) error {
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

	now := time.Now().UTC()
	s.mu.Lock()
	s.lastRefreshedAt = &now
	s.mu.Unlock()

	return nil
}

func (s *refreshService) IsRefreshing() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.isRefreshing
}

func (s *refreshService) GetRefreshStatus() RefreshStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return RefreshStatus{
		IsRefreshing:    s.isRefreshing,
		LastRefreshedAt: s.lastRefreshedAt,
	}
}

func (s *refreshService) RefreshFeed(ctx context.Context, feedID int64) error {
	feed, err := s.feeds.GetByID(ctx, feedID)
	if err != nil {
		return err
	}

	host := strings.ToLower(network.ExtractHost(feed.URL))
	var interval time.Duration
	if host != "" && s.rateLimitSvc != nil {
		interval = s.rateLimitSvc.GetIntervalDuration(ctx, host)
	}
	return s.refreshFeedWithLimiter(ctx, feed, host, interval)
}

func (s *refreshService) RefreshFeeds(ctx context.Context, feedIDs []int64) error {
	if len(feedIDs) == 0 {
		return nil
	}

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

func (s *refreshService) loadRateLimits(ctx context.Context) map[string]time.Duration {
	if s.rateLimitSvc == nil {
		return nil
	}
	limits, err := s.rateLimitSvc.List(ctx)
	if err != nil {
		logger.Warn("load domain rate limits failed", "module", "service", "action", "list", "resource", "rate_limit", "result", "failed", "error", err)
		return nil
	}
	result := make(map[string]time.Duration, len(limits))
	for _, lim := range limits {
		if lim.IntervalSeconds > 0 {
			result[strings.ToLower(strings.TrimSpace(lim.Host))] = time.Duration(lim.IntervalSeconds) * time.Second
		}
	}
	return result
}

// refreshFeedsWithRateLimit uses a fixed worker pool and service-level limiters
// with a single up-front rate-limit table lookup.
func (s *refreshService) refreshFeedsWithRateLimit(ctx context.Context, feeds []model.Feed) {
	if len(feeds) == 0 {
		return
	}

	rateLimits := s.loadRateLimits(ctx)

	workerCount := min(maxConcurrentRefresh, len(feeds))
	jobs := make(chan model.Feed, len(feeds))
	for _, feed := range feeds {
		jobs <- feed
	}
	close(jobs)

	var wg sync.WaitGroup
	wg.Add(workerCount)
	for range workerCount {
		go func() {
			defer wg.Done()
			for feed := range jobs {
				if ctx.Err() != nil {
					return
				}
				host := strings.ToLower(network.ExtractHost(feed.URL))
				var interval time.Duration
				if host != "" && rateLimits != nil {
					interval = rateLimits[host]
				}
				if err := s.refreshFeedWithLimiter(ctx, feed, host, interval); err != nil {
					if ctx.Err() != nil {
						return
					}
					logger.Error("refresh feed failed", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "error", err)
				}
			}
		}()
	}

	wg.Wait()
}

func (s *refreshService) refreshFeedWithLimiter(ctx context.Context, feed model.Feed, host string, interval time.Duration) error {
	if host != "" {
		if err := s.hostLimiter.acquireSemaphore(ctx, host); err != nil {
			logger.Debug("refresh host acquire cancelled", "module", "service", "action", "refresh", "resource", "feed", "result", "cancelled", "host", host, "error", err)
			return err
		}
		defer s.hostLimiter.releaseSemaphore(host)

		if err := s.hostLimiter.waitForInterval(ctx, host, interval); err != nil {
			logger.Debug("refresh host wait cancelled", "module", "service", "action", "refresh", "resource", "feed", "result", "cancelled", "host", host, "error", err)
			return err
		}
	}

	if err := s.globalSem.Acquire(ctx, 1); err != nil {
		logger.Debug("refresh global acquire cancelled", "module", "service", "action", "refresh", "resource", "feed", "result", "cancelled", "host", host, "error", err)
		return err
	}
	defer s.globalSem.Release(1)

	if host != "" {
		s.hostLimiter.recordRequest(host)
	}

	return s.refreshFeedInternal(ctx, feed)
}

func (s *refreshService) refreshFeedInternal(ctx context.Context, feed model.Feed) error {
	var fallbackFn func(context.Context) string
	if s.settings != nil {
		fallbackFn = s.settings.GetFallbackUserAgent
	}

	var etag, lastModified string
	if feed.ETag != nil {
		etag = *feed.ETag
	}
	if feed.LastModified != nil {
		lastModified = *feed.LastModified
	}

	res, err := fetchHTTPWithAnubis(ctx, httpFetchOptions{
		URL:           feed.URL,
		Timeout:       refreshTimeout,
		MaxBodyBytes:  maxFeedBodyBytes,
		UserAgent:     config.DefaultUserAgent,
		FallbackUA:    fallbackFn,
		ETag:          etag,
		LastModified:  lastModified,
		AcceptNotMod:  true,
		ClientFactory: s.clientFactory,
		Anubis:        s.anubis,
		OnFallbackUA: func(statusCode int) {
			logger.Warn("retrying with fallback ua", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "status_code", statusCode)
		},
	})
	if err != nil {
		errMsg := err.Error()
		if errors.Is(err, ErrUpstreamRejected) {
			errMsg = "upstream rejected"
			err = errors.New(errMsg)
		}
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}

	if res.NotModified {
		logger.Debug("feed not modified", "module", "service", "action", "refresh", "resource", "feed", "result", "skipped", "feed_id", feed.ID, "host", network.ExtractHost(feed.URL))
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
		return nil
	}

	if res.StatusCode >= http.StatusBadRequest {
		logger.Error("feed http error", "module", "service", "action", "refresh", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "status_code", res.StatusCode)
		errMsg := fmt.Sprintf("HTTP %d", res.StatusCode)
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return nil
	}

	parsed, parseErr := gofeed.NewParser().Parse(bytes.NewReader(res.Body))
	if parseErr != nil {
		errMsg := parseErr.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return parseErr
	}

	return s.processParsedFeed(ctx, feed, parsed, res.Header)
}

func (s *refreshService) processParsedFeed(ctx context.Context, feed model.Feed, parsed *gofeed.Feed, header http.Header) error {
	newCount, updatedCount, err := s.saveEntries(ctx, feed.ID, parsed.Items)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}
	if newCount > 0 || updatedCount > 0 {
		logger.Info("feed refreshed", "module", "service", "action", "refresh", "resource", "feed", "result", "ok", "feed_id", feed.ID, "feed_title", feed.Title, "new", newCount, "updated", updatedCount)
	}

	_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)

	newETag := optionalString(header.Get("ETag"))
	newLastModified := optionalString(header.Get("Last-Modified"))
	if newETag != nil || newLastModified != nil {
		if err := s.feeds.UpdateConditionalGet(ctx, feed.ID, newETag, newLastModified); err != nil {
			logger.Warn("update feed conditional get failed", "module", "service", "action", "update", "resource", "feed", "result", "failed", "feed_id", feed.ID, "feed_title", feed.Title, "error", err)
		}
	}

	if (feed.SiteURL == nil || *feed.SiteURL == "") && parsed.Link != "" {
		newSiteURL := strings.TrimSpace(parsed.Link)
		if newSiteURL != "" {
			_ = s.feeds.UpdateSiteURL(ctx, feed.ID, newSiteURL)
			feed.SiteURL = &newSiteURL
		}
	}

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

// saveEntries saves parsed feed items in a single transaction, using a batched hash
// lookup to compute new/updated counts without N+1 queries.
func (s *refreshService) saveEntries(ctx context.Context, feedID int64, items []*gofeed.Item) (newCount, updatedCount int, err error) {
	entries := itemsToEntries(feedID, items)
	if len(entries) == 0 {
		return 0, 0, nil
	}

	hashes := make([]string, 0, len(entries))
	seenInBatch := make(map[string]struct{}, len(entries))
	for _, entry := range entries {
		if _, dup := seenInBatch[entry.Hash]; !dup {
			seenInBatch[entry.Hash] = struct{}{}
			hashes = append(hashes, entry.Hash)
		}
	}

	existingHashes, lookupErr := s.entries.GetExistingHashes(ctx, feedID, hashes)
	if lookupErr != nil {
		logger.Warn("check existing entry hashes failed", "module", "service", "action", "list", "resource", "entry", "result", "failed", "feed_id", feedID, "error", lookupErr)
		existingHashes = make(map[string]struct{})
	}

	if err := s.entries.CreateOrUpdateBatch(ctx, entries); err != nil {
		logger.Warn("save entries batch failed", "module", "service", "action", "save", "resource", "entry", "result", "failed", "feed_id", feedID, "count", len(entries), "error", err)
		return 0, 0, err
	}

	counted := make(map[string]struct{}, len(entries))
	for _, entry := range entries {
		if _, already := counted[entry.Hash]; already {
			updatedCount++
			continue
		}
		counted[entry.Hash] = struct{}{}
		if _, existed := existingHashes[entry.Hash]; existed {
			updatedCount++
		} else {
			newCount++
		}
	}
	return newCount, updatedCount, nil
}
