//go:build integration

package service_test

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"gist/backend/internal/db"
	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/service"
	"gist/backend/pkg/network"
	"gist/backend/pkg/snowflake"

	"github.com/stretchr/testify/require"
)

func init() {
	// Initialize snowflake for integration tests
	_ = snowflake.Init(1)
}

// Test URLs for readability extraction
var testArticles = []struct {
	name string
	url  string
}{
	{"Cloudflare Blog Post", "https://blog.cloudflare.com/pingora-open-source/"},
	{"Tailscale Blog Post", "https://tailscale.com/blog/how-nat-traversal-works"},
}

func setupReadabilityTestDB(t *testing.T) *sql.DB {
	dbConn, err := db.Open(":memory:")
	require.NoError(t, err)

	err = db.Migrate(dbConn)
	require.NoError(t, err)

	t.Cleanup(func() {
		dbConn.Close()
	})

	return dbConn
}

func TestReadabilityService_Integration_FetchReadableContent(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") == "" {
		t.Skip("Skipping integration test. Set INTEGRATION_TEST=1 to run.")
	}

	dbConn := setupReadabilityTestDB(t)
	clientFactory := network.NewClientFactoryForTest(nil)
	entryRepo := repository.NewEntryRepository(dbConn)
	feedRepo := repository.NewFeedRepository(dbConn)

	// Create a feed first
	feed, err := feedRepo.Create(context.Background(), model.Feed{
		Title: "Test Feed",
		URL:   "https://example.com/feed",
		Type:  "article",
	})
	require.NoError(t, err)

	svc := service.NewReadabilityService(entryRepo, clientFactory, nil)
	defer svc.Close()

	for _, article := range testArticles {
		t.Run(article.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()

			// Create an entry with the test URL
			url := article.url
			title := article.name
			entry := model.Entry{
				FeedID: feed.ID,
				URL:    &url,
				Title:  &title,
				Hash:   hashString(url),
			}
			err := entryRepo.CreateOrUpdate(ctx, entry)
			require.NoError(t, err)

			// Get the created entry
			filter := repository.EntryListFilter{
				FeedID: &feed.ID,
				Limit:  10,
			}
			entries, err := entryRepo.List(ctx, filter)
			require.NoError(t, err)
			require.NotEmpty(t, entries)

			var targetEntry *model.Entry
			for _, e := range entries {
				if e.URL != nil && *e.URL == url {
					targetEntry = &e
					break
				}
			}
			require.NotNil(t, targetEntry, "entry not found")

			// Fetch readable content
			content, err := svc.FetchReadableContent(ctx, targetEntry.ID)
			require.NoError(t, err)
			require.NotEmpty(t, content, "expected non-empty readable content")

			t.Logf("Fetched readable content for: %s", article.name)
			t.Logf("Content length: %d bytes", len(content))

			// Content should contain HTML
			require.Contains(t, content, "<")
		})
	}
}

func TestReadabilityService_Integration_CachedContent(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") == "" {
		t.Skip("Skipping integration test. Set INTEGRATION_TEST=1 to run.")
	}

	dbConn := setupReadabilityTestDB(t)
	clientFactory := network.NewClientFactoryForTest(nil)
	entryRepo := repository.NewEntryRepository(dbConn)
	feedRepo := repository.NewFeedRepository(dbConn)

	// Create a feed
	feed, err := feedRepo.Create(context.Background(), model.Feed{
		Title: "Test Feed",
		URL:   "https://example.com/feed",
		Type:  "article",
	})
	require.NoError(t, err)

	svc := service.NewReadabilityService(entryRepo, clientFactory, nil)
	defer svc.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Create an entry
	url := "https://example.com/article"
	title := "Cached Article"
	entry := model.Entry{
		FeedID: feed.ID,
		URL:    &url,
		Title:  &title,
		Hash:   hashString(url),
	}
	err = entryRepo.CreateOrUpdate(ctx, entry)
	require.NoError(t, err)

	// Get the entry
	filter := repository.EntryListFilter{
		FeedID: &feed.ID,
		Limit:  10,
	}
	entries, err := entryRepo.List(ctx, filter)
	require.NoError(t, err)
	require.NotEmpty(t, entries)

	// Update with cached readable content using the proper method
	cachedContent := "<p>This is cached readable content.</p>"
	err = entryRepo.UpdateReadableContent(ctx, entries[0].ID, cachedContent)
	require.NoError(t, err)

	// Fetch should return cached content without making network request
	content, err := svc.FetchReadableContent(ctx, entries[0].ID)
	require.NoError(t, err)
	require.Equal(t, cachedContent, content)
}
