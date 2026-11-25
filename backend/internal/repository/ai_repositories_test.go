package repository_test

import (
	"context"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/repository/testutil"

	"github.com/stretchr/testify/require"
)

func TestAISummaryRepository(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewAISummaryRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	entryID := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID})

	err := repo.Save(ctx, entryID, false, "zh-CN", "summary content")
	require.NoError(t, err)

	summary, err := repo.Get(ctx, entryID, false, "zh-CN")
	require.NoError(t, err)
	require.NotNil(t, summary)
	require.Equal(t, "summary content", summary.Summary)

	err = repo.Save(ctx, entryID, false, "zh-CN", "updated summary")
	require.NoError(t, err)
	summary, err = repo.Get(ctx, entryID, false, "zh-CN")
	require.NoError(t, err)
	require.Equal(t, "updated summary", summary.Summary)

	count, err := repo.DeleteAll(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)
}

func TestAITranslationRepository(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewAITranslationRepository(db)
	ctx := context.Background()

	feedID := testutil.SeedFeed(t, db, model.Feed{Title: "F", URL: "u"})
	entryID := testutil.SeedEntry(t, db, model.Entry{FeedID: feedID})

	err := repo.Save(ctx, entryID, false, "en-US", "translated html")
	require.NoError(t, err)

	trans, err := repo.Get(ctx, entryID, false, "en-US")
	require.NoError(t, err)
	require.NotNil(t, trans)
	require.Equal(t, "translated html", trans.Content)

	count, err := repo.DeleteAll(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)

	trans, err = repo.Get(ctx, entryID, false, "en-US")
	require.NoError(t, err)
	require.Nil(t, trans)
}

func TestAIListTranslationRepository(t *testing.T) {
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

	trans, err := repo.Get(ctx, entryID1, "en-US")
	require.NoError(t, err)
	require.NotNil(t, trans)
	require.Equal(t, "Title 1", trans.Title)

	batch, err := repo.GetBatch(ctx, []int64{entryID1, entryID2}, "en-US")
	require.NoError(t, err)
	require.Len(t, batch, 2)

	count, err := repo.DeleteAll(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)
}
