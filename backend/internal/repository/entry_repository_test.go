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

func TestEntryRepository_CreateOrUpdateBatch_AndGetExistingHashes(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})
	title1 := "Entry 1"
	title2 := "Entry 2"
	url1 := "https://example.com/1"
	url2 := "https://example.com/2"
	h1 := hashString(url1)
	h2 := hashString(url2)

	err := repo.CreateOrUpdateBatch(ctx, []model.Entry{
		{FeedID: feedID, Title: &title1, URL: &url1, Hash: h1},
		{FeedID: feedID, Title: &title2, URL: &url2, Hash: h2},
	})
	require.NoError(t, err)

	existing, err := repo.GetExistingHashes(ctx, feedID, []string{h1, h2, hashString("missing")})
	require.NoError(t, err)
	require.Len(t, existing, 2)
	_, ok1 := existing[h1]
	_, ok2 := existing[h2]
	require.True(t, ok1)
	require.True(t, ok2)
}

func TestEntryRepository_List_Filters(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	folderID := testutil.SeedFolder(t, db, "F1", nil, "article")
	feedID1 := testutil.SeedFeed(t, db, model.Feed{Title: "Feed 1", URL: "u1", FolderID: &folderID})
	feedID2 := testutil.SeedFeed(t, db, model.Feed{Title: "Feed 2", URL: "u2"})

	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID1, Title: new("E1"), Read: false})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID1, Title: new("E2"), Read: true})
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID2, Title: new("E3"), Starred: true})

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

func TestEntryRepository_UpdateManyReadStatus(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Feed", URL: "u"})
	entryID1 := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, Read: false})
	entryID2 := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, Read: false})
	entryID3 := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, Read: false})

	err := repo.UpdateManyReadStatus(ctx, []int64{entryID1, entryID2}, true)
	require.NoError(t, err)

	fetched1, err := repo.GetByID(ctx, entryID1)
	require.NoError(t, err)
	fetched2, err := repo.GetByID(ctx, entryID2)
	require.NoError(t, err)
	fetched3, err := repo.GetByID(ctx, entryID3)
	require.NoError(t, err)

	require.True(t, fetched1.Read)
	require.True(t, fetched2.Read)
	require.False(t, fetched3.Read)

	err = repo.UpdateManyReadStatus(ctx, []int64{entryID1}, false)
	require.NoError(t, err)

	fetched1, err = repo.GetByID(ctx, entryID1)
	require.NoError(t, err)
	require.False(t, fetched1.Read)
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
	testutil.SeedEntry(t, db, model.Entry{FeedID: feedID, ReadableContent: new("content"), Starred: false})
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

func TestEntryRepository_CreateOrUpdate_UpgradesLegacyURLHashToGUIDHash(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	summaryRepo := repository.NewAISummaryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})
	title := "Test Entry"
	legacyURL := "https://example.com/post"
	legacyHash := hashString(legacyURL)
	guidHash := hashString("guid-abc-123")

	legacyID := testutil.SeedEntry(t, db, model.Entry{
		FeedID:  feedID,
		Title:   &title,
		URL:     &legacyURL,
		Hash:    legacyHash,
		Read:    true,
		Starred: true,
	})
	require.NoError(t, summaryRepo.Save(ctx, legacyID, false, "zh-CN", "cached summary"))

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
	require.Equal(t, legacyID, entries[0].ID)
	require.Equal(t, guidHash, entries[0].Hash)
	require.True(t, entries[0].Read)
	require.True(t, entries[0].Starred)

	cached, err := summaryRepo.Get(ctx, legacyID, false, "zh-CN")
	require.NoError(t, err)
	require.NotNil(t, cached)
	require.Equal(t, "cached summary", cached.Summary)
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

	legacyID := testutil.SeedEntry(t, db, model.Entry{
		FeedID:  feedID,
		Title:   &title,
		URL:     &legacyURL,
		Hash:    legacyHash,
		Read:    true,
		Starred: true,
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
	require.Equal(t, legacyID, entries[0].ID)
	require.Equal(t, guidHash, entries[0].Hash)
	require.NotNil(t, entries[0].URL)
	require.Equal(t, newURL, *entries[0].URL)
	require.True(t, entries[0].Read)
	require.True(t, entries[0].Starred)
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

	testutil.SeedEntry(t, db, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &newURL,
		Hash:   guidHash,
	})
	testutil.SeedEntry(t, db, model.Entry{
		FeedID: feedID,
		Title:  &title,
		URL:    &legacyURL,
		Hash:   hashString(legacyURL),
	})

	updatedTitle := "Updated Title"
	err := repo.CreateOrUpdate(ctx, model.Entry{
		FeedID: feedID,
		Title:  &updatedTitle,
		URL:    &newURL,
		Hash:   guidHash,
	})
	require.NoError(t, err)

	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 2)
}

func TestEntryRepository_CreateOrUpdateBatch_UpgradesLegacyURLHashAndPreservesDistinctGUIDs(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	summaryRepo := repository.NewAISummaryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})

	legacyURL := "https://example.com/v2ex#reply1"
	updatedURL := "https://example.com/v2ex#reply2"
	legacyTitle := "Legacy Post"
	legacyID := testutil.SeedEntry(t, db, model.Entry{
		FeedID:  feedID,
		Title:   &legacyTitle,
		URL:     &legacyURL,
		Hash:    hashString(legacyURL),
		Read:    true,
		Starred: true,
	})
	require.NoError(t, summaryRepo.Save(ctx, legacyID, false, "en", "preserved summary"))

	// Distinct GUID row sharing a URL must NOT be overwritten by a different GUID.
	sharedURL := "https://example.com/weekly"
	guid1Title := "Weekly #1"
	guid2Title := "Weekly #2"
	guid1ID := testutil.SeedEntry(t, db, model.Entry{
		FeedID: feedID,
		Title:  &guid1Title,
		URL:    &sharedURL,
		Hash:   hashString("weekly-guid-1"),
	})

	newGUIDHash := hashString("guid-v2ex-1")
	err := repo.CreateOrUpdateBatch(ctx, []model.Entry{
		{
			FeedID: feedID,
			Title:  &legacyTitle,
			URL:    &updatedURL,
			Hash:   newGUIDHash,
		},
		{
			FeedID: feedID,
			Title:  &guid2Title,
			URL:    &sharedURL,
			Hash:   hashString("weekly-guid-2"),
		},
	})
	require.NoError(t, err)

	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 3)

	upgraded, err := repo.GetByID(ctx, legacyID)
	require.NoError(t, err)
	require.Equal(t, newGUIDHash, upgraded.Hash)
	require.Equal(t, updatedURL, *upgraded.URL)
	require.True(t, upgraded.Read)
	require.True(t, upgraded.Starred)

	cached, err := summaryRepo.Get(ctx, legacyID, false, "en")
	require.NoError(t, err)
	require.NotNil(t, cached)
	require.Equal(t, "preserved summary", cached.Summary)

	existingGUID1, err := repo.GetByID(ctx, guid1ID)
	require.NoError(t, err)
	require.Equal(t, hashString("weekly-guid-1"), existingGUID1.Hash)
}

func TestEntryRepository_List_PreservesSubSecondOrder(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewEntryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "Test Feed", URL: "url"})
	t0 := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	t1 := time.Date(2026, 5, 1, 10, 0, 0, 150_000_000, time.UTC)
	t2 := time.Date(2026, 5, 1, 10, 0, 0, 200_000_000, time.UTC)

	title0, title1, title2 := "t0", "t1", "t2"
	require.NoError(t, repo.CreateOrUpdateBatch(ctx, []model.Entry{
		{FeedID: feedID, Title: &title0, Hash: hashString("t0"), PublishedAt: &t0},
		{FeedID: feedID, Title: &title2, Hash: hashString("t2"), PublishedAt: &t2},
		{FeedID: feedID, Title: &title1, Hash: hashString("t1"), PublishedAt: &t1},
	}))

	entries, err := repo.List(ctx, repository.EntryListFilter{FeedID: &feedID})
	require.NoError(t, err)
	require.Len(t, entries, 3)
	require.Equal(t, "t2", *entries[0].Title)
	require.Equal(t, "t1", *entries[1].Title)
	require.Equal(t, "t0", *entries[2].Title)
	require.Equal(t, t2, entries[0].PublishedAt.UTC())
	require.Equal(t, t1, entries[1].PublishedAt.UTC())
	require.Equal(t, t0, entries[2].PublishedAt.UTC())
}

func TestEntryRepository_LegacyLookupQueries_UseFeedURLIndexWithoutTempBTree(t *testing.T) {
	db := testutil.NewTestDB(t)

	explain := func(query string, args ...any) string {
		t.Helper()
		rows, err := db.Query("EXPLAIN QUERY PLAN "+query, args...)
		require.NoError(t, err)
		defer rows.Close()

		var details []string
		for rows.Next() {
			var id, parent, notused int
			var detail string
			require.NoError(t, rows.Scan(&id, &parent, &notused, &detail))
			details = append(details, detail)
		}
		require.NoError(t, rows.Err())
		return strings.Join(details, "\n")
	}

	exactPlan := explain(
		`SELECT id, hash, url FROM entries WHERE feed_id = ? AND url = ? ORDER BY id ASC`,
		int64(1), "https://example.com/post",
	)
	require.Contains(t, exactPlan, "idx_entries_feed_url_lookup")
	require.Contains(t, exactPlan, "url=?")
	require.NotContains(t, exactPlan, "TEMP B-TREE")

	rangePlan := explain(
		`SELECT id, hash, url FROM entries WHERE feed_id = ? AND url >= ? AND url < ?`,
		int64(1), "https://example.com/post#", "https://example.com/post$",
	)
	require.Contains(t, rangePlan, "idx_entries_feed_url_lookup")
	require.Contains(t, rangePlan, "url>?")
	require.Contains(t, rangePlan, "url<?")
	require.NotContains(t, rangePlan, "TEMP B-TREE")
}

func hashString(input string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(input)))
	return hex.EncodeToString(sum[:])
}
