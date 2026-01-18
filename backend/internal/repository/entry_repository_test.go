package repository_test

import (
	"gist/backend/internal/repository"
	"context"
	"testing"

	"gist/backend/internal/model"
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

func stringPtr(s string) *string {
	return &s
}
