package service

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"

	"gist-backend/internal/model"
	"gist-backend/internal/repository"
)

type RefreshService interface {
	RefreshAll(ctx context.Context) error
	RefreshFeed(ctx context.Context, feedID int64) error
}

type refreshService struct {
	feeds      repository.FeedRepository
	entries    repository.EntryRepository
	httpClient *http.Client
}

func NewRefreshService(feeds repository.FeedRepository, entries repository.EntryRepository, httpClient *http.Client) RefreshService {
	client := httpClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &refreshService{
		feeds:      feeds,
		entries:    entries,
		httpClient: client,
	}
}

func (s *refreshService) RefreshAll(ctx context.Context) error {
	feeds, err := s.feeds.List(ctx, nil)
	if err != nil {
		return err
	}

	for _, feed := range feeds {
		if err := s.refreshFeedInternal(ctx, feed); err != nil {
			log.Printf("refresh feed %d (%s): %v", feed.ID, feed.Title, err)
			continue
		}
	}

	return nil
}

func (s *refreshService) RefreshFeed(ctx context.Context, feedID int64) error {
	feed, err := s.feeds.GetByID(ctx, feedID)
	if err != nil {
		return err
	}
	return s.refreshFeedInternal(ctx, feed)
}

func (s *refreshService) refreshFeedInternal(ctx context.Context, feed model.Feed) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Gist/1.0")

	// Conditional GET
	if feed.ETag != nil && *feed.ETag != "" {
		req.Header.Set("If-None-Match", *feed.ETag)
	}
	if feed.LastModified != nil && *feed.LastModified != "" {
		req.Header.Set("If-Modified-Since", *feed.LastModified)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Not modified, skip parsing
	if resp.StatusCode == http.StatusNotModified {
		log.Printf("feed %d (%s): not modified", feed.ID, feed.Title)
		return nil
	}

	if resp.StatusCode >= http.StatusBadRequest {
		log.Printf("feed %d (%s): HTTP %d", feed.ID, feed.Title, resp.StatusCode)
		return nil
	}

	parser := gofeed.NewParser()
	parsed, err := parser.Parse(resp.Body)
	if err != nil {
		return err
	}

	// Update feed ETag and LastModified
	newETag := strings.TrimSpace(resp.Header.Get("ETag"))
	newLastModified := strings.TrimSpace(resp.Header.Get("Last-Modified"))
	if newETag != "" || newLastModified != "" {
		feed.ETag = optionalString(newETag)
		feed.LastModified = optionalString(newLastModified)
		if _, err := s.feeds.Update(ctx, feed); err != nil {
			log.Printf("update feed %d etag: %v", feed.ID, err)
		}
	}

	// Save entries
	savedCount := 0
	for _, item := range parsed.Items {
		entry := itemToEntry(feed.ID, item)
		if entry.URL == nil || *entry.URL == "" {
			continue
		}

		// Check if entry already exists
		exists, err := s.entries.ExistsByURL(ctx, feed.ID, *entry.URL)
		if err != nil {
			log.Printf("check entry exists: %v", err)
			continue
		}
		if exists {
			continue
		}

		if err := s.entries.CreateOrUpdate(ctx, entry); err != nil {
			log.Printf("save entry: %v", err)
			continue
		}
		savedCount++
	}

	log.Printf("feed %d (%s): saved %d new entries", feed.ID, feed.Title, savedCount)
	return nil
}

func itemToEntry(feedID int64, item *gofeed.Item) model.Entry {
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

	if item.Author != nil && item.Author.Name != "" {
		author := strings.TrimSpace(item.Author.Name)
		entry.Author = &author
	}

	if item.PublishedParsed != nil {
		t := item.PublishedParsed.UTC()
		entry.PublishedAt = &t
	} else if item.UpdatedParsed != nil {
		t := item.UpdatedParsed.UTC()
		entry.PublishedAt = &t
	}

	return entry
}
