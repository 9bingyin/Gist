package repository_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/repository/testutil"

	"github.com/stretchr/testify/require"
)

func TestEntryRepository_CreateAndGet(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})

	title := "Test Entry"
	url := "https://example.com/entry"
	entry := model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &url,
		Hash:   hashString(url),
	}

	err := repo.CreateOrUpdate(ctx, entry)
	require.NoError(t, err)

	// List to find the ID
	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	entryID := entries[0].ID

	fetched, err := repo.GetByID(ctx, entryID)
	require.NoError(t, err)
	require.Equal(t, entryID, fetched.ID)
	require.Equal(t, title, *fetched.Title)
	require.Equal(t, url, *fetched.URL)
}

func TestEntryRepository_CreateOrUpdate_SameHashUpdatesURL(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})

	title := "Test Entry"
	hash := hashString("stable-guid")
	url1 := "https://www.v2ex.com/t/1193191#reply10"
	url2 := "https://www.v2ex.com/t/1193191#reply20"

	err := repo.CreateOrUpdate(ctx, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &url1,
		Hash:   hash,
	})
	require.NoError(t, err)

	err = repo.CreateOrUpdate(ctx, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &url2,
		Hash:   hash,
	})
	require.NoError(t, err)

	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.NotNil(t, entries[0].URL)
	require.Equal(t, url2, *entries[0].URL)
}

func TestEntryRepository_CreateOrUpdate_UpgradesLegacyURLHashToGUIDHash(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})
	title := "Test Entry"
	legacyURL := "https://example.com/post"
	legacyHash := hashString(legacyURL)
	guidHash := hashString("guid-abc-123")

	testutil.SeedEntry(t, db, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &legacyURL,
		Hash:   legacyHash,
	})

	err := repo.CreateOrUpdate(ctx, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &legacyURL,
		Hash:   guidHash,
	})
	require.NoError(t, err)

	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.Equal(t, guidHash, entries[0].Hash)
}

func TestEntryRepository_CreateOrUpdate_UpgradesLegacyURLHashToGUIDHash_WhenFragmentChanges(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})
	title := "Test Entry"
	legacyURL := "https://www.v2ex.com/t/1193191#reply10"
	newURL := "https://www.v2ex.com/t/1193191#reply20"
	legacyHash := hashString(legacyURL)
	guidHash := hashString("v2ex-guid-1193191")

	testutil.SeedEntry(t, db, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &legacyURL,
		Hash:   legacyHash,
	})

	err := repo.CreateOrUpdate(ctx, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &newURL,
		Hash:   guidHash,
	})
	require.NoError(t, err)

	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.Equal(t, guidHash, entries[0].Hash)
	require.NotNil(t, entries[0].URL)
	require.Equal(t, newURL, *entries[0].URL)
}

func TestEntryRepository_CreateOrUpdate_CompatibilitySkipsWhenTargetHashExists(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})
	title := "Test Entry"
	newURL := "https://www.v2ex.com/t/1193191#reply20"
	legacyURL := "https://www.v2ex.com/t/1193191#reply10"
	guidHash := hashString("v2ex-guid-1193191")

	// Existing target hash row.
	testutil.SeedEntry(t, db, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &newURL,
		Hash:   guidHash,
	})
	// Legacy URL-hash row that used to trigger compatibility update conflicts.
	testutil.SeedEntry(t, db, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &legacyURL,
		Hash:   hashString(legacyURL),
	})

	err := repo.CreateOrUpdate(ctx, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &newURL,
		Hash:   guidHash,
	})
	require.NoError(t, err)
}

func TestEntryRepository_List_Filters(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	folderID := testutil.SeedFolder(t, db, "F1", nil, "article")
	feedID1 := testutil.SeedFeed(t, db, model.Feed{Title: "Feed 1", URL: "u1", FolderID: &folderID})
	feedID2 := testutil.SeedFeed(t, db, model.Feed{Title: "Feed 2", URL: "u2"})

	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID1, Title: stringPtr("E1"), Read: false})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID1, Title: stringPtr("E2"), Read: true})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID2, Title: stringPtr("E3"), Starred: true})

	// Unread only
	entries, err := repo.List(ctx, repository.EntryListFilter{UnreadOnly: true})
	require.NoError(t, err)
	require.Len(t, entries, 2) // E1, E3

	// Starred only
	entries, err = repo.List(ctx, repository.EntryListFilter{StarredOnly: true})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.Equal(t, "E3", *entries[0].Title)

	// By Folder
	entries, err = repo.List(ctx, repository.EntryListFilter{FolderID: &folderID})
	require.NoError(t, err)
	require.Len(t, entries, 2) // E1, E2
}

func TestEntryRepository_UpdateStatus(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Feed", URL: "u"})
	entryID := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, Read: false, Starred: false})

	// Mark read
	err := repo.UpdateReadStatus(ctx, entryID, true)
	require.NoError(t, err)
	fetched, _ := repo.GetByID(ctx, entryID)
	require.True(t, fetched.Read)

	// Mark starred
	err = repo.UpdateStarredStatus(ctx, entryID, true)
	require.NoError(t, err)
	fetched, _ = repo.GetByID(ctx, entryID)
	require.True(t, fetched.Starred)
}

func TestEntryRepository_MarkAllAsRead(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID1 := testutil.SeedFeed(t, db, model.Feed{Title: "F1", URL: "u1"})
	feedID2 := testutil.SeedFeed(t, db, model.Feed{Title: "F2", URL: "u2"})

	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID1, Read: false})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID2, Read: false})

	err := repo.MarkAllAsRead(ctx, &feedID1, nil, nil)
	require.NoError(t, err)

	counts, _ := repo.GetAllUnreadCounts(ctx)
	require.Len(t, counts, 1)
	require.Equal(t, feedID2, counts[0].FeedID)
	require.Equal(t, 1, counts[0].Count)
}

func TestEntryRepository_ClearCaches(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, ReadableContent: stringPtr("content"), Starred: false})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, Starred: true})

	// Clear readable
	count, err := repo.ClearAllReadableContent(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)

	// Delete unstarred
	count, err = repo.DeleteUnstarred(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)

	entries, _ := repo.List(ctx, repository.EntryListFilter{})
	require.Len(t, entries, 1)
	require.True(t, entries[0].Starred)
}

func TestEntryRepository_ExistsByHash(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	entryURL := "https://example.com/entry"
	entryHash := hashString(entryURL)
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, URL: &entryURL, Hash: entryHash})

	exists, err := repo.ExistsByHash(ctx, feedID, entryHash)
	require.NoError(t, err)
	require.True(t, exists)

	exists, err = repo.ExistsByHash(ctx, feedID, hashString("https://example.com/missing"))
	require.NoError(t, err)
	require.False(t, exists)
}

func TestEntryRepository_ExistsByLegacyURL(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	legacyURL := "https://www.v2ex.com/t/1193191#reply10"
	testutil.SeedEntry(t, db, model.Entry{
		FeedID: feedID,
		URL:    &legacyURL,
		Hash:   hashString(legacyURL),
	})

	exists, err := repo.ExistsByLegacyURL(ctx, feedID, "https://www.v2ex.com/t/1193191#reply20", hashString("v2ex-guid-1193191"))
	require.NoError(t, err)
	require.True(t, exists)

	exists, err = repo.ExistsByLegacyURL(ctx, feedID, "https://www.v2ex.com/t/other#reply1", hashString("other-guid"))
	require.NoError(t, err)
	require.False(t, exists)
}

func TestEntryRepository_UpdateReadableContent(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	entryID := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID})

	err := repo.UpdateReadableContent(ctx, entryID, "<article>readable</article>")
	require.NoError(t, err)

	entry, err := repo.GetByID(ctx, entryID)
	require.NoError(t, err)
	require.NotNil(t, entry.ReadableContent)
	require.Equal(t, "<article>readable</article>", *entry.ReadableContent)
}

func TestEntryRepository_GetStarredCount(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, Starred: true})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, Starred: false})

	count, err := repo.GetStarredCount(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, count)
}

func TestParseTimePtr(t *testing.T) {
	require.Nil(t, repository.ParseTimePtr(""))

	ts := "2025-01-04T12:34:56Z"
	got := repository.ParseTimePtr(ts)
	require.NotNil(t, got)
	require.Equal(t, ts, got.UTC().Format(time.RFC3339))
}

// TestEntryRepository_CreateOrUpdate_PreservesExistingPublishedAt tests the BUG fix:
// When an entry is updated (via ON CONFLICT), the existing published_at should be
// preserved using COALESCE, not overwritten by the new value.
// See commit 4b9dbc0: fix: Refresh should not overwrite existing published_at
func TestEntryRepository_CreateOrUpdate_PreservesExistingPublishedAt(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})

	title := "Test Entry"
	url := "https://example.com/entry"
	originalTime := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)

	// Create entry with published_at
	entry := model.Entry{
		FeedID:      feedID,
		Title:       &title,
		URL:         &url,
		Hash:        hashString(url),
		PublishedAt: &originalTime,
	}
	err := repo.CreateOrUpdate(ctx, entry)
	require.NoError(t, err)

	// Update the same entry with a different published_at
	newTime := time.Date(2025, 6, 15, 12, 0, 0, 0, time.UTC)
	updatedEntry := model.Entry{
		FeedID:      feedID,
		Title:       &title,
		URL:         &url,
		Hash:        hashString(url),
		PublishedAt: &newTime,
	}
	err = repo.CreateOrUpdate(ctx, updatedEntry)
	require.NoError(t, err)

	// Verify that the original published_at is preserved
	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.NotNil(t, entries[0].PublishedAt)
	require.Equal(t, originalTime.Format(time.RFC3339), entries[0].PublishedAt.UTC().Format(time.RFC3339))
}

// TestEntryRepository_CreateOrUpdate_SetsPublishedAtWhenNull tests the BUG fix:
// When an entry is updated and the existing published_at is NULL, the new value
// should be used (COALESCE returns the first non-NULL value).
// See commit 4b9dbc0: fix: Refresh should not overwrite existing published_at
func TestEntryRepository_CreateOrUpdate_SetsPublishedAtWhenNull(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})

	title := "Test Entry"
	url := "https://example.com/entry"

	// Create entry without published_at
	entry := model.Entry{
		FeedID:      feedID,
		Title:       &title,
		URL:         &url,
		Hash:        hashString(url),
		PublishedAt: nil,
	}
	err := repo.CreateOrUpdate(ctx, entry)
	require.NoError(t, err)

	// Verify entry has no published_at
	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.Nil(t, entries[0].PublishedAt)

	// Update the same entry with a published_at
	newTime := time.Date(2025, 6, 15, 12, 0, 0, 0, time.UTC)
	updatedEntry := model.Entry{
		FeedID:      feedID,
		Title:       &title,
		URL:         &url,
		Hash:        hashString(url),
		PublishedAt: &newTime,
	}
	err = repo.CreateOrUpdate(ctx, updatedEntry)
	require.NoError(t, err)

	// Verify that the new published_at is set
	entries, err = repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.NotNil(t, entries[0].PublishedAt)
	require.Equal(t, newTime.Format(time.RFC3339), entries[0].PublishedAt.UTC().Format(time.RFC3339))
}

func stringPtr(s string) *string {
	return &s
}

func hashString(input string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(input)))
	return hex.EncodeToString(sum[:])
}
