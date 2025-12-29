package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"

	"gist-backend/internal/model"
	"gist-backend/internal/repository"
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
	httpClient *http.Client
}

func NewFeedService(feeds repository.FeedRepository, folders repository.FolderRepository, httpClient *http.Client) FeedService {
	client := httpClient
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	return &feedService{feeds: feeds, folders: folders, httpClient: client}
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

	return s.feeds.Create(ctx, feed)
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
	title       string
	description string
	siteURL     string
	imageURL    string
	lastUpdated string
	itemCount   *int
	etag        string
	lastModified string
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
	}, nil
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
