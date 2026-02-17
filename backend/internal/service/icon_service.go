//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
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
	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const (
	iconTimeout        = 30 * time.Second
	maxConcurrentIcons = 4 // Concurrent icon fetch limit
)

type IconService interface {
	// FetchAndSaveIcon downloads and saves the icon locally
	// Returns relative path like "example.com.ico" or "example.com.png" based on domain and detected format
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
	dataDir       string
	feeds         repository.FeedRepository
	clientFactory *network.ClientFactory
	anubis        AnubisSolver
}

func NewIconService(dataDir string, feeds repository.FeedRepository, clientFactory *network.ClientFactory, anubisSolver AnubisSolver) IconService {
	return &iconService{
		dataDir:       dataDir,
		feeds:         feeds,
		clientFactory: clientFactory,
		anubis:        anubisSolver,
	}
}

// supportedIconExts lists all supported icon extensions
var supportedIconExts = []string{".png", ".ico", ".svg", ".jpg", ".jpeg", ".gif"}

// findExistingIcon checks if an icon already exists for the given base name (without extension)
// Returns the full filename if found, empty string otherwise
func (s *iconService) findExistingIcon(baseName string) string {
	for _, ext := range supportedIconExts {
		filename := baseName + ext
		fullPath := filepath.Join(s.dataDir, "icons", filename)
		if _, err := os.Stat(fullPath); err == nil {
			return filename
		}
	}
	return ""
}

func (s *iconService) FetchAndSaveIcon(ctx context.Context, feedImageURL, siteURL string) (string, error) {
	feedImageURL = strings.TrimSpace(feedImageURL)

	// Check if icon already exists before downloading
	// For RSS image: check hash-based filename
	// For favicon: check domain-based filename
	if feedImageURL != "" {
		hash := sha256.Sum256([]byte(feedImageURL))
		baseName := hex.EncodeToString(hash[:8])
		if existing := s.findExistingIcon(baseName); existing != "" {
			return existing, nil
		}
	} else if siteURL != "" {
		if parsed, err := url.Parse(siteURL); err == nil && parsed.Hostname() != "" {
			baseName := filepath.Clean(parsed.Hostname())
			if existing := s.findExistingIcon(baseName); existing != "" {
				return existing, nil
			}
		}
	}

	// Build list of URLs to try (in order):
	// 1. RSS feed image (if provided)
	// 2. Local /favicon.ico
	// 3. Google Favicon API
	// 4. DuckDuckGo Favicon API
	var urlsToTry []string
	var isRSSImage bool

	if feedImageURL != "" {
		urlsToTry = append(urlsToTry, feedImageURL)
		isRSSImage = true
	}

	// Add local favicon.ico
	if localURL := s.buildLocalFaviconURL(siteURL); localURL != "" {
		urlsToTry = append(urlsToTry, localURL)
	}

	// Add Google Favicon API
	if googleURL := s.buildFaviconURL(siteURL); googleURL != "" {
		urlsToTry = append(urlsToTry, googleURL)
	}

	// Add DuckDuckGo Favicon API as final fallback
	if ddgURL := s.buildDDGFaviconURL(siteURL); ddgURL != "" {
		urlsToTry = append(urlsToTry, ddgURL)
	}

	if len(urlsToTry) == 0 {
		return "", nil
	}

	// Try each URL until one succeeds
	var result *iconDownloadResult
	var successURL string
	var lastErr error

	for _, iconURL := range urlsToTry {
		result, lastErr = s.downloadIconWithFormat(ctx, iconURL)
		if lastErr == nil {
			successURL = iconURL
			break
		}
		logger.Debug("icon download failed", "module", "service", "action", "fetch", "resource", "icon", "result", "failed", "host", network.ExtractHost(iconURL), "error", lastErr)
	}

	if result == nil {
		logger.Debug("icon download attempts failed", "module", "service", "action", "fetch", "resource", "icon", "result", "failed", "error", lastErr)
		return "", nil // All attempts failed, icon is optional
	}

	// Determine filename based on source:
	// - RSS image: use URL hash + detected extension
	// - Favicon: use domain + detected extension
	var iconPath string
	if isRSSImage && successURL == feedImageURL {
		// RSS image: hash-based filename
		hash := sha256.Sum256([]byte(feedImageURL))
		iconPath = hex.EncodeToString(hash[:8]) + "." + result.format.ext
	} else {
		// Favicon: domain-based filename
		iconPath = iconFilename(siteURL, result.format.ext)
		if iconPath == "" {
			return "", nil
		}
	}

	fullPath := filepath.Join(s.dataDir, "icons", iconPath)

	// Check if icon already exists
	if _, err := os.Stat(fullPath); err == nil {
		return iconPath, nil
	}

	// Save to file
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return "", fmt.Errorf("create icons dir: %w", err)
	}

	if err := os.WriteFile(fullPath, result.data, 0644); err != nil {
		return "", fmt.Errorf("write icon file: %w", err)
	}

	logger.Info("icon saved", "module", "service", "action", "save", "resource", "icon", "result", "ok", "path", iconPath, "host", network.ExtractHost(siteURL), "format", result.format.ext)
	return iconPath, nil
}

func (s *iconService) EnsureIcon(ctx context.Context, iconPath, siteURL string) error {
	if iconPath == "" {
		return nil
	}

	// Validate path to prevent path traversal attacks
	if !isValidIconPath(iconPath) {
		return nil
	}

	// Clean to prevent path traversal
	iconPath = filepath.Clean(iconPath)
	fullPath := filepath.Join(s.dataDir, "icons", iconPath)

	// Check if file exists
	if _, err := os.Stat(fullPath); err == nil {
		return nil // File exists
	}

	// Check if this is a hash-based filename (16 hex chars + image extension)
	// Hash-based icons (e.g., user avatars) cannot be recovered without the original URL
	if isHashFilename(iconPath) {
		return nil // Cannot recover, skip
	}

	// File missing, try to re-download:
	// 1. Local /favicon.ico
	// 2. Google Favicon API
	var iconData []byte
	var err error

	// Try local favicon.ico first
	if localURL := s.buildLocalFaviconURL(siteURL); localURL != "" {
		iconData, err = s.downloadIcon(ctx, localURL)
		if err != nil {
			logger.Debug("local favicon.ico download failed", "module", "service", "action", "fetch", "resource", "icon", "result", "failed", "host", network.ExtractHost(localURL), "error", err)
		}
	}

	// Fallback to Google Favicon API
	if iconData == nil {
		googleURL := s.buildFaviconURL(siteURL)
		if googleURL == "" {
			return nil
		}
		iconData, err = s.downloadIcon(ctx, googleURL)
		if err != nil {
			return nil // Silently fail
		}
	}

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return fmt.Errorf("create icons dir: %w", err)
	}

	if err := os.WriteFile(fullPath, iconData, 0644); err != nil {
		return fmt.Errorf("write icon file: %w", err)
	}

	return nil
}

// isHashFilename checks if the filename is a hash-based name (16 hex chars + image extension)
func isHashFilename(filename string) bool {
	var name string
	hasValidExt := false
	for _, ext := range supportedIconExts {
		if strings.HasSuffix(filename, ext) {
			name = strings.TrimSuffix(filename, ext)
			hasValidExt = true
			break
		}
	}

	if !hasValidExt {
		return false
	}

	if len(name) != 16 {
		return false
	}

	for _, c := range name {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}

// isValidIconPath checks if the icon path is safe (no absolute path or parent directory reference)
func isValidIconPath(iconPath string) bool {
	if iconPath == "" {
		return false
	}
	cleaned := filepath.Clean(iconPath)
	// Reject absolute paths
	if filepath.IsAbs(cleaned) {
		return false
	}
	// Reject paths that try to escape (start with .. or contain ../)
	if strings.HasPrefix(cleaned, "..") {
		return false
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
	// Validate path to prevent path traversal attacks
	if !isValidIconPath(filename) {
		return ""
	}
	// Clean to prevent path traversal
	return filepath.Join(s.dataDir, "icons", filepath.Clean(filename))
}

func (s *iconService) BackfillIcons(ctx context.Context) error {
	parser := gofeed.NewParser()

	// 1. Fetch icons for feeds without icon_path in DB
	feeds, err := s.feeds.ListWithoutIcon(ctx)
	if err != nil {
		logger.Error("icon backfill list feeds failed", "module", "service", "action", "list", "resource", "icon", "result", "failed", "error", err)
		return fmt.Errorf("list feeds without icon: %w", err)
	}
	if len(feeds) > 0 {
		logger.Info("icon backfill started", "module", "service", "action", "fetch", "resource", "icon", "result", "ok", "count", len(feeds))
	}
	s.fetchIconsForFeeds(ctx, parser, feeds)

	// 2. Re-download missing or stale icon files
	allFeeds, err := s.feeds.List(ctx, nil)
	if err != nil {
		logger.Error("icon backfill list all feeds failed", "module", "service", "action", "list", "resource", "icon", "result", "failed", "error", err)
		return fmt.Errorf("list all feeds: %w", err)
	}

	const iconMaxAge = 30 * 24 * time.Hour // 30 days
	now := time.Now()

	var feedsNeedRefetch []int64
	for _, feed := range allFeeds {
		if feed.IconPath == nil || *feed.IconPath == "" {
			continue
		}

		// Validate path to prevent path traversal attacks
		if !isValidIconPath(*feed.IconPath) {
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
		} else {
			logger.Warn("icon backfill refetch list failed", "module", "service", "action", "list", "resource", "icon", "result", "failed", "error", err)
		}
	}

	logger.Info("icon backfill completed", "module", "service", "action", "fetch", "resource", "icon", "result", "ok")
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
				if err != nil {
					logger.Debug("icon fetch failed", "module", "service", "action", "fetch", "resource", "icon", "result", "failed", "feed_id", feed.ID, "error", err)
				}
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

// buildLocalFaviconURL constructs the URL for the site's /favicon.ico
func (s *iconService) buildLocalFaviconURL(siteURL string) string {
	if siteURL == "" {
		return ""
	}

	parsed, err := url.Parse(siteURL)
	if err != nil {
		return ""
	}

	if parsed.Hostname() == "" {
		return ""
	}

	// Construct https://{host}/favicon.ico
	scheme := parsed.Scheme
	if scheme == "" {
		scheme = "https"
	}

	return fmt.Sprintf("%s://%s/favicon.ico", scheme, parsed.Host)
}

// buildDDGFaviconURL constructs the DuckDuckGo favicon API URL
func (s *iconService) buildDDGFaviconURL(siteURL string) string {
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

	return fmt.Sprintf("https://icons.duckduckgo.com/ip3/%s.ico", domain)
}

// iconFilename generates a filename based on the domain and extension
// ext should include the dot, e.g., ".png", ".ico", ".svg"
func iconFilename(siteURL, ext string) string {
	if siteURL == "" {
		return ""
	}

	parsed, err := url.Parse(siteURL)
	if err != nil || parsed.Hostname() == "" {
		return ""
	}

	// Default to .png if no extension provided
	if ext == "" {
		ext = ".png"
	}

	// Ensure extension starts with dot
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}

	// Clean to prevent path traversal
	return filepath.Clean(parsed.Hostname()) + ext
}

// iconDownloadResult holds the downloaded icon data and format info
type iconDownloadResult struct {
	data   []byte
	format *iconFormat
}

func (s *iconService) downloadIcon(ctx context.Context, iconURL string) ([]byte, error) {
	result, err := s.downloadIconWithFormat(ctx, iconURL)
	if err != nil {
		return nil, err
	}
	return result.data, nil
}

// downloadIconWithFormat downloads icon and detects its format
func (s *iconService) downloadIconWithFormat(ctx context.Context, iconURL string) (*iconDownloadResult, error) {
	return s.downloadIconWithRetry(ctx, iconURL, "", 0)
}

func (s *iconService) downloadIconWithRetry(ctx context.Context, iconURL string, cookie string, retryCount int) (*iconDownloadResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, iconURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", config.DefaultUserAgent)

	// Add cookie (either provided or from cache)
	if cookie == "" {
		if parsed, err := url.Parse(iconURL); err == nil {
			if cachedCookie := getCachedAnubisCookie(ctx, s.anubis, parsed.Host, req.Header); cachedCookie != "" {
				cookie = cachedCookie
			}
		}
	}

	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	httpClient := s.clientFactory.NewHTTPClient(ctx, iconTimeout)
	resp, err := httpClient.Do(req)
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

	newCookie, anubisErr := trySolveAnubisChallenge(ctx, s.anubis, data, iconURL, resp.Cookies(), req.Header.Clone(), retryCount)
	switch {
	case anubisErr == nil:
		logger.Debug("icon download detected anubis challenge", "module", "service", "action", "fetch", "resource", "icon", "result", "ok", "host", network.ExtractHost(iconURL))
		// Retry with fresh client to avoid connection reuse
		return s.downloadIconWithFreshClient(ctx, iconURL, newCookie, retryCount+1)
	case errors.Is(anubisErr, errAnubisNotPage):
		// Not an Anubis page; continue normal icon decoding.
	case errors.Is(anubisErr, errAnubisRejected):
		return nil, fmt.Errorf("upstream rejected")
	case errors.Is(anubisErr, errAnubisRetryExceeded):
		return nil, fmt.Errorf("anubis challenge persists after %d retries", retryCount)
	default:
		return nil, anubisErr
	}

	// Detect format and validate dimensions (besticon approach)
	format, err := detectImageFormat(data)
	if err != nil {
		return nil, fmt.Errorf("invalid icon format: %w", err)
	}

	return &iconDownloadResult{
		data:   data,
		format: format,
	}, nil
}

// downloadIconWithFreshClient creates a new http.Client to avoid connection reuse after Anubis
func (s *iconService) downloadIconWithFreshClient(ctx context.Context, iconURL string, cookie string, retryCount int) (*iconDownloadResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, iconURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", config.DefaultUserAgent)
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	// Use fresh client to avoid connection reuse
	freshClient := s.clientFactory.NewHTTPClient(ctx, iconTimeout)
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

	newCookie, anubisErr := trySolveAnubisChallenge(ctx, s.anubis, data, iconURL, resp.Cookies(), req.Header.Clone(), retryCount)
	switch {
	case anubisErr == nil:
		return s.downloadIconWithFreshClient(ctx, iconURL, newCookie, retryCount+1)
	case errors.Is(anubisErr, errAnubisNotPage):
		// Not an Anubis page; continue normal icon decoding.
	case errors.Is(anubisErr, errAnubisRejected):
		return nil, fmt.Errorf("upstream rejected")
	case errors.Is(anubisErr, errAnubisRetryExceeded):
		return nil, fmt.Errorf("anubis challenge persists after %d retries", retryCount)
	default:
		return nil, anubisErr
	}

	// Detect format and validate dimensions (besticon approach)
	format, err := detectImageFormat(data)
	if err != nil {
		return nil, fmt.Errorf("invalid icon format: %w", err)
	}

	return &iconDownloadResult{
		data:   data,
		format: format,
	}, nil
}

func (s *iconService) ClearAllIcons(ctx context.Context) (int64, error) {
	// 1. Delete all icon files from the icons directory
	iconsDir := filepath.Join(s.dataDir, "icons")
	entries, err := os.ReadDir(iconsDir)
	if err != nil && !os.IsNotExist(err) {
		logger.Error("icon cache read failed", "module", "service", "action", "clear", "resource", "icon", "result", "failed", "error", err)
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
		logger.Error("icon cache clear db failed", "module", "service", "action", "clear", "resource", "icon", "result", "failed", "error", err)
		return deletedFiles, fmt.Errorf("clear icon paths in db: %w", err)
	}

	// 3. Clear ETag and Last-Modified to force full refresh on next update
	// This ensures icons will be re-fetched even if feed returns 304 Not Modified
	_, err = s.feeds.ClearAllConditionalGet(ctx)
	if err != nil {
		logger.Error("icon cache clear conditional get failed", "module", "service", "action", "clear", "resource", "icon", "result", "failed", "error", err)
		return deletedFiles, fmt.Errorf("clear conditional get: %w", err)
	}

	logger.Info("icon cache cleared", "module", "service", "action", "clear", "resource", "icon", "result", "ok", "count", deletedFiles)
	return deletedFiles, nil
}

// isSVG detects if the data is an SVG image (similar to besticon's approach)
func isSVG(data []byte) bool {
	// Check minimum length
	if len(data) < 10 {
		return false
	}

	// Check if it starts with something reasonable
	switch {
	case bytes.HasPrefix(data, []byte("<!")):
	case bytes.HasPrefix(data, []byte("<?")):
	case bytes.HasPrefix(data, []byte("<svg")):
	default:
		return false
	}

	// Check if there's an <svg tag in the first 300 bytes
	searchLen := len(data)
	if searchLen > 300 {
		searchLen = 300
	}
	if off := bytes.Index(data[:searchLen], []byte("<svg")); off == -1 {
		return false
	}

	return true
}

// isICO detects if the data is an ICO image
// ICO format: first 4 bytes are 0x00 0x00 0x01 0x00 (or 0x02 0x00 for CUR)
func isICO(data []byte) bool {
	if len(data) < 6 {
		return false
	}
	// Check ICO magic number: 0x00 0x00 0x01 0x00
	// CUR files use 0x00 0x00 0x02 0x00, we accept both
	if data[0] == 0x00 && data[1] == 0x00 && (data[2] == 0x01 || data[2] == 0x02) && data[3] == 0x00 {
		// Additional check: bytes 4-5 contain the number of images (should be > 0)
		numImages := int(data[4]) | int(data[5])<<8
		return numImages > 0
	}
	return false
}

// iconFormat holds detected format information
type iconFormat struct {
	ext    string // e.g., "png", "ico", "svg", "jpg", "gif"
	width  int
	height int
}

// detectImageFormat detects the format and dimensions of image data
// Returns format info or error if format is unrecognized or dimensions are invalid
func detectImageFormat(data []byte) (*iconFormat, error) {
	// Special handling for SVG (golang can't decode with image.DecodeConfig)
	if isSVG(data) {
		return &iconFormat{
			ext:    "svg",
			width:  9999, // SVG is vector, use large value like besticon
			height: 9999,
		}, nil
	}

	// Special handling for ICO (golang standard library doesn't support ICO)
	if isICO(data) {
		return &iconFormat{
			ext:    "ico",
			width:  32, // Default size, actual size varies
			height: 32,
		}, nil
	}

	// Try to decode as raster image
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("unknown image format: %w", err)
	}

	// Normalize format name (jpeg -> jpg)
	if format == "jpeg" {
		format = "jpg"
	}

	// Filter out invalid dimensions (like 1x1 tracking pixels)
	if cfg.Width <= 1 || cfg.Height <= 1 {
		return nil, fmt.Errorf("icon dimensions too small: %dx%d", cfg.Width, cfg.Height)
	}

	return &iconFormat{
		ext:    format,
		width:  cfg.Width,
		height: cfg.Height,
	}, nil
}
