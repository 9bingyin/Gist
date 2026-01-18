package repository_test

import (
	"gist/backend/internal/repository"
	"context"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/repository/testutil"

	"github.com/stretchr/testify/require"
)

func TestFeedRepository_CreateAndGet(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewFeedRepository(db)
	ctx := context.Background()

	feed := model.Feed{
		Title: "Test Feed",
		URL:   "https://example.com/feed",
	}

	created, err := repo.Create(ctx, feed)
	require.NoError(t, err)
	require.NotZero(t, created.ID)
	require.Equal(t, feed.Title, created.Title)
	require.Equal(t, "article", created.Type) // Default type

	fetched, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, created.ID, fetched.ID)
	require.Equal(t, created.Title, fetched.Title)
	require.Equal(t, created.URL, fetched.URL)
}

func TestFeedRepository_List(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewFeedRepository(db)
	ctx := context.Background()

	folderID := testutil.SeedFolder(t, db, "Test Folder", nil, "article")

	testutil.SeedFeed(t, db, model.Feed{Title: "Feed 1", URL: "url1", FolderID: &folderID})
	testutil.SeedFeed(t, db, model.Feed{Title: "Feed 2", URL: "url2", FolderID: nil})

	// List all
	feeds, err := repo.List(ctx, nil)
	require.NoError(t, err)
	require.Len(t, feeds, 2)

	// List by folder
	feeds, err = repo.List(ctx, &folderID)
	require.NoError(t, err)
	require.Len(t, feeds, 1)
	require.Equal(t, "Feed 1", feeds[0].Title)
}

func TestFeedRepository_Update(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewFeedRepository(db)
	ctx := context.Background()

	id := testutil.SeedFeed(t, db, model.Feed{Title: "Old Title", URL: "url"})

	feed, err := repo.GetByID(ctx, id)
	require.NoError(t, err)

	feed.Title = "New Title"
	updated, err := repo.Update(ctx, feed)
	require.NoError(t, err)
	require.Equal(t, "New Title", updated.Title)

	fetched, err := repo.GetByID(ctx, id)
	require.NoError(t, err)
	require.Equal(t, "New Title", fetched.Title)
}

func TestFeedRepository_Delete(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewFeedRepository(db)
	ctx := context.Background()

	id := testutil.SeedFeed(t, db, model.Feed{Title: "To Delete", URL: "url"})

	err := repo.Delete(ctx, id)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, id)
	require.Error(t, err) // Should return sql.ErrNoRows or similar
}

func TestFeedRepository_DeleteBatch(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewFeedRepository(db)
	ctx := context.Background()

	id1 := testutil.SeedFeed(t, db, model.Feed{Title: "F1", URL: "u1"})
	id2 := testutil.SeedFeed(t, db, model.Feed{Title: "F2", URL: "u2"})
	id3 := testutil.SeedFeed(t, db, model.Feed{Title: "F3", URL: "u3"})

	count, err := repo.DeleteBatch(ctx, []int64{id1, id2})
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	feeds, err := repo.List(ctx, nil)
	require.NoError(t, err)
	require.Len(t, feeds, 1)
	require.Equal(t, id3, feeds[0].ID)
}
