package service_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/repository/mock"
	"gist/backend/internal/service"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestEntryService_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	expectedEntries := []model.Entry{
		{ID: 1, FeedID: 100, Title: stringPtr("Entry 1")},
		{ID: 2, FeedID: 100, Title: stringPtr("Entry 2")},
	}

	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{
			FeedID:       nil,
			FolderID:     nil,
			ContentType:  nil,
			UnreadOnly:   false,
			StarredOnly:  false,
			HasThumbnail: false,
			Limit:        50,
			Offset:       0,
		}).
		Return(expectedEntries, nil)

	entries, err := svc.List(ctx, service.EntryListParams{})
	require.NoError(t, err)
	require.Len(t, entries, 2)
}

func TestEntryService_List_WithFeedID(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(100)

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{ID: feedID, Title: "Test Feed"}, nil)

	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{
			FeedID:       &feedID,
			FolderID:     nil,
			ContentType:  nil,
			UnreadOnly:   false,
			StarredOnly:  false,
			HasThumbnail: false,
			Limit:        50,
			Offset:       0,
		}).
		Return([]model.Entry{}, nil)

	_, err := svc.List(ctx, service.EntryListParams{FeedID: &feedID})
	require.NoError(t, err)
}

func TestEntryService_List_FeedNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(999)

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{}, sql.ErrNoRows)

	_, err := svc.List(ctx, service.EntryListParams{FeedID: &feedID})
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestEntryService_List_FolderNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	folderID := int64(999)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{}, sql.ErrNoRows)

	_, err := svc.List(ctx, service.EntryListParams{FolderID: &folderID})
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestEntryService_List_LimitClamp(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	// Limit > 101 should be clamped to 101
	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{
			Limit:  101,
			Offset: 0,
		}).
		Return([]model.Entry{}, nil)

	_, err := svc.List(ctx, service.EntryListParams{Limit: 200})
	require.NoError(t, err)
}

func TestEntryService_List_DefaultLimit(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	// Limit <= 0 should default to 50
	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{
			Limit:  50,
			Offset: 0,
		}).
		Return([]model.Entry{}, nil)

	_, err := svc.List(ctx, service.EntryListParams{Limit: 0})
	require.NoError(t, err)
}

func TestEntryService_List_FeedCheckError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(100)
	dbErr := errors.New("db error")

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{}, dbErr)

	_, err := svc.List(ctx, service.EntryListParams{FeedID: &feedID})
	require.ErrorIs(t, err, dbErr)
}

func TestEntryService_List_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbErr := errors.New("list error")

	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{
			Limit:  50,
			Offset: 0,
		}).
		Return(nil, dbErr)

	_, err := svc.List(ctx, service.EntryListParams{})
	require.ErrorIs(t, err, dbErr)
}

func TestEntryService_GetByID_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	expectedEntry := model.Entry{
		ID:     123,
		FeedID: 100,
		Title:  stringPtr("Test Entry"),
	}

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(expectedEntry, nil)

	entry, err := svc.GetByID(ctx, 123)
	require.NoError(t, err)
	require.Equal(t, int64(123), entry.ID)
}

func TestEntryService_GetByID_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(999)).
		Return(model.Entry{}, sql.ErrNoRows)

	_, err := svc.GetByID(ctx, 999)
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestEntryService_MarkAsRead_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{ID: 123}, nil)

	mockEntries.EXPECT().
		UpdateReadStatus(ctx, int64(123), true).
		Return(nil)

	err := svc.MarkAsRead(ctx, 123, true)
	require.NoError(t, err)
}

func TestEntryService_MarkAsRead_UpdateError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbErr := errors.New("update failed")

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{ID: 123}, nil)

	mockEntries.EXPECT().
		UpdateReadStatus(ctx, int64(123), true).
		Return(dbErr)

	err := svc.MarkAsRead(ctx, 123, true)
	require.ErrorIs(t, err, dbErr)
}

func TestEntryService_MarkAsRead_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(999)).
		Return(model.Entry{}, sql.ErrNoRows)

	err := svc.MarkAsRead(ctx, 999, true)
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestEntryService_MarkAsStarred_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{ID: 123}, nil)

	mockEntries.EXPECT().
		UpdateStarredStatus(ctx, int64(123), true).
		Return(nil)

	err := svc.MarkAsStarred(ctx, 123, true)
	require.NoError(t, err)
}

func TestEntryService_MarkAsStarred_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(999)).
		Return(model.Entry{}, sql.ErrNoRows)

	err := svc.MarkAsStarred(ctx, 999, true)
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestEntryService_MarkAsStarred_UpdateError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbErr := errors.New("update failed")

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{ID: 123}, nil)

	mockEntries.EXPECT().
		UpdateStarredStatus(ctx, int64(123), true).
		Return(dbErr)

	err := svc.MarkAsStarred(ctx, 123, true)
	require.ErrorIs(t, err, dbErr)
}

func TestEntryService_MarkAllAsRead_ByFeed(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(100)

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{ID: feedID}, nil)

	mockEntries.EXPECT().
		MarkAllAsRead(ctx, &feedID, (*int64)(nil), (*string)(nil)).
		Return(nil)

	err := svc.MarkAllAsRead(ctx, &feedID, nil, nil)
	require.NoError(t, err)
}

func TestEntryService_MarkAllAsRead_ByFolder(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	folderID := int64(200)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID}, nil)

	mockEntries.EXPECT().
		MarkAllAsRead(ctx, (*int64)(nil), &folderID, (*string)(nil)).
		Return(nil)

	err := svc.MarkAllAsRead(ctx, nil, &folderID, nil)
	require.NoError(t, err)
}

func TestEntryService_MarkAllAsRead_All(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		MarkAllAsRead(ctx, (*int64)(nil), (*int64)(nil), (*string)(nil)).
		Return(nil)

	err := svc.MarkAllAsRead(ctx, nil, nil, nil)
	require.NoError(t, err)
}

func TestEntryService_MarkAllAsRead_FeedNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(999)

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{}, sql.ErrNoRows)

	err := svc.MarkAllAsRead(ctx, &feedID, nil, nil)
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestEntryService_MarkAllAsRead_FolderCheckError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	folderID := int64(100)
	dbErr := errors.New("folder error")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{}, dbErr)

	err := svc.MarkAllAsRead(ctx, nil, &folderID, nil)
	require.ErrorIs(t, err, dbErr)
}

func TestEntryService_MarkAllAsRead_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbErr := errors.New("mark error")

	mockEntries.EXPECT().
		MarkAllAsRead(ctx, (*int64)(nil), (*int64)(nil), (*string)(nil)).
		Return(dbErr)

	err := svc.MarkAllAsRead(ctx, nil, nil, nil)
	require.ErrorIs(t, err, dbErr)
}

func TestEntryService_GetUnreadCounts_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	expectedCounts := []repository.UnreadCount{
		{FeedID: 1, Count: 5},
		{FeedID: 2, Count: 10},
		{FeedID: 3, Count: 3},
	}

	mockEntries.EXPECT().
		GetAllUnreadCounts(ctx).
		Return(expectedCounts, nil)

	counts, err := svc.GetUnreadCounts(ctx)
	require.NoError(t, err)
	require.Len(t, counts, 3)
	require.Equal(t, 5, counts[1])
	require.Equal(t, 10, counts[2])
}

func TestEntryService_GetUnreadCounts_Error(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbErr := errors.New("count error")

	mockEntries.EXPECT().
		GetAllUnreadCounts(ctx).
		Return(nil, dbErr)

	_, err := svc.GetUnreadCounts(ctx)
	require.ErrorIs(t, err, dbErr)
}

func TestEntryService_GetStarredCount_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetStarredCount(ctx).
		Return(42, nil)

	count, err := svc.GetStarredCount(ctx)
	require.NoError(t, err)
	require.Equal(t, 42, count)
}

func TestEntryService_GetStarredCount_Error(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbErr := errors.New("count error")

	mockEntries.EXPECT().
		GetStarredCount(ctx).
		Return(0, dbErr)

	_, err := svc.GetStarredCount(ctx)
	require.ErrorIs(t, err, dbErr)
}

func TestEntryService_List_WithFilters(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	contentType := "picture"

	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{
			FeedID:       nil,
			FolderID:     nil,
			ContentType:  &contentType,
			UnreadOnly:   true,
			StarredOnly:  false,
			HasThumbnail: true,
			Limit:        20,
			Offset:       10,
		}).
		Return([]model.Entry{}, nil)

	_, err := svc.List(ctx, service.EntryListParams{
		ContentType:  &contentType,
		UnreadOnly:   true,
		HasThumbnail: true,
		Limit:        20,
		Offset:       10,
	})
	require.NoError(t, err)
}

func TestEntryService_ClearEntryCache_ResetFailureIgnored(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mock.NewMockFolderRepository(ctrl))

	mockEntries.EXPECT().DeleteUnstarred(context.Background()).Return(int64(2), nil)
	mockFeeds.EXPECT().ClearAllConditionalGet(context.Background()).Return(int64(0), errors.New("reset failed"))

	count, err := svc.ClearEntryCache(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(2), count)
}

// Helper function
func stringPtr(s string) *string {
	return &s
}
