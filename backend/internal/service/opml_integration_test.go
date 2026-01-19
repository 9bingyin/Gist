//go:build integration

package service_test

import (
	"context"
	"database/sql"
	"os"
	"strings"
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

// Sample OPML content with a subset of feeds for testing
const testOPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test Subscriptions</title>
  </head>
  <body>
    <outline text="Github" title="Github">
      <outline text="Release notes from jellyfin" title="Release notes from jellyfin" type="rss" xmlUrl="https://github.com/jellyfin/jellyfin/releases.atom"></outline>
      <outline text="Release notes from navidrome" title="Release notes from navidrome" type="rss" xmlUrl="https://github.com/navidrome/navidrome/releases.atom"></outline>
    </outline>
    <outline text="Blogs" title="Blogs">
      <outline text="The Cloudflare Blog" title="The Cloudflare Blog" type="rss" xmlUrl="https://blog.cloudflare.com/rss/"></outline>
    </outline>
  </body>
</opml>`

func setupOPMLTestDB(t *testing.T) *sql.DB {
	dbConn, err := db.Open(":memory:")
	require.NoError(t, err)

	err = db.Migrate(dbConn)
	require.NoError(t, err)

	t.Cleanup(func() {
		dbConn.Close()
	})

	return dbConn
}

func TestOPMLService_Integration_ImportAndExport(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") == "" {
		t.Skip("Skipping integration test. Set INTEGRATION_TEST=1 to run.")
	}

	dbConn := setupOPMLTestDB(t)
	clientFactory := network.NewClientFactoryForTest(nil)

	feedRepo := repository.NewFeedRepository(dbConn)
	folderRepo := repository.NewFolderRepository(dbConn)
	entryRepo := repository.NewEntryRepository(dbConn)

	feedSvc := service.NewFeedService(feedRepo, folderRepo, entryRepo, nil, nil, clientFactory, nil)
	folderSvc := service.NewFolderService(folderRepo, feedRepo)
	// Create OPML service with nil for optional dependencies
	opmlSvc := service.NewOPMLService(folderSvc, feedSvc, nil, nil, folderRepo, feedRepo)

	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()

	// Import OPML with progress callback
	var progressCount int
	result, err := opmlSvc.Import(ctx, strings.NewReader(testOPML), func(p service.ImportProgress) {
		progressCount++
		t.Logf("Progress: %d/%d - %s (%s)", p.Current, p.Total, p.Feed, p.Status)
	})
	require.NoError(t, err)

	t.Logf("Import result: folders=%d/%d, feeds=%d/%d",
		result.FoldersCreated, result.FoldersSkipped,
		result.FeedsCreated, result.FeedsSkipped)
	require.Greater(t, result.FoldersCreated+result.FoldersSkipped, 0)
	require.Greater(t, result.FeedsCreated+result.FeedsSkipped, 0)

	// Verify folders were created
	folders, err := folderSvc.List(ctx)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(folders), 2, "expected at least 2 folders")

	t.Logf("Created %d folders:", len(folders))
	for _, f := range folders {
		t.Logf("  - %s (ID: %d)", f.Name, f.ID)
	}

	// Verify feeds were created
	feeds, err := feedSvc.List(ctx, nil)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(feeds), 2, "expected at least 2 feeds")

	t.Logf("Created %d feeds:", len(feeds))
	for _, f := range feeds {
		t.Logf("  - %s (ID: %d)", f.Title, f.ID)
	}

	// Export OPML
	exportedOPML, err := opmlSvc.Export(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, exportedOPML)
	require.Contains(t, string(exportedOPML), "opml")
	require.Contains(t, string(exportedOPML), "jellyfin")

	t.Logf("Exported OPML length: %d bytes", len(exportedOPML))
}

func TestOPMLService_Integration_ImportFromFile(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") == "" {
		t.Skip("Skipping integration test. Set INTEGRATION_TEST=1 to run.")
	}

	opmlPath := "/Users/bingyin/Downloads/gist.opml"
	if _, err := os.Stat(opmlPath); os.IsNotExist(err) {
		t.Skip("OPML file not found at " + opmlPath)
	}

	dbConn := setupOPMLTestDB(t)
	clientFactory := network.NewClientFactoryForTest(nil)

	feedRepo := repository.NewFeedRepository(dbConn)
	folderRepo := repository.NewFolderRepository(dbConn)
	entryRepo := repository.NewEntryRepository(dbConn)

	feedSvc := service.NewFeedService(feedRepo, folderRepo, entryRepo, nil, nil, clientFactory, nil)
	folderSvc := service.NewFolderService(folderRepo, feedRepo)
	opmlSvc := service.NewOPMLService(folderSvc, feedSvc, nil, nil, folderRepo, feedRepo)

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	// Open OPML file
	file, err := os.Open(opmlPath)
	require.NoError(t, err)
	defer file.Close()

	// Import with nil progress callback for simplicity
	result, err := opmlSvc.Import(ctx, file, nil)
	require.NoError(t, err)

	t.Logf("Import result: folders=%d created/%d skipped, feeds=%d created/%d skipped",
		result.FoldersCreated, result.FoldersSkipped,
		result.FeedsCreated, result.FeedsSkipped)

	// Verify data was created
	folders, _ := folderSvc.List(ctx)
	feeds, _ := feedSvc.List(ctx, nil)

	t.Logf("Created %d folders and %d feeds", len(folders), len(feeds))
	require.Greater(t, len(feeds), 0, "expected at least one feed")
}
