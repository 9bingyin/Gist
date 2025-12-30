package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gist/backend/internal/repository"
)

type IconService interface {
	// FetchAndSaveIcon downloads and saves the icon locally
	// Returns relative path like "1.png"
	FetchAndSaveIcon(ctx context.Context, feedID int64, feedImageURL, siteURL string) (string, error)
	// EnsureIcon checks if the icon file exists, re-downloads if missing
	EnsureIcon(ctx context.Context, feedID int64, iconPath, siteURL string) error
	// BackfillIcons fetches icons for all feeds that don't have one
	BackfillIcons(ctx context.Context) error
}

type iconService struct {
	dataDir    string
	feeds      repository.FeedRepository
	httpClient *http.Client
}

func NewIconService(dataDir string, feeds repository.FeedRepository) IconService {
	return &iconService{
		dataDir: dataDir,
		feeds:   feeds,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (s *iconService) FetchAndSaveIcon(ctx context.Context, feedID int64, feedImageURL, siteURL string) (string, error) {
	// Determine icon URL: prefer feed image, fallback to Google Favicon API
	iconURL := strings.TrimSpace(feedImageURL)
	if iconURL == "" {
		iconURL = s.buildFaviconURL(siteURL)
	}
	if iconURL == "" {
		return "", nil
	}

	// Download icon
	iconData, err := s.downloadIcon(ctx, iconURL)
	if err != nil {
		// Try Google Favicon API as fallback if feed image failed
		if feedImageURL != "" {
			iconURL = s.buildFaviconURL(siteURL)
			if iconURL != "" {
				iconData, err = s.downloadIcon(ctx, iconURL)
			}
		}
		if err != nil {
			return "", nil // Silently fail, icon is optional
		}
	}

	// Save to file
	iconPath := fmt.Sprintf("%d.png", feedID)
	fullPath := filepath.Join(s.dataDir, "icons", iconPath)

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return "", fmt.Errorf("create icons dir: %w", err)
	}

	if err := os.WriteFile(fullPath, iconData, 0644); err != nil {
		return "", fmt.Errorf("write icon file: %w", err)
	}

	return iconPath, nil
}

func (s *iconService) EnsureIcon(ctx context.Context, feedID int64, iconPath, siteURL string) error {
	if iconPath == "" {
		return nil
	}

	fullPath := filepath.Join(s.dataDir, "icons", iconPath)

	// Check if file exists
	if _, err := os.Stat(fullPath); err == nil {
		return nil // File exists
	}

	// File missing, re-download
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

func (s *iconService) BackfillIcons(ctx context.Context) error {
	feeds, err := s.feeds.ListWithoutIcon(ctx)
	if err != nil {
		return fmt.Errorf("list feeds without icon: %w", err)
	}

	for _, feed := range feeds {
		siteURL := ""
		if feed.SiteURL != nil {
			siteURL = *feed.SiteURL
		}
		if siteURL == "" {
			siteURL = feed.URL
		}

		iconPath, err := s.FetchAndSaveIcon(ctx, feed.ID, "", siteURL)
		if err != nil {
			continue // Skip failed feeds
		}
		if iconPath != "" {
			if err := s.feeds.UpdateIconPath(ctx, feed.ID, iconPath); err != nil {
				continue
			}
		}
	}

	return nil
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

func (s *iconService) downloadIcon(ctx context.Context, iconURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, iconURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Gist/1.0")

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

	// Check minimum size (avoid empty/broken images)
	if len(data) < 100 {
		return nil, fmt.Errorf("icon too small")
	}

	return data, nil
}
