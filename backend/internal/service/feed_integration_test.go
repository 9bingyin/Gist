//go:build integration

package service_test

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"gist/backend/internal/db"
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

// Test feeds from OPML - chosen for reliability and speed
var testFeeds = []struct {
	name string
	url  string
}{
	{"GitHub Jellyfin Releases", "https://github.com/jellyfin/jellyfin/releases.atom"},
	{"GitHub Navidrome Releases", "https://github.com/navidrome/navidrome/releases.atom"},
	{"Cloudflare Blog", "https://blog.cloudflare.com/rss/"},
	{"Simon Willison's Weblog", "https://simonwillison.net/atom/everything/"},
	{"Tailscale Blog", "https://tailscale.com/blog/index.xml"},
}

func setupTestDB(t *testing.T) *sql.DB {
	// Use in-memory SQLite for testing
	dbConn, err := db.Open(":memory:")
	require.NoError(t, err, "failed to open test database")

	err = db.Migrate(dbConn)
	require.NoError(t, err, "failed to migrate test database")

	t.Cleanup(func() {
		dbConn.Close()
	})

	return dbConn
}

func TestFeedService_Integration_Preview(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") == "" {
		t.Skip("Skipping integration test. Set INTEGRATION_TEST=1 to run.")
	}

	clientFactory := network.NewClientFactoryForTest(nil)
	feedRepo := repository.NewFeedRepository(setupTestDB(t))
	folderRepo := repository.NewFolderRepository(setupTestDB(t))
	entryRepo := repository.NewEntryRepository(setupTestDB(t))

	svc := service.NewFeedService(feedRepo, folderRepo, entryRepo, nil, nil, clientFactory, nil)

	for _, feed := range testFeeds {
		t.Run(feed.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			preview, err := svc.Preview(ctx, feed.url)
			require.NoError(t, err, "failed to preview feed: %s", feed.url)
			require.NotEmpty(t, preview.Title, "expected non-empty title")
			require.Equal(t, feed.url, preview.URL)

			t.Logf("Feed: %s", preview.Title)
			if preview.Description != nil {
				t.Logf("Description: %s", *preview.Description)
			}
			if preview.ItemCount != nil {
				t.Logf("Items: %d", *preview.ItemCount)
			}
		})
	}
}

func TestFeedService_Integration_AddAndList(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") == "" {
		t.Skip("Skipping integration test. Set INTEGRATION_TEST=1 to run.")
	}

	dbConn := setupTestDB(t)
	clientFactory := network.NewClientFactoryForTest(nil)
	feedRepo := repository.NewFeedRepository(dbConn)
	folderRepo := repository.NewFolderRepository(dbConn)
	entryRepo := repository.NewEntryRepository(dbConn)

	svc := service.NewFeedService(feedRepo, folderRepo, entryRepo, nil, nil, clientFactory, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Add one feed
	testFeed := testFeeds[0]
	created, err := svc.Add(ctx, testFeed.url, nil, "", "article")
	require.NoError(t, err, "failed to add feed")
	require.NotZero(t, created.ID)
	require.NotEmpty(t, created.Title)

	t.Logf("Created feed: ID=%d, Title=%s", created.ID, created.Title)

	// List feeds
	feeds, err := svc.List(ctx, nil)
	require.NoError(t, err, "failed to list feeds")
	require.Len(t, feeds, 1)
	require.Equal(t, created.ID, feeds[0].ID)

	// List entries using filter
	filter := repository.EntryListFilter{
		FeedID: &created.ID,
		Limit:  10,
	}
	entries, err := entryRepo.List(ctx, filter)
	require.NoError(t, err, "failed to list entries")
	require.NotEmpty(t, entries, "expected at least one entry")

	t.Logf("Found %d entries", len(entries))
	for i, entry := range entries {
		if i >= 3 {
			break
		}
		title := ""
		if entry.Title != nil {
			title = *entry.Title
		}
		t.Logf("Entry %d: %s", i+1, title)
	}
}

func TestFeedService_Integration_FetchMultipleFeeds(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") == "" {
		t.Skip("Skipping integration test. Set INTEGRATION_TEST=1 to run.")
	}

	dbConn := setupTestDB(t)
	clientFactory := network.NewClientFactoryForTest(nil)
	feedRepo := repository.NewFeedRepository(dbConn)
	folderRepo := repository.NewFolderRepository(dbConn)
	entryRepo := repository.NewEntryRepository(dbConn)

	svc := service.NewFeedService(feedRepo, folderRepo, entryRepo, nil, nil, clientFactory, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// Add multiple feeds
	for _, feed := range testFeeds[:3] { // Only test first 3 for speed
		t.Run(feed.name, func(t *testing.T) {
			created, err := svc.Add(ctx, feed.url, nil, "", "article")
			require.NoError(t, err, "failed to add feed: %s", feed.url)
			require.NotZero(t, created.ID)
			t.Logf("Added: %s (ID: %d)", created.Title, created.ID)
		})
	}

	// List all feeds
	feeds, err := svc.List(ctx, nil)
	require.NoError(t, err)
	require.Len(t, feeds, 3)
}
