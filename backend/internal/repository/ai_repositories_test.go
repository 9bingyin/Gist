package repository_test

import (
	"context"
	"gist/backend/internal/repository"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/repository/testutil"

	"github.com/stretchr/testify/require"
)

func TestAISummaryRepository(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewAISummaryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	entryID := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID})

	// Save
	err := repo.Save(ctx, entryID, false, "zh-CN", "summary content")
	require.NoError(t, err)

	// Get
	summary, err := repo.Get(ctx, entryID, false, "zh-CN")
	require.NoError(t, err)
	require.NotNil(t, summary)
	require.Equal(t, "summary content", summary.Summary)

	// Update (Conflict)
	err = repo.Save(ctx, entryID, false, "zh-CN", "updated summary")
	require.NoError(t, err)
	summary, _ = repo.Get(ctx, entryID, false, "zh-CN")
	require.Equal(t, "updated summary", summary.Summary)

	// Delete All
	count, err := repo.DeleteAll(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)

	// Delete By Entry
	err = repo.DeleteByEntryID(ctx, entryID)
	require.NoError(t, err)
}

func TestAITranslationRepository(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewAITranslationRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	entryID := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID})

	// Save
	err := repo.Save(ctx, entryID, false, "en-US", "translated html")
	require.NoError(t, err)

	// Get
	trans, err := repo.Get(ctx, entryID, false, "en-US")
	require.NoError(t, err)
	require.NotNil(t, trans)
	require.Equal(t, "translated html", trans.Content)

	// Delete By Entry
	err = repo.DeleteByEntryID(ctx, entryID)
	require.NoError(t, err)
	trans, _ = repo.Get(ctx, entryID, false, "en-US")
	require.Nil(t, trans)

	// Delete All
	count, err := repo.DeleteAll(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(0), count)
}

func TestAIListTranslationRepository(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewAIListTranslationRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	entryID := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID})

	// Save
	err := repo.Save(ctx, entryID, "en-US", "Trans Title", "Trans Summary")
	require.NoError(t, err)

	// Get
	trans, err := repo.Get(ctx, entryID, "en-US")
	require.NoError(t, err)
	require.NotNil(t, trans)
	require.Equal(t, "Trans Title", trans.Title)

	// Delete All
	count, err := repo.DeleteAll(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)
}

func TestAIListTranslationRepository_GetBatchAndDelete(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewAIListTranslationRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	entryID1 := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID})
	entryID2 := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID})

	err := repo.Save(ctx, entryID1, "en-US", "Title 1", "Summary 1")
	require.NoError(t, err)
	err = repo.Save(ctx, entryID2, "en-US", "Title 2", "Summary 2")
	require.NoError(t, err)

	batch, err := repo.GetBatch(ctx, []int64{entryID1, entryID2}, "en-US")
	require.NoError(t, err)
	require.Len(t, batch, 2)

	err = repo.DeleteByEntryID(ctx, entryID1)
	require.NoError(t, err)
	remaining, err := repo.GetBatch(ctx, []int64{entryID1, entryID2}, "en-US")
	require.NoError(t, err)
	require.Len(t, remaining, 1)
}
