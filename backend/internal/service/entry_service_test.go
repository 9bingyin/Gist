package service

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/testutil"

	"go.uber.org/mock/gomock"
)

func TestEntryService_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
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

	entries, err := service.List(ctx, EntryListParams{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(entries) != 2 {
		t.Errorf("expected 2 entries, got %d", len(entries))
	}
}

func TestEntryService_List_WithFeedID(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
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

	_, err := service.List(ctx, EntryListParams{FeedID: &feedID})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEntryService_List_FeedNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(999)

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{}, sql.ErrNoRows)

	_, err := service.List(ctx, EntryListParams{FeedID: &feedID})
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestEntryService_List_FolderNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	folderID := int64(999)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{}, sql.ErrNoRows)

	_, err := service.List(ctx, EntryListParams{FolderID: &folderID})
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestEntryService_List_LimitClamp(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	// Limit > 101 should be clamped to 101
	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{
			Limit:  101,
			Offset: 0,
		}).
		Return([]model.Entry{}, nil)

	_, err := service.List(ctx, EntryListParams{Limit: 200})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEntryService_List_DefaultLimit(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	// Limit <= 0 should default to 50
	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{
			Limit:  50,
			Offset: 0,
		}).
		Return([]model.Entry{}, nil)

	_, err := service.List(ctx, EntryListParams{Limit: 0})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEntryService_GetByID_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	expectedEntry := model.Entry{
		ID:     123,
		FeedID: 100,
		Title:  stringPtr("Test Entry"),
	}

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(expectedEntry, nil)

	entry, err := service.GetByID(ctx, 123)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if entry.ID != 123 {
		t.Errorf("expected ID 123, got %d", entry.ID)
	}
}

func TestEntryService_GetByID_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(999)).
		Return(model.Entry{}, sql.ErrNoRows)

	_, err := service.GetByID(ctx, 999)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestEntryService_MarkAsRead_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{ID: 123}, nil)

	mockEntries.EXPECT().
		UpdateReadStatus(ctx, int64(123), true).
		Return(nil)

	err := service.MarkAsRead(ctx, 123, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEntryService_MarkAsRead_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(999)).
		Return(model.Entry{}, sql.ErrNoRows)

	err := service.MarkAsRead(ctx, 999, true)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestEntryService_MarkAsStarred_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{ID: 123}, nil)

	mockEntries.EXPECT().
		UpdateStarredStatus(ctx, int64(123), true).
		Return(nil)

	err := service.MarkAsStarred(ctx, 123, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEntryService_MarkAllAsRead_ByFeed(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(100)

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{ID: feedID}, nil)

	mockEntries.EXPECT().
		MarkAllAsRead(ctx, &feedID, (*int64)(nil), (*string)(nil)).
		Return(nil)

	err := service.MarkAllAsRead(ctx, &feedID, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEntryService_MarkAllAsRead_ByFolder(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	folderID := int64(200)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID}, nil)

	mockEntries.EXPECT().
		MarkAllAsRead(ctx, (*int64)(nil), &folderID, (*string)(nil)).
		Return(nil)

	err := service.MarkAllAsRead(ctx, nil, &folderID, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEntryService_MarkAllAsRead_All(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		MarkAllAsRead(ctx, (*int64)(nil), (*int64)(nil), (*string)(nil)).
		Return(nil)

	err := service.MarkAllAsRead(ctx, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEntryService_MarkAllAsRead_FeedNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(999)

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{}, sql.ErrNoRows)

	err := service.MarkAllAsRead(ctx, &feedID, nil, nil)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestEntryService_GetUnreadCounts_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	expectedCounts := []repository.UnreadCount{
		{FeedID: 1, Count: 5},
		{FeedID: 2, Count: 10},
		{FeedID: 3, Count: 3},
	}

	mockEntries.EXPECT().
		GetAllUnreadCounts(ctx).
		Return(expectedCounts, nil)

	counts, err := service.GetUnreadCounts(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(counts) != 3 {
		t.Errorf("expected 3 feed counts, got %d", len(counts))
	}

	if counts[1] != 5 {
		t.Errorf("expected feed 1 to have 5 unread, got %d", counts[1])
	}

	if counts[2] != 10 {
		t.Errorf("expected feed 2 to have 10 unread, got %d", counts[2])
	}
}

func TestEntryService_GetStarredCount_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	mockEntries.EXPECT().
		GetStarredCount(ctx).
		Return(42, nil)

	count, err := service.GetStarredCount(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if count != 42 {
		t.Errorf("expected starred count 42, got %d", count)
	}
}

func TestEntryService_List_WithFilters(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
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

	_, err := service.List(ctx, EntryListParams{
		ContentType:  &contentType,
		UnreadOnly:   true,
		HasThumbnail: true,
		Limit:        20,
		Offset:       10,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- Error Propagation Tests ---

func TestEntryService_List_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbError := errors.New("database connection lost")

	mockEntries.EXPECT().
		List(ctx, repository.EntryListFilter{Limit: 50, Offset: 0}).
		Return(nil, dbError)

	_, err := service.List(ctx, EntryListParams{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestEntryService_List_FeedValidationError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	feedID := int64(100)
	dbError := errors.New("database timeout")

	mockFeeds.EXPECT().
		GetByID(ctx, feedID).
		Return(model.Feed{}, dbError)

	_, err := service.List(ctx, EntryListParams{FeedID: &feedID})
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestEntryService_List_FolderValidationError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	folderID := int64(100)
	dbError := errors.New("database timeout")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{}, dbError)

	_, err := service.List(ctx, EntryListParams{FolderID: &folderID})
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestEntryService_GetByID_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbError := errors.New("database error")

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{}, dbError)

	_, err := service.GetByID(ctx, 123)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestEntryService_MarkAsRead_UpdateError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbError := errors.New("update failed")

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{ID: 123}, nil)

	mockEntries.EXPECT().
		UpdateReadStatus(ctx, int64(123), true).
		Return(dbError)

	err := service.MarkAsRead(ctx, 123, true)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestEntryService_MarkAsStarred_UpdateError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbError := errors.New("update failed")

	mockEntries.EXPECT().
		GetByID(ctx, int64(123)).
		Return(model.Entry{ID: 123}, nil)

	mockEntries.EXPECT().
		UpdateStarredStatus(ctx, int64(123), true).
		Return(dbError)

	err := service.MarkAsStarred(ctx, 123, true)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestEntryService_MarkAllAsRead_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbError := errors.New("mark all failed")

	mockEntries.EXPECT().
		MarkAllAsRead(ctx, (*int64)(nil), (*int64)(nil), (*string)(nil)).
		Return(dbError)

	err := service.MarkAllAsRead(ctx, nil, nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestEntryService_MarkAllAsRead_FolderNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	folderID := int64(999)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{}, sql.ErrNoRows)

	err := service.MarkAllAsRead(ctx, nil, &folderID, nil)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestEntryService_GetUnreadCounts_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbError := errors.New("count query failed")

	mockEntries.EXPECT().
		GetAllUnreadCounts(ctx).
		Return(nil, dbError)

	_, err := service.GetUnreadCounts(ctx)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestEntryService_GetStarredCount_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, mockFolders)
	ctx := context.Background()

	dbError := errors.New("count query failed")

	mockEntries.EXPECT().
		GetStarredCount(ctx).
		Return(0, dbError)

	_, err := service.GetStarredCount(ctx)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

// Helper function
func stringPtr(s string) *string {
	return &s
}
