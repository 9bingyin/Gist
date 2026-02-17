//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"

	"gist/backend/internal/config"
	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
	"gist/backend/pkg/sanitizer"
)

const feedTimeout = 30 * time.Second

type FeedService interface {
	Add(ctx context.Context, feedURL string, folderID *int64, titleOverride string, feedType string) (model.Feed, error)
	AddWithoutFetch(ctx context.Context, feedURL string, folderID *int64, titleOverride string, feedType string) (model.Feed, bool, error)
	Preview(ctx context.Context, feedURL string) (FeedPreview, error)
	List(ctx context.Context, folderID *int64) ([]model.Feed, error)
	Update(ctx context.Context, id int64, title string, folderID *int64) (model.Feed, error)
	UpdateType(ctx context.Context, id int64, feedType string) error
	Delete(ctx context.Context, id int64) error
	DeleteBatch(ctx context.Context, ids []int64) error
}

type FeedPreview struct {
	URL         string
	Title       string
	Description *string
	SiteURL     *string
	ImageURL    *string
	ItemCount   *int
	LastUpdated *string
}

type feedService struct {
	feeds         repository.FeedRepository
	folders       repository.FolderRepository
	entries       repository.EntryRepository
	icons         IconService
	settings      SettingsService
	clientFactory *network.ClientFactory
	anubis        AnubisSolver
}

func NewFeedService(feeds repository.FeedRepository, folders repository.FolderRepository, entries repository.EntryRepository, icons IconService, settings SettingsService, clientFactory *network.ClientFactory, anubisSolver AnubisSolver) FeedService {
	return &feedService{feeds: feeds, folders: folders, entries: entries, icons: icons, settings: settings, clientFactory: clientFactory, anubis: anubisSolver}
}

func (s *feedService) Add(ctx context.Context, feedURL string, folderID *int64, titleOverride string, feedType string) (model.Feed, error) {
	trimmedURL := strings.TrimSpace(feedURL)
	if !isValidURL(trimmedURL) {
		return model.Feed{}, ErrInvalid
	}
	if existing, err := s.feeds.FindByURL(ctx, trimmedURL); err != nil {
		return model.Feed{}, fmt.Errorf("check feed url: %w", err)
	} else if existing != nil {
		return model.Feed{}, &FeedConflictError{ExistingFeed: *existing}
	}
	if folderID != nil {
		folder, err := s.folders.GetByID(ctx, *folderID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return model.Feed{}, ErrNotFound
			}
			return model.Feed{}, fmt.Errorf("check folder: %w", err)
		}
		if folder.Type != feedType {
			logger.Warn("feed type mismatch with folder type", "module", "service", "action", "create", "resource", "feed", "result", "failed", "folder_id", *folderID, "folder_type", folder.Type, "feed_type", feedType)
			return model.Feed{}, ErrInvalid
		}
	}

	fetched, fetchErr := s.fetchFeed(ctx, trimmedURL)
	if fetchErr != nil {
		logger.Warn("feed fetch failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(trimmedURL), "error", fetchErr)
		// Fetch failed, create feed with error message
		finalTitle := strings.TrimSpace(titleOverride)
		if finalTitle == "" {
			finalTitle = trimmedURL
		}
		errMsg := fetchErr.Error()
		feed := model.Feed{
			FolderID:     folderID,
			Title:        finalTitle,
			URL:          trimmedURL,
			Type:         feedType,
			ErrorMessage: &errMsg,
		}
		return s.feeds.Create(ctx, feed)
	}

	finalTitle := strings.TrimSpace(titleOverride)
	if finalTitle == "" {
		finalTitle = strings.TrimSpace(fetched.title)
	}
	if finalTitle == "" {
		finalTitle = trimmedURL
	}

	feed := model.Feed{
		FolderID:     folderID,
		Title:        finalTitle,
		URL:          trimmedURL,
		SiteURL:      optionalString(fetched.siteURL),
		Description:  optionalString(fetched.description),
		Type:         feedType,
		ETag:         optionalString(fetched.etag),
		LastModified: optionalString(fetched.lastModified),
	}

	created, err := s.feeds.Create(ctx, feed)
	if err != nil {
		logger.Error("feed create failed", "module", "service", "action", "create", "resource", "feed", "result", "failed", "host", network.ExtractHost(trimmedURL), "error", err)
		return model.Feed{}, err
	}

	logger.Info("feed created", "module", "service", "action", "create", "resource", "feed", "result", "ok", "feed_id", created.ID, "feed_title", created.Title, "host", network.ExtractHost(created.URL))

	// Download and save icon
	if s.icons != nil {
		siteURL := ""
		if created.SiteURL != nil {
			siteURL = *created.SiteURL
		}
		if siteURL == "" {
			siteURL = trimmedURL // Use feed URL as fallback for favicon
		}
		if iconPath, err := s.icons.FetchAndSaveIcon(ctx, fetched.imageURL, siteURL); err == nil && iconPath != "" {
			_ = s.feeds.UpdateIconPath(ctx, created.ID, iconPath)
			created.IconPath = &iconPath
		}
	}

	// Save entries from the fetched feed
	dynamicTime := hasDynamicTime(fetched.items)
	for _, item := range fetched.items {
		entry := itemToEntry(created.ID, item, dynamicTime)
		if entry.URL == nil || *entry.URL == "" {
			continue
		}
		if err := s.entries.CreateOrUpdate(ctx, entry); err != nil {
			logger.Warn("entry create failed", "module", "service", "action", "create", "resource", "entry", "result", "failed", "feed_id", created.ID, "feed_title", created.Title, "host", network.ExtractHost(*entry.URL), "error", err)
		}
	}

	return created, nil
}

// AddWithoutFetch creates a feed record without fetching content.
// Returns (feed, isNew, error). isNew is true if a new feed was created.
func (s *feedService) AddWithoutFetch(ctx context.Context, feedURL string, folderID *int64, titleOverride string, feedType string) (model.Feed, bool, error) {
	trimmedURL := strings.TrimSpace(feedURL)
	if !isValidURL(trimmedURL) {
		return model.Feed{}, false, ErrInvalid
	}
	if existing, err := s.feeds.FindByURL(ctx, trimmedURL); err != nil {
		return model.Feed{}, false, fmt.Errorf("check feed url: %w", err)
	} else if existing != nil {
		return *existing, false, nil // Feed already exists, not an error
	}
	if folderID != nil {
		folder, err := s.folders.GetByID(ctx, *folderID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return model.Feed{}, false, ErrNotFound
			}
			return model.Feed{}, false, fmt.Errorf("check folder: %w", err)
		}
		if folder.Type != feedType {
			logger.Warn("feed type mismatch with folder type", "module", "service", "action", "create", "resource", "feed", "result", "failed", "folder_id", *folderID, "folder_type", folder.Type, "feed_type", feedType)
			return model.Feed{}, false, ErrInvalid
		}
	}

	finalTitle := strings.TrimSpace(titleOverride)
	if finalTitle == "" {
		finalTitle = trimmedURL
	}

	feed := model.Feed{
		FolderID: folderID,
		Title:    finalTitle,
		URL:      trimmedURL,
		Type:     feedType,
	}

	created, err := s.feeds.Create(ctx, feed)
	if err != nil {
		logger.Error("feed create without fetch failed", "module", "service", "action", "create", "resource", "feed", "result", "failed", "host", network.ExtractHost(trimmedURL), "error", err)
		return model.Feed{}, false, err
	}

	logger.Info("feed created without fetch", "module", "service", "action", "create", "resource", "feed", "result", "ok", "feed_id", created.ID, "feed_title", created.Title, "host", network.ExtractHost(created.URL))
	return created, true, nil
}

func (s *feedService) Preview(ctx context.Context, feedURL string) (FeedPreview, error) {
	trimmedURL := strings.TrimSpace(feedURL)
	if !isValidURL(trimmedURL) {
		return FeedPreview{}, ErrInvalid
	}

	fetched, err := s.fetchFeed(ctx, trimmedURL)
	if err != nil {
		logger.Warn("feed preview failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(trimmedURL), "error", err)
		return FeedPreview{}, err
	}

	logger.Debug("feed preview fetched", "module", "service", "action", "fetch", "resource", "feed", "result", "ok", "host", network.ExtractHost(trimmedURL))

	title := strings.TrimSpace(fetched.title)
	if title == "" {
		title = trimmedURL
	}
	preview := FeedPreview{
		URL:         trimmedURL,
		Title:       title,
		Description: optionalString(fetched.description),
		SiteURL:     optionalString(fetched.siteURL),
		ImageURL:    optionalString(fetched.imageURL),
		ItemCount:   fetched.itemCount,
		LastUpdated: optionalString(fetched.lastUpdated),
	}

	return preview, nil
}

func (s *feedService) List(ctx context.Context, folderID *int64) ([]model.Feed, error) {
	feeds, err := s.feeds.List(ctx, folderID)
	if err != nil {
		logger.Error("feed list failed", "module", "service", "action", "list", "resource", "feed", "result", "failed", "folder_id", folderID, "error", err)
		return nil, err
	}
	return feeds, nil
}

func (s *feedService) Update(ctx context.Context, id int64, title string, folderID *int64) (model.Feed, error) {
	trimmedTitle := strings.TrimSpace(title)
	if trimmedTitle == "" {
		return model.Feed{}, ErrInvalid
	}

	feed, err := s.feeds.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return model.Feed{}, ErrNotFound
		}
		return model.Feed{}, fmt.Errorf("get feed: %w", err)
	}

	// Check if folder is actually changing (value comparison, not pointer comparison)
	folderChanged := false
	if folderID == nil && feed.FolderID != nil {
		folderChanged = true // moving from folder to no folder
	} else if folderID != nil && feed.FolderID == nil {
		folderChanged = true // moving from no folder to folder
	} else if folderID != nil && feed.FolderID != nil && *folderID != *feed.FolderID {
		folderChanged = true // moving from one folder to another
	}

	if folderID != nil && folderChanged {
		folder, err := s.folders.GetByID(ctx, *folderID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return model.Feed{}, ErrNotFound
			}
			return model.Feed{}, fmt.Errorf("check folder: %w", err)
		}
		if folder.Type != feed.Type {
			logger.Warn("feed type mismatch with folder type", "module", "service", "action", "update", "resource", "feed", "result", "failed", "feed_id", id, "folder_id", *folderID, "folder_type", folder.Type, "feed_type", feed.Type)
			return model.Feed{}, ErrInvalid
		}
	}
	feed.Title = trimmedTitle
	feed.FolderID = folderID

	updated, err := s.feeds.Update(ctx, feed)
	if err != nil {
		logger.Error("feed update failed", "module", "service", "action", "update", "resource", "feed", "result", "failed", "feed_id", id, "error", err)
		return model.Feed{}, err
	}
	logger.Info("feed updated", "module", "service", "action", "update", "resource", "feed", "result", "ok", "feed_id", updated.ID, "feed_title", updated.Title)
	return updated, nil
}

func (s *feedService) Delete(ctx context.Context, id int64) error {
	if _, err := s.feeds.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get feed: %w", err)
	}
	if err := s.feeds.Delete(ctx, id); err != nil {
		logger.Error("feed delete failed", "module", "service", "action", "delete", "resource", "feed", "result", "failed", "feed_id", id, "error", err)
		return err
	}
	logger.Info("feed deleted", "module", "service", "action", "delete", "resource", "feed", "result", "ok", "feed_id", id)
	return nil
}

func (s *feedService) UpdateType(ctx context.Context, id int64, feedType string) error {
	if _, err := s.feeds.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get feed: %w", err)
	}
	if err := s.feeds.UpdateType(ctx, id, feedType); err != nil {
		logger.Error("feed update type failed", "module", "service", "action", "update", "resource", "feed", "result", "failed", "feed_id", id, "type", feedType, "error", err)
		return err
	}
	logger.Info("feed type updated", "module", "service", "action", "update", "resource", "feed", "result", "ok", "feed_id", id, "type", feedType)
	return nil
}

func (s *feedService) DeleteBatch(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	// Delete and check affected rows to detect missing IDs
	affected, err := s.feeds.DeleteBatch(ctx, ids)
	if err != nil {
		logger.Error("feed batch delete failed", "module", "service", "action", "delete", "resource", "feed", "result", "failed", "count", len(ids), "error", err)
		return err
	}
	if affected != int64(len(ids)) {
		logger.Warn("feed batch delete missing", "module", "service", "action", "delete", "resource", "feed", "result", "failed", "count", len(ids), "affected", affected)
		return ErrNotFound
	}
	logger.Info("feed batch deleted", "module", "service", "action", "delete", "resource", "feed", "result", "ok", "count", len(ids))
	return nil
}

type feedFetch struct {
	title        string
	description  string
	siteURL      string
	imageURL     string
	lastUpdated  string
	itemCount    *int
	etag         string
	lastModified string
	items        []*gofeed.Item
}

func (s *feedService) fetchFeed(ctx context.Context, feedURL string) (feedFetch, error) {
	return s.fetchFeedWithUA(ctx, feedURL, config.DefaultUserAgent, true)
}

func (s *feedService) fetchFeedWithUA(ctx context.Context, feedURL string, userAgent string, allowFallback bool) (feedFetch, error) {
	return s.fetchFeedWithCookie(ctx, feedURL, userAgent, "", allowFallback, 0)
}

func (s *feedService) fetchFeedWithCookie(ctx context.Context, feedURL string, userAgent string, cookie string, allowFallback bool, retryCount int) (feedFetch, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return feedFetch{}, ErrFeedFetch
	}
	req.Header.Set("User-Agent", userAgent)

	// Add cached Anubis cookie if available
	if cookie == "" {
		host := network.ExtractHost(feedURL)
		if cachedCookie := getCachedAnubisCookie(ctx, s.anubis, host, req.Header); cachedCookie != "" {
			cookie = cachedCookie
		}
	}

	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	httpClient := s.clientFactory.NewHTTPClient(ctx, feedTimeout)
	resp, err := httpClient.Do(req)
	if err != nil {
		logger.Warn("feed preview fetch failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "error", err)
		return feedFetch{}, ErrFeedFetch
	}
	defer resp.Body.Close()

	// On HTTP error, try fallback UA if available
	if resp.StatusCode >= http.StatusBadRequest && allowFallback && s.settings != nil {
		fallbackUA := s.settings.GetFallbackUserAgent(ctx)
		if fallbackUA != "" {
			logger.Warn("feed preview retry with fallback ua", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "status_code", resp.StatusCode)
			return s.fetchFeedWithCookie(ctx, feedURL, fallbackUA, cookie, false, retryCount)
		}
	}

	if resp.StatusCode >= http.StatusBadRequest {
		logger.Error("feed preview http error", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "status_code", resp.StatusCode)
		return feedFetch{}, ErrFeedFetch
	}

	// Read body into memory for Anubis detection and RSS parsing
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Warn("feed preview read failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "error", err)
		return feedFetch{}, ErrFeedFetch
	}

	// Try to parse as RSS/Atom
	parser := gofeed.NewParser()
	parsed, parseErr := parser.Parse(bytes.NewReader(body))
	if parseErr != nil {
		newCookie, anubisErr := trySolveAnubisChallenge(ctx, s.anubis, body, feedURL, resp.Cookies(), req.Header.Clone(), retryCount)
		switch {
		case anubisErr == nil:
			// Retry with fresh client and same request fingerprint.
			return s.fetchFeedWithFreshClient(ctx, feedURL, userAgent, newCookie, retryCount+1)
		case errors.Is(anubisErr, errAnubisRejected):
			logger.Warn("feed preview upstream rejected", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL))
			return feedFetch{}, fmt.Errorf("upstream rejected")
		case errors.Is(anubisErr, errAnubisRetryExceeded):
			logger.Warn("feed preview anubis persists", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "retry_count", retryCount)
			return feedFetch{}, fmt.Errorf("anubis challenge persists after %d retries", retryCount)
		case anubisErr != nil && !errors.Is(anubisErr, errAnubisNotPage):
			logger.Warn("feed preview anubis solve failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "error", anubisErr)
			return feedFetch{}, ErrFeedFetch
		}
		logger.Error("feed preview parse failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "error", parseErr)
		return feedFetch{}, ErrFeedFetch

	}

	title := strings.TrimSpace(parsed.Title)
	description := strings.TrimSpace(parsed.Description)
	siteURL := strings.TrimSpace(parsed.Link)
	imageURL := ""
	if parsed.Image != nil {
		imageURL = strings.TrimSpace(parsed.Image.URL)
	}
	lastUpdated := ""
	if parsed.UpdatedParsed != nil {
		lastUpdated = parsed.UpdatedParsed.UTC().Format(time.RFC3339)
	} else if parsed.PublishedParsed != nil {
		lastUpdated = parsed.PublishedParsed.UTC().Format(time.RFC3339)
	}
	var itemCount *int
	if parsed.Items != nil {
		count := len(parsed.Items)
		itemCount = &count
	}

	etag := strings.TrimSpace(resp.Header.Get("ETag"))
	lastModified := strings.TrimSpace(resp.Header.Get("Last-Modified"))

	return feedFetch{
		title:        title,
		description:  description,
		siteURL:      siteURL,
		imageURL:     imageURL,
		lastUpdated:  lastUpdated,
		itemCount:    itemCount,
		etag:         etag,
		lastModified: lastModified,
		items:        parsed.Items,
	}, nil
}

// fetchFeedWithFreshClient creates a new http.Client to avoid connection reuse after Anubis
func (s *feedService) fetchFeedWithFreshClient(ctx context.Context, feedURL string, userAgent string, cookie string, retryCount int) (feedFetch, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return feedFetch{}, ErrFeedFetch
	}
	req.Header.Set("User-Agent", userAgent)
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	// Use fresh client to avoid connection reuse
	freshClient := s.clientFactory.NewHTTPClient(ctx, feedTimeout)
	resp, err := freshClient.Do(req)
	if err != nil {
		logger.Warn("feed preview fetch failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "error", err)
		return feedFetch{}, ErrFeedFetch
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		logger.Error("feed preview http error", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "status_code", resp.StatusCode)
		return feedFetch{}, ErrFeedFetch
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Warn("feed preview read failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "error", err)
		return feedFetch{}, ErrFeedFetch
	}

	newCookie, anubisErr := trySolveAnubisChallenge(ctx, s.anubis, body, feedURL, resp.Cookies(), req.Header.Clone(), retryCount)
	switch {
	case anubisErr == nil:
		return s.fetchFeedWithFreshClient(ctx, feedURL, userAgent, newCookie, retryCount+1)
	case errors.Is(anubisErr, errAnubisRejected):
		logger.Warn("feed preview upstream rejected", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL))
		return feedFetch{}, fmt.Errorf("upstream rejected")
	case errors.Is(anubisErr, errAnubisRetryExceeded):
		logger.Warn("feed preview anubis persists", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "retry_count", retryCount)
		return feedFetch{}, fmt.Errorf("anubis challenge persists after %d retries", retryCount)
	case anubisErr != nil && !errors.Is(anubisErr, errAnubisNotPage):
		logger.Warn("feed preview anubis solve failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "error", anubisErr)
		return feedFetch{}, ErrFeedFetch
	}

	parser := gofeed.NewParser()
	parsed, parseErr := parser.Parse(bytes.NewReader(body))
	if parseErr != nil {
		logger.Error("feed preview parse failed", "module", "service", "action", "fetch", "resource", "feed", "result", "failed", "host", network.ExtractHost(feedURL), "error", parseErr)
		return feedFetch{}, ErrFeedFetch
	}

	title := strings.TrimSpace(parsed.Title)
	description := strings.TrimSpace(parsed.Description)
	siteURL := strings.TrimSpace(parsed.Link)
	imageURL := ""
	if parsed.Image != nil {
		imageURL = strings.TrimSpace(parsed.Image.URL)
	}
	lastUpdated := ""
	if parsed.UpdatedParsed != nil {
		lastUpdated = parsed.UpdatedParsed.UTC().Format(time.RFC3339)
	} else if parsed.PublishedParsed != nil {
		lastUpdated = parsed.PublishedParsed.UTC().Format(time.RFC3339)
	}
	var itemCount *int
	if parsed.Items != nil {
		count := len(parsed.Items)
		itemCount = &count
	}

	etag := strings.TrimSpace(resp.Header.Get("ETag"))
	lastModified := strings.TrimSpace(resp.Header.Get("Last-Modified"))

	return feedFetch{
		title:        title,
		description:  description,
		siteURL:      siteURL,
		imageURL:     imageURL,
		lastUpdated:  lastUpdated,
		itemCount:    itemCount,
		etag:         etag,
		lastModified: lastModified,
		items:        parsed.Items,
	}, nil
}

// hasDynamicTime checks if all items have the same updated time (dynamic generation)
func hasDynamicTime(items []*gofeed.Item) bool {
	if len(items) < 2 {
		return false
	}
	var firstTime *time.Time
	for _, item := range items {
		if item.UpdatedParsed != nil {
			if firstTime == nil {
				firstTime = item.UpdatedParsed
			} else if !firstTime.Equal(*item.UpdatedParsed) {
				return false
			}
		}
	}
	return firstTime != nil
}

func itemToEntry(feedID int64, item *gofeed.Item, ignoreDynamicTime bool) model.Entry {
	entry := model.Entry{
		FeedID: feedID,
	}

	if item.Title != "" {
		title := strings.TrimSpace(item.Title)
		entry.Title = &title
	}

	if item.Link != "" {
		url := strings.TrimSpace(item.Link)
		entry.URL = &url
	}

	content := item.Content
	if content == "" {
		content = item.Description
	}
	if content != "" {
		entry.Content = &content
	}

	// Extract thumbnail from media tags
	entry.ThumbnailURL = extractThumbnail(item)

	if item.Author != nil && item.Author.Name != "" {
		author := sanitizer.SanitizeAuthor(item.Author.Name)
		if author != "" {
			entry.Author = &author
		}
	}

	entry.PublishedAt = extractPublishedAt(item, ignoreDynamicTime)

	return entry
}

func extractPublishedAt(item *gofeed.Item, ignoreDynamicTime bool) *time.Time {
	// 1. Try to extract from summary (SEC RSS: "Filed: 2025-12-17")
	if t := extractDateFromSummary(item.Description); t != nil {
		return t
	}

	// 2. Try standard fields
	if item.PublishedParsed != nil {
		t := item.PublishedParsed.UTC()
		return &t
	}
	if !ignoreDynamicTime && item.UpdatedParsed != nil {
		t := item.UpdatedParsed.UTC()
		return &t
	}

	// Fallback to current time when no date is available
	now := time.Now().UTC()
	return &now
}

var filedDateRegex = regexp.MustCompile(`Filed:.*?(\d{4}-\d{2}-\d{2})`)

func extractDateFromSummary(summary string) *time.Time {
	if summary == "" {
		return nil
	}
	matches := filedDateRegex.FindStringSubmatch(summary)
	if len(matches) >= 2 {
		if t, err := time.Parse("2006-01-02", matches[1]); err == nil {
			utc := t.UTC()
			return &utc
		}
	}
	return nil
}

func extractThumbnail(item *gofeed.Item) *string {
	// 1. Check item.Image
	if item.Image != nil && item.Image.URL != "" {
		url := strings.TrimSpace(item.Image.URL)
		return &url
	}

	// 2. Check enclosures for image type
	for _, enc := range item.Enclosures {
		if strings.HasPrefix(enc.Type, "image/") {
			url := strings.TrimSpace(enc.URL)
			if url != "" {
				return &url
			}
		}
	}

	// 3. Check media:content and media:thumbnail
	if media, ok := item.Extensions["media"]; ok {
		// Check media:content
		if content, ok := media["content"]; ok {
			for _, c := range content {
				url := strings.TrimSpace(c.Attrs["url"])
				if url == "" {
					continue
				}
				// Check type attribute
				if typ := c.Attrs["type"]; strings.HasPrefix(typ, "image/") {
					return &url
				}
				// Check medium attribute
				if medium := c.Attrs["medium"]; medium == "image" {
					return &url
				}
			}
		}
		// Check media:thumbnail
		if thumb, ok := media["thumbnail"]; ok {
			for _, t := range thumb {
				url := strings.TrimSpace(t.Attrs["url"])
				if url != "" {
					return &url
				}
			}
		}
	}

	return nil
}

func optionalString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func isValidURL(value string) bool {
	parsed, err := url.ParseRequestURI(value)
	if err != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	return parsed.Host != ""
}
