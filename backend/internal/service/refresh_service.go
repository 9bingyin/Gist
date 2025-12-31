package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
)

var ErrAlreadyRefreshing = errors.New("refresh already in progress")

type RefreshService interface {
	RefreshAll(ctx context.Context) error
	RefreshFeed(ctx context.Context, feedID int64) error
	IsRefreshing() bool
}

type refreshService struct {
	feeds        repository.FeedRepository
	entries      repository.EntryRepository
	httpClient   *http.Client
	mu           sync.Mutex
	isRefreshing bool
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

	for _, feed := range feeds {
		if err := s.refreshFeedInternal(ctx, feed); err != nil {
			log.Printf("refresh feed %d (%s): %v", feed.ID, feed.Title, err)
			continue
		}
	}

	return nil
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

func (s *refreshService) refreshFeedInternal(ctx context.Context, feed model.Feed) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
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

	if resp.StatusCode >= http.StatusBadRequest {
		log.Printf("feed %d (%s): HTTP %d", feed.ID, feed.Title, resp.StatusCode)
		errMsg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return nil
	}

	parser := gofeed.NewParser()
	parsed, err := parser.Parse(resp.Body)
	if err != nil {
		errMsg := err.Error()
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, &errMsg)
		return err
	}

	// Clear error message on successful refresh
	if feed.ErrorMessage != nil {
		_ = s.feeds.UpdateErrorMessage(ctx, feed.ID, nil)
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
	return nil
}

