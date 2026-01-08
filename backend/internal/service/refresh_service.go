package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
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
	RefreshFeeds(ctx context.Context, feedIDs []int64) error
	IsRefreshing() bool
}

type refreshService struct {
	feeds        repository.FeedRepository
	entries      repository.EntryRepository
	settings     SettingsService
	icons        IconService
	httpClient   *http.Client
	anubis       *anubis.Solver
	mu           sync.Mutex
	isRefreshing bool
}

func NewRefreshService(feeds repository.FeedRepository, entries repository.EntryRepository, settings SettingsService, icons IconService, httpClient *http.Client, anubisSolver *anubis.Solver) RefreshService {
	client := httpClient
	if client == nil {
		client = &http.Client{Timeout: refreshTimeout}
	}
	return &refreshService{
		feeds:      feeds,
		entries:    entries,
		settings:   settings,
		icons:      icons,
		httpClient: client,
		anubis:     anubisSolver,
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

func (s *refreshService) RefreshFeeds(ctx context.Context, feedIDs []int64) error {
	if len(feedIDs) == 0 {
		return nil
	}

	// Get all feeds by IDs in a single query
	feeds, err := s.feeds.GetByIDs(ctx, feedIDs)
	if err != nil {
		log.Printf("get feeds by ids: %v", err)
		return err
	}

	if len(feeds) == 0 {
		return nil
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
			}
			return nil
		})
	}

	return g.Wait()
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
			return s.refreshFeedWithCookie(ctx, feed, fallbackUA, cookie, false, retryCount)
		}
	}

	if resp.StatusCode >= http.StatusBadRequest {
		log.Printf("feed %d (%s): HTTP %d", feed.ID, feed.Title, resp.StatusCode)
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
		// Parse failed, check if it's an Anubis challenge
		if s.anubis != nil && anubis.IsAnubisChallenge(body) {
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
	freshClient := &http.Client{Timeout: refreshTimeout}
	resp, err := freshClient.Do(req)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		log.Printf("feed %d (%s): HTTP %d", feed.ID, feed.Title, resp.StatusCode)
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
	if s.anubis != nil && anubis.IsAnubisChallenge(body) {
		errMsg := fmt.Sprintf("anubis challenge persists after %d retries", retryCount)
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

	// Clear error message on successful refresh
	if feed.ErrorMessage != nil {
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
	}

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
			log.Printf("update feed %d etag: %v", feed.ID, err)
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

