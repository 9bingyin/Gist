//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
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
	maxConcurrentIcons = 4
	iconMaxAge         = 30 * 24 * time.Hour
)

type IconService interface {
	// FetchAndSaveIcon downloads and saves the icon locally.
	// Returns relative path like "example.com.ico" or "example.com.png".
	FetchAndSaveIcon(ctx context.Context, feedImageURL, siteURL string) (string, error)
	// EnsureIcon checks if the icon file exists, re-downloads if missing.
	EnsureIcon(ctx context.Context, iconPath, siteURL string) error
	// BackfillIcons fetches icons for all feeds that don't have one or whose icon is stale.
	BackfillIcons(ctx context.Context) error
	// GetIconPath returns the full path for an icon file.
	GetIconPath(filename string) string
	// ClearAllIcons deletes all icon files and clears icon_path in database.
	ClearAllIcons(ctx context.Context) (int64, error)
}

type iconService struct {
	dataDir       string
	feeds         repository.FeedRepository
	clientFactory *network.ClientFactory
	anubis        AnubisSolver

	fileLocksMu sync.Mutex
	fileLocks   map[string]*sync.Mutex
}

func NewIconService(dataDir string, feeds repository.FeedRepository, clientFactory *network.ClientFactory, anubisSolver AnubisSolver) IconService {
	return &iconService{
		dataDir:       dataDir,
		feeds:         feeds,
		clientFactory: clientFactory,
		anubis:        anubisSolver,
		fileLocks:     make(map[string]*sync.Mutex),
	}
}

func (s *iconService) lockFile(key string) func() {
	s.fileLocksMu.Lock()
	mu, ok := s.fileLocks[key]
	if !ok {
		mu = &sync.Mutex{}
		s.fileLocks[key] = mu
	}
	s.fileLocksMu.Unlock()

	mu.Lock()
	return mu.Unlock
}

// supportedIconExts lists all supported icon extensions.
var supportedIconExts = []string{".png", ".ico", ".svg", ".jpg", ".jpeg", ".gif"}

func (s *iconService) findExistingIcon(baseName string) string {
	for _, ext := range supportedIconExts {
		filename := baseName + ext
		fullPath := filepath.Join(s.dataDir, "icons", filename)
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			return filename
		}
	}
	return ""
}

func (s *iconService) FetchAndSaveIcon(ctx context.Context, feedImageURL, siteURL string) (string, error) {
	return s.fetchAndSaveIcon(ctx, feedImageURL, siteURL, false)
}

func (s *iconService) fetchAndSaveIcon(ctx context.Context, feedImageURL, siteURL string, forceRefresh bool) (string, error) {
	feedImageURL = strings.TrimSpace(feedImageURL)

	if !forceRefresh {
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
	}

	var urlsToTry []string
	var isRSSImage bool

	if feedImageURL != "" {
		urlsToTry = append(urlsToTry, feedImageURL)
		isRSSImage = true
	}
	if localURL := s.buildLocalFaviconURL(siteURL); localURL != "" {
		urlsToTry = append(urlsToTry, localURL)
	}
	if googleURL := s.buildFaviconURL(siteURL); googleURL != "" {
		urlsToTry = append(urlsToTry, googleURL)
	}
	if ddgURL := s.buildDDGFaviconURL(siteURL); ddgURL != "" {
		urlsToTry = append(urlsToTry, ddgURL)
	}

	if len(urlsToTry) == 0 {
		return "", nil
	}

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
		return "", nil
	}

	var iconPath string
	if isRSSImage && successURL == feedImageURL {
		hash := sha256.Sum256([]byte(feedImageURL))
		iconPath = hex.EncodeToString(hash[:8]) + "." + result.format.ext
	} else {
		iconPath = iconFilename(siteURL, result.format.ext)
		if iconPath == "" {
			return "", nil
		}
	}

	fullPath := filepath.Join(s.dataDir, "icons", iconPath)
	unlock := s.lockFile(iconPath)
	defer unlock()

	if !forceRefresh {
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			return iconPath, nil
		}
	}

	if err := writeFileAtomic(fullPath, result.data); err != nil {
		return "", fmt.Errorf("write icon file: %w", err)
	}

	logger.Info("icon saved", "module", "service", "action", "save", "resource", "icon", "result", "ok", "path", iconPath, "host", network.ExtractHost(siteURL), "format", result.format.ext)
	return iconPath, nil
}

func (s *iconService) EnsureIcon(ctx context.Context, iconPath, siteURL string) error {
	return s.ensureIcon(ctx, iconPath, siteURL, false)
}

func (s *iconService) ensureIcon(ctx context.Context, iconPath, siteURL string, forceRefresh bool) error {
	if iconPath == "" || !isValidIconPath(iconPath) {
		return nil
	}

	iconPath = filepath.Clean(iconPath)
	fullPath := filepath.Join(s.dataDir, "icons", iconPath)

	if !forceRefresh {
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			return nil
		}
	}

	// Hash-based icons cannot be recovered without the original RSS image URL.
	if isHashFilename(iconPath) {
		return nil
	}

	var iconData []byte
	var err error

	if localURL := s.buildLocalFaviconURL(siteURL); localURL != "" {
		iconData, err = s.downloadIcon(ctx, localURL)
		if err != nil {
			logger.Debug("local favicon.ico download failed", "module", "service", "action", "fetch", "resource", "icon", "result", "failed", "host", network.ExtractHost(localURL), "error", err)
		}
	}

	if iconData == nil {
		googleURL := s.buildFaviconURL(siteURL)
		if googleURL != "" {
			iconData, _ = s.downloadIcon(ctx, googleURL)
		}
	}

	if iconData == nil {
		ddgURL := s.buildDDGFaviconURL(siteURL)
		if ddgURL != "" {
			iconData, _ = s.downloadIcon(ctx, ddgURL)
		}
	}

	if iconData == nil {
		return nil
	}

	unlock := s.lockFile(iconPath)
	defer unlock()

	if err := writeFileAtomic(fullPath, iconData); err != nil {
		return fmt.Errorf("write icon file: %w", err)
	}
	return nil
}

// writeFileAtomic writes data to a temporary file in the same directory and atomically
// renames it into place so concurrent readers never observe partially written files.
func writeFileAtomic(fullPath string, data []byte) error {
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create icons dir: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".icon-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpName)
		}
	}()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o644); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, fullPath); err != nil {
		return err
	}
	cleanup = false
	return nil
}

func isHashFilename(filename string) bool {
	var name string
	hasValidExt := false
	for _, ext := range supportedIconExts {
		if before, ok := strings.CutSuffix(filename, ext); ok {
			name = before
			hasValidExt = true
			break
		}
	}
	if !hasValidExt || len(name) != 16 {
		return false
	}
	for _, c := range name {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}

func isValidIconPath(iconPath string) bool {
	if iconPath == "" {
		return false
	}
	cleaned := filepath.Clean(iconPath)
	if cleaned == "." || cleaned == ".." || filepath.IsAbs(cleaned) {
		return false
	}
	if strings.HasPrefix(cleaned, "..") || strings.ContainsRune(cleaned, filepath.Separator) {
		return false
	}
	return true
}

func (s *iconService) GetIconPath(filename string) string {
	if !isValidIconPath(filename) {
		return ""
	}
	return filepath.Join(s.dataDir, "icons", filepath.Clean(filename))
}

func (s *iconService) BackfillIcons(ctx context.Context) error {
	// 1. Fetch icons for feeds without icon_path in DB.
	feeds, err := s.feeds.ListWithoutIcon(ctx)
	if err != nil {
		logger.Error("icon backfill list feeds failed", "module", "service", "action", "list", "resource", "icon", "result", "failed", "error", err)
		return fmt.Errorf("list feeds without icon: %w", err)
	}
	if len(feeds) > 0 {
		logger.Info("icon backfill started", "module", "service", "action", "fetch", "resource", "icon", "result", "ok", "count", len(feeds))
	}
	s.fetchIconsForFeeds(ctx, feeds, false)

	// 2. Re-download missing or stale (>30d) icon files.
	allFeeds, err := s.feeds.List(ctx, nil)
	if err != nil {
		logger.Error("icon backfill list all feeds failed", "module", "service", "action", "list", "resource", "icon", "result", "failed", "error", err)
		return fmt.Errorf("list all feeds: %w", err)
	}

	now := time.Now()
	var hashFeedsToRefetch []model.Feed

	for _, feed := range allFeeds {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if feed.IconPath == nil || *feed.IconPath == "" || !isValidIconPath(*feed.IconPath) {
			continue
		}

		cleanPath := filepath.Clean(*feed.IconPath)
		fullPath := filepath.Join(s.dataDir, "icons", cleanPath)
		info, statErr := os.Stat(fullPath)
		needRefresh := statErr != nil || info.IsDir() || now.Sub(info.ModTime()) > iconMaxAge
		if !needRefresh {
			continue
		}

		if isHashFilename(*feed.IconPath) {
			hashFeedsToRefetch = append(hashFeedsToRefetch, feed)
			continue
		}

		siteURL := feed.URL
		if feed.SiteURL != nil && *feed.SiteURL != "" {
			siteURL = *feed.SiteURL
		}
		_ = s.ensureIcon(ctx, *feed.IconPath, siteURL, true)
	}

	// 3. Force re-fetch stale hash-based icons via ClientFactory + RSS parsing.
	if len(hashFeedsToRefetch) > 0 {
		s.fetchIconsForFeeds(ctx, hashFeedsToRefetch, true)
	}

	logger.Info("icon backfill completed", "module", "service", "action", "fetch", "resource", "icon", "result", "ok")
	return nil
}

// fetchIconsForFeeds parses RSS feeds via ClientFactory to get imageURL and fetches icons concurrently.
func (s *iconService) fetchIconsForFeeds(ctx context.Context, feeds []model.Feed, forceRefresh bool) {
	if len(feeds) == 0 {
		return
	}

	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(maxConcurrentIcons)

	for _, feed := range feeds {
		g.Go(func() error {
			siteURL := feed.URL
			if feed.SiteURL != nil && *feed.SiteURL != "" {
				siteURL = *feed.SiteURL
			}

			imageURL := s.fetchFeedImageURL(ctx, feed.URL)

			iconPath, err := s.fetchAndSaveIcon(ctx, imageURL, siteURL, forceRefresh)
			if err != nil || iconPath == "" {
				if err != nil {
					logger.Debug("icon fetch failed", "module", "service", "action", "fetch", "resource", "icon", "result", "failed", "feed_id", feed.ID, "error", err)
				}
				return nil
			}
			_ = s.feeds.UpdateIconPath(ctx, feed.ID, iconPath)
			return nil
		})
	}

	_ = g.Wait()
}

func (s *iconService) fetchFeedImageURL(ctx context.Context, feedURL string) string {
	res, err := fetchHTTPWithAnubis(ctx, httpFetchOptions{
		URL:           feedURL,
		Timeout:       iconTimeout,
		MaxBodyBytes:  maxFeedBodyBytes,
		UserAgent:     config.DefaultUserAgent,
		ClientFactory: s.clientFactory,
		Anubis:        s.anubis,
	})
	if err != nil || res.StatusCode != http.StatusOK {
		return ""
	}
	parsed, err := gofeed.NewParser().Parse(bytes.NewReader(res.Body))
	if err != nil || parsed.Image == nil {
		return ""
	}
	return strings.TrimSpace(parsed.Image.URL)
}

func (s *iconService) buildFaviconURL(siteURL string) string {
	if siteURL == "" {
		return ""
	}
	parsed, err := url.Parse(siteURL)
	if err != nil || parsed.Hostname() == "" {
		return ""
	}
	return fmt.Sprintf("https://www.google.com/s2/favicons?domain=%s&sz=128", url.QueryEscape(parsed.Hostname()))
}

func (s *iconService) buildLocalFaviconURL(siteURL string) string {
	if siteURL == "" {
		return ""
	}
	parsed, err := url.Parse(siteURL)
	if err != nil || parsed.Hostname() == "" {
		return ""
	}
	scheme := parsed.Scheme
	if scheme == "" {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s/favicon.ico", scheme, parsed.Host)
}

func (s *iconService) buildDDGFaviconURL(siteURL string) string {
	if siteURL == "" {
		return ""
	}
	parsed, err := url.Parse(siteURL)
	if err != nil || parsed.Hostname() == "" {
		return ""
	}
	return fmt.Sprintf("https://icons.duckduckgo.com/ip3/%s.ico", parsed.Hostname())
}

func iconFilename(siteURL, ext string) string {
	if siteURL == "" {
		return ""
	}
	parsed, err := url.Parse(siteURL)
	if err != nil || parsed.Hostname() == "" {
		return ""
	}
	if ext == "" {
		ext = ".png"
	}
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	return filepath.Clean(parsed.Hostname()) + ext
}

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

func (s *iconService) downloadIconWithFormat(ctx context.Context, iconURL string) (*iconDownloadResult, error) {
	res, err := fetchHTTPWithAnubis(ctx, httpFetchOptions{
		URL:           iconURL,
		Timeout:       iconTimeout,
		MaxBodyBytes:  maxIconBodyBytes,
		UserAgent:     config.DefaultUserAgent,
		ClientFactory: s.clientFactory,
		Anubis:        s.anubis,
		OnAnubisSolved: func(host string) {
			logger.Debug("icon download detected anubis challenge", "module", "service", "action", "fetch", "resource", "icon", "result", "ok", "host", host)
		},
	})
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", res.StatusCode)
	}

	format, err := detectImageFormat(res.Body)
	if err != nil {
		return nil, fmt.Errorf("invalid icon format: %w", err)
	}

	return &iconDownloadResult{
		data:   res.Body,
		format: format,
	}, nil
}

func (s *iconService) ClearAllIcons(ctx context.Context) (int64, error) {
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

	if _, err = s.feeds.ClearAllIconPaths(ctx); err != nil {
		logger.Error("icon cache clear db failed", "module", "service", "action", "clear", "resource", "icon", "result", "failed", "error", err)
		return deletedFiles, fmt.Errorf("clear icon paths in db: %w", err)
	}

	if _, err = s.feeds.ClearAllConditionalGet(ctx); err != nil {
		logger.Error("icon cache clear conditional get failed", "module", "service", "action", "clear", "resource", "icon", "result", "failed", "error", err)
		return deletedFiles, fmt.Errorf("clear conditional get: %w", err)
	}

	logger.Info("icon cache cleared", "module", "service", "action", "clear", "resource", "icon", "result", "ok", "count", deletedFiles)
	return deletedFiles, nil
}

func isSVG(data []byte) bool {
	if len(data) < 10 {
		return false
	}
	return isSVGDocument(data)
}

func isICO(data []byte) bool {
	if len(data) < 6 {
		return false
	}
	if data[0] == 0x00 && data[1] == 0x00 && (data[2] == 0x01 || data[2] == 0x02) && data[3] == 0x00 {
		numImages := int(data[4]) | int(data[5])<<8
		return numImages > 0
	}
	return false
}

type iconFormat struct {
	ext    string
	width  int
	height int
}

func detectImageFormat(data []byte) (*iconFormat, error) {
	if isSVG(data) {
		return &iconFormat{ext: "svg", width: 9999, height: 9999}, nil
	}
	if isICO(data) {
		return &iconFormat{ext: "ico", width: 32, height: 32}, nil
	}

	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("unknown image format: %w", err)
	}
	if format == "jpeg" {
		format = "jpg"
	}
	if cfg.Width <= 1 || cfg.Height <= 1 {
		return nil, fmt.Errorf("icon dimensions too small: %dx%d", cfg.Width, cfg.Height)
	}

	return &iconFormat{ext: format, width: cfg.Width, height: cfg.Height}, nil
}
