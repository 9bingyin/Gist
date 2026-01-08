package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
	"golang.org/x/sync/errgroup"

	"gist/backend/internal/config"
	"gist/backend/internal/logger"
	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/anubis"
)

const (
	iconTimeout        = 15 * time.Second
	maxConcurrentIcons = 4 // Concurrent icon fetch limit
)

type IconService interface {
	// FetchAndSaveIcon downloads and saves the icon locally
	// Returns relative path like "example.com.png" based on domain
	FetchAndSaveIcon(ctx context.Context, feedImageURL, siteURL string) (string, error)
	// EnsureIcon checks if the icon file exists, re-downloads if missing
	EnsureIcon(ctx context.Context, iconPath, siteURL string) error
	// EnsureIconByFeedID checks if icon exists, fetches feed's siteURL and re-downloads if missing
	EnsureIconByFeedID(ctx context.Context, feedID int64, iconPath string) error
	// BackfillIcons fetches icons for all feeds that don't have one
	BackfillIcons(ctx context.Context) error
	// GetIconPath returns the full path for an icon file
	GetIconPath(filename string) string
	// ClearAllIcons deletes all icon files and clears icon_path in database
	ClearAllIcons(ctx context.Context) (int64, error)
}

type iconService struct {
	dataDir    string
	feeds      repository.FeedRepository
	httpClient *http.Client
	anubis     *anubis.Solver
}

func NewIconService(dataDir string, feeds repository.FeedRepository, anubisSolver *anubis.Solver) IconService {
	return &iconService{
		dataDir: dataDir,
		feeds:   feeds,
		httpClient: &http.Client{
			Timeout: iconTimeout,
		},
		anubis: anubisSolver,
	}
}

func (s *iconService) FetchAndSaveIcon(ctx context.Context, feedImageURL, siteURL string) (string, error) {
	feedImageURL = strings.TrimSpace(feedImageURL)

	// Determine icon filename:
	// - If feed has its own image (e.g., user avatar), use URL hash for unique filename
	// - Otherwise, use domain-based filename (shared favicon)
	var iconPath string
	var iconURL string

	if feedImageURL != "" {
		// Feed has its own image, use hash-based filename
		hash := sha256.Sum256([]byte(feedImageURL))
		iconPath = hex.EncodeToString(hash[:8]) + ".png" // Use first 8 bytes (16 chars)
		iconURL = feedImageURL
	} else {
		// Use domain-based filename for shared favicon
		iconPath = iconFilename(siteURL)
		if iconPath == "" {
			return "", nil
		}
		iconURL = s.buildFaviconURL(siteURL)
		if iconURL == "" {
			return "", nil
		}
	}

	fullPath := filepath.Join(s.dataDir, "icons", iconPath)

	// Check if icon already exists
	if _, err := os.Stat(fullPath); err == nil {
		return iconPath, nil
	}

	// Download icon with fallback:
	// 1. Feed's own image URL (if provided)
	// 2. Google Favicon API (which already tries /favicon.ico internally)
	iconData, err := s.downloadIcon(ctx, iconURL)
	if err != nil {
		logger.Debug("icon download failed, trying fallback", "url", iconURL, "error", err)
		// Try Google Favicon API as fallback
		googleURL := s.buildFaviconURL(siteURL)
		if googleURL != "" && googleURL != iconURL {
			iconData, err = s.downloadIcon(ctx, googleURL)
			if err == nil {
				// Switch to domain-based filename since we're using favicon
				iconPath = iconFilename(siteURL)
				if iconPath == "" {
					return "", nil
				}
				fullPath = filepath.Join(s.dataDir, "icons", iconPath)
			} else {
				logger.Debug("icon fallback also failed", "url", googleURL, "error", err)
				return "", nil // All attempts failed, icon is optional
			}
		} else {
			return "", nil // No valid Google Favicon URL available
		}
	}

	// Save to file
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return "", fmt.Errorf("create icons dir: %w", err)
	}

	if err := os.WriteFile(fullPath, iconData, 0644); err != nil {
		return "", fmt.Errorf("write icon file: %w", err)
	}

	logger.Info("icon saved", "path", iconPath, "site", siteURL)
	return iconPath, nil
}

func (s *iconService) EnsureIcon(ctx context.Context, iconPath, siteURL string) error {
	if iconPath == "" {
		return nil
	}

	// Clean to prevent path traversal
	iconPath = filepath.Clean(iconPath)
	fullPath := filepath.Join(s.dataDir, "icons", iconPath)

	// Check if file exists
	if _, err := os.Stat(fullPath); err == nil {
		return nil // File exists
	}

	// Check if this is a hash-based filename (16 hex chars + .png)
	// Hash-based icons (e.g., user avatars) cannot be recovered without the original URL
	if isHashFilename(iconPath) {
		return nil // Cannot recover, skip
	}

	// File missing, re-download using Google Favicon API
	iconURL := s.buildFaviconURL(siteURL)
	if iconURL == "" {
		return nil
	}

	iconData, err := s.downloadIcon(ctx, iconURL)
	if err != nil {
		return nil // Silently fail
	}

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return fmt.Errorf("create icons dir: %w", err)
	}

	if err := os.WriteFile(fullPath, iconData, 0644); err != nil {
		return fmt.Errorf("write icon file: %w", err)
	}

	return nil
}

// isHashFilename checks if the filename is a hash-based name (16 hex chars + .png)
func isHashFilename(filename string) bool {
	if !strings.HasSuffix(filename, ".png") {
		return false
	}
	name := strings.TrimSuffix(filename, ".png")
	if len(name) != 16 {
		return false
	}
	for _, c := range name {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

func (s *iconService) EnsureIconByFeedID(ctx context.Context, feedID int64, iconPath string) error {
	if iconPath == "" {
		return fmt.Errorf("empty icon path")
	}

	// Get feed to get siteURL
	feed, err := s.feeds.GetByID(ctx, feedID)
	if err != nil {
		return fmt.Errorf("get feed: %w", err)
	}

	siteURL := ""
	if feed.SiteURL != nil {
		siteURL = *feed.SiteURL
	}

	return s.EnsureIcon(ctx, iconPath, siteURL)
}

func (s *iconService) GetIconPath(filename string) string {
	// Clean to prevent path traversal
	return filepath.Join(s.dataDir, "icons", filepath.Clean(filename))
}

func (s *iconService) BackfillIcons(ctx context.Context) error {
	parser := gofeed.NewParser()

	// 1. Fetch icons for feeds without icon_path in DB
	feeds, err := s.feeds.ListWithoutIcon(ctx)
	if err != nil {
		return fmt.Errorf("list feeds without icon: %w", err)
	}
	if len(feeds) > 0 {
		logger.Info("backfilling icons for feeds without icon", "count", len(feeds))
	}
	s.fetchIconsForFeeds(ctx, parser, feeds)

	// 2. Re-download missing or stale icon files
	allFeeds, err := s.feeds.List(ctx, nil)
	if err != nil {
		return fmt.Errorf("list all feeds: %w", err)
	}

	const iconMaxAge = 30 * 24 * time.Hour // 30 days
	now := time.Now()

	var feedsNeedRefetch []int64
	for _, feed := range allFeeds {
		if feed.IconPath == nil || *feed.IconPath == "" {
			continue
		}

		// Clean to prevent path traversal
		cleanPath := filepath.Clean(*feed.IconPath)
		fullPath := filepath.Join(s.dataDir, "icons", cleanPath)
		info, statErr := os.Stat(fullPath)
		needRefresh := statErr != nil || now.Sub(info.ModTime()) > iconMaxAge
		if !needRefresh {
			continue
		}

		// Hash-based icons need re-fetch via RSS parsing
		if isHashFilename(*feed.IconPath) {
			feedsNeedRefetch = append(feedsNeedRefetch, feed.ID)
			continue
		}

		// Domain-based icons can be re-downloaded directly
		siteURL := feed.URL
		if feed.SiteURL != nil && *feed.SiteURL != "" {
			siteURL = *feed.SiteURL
		}
		_ = s.EnsureIcon(ctx, *feed.IconPath, siteURL)
	}

	// 3. Re-fetch hash-based icons by clearing DB and re-parsing RSS
	if len(feedsNeedRefetch) > 0 {
		for _, feedID := range feedsNeedRefetch {
			_ = s.feeds.UpdateIconPath(ctx, feedID, "")
		}
		if feedsToRefetch, err := s.feeds.ListWithoutIcon(ctx); err == nil {
			s.fetchIconsForFeeds(ctx, parser, feedsToRefetch)
		}
	}

	return nil
}

// fetchIconsForFeeds parses RSS feeds to get imageURL and fetches icons concurrently
func (s *iconService) fetchIconsForFeeds(ctx context.Context, parser *gofeed.Parser, feeds []model.Feed) {
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(maxConcurrentIcons)

	for _, feed := range feeds {
		feed := feed // capture loop variable
		g.Go(func() error {
			siteURL := feed.URL
			if feed.SiteURL != nil && *feed.SiteURL != "" {
				siteURL = *feed.SiteURL
			}

			// Try to parse feed to get imageURL from RSS
			imageURL := ""
			if parsed, err := parser.ParseURLWithContext(feed.URL, ctx); err == nil && parsed.Image != nil {
				imageURL = strings.TrimSpace(parsed.Image.URL)
			}

			iconPath, err := s.FetchAndSaveIcon(ctx, imageURL, siteURL)
			if err != nil || iconPath == "" {
				return nil // Don't propagate error, continue with other feeds
			}
			_ = s.feeds.UpdateIconPath(ctx, feed.ID, iconPath)
			return nil
		})
	}

	_ = g.Wait()
}

func (s *iconService) buildFaviconURL(siteURL string) string {
	if siteURL == "" {
		return ""
	}

	parsed, err := url.Parse(siteURL)
	if err != nil {
		return ""
	}

	domain := parsed.Hostname()
	if domain == "" {
		return ""
	}

	return fmt.Sprintf("https://www.google.com/s2/favicons?domain=%s&sz=128", url.QueryEscape(domain))
}

// iconFilename generates a filename based on the domain
func iconFilename(siteURL string) string {
	if siteURL == "" {
		return ""
	}

	parsed, err := url.Parse(siteURL)
	if err != nil || parsed.Hostname() == "" {
		return ""
	}

	// Clean to prevent path traversal
	return filepath.Clean(parsed.Hostname()) + ".png"
}

func (s *iconService) downloadIcon(ctx context.Context, iconURL string) ([]byte, error) {
	return s.downloadIconWithRetry(ctx, iconURL, "", 0)
}

func (s *iconService) downloadIconWithRetry(ctx context.Context, iconURL string, cookie string, retryCount int) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, iconURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", config.DefaultUserAgent)

	// Add cookie (either provided or from cache)
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	} else if s.anubis != nil {
		if parsed, err := url.Parse(iconURL); err == nil {
			if cachedCookie := s.anubis.GetCachedCookie(ctx, parsed.Host); cachedCookie != "" {
				req.Header.Set("Cookie", cachedCookie)
			}
		}
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Check if response is Anubis challenge (HTML instead of image)
	if s.anubis != nil && anubis.IsAnubisChallenge(data) {
		if retryCount >= 2 {
			// Too many retries, give up
			return nil, fmt.Errorf("anubis challenge persists after %d retries", retryCount)
		}
		logger.Debug("icon download detected Anubis challenge", "url", iconURL)
		newCookie, solveErr := s.anubis.SolveFromBody(ctx, data, iconURL, resp.Cookies())
		if solveErr != nil {
			return nil, solveErr
		}
		// Retry with fresh client to avoid connection reuse
		return s.downloadIconWithFreshClient(ctx, iconURL, newCookie, retryCount+1)
	}

	// Check minimum size (avoid empty/broken images)
	if len(data) < 100 {
		return nil, fmt.Errorf("icon too small")
	}

	return data, nil
}

// downloadIconWithFreshClient creates a new http.Client to avoid connection reuse after Anubis
func (s *iconService) downloadIconWithFreshClient(ctx context.Context, iconURL string, cookie string, retryCount int) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, iconURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", config.DefaultUserAgent)
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	// Use fresh client to avoid connection reuse
	freshClient := &http.Client{Timeout: iconTimeout}
	resp, err := freshClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Check if still getting Anubis (shouldn't happen with fresh connection)
	if s.anubis != nil && anubis.IsAnubisChallenge(data) {
		return nil, fmt.Errorf("anubis challenge persists after %d retries", retryCount)
	}

	// Check minimum size
	if len(data) < 100 {
		return nil, fmt.Errorf("icon too small")
	}

	return data, nil
}

func (s *iconService) ClearAllIcons(ctx context.Context) (int64, error) {
	// 1. Delete all icon files from the icons directory
	iconsDir := filepath.Join(s.dataDir, "icons")
	entries, err := os.ReadDir(iconsDir)
	if err != nil && !os.IsNotExist(err) {
		return 0, fmt.Errorf("read icons dir: %w", err)
	}

	var deletedFiles int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		filePath := filepath.Join(iconsDir, entry.Name())
		if err := os.Remove(filePath); err == nil {
			deletedFiles++
		}
	}

	// 2. Clear all icon_path in database
	_, err = s.feeds.ClearAllIconPaths(ctx)
	if err != nil {
		return deletedFiles, fmt.Errorf("clear icon paths in db: %w", err)
	}

	return deletedFiles, nil
}
