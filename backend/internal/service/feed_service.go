package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
)

type FeedService interface {
	Add(ctx context.Context, feedURL string, folderID *int64, titleOverride string) (model.Feed, error)
	Preview(ctx context.Context, feedURL string) (FeedPreview, error)
	List(ctx context.Context, folderID *int64) ([]model.Feed, error)
	Update(ctx context.Context, id int64, title string, folderID *int64) (model.Feed, error)
	Delete(ctx context.Context, id int64) error
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
	feeds      repository.FeedRepository
	folders    repository.FolderRepository
	entries    repository.EntryRepository
	icons      IconService
	httpClient *http.Client
}

func NewFeedService(feeds repository.FeedRepository, folders repository.FolderRepository, entries repository.EntryRepository, icons IconService, httpClient *http.Client) FeedService {
	client := httpClient
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	return &feedService{feeds: feeds, folders: folders, entries: entries, icons: icons, httpClient: client}
}

func (s *feedService) Add(ctx context.Context, feedURL string, folderID *int64, titleOverride string) (model.Feed, error) {
	trimmedURL := strings.TrimSpace(feedURL)
	if !isValidURL(trimmedURL) {
		return model.Feed{}, ErrInvalid
	}
	if existing, err := s.feeds.FindByURL(ctx, trimmedURL); err != nil {
		return model.Feed{}, fmt.Errorf("check feed url: %w", err)
	} else if existing != nil {
		return model.Feed{}, ErrConflict
	}
	if folderID != nil {
		if _, err := s.folders.GetByID(ctx, *folderID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return model.Feed{}, ErrNotFound
			}
			return model.Feed{}, fmt.Errorf("check folder: %w", err)
		}
	}

	fetched, err := s.fetchFeed(ctx, trimmedURL)
	if err != nil {
		return model.Feed{}, err
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
		ETag:         optionalString(fetched.etag),
		LastModified: optionalString(fetched.lastModified),
	}

	created, err := s.feeds.Create(ctx, feed)
	if err != nil {
		return model.Feed{}, err
	}

	// Download and save icon
	if s.icons != nil {
		siteURL := ""
		if created.SiteURL != nil {
			siteURL = *created.SiteURL
		}
		if iconPath, err := s.icons.FetchAndSaveIcon(ctx, created.ID, fetched.imageURL, siteURL); err == nil && iconPath != "" {
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
		_ = s.entries.CreateOrUpdate(ctx, entry)
	}

	return created, nil
}

func (s *feedService) Preview(ctx context.Context, feedURL string) (FeedPreview, error) {
	trimmedURL := strings.TrimSpace(feedURL)
	if !isValidURL(trimmedURL) {
		return FeedPreview{}, ErrInvalid
	}

	fetched, err := s.fetchFeed(ctx, trimmedURL)
	if err != nil {
		return FeedPreview{}, err
	}

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
	return s.feeds.List(ctx, folderID)
}

func (s *feedService) Update(ctx context.Context, id int64, title string, folderID *int64) (model.Feed, error) {
	trimmedTitle := strings.TrimSpace(title)
	if trimmedTitle == "" {
		return model.Feed{}, ErrInvalid
	}
	if folderID != nil {
		if _, err := s.folders.GetByID(ctx, *folderID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return model.Feed{}, ErrNotFound
			}
			return model.Feed{}, fmt.Errorf("check folder: %w", err)
		}
	}

	feed, err := s.feeds.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return model.Feed{}, ErrNotFound
		}
		return model.Feed{}, fmt.Errorf("get feed: %w", err)
	}
	feed.Title = trimmedTitle
	feed.FolderID = folderID

	return s.feeds.Update(ctx, feed)
}

func (s *feedService) Delete(ctx context.Context, id int64) error {
	if _, err := s.feeds.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get feed: %w", err)
	}
	return s.feeds.Delete(ctx, id)
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
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return feedFetch{}, ErrFeedFetch
	}
	req.Header.Set("User-Agent", "Gist/1.0")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return feedFetch{}, ErrFeedFetch
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return feedFetch{}, ErrFeedFetch
	}

	parser := gofeed.NewParser()
	parsed, err := parser.Parse(resp.Body)
	if err != nil {
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
		author := strings.TrimSpace(item.Author.Name)
		entry.Author = &author
	}

	entry.PublishedAt = extractPublishedAt(item, ignoreDynamicTime)

	return entry
}

func extractPublishedAt(item *gofeed.Item, ignoreDynamicTime bool) *time.Time {
	now := time.Now()

	// 1. Try to extract from summary (SEC RSS: "Filed: 2025-12-17")
	if t := extractDateFromSummary(item.Description); t != nil {
		return t
	}

	// 2. Try standard fields, reject future dates
	if item.PublishedParsed != nil && !item.PublishedParsed.After(now) {
		t := item.PublishedParsed.UTC()
		return &t
	}
	if !ignoreDynamicTime && item.UpdatedParsed != nil && !item.UpdatedParsed.After(now) {
		t := item.UpdatedParsed.UTC()
		return &t
	}

	return nil
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
	if strings.TrimSpace(value) == "" {
		return nil
	}
	trimmed := strings.TrimSpace(value)
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
