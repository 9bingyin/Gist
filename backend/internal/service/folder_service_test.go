package service_test

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/service"
	"gist/backend/internal/repository/mock"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestFolderService_Create_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	mockFolders.EXPECT().
		FindByName(ctx, "Tech News", (*int64)(nil)).
		Return(nil, nil)

	mockFolders.EXPECT().
		Create(ctx, "Tech News", (*int64)(nil), "article").
		Return(model.Folder{
			ID:   123,
			Name: "Tech News",
			Type: "article",
		}, nil)

	folder, err := svc.Create(ctx, "Tech News", nil, "article")
	require.NoError(t, err)
	require.Equal(t, int64(123), folder.ID)
	require.Equal(t, "Tech News", folder.Name)
}

func TestFolderService_Create_EmptyName(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	_, err := svc.Create(ctx, "", nil, "article")
	require.ErrorIs(t, err, service.ErrInvalid)

	_, err = svc.Create(ctx, "   ", nil, "article")
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestFolderService_Create_DuplicateName(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	existingFolder := &model.Folder{ID: 1, Name: "Existing"}

	mockFolders.EXPECT().
		FindByName(ctx, "Existing", (*int64)(nil)).
		Return(existingFolder, nil)

	_, err := svc.Create(ctx, "Existing", nil, "article")
	require.ErrorIs(t, err, service.ErrConflict)
}

func TestFolderService_Create_ParentNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	parentID := int64(999)

	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{}, sql.ErrNoRows)

	_, err := svc.Create(ctx, "Child", &parentID, "article")
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestFolderService_Create_WithParent(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	parentID := int64(100)

	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{ID: parentID, Name: "Parent"}, nil)

	mockFolders.EXPECT().
		FindByName(ctx, "Child", &parentID).
		Return(nil, nil)

	mockFolders.EXPECT().
		Create(ctx, "Child", &parentID, "article").
		Return(model.Folder{ID: 200, Name: "Child", ParentID: &parentID}, nil)

	folder, err := svc.Create(ctx, "Child", &parentID, "article")
	require.NoError(t, err)
	require.NotNil(t, folder.ParentID)
	require.Equal(t, parentID, *folder.ParentID)
}

func TestFolderService_Update_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Old Name"}, nil)

	mockFolders.EXPECT().
		FindByName(ctx, "New Name", (*int64)(nil)).
		Return(nil, nil)

	mockFolders.EXPECT().
		Update(ctx, folderID, "New Name", (*int64)(nil)).
		Return(model.Folder{ID: folderID, Name: "New Name"}, nil)

	folder, err := svc.Update(ctx, folderID, "New Name", nil)
	require.NoError(t, err)
	require.Equal(t, "New Name", folder.Name)
}

func TestFolderService_Update_DirectCycle(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	// Attempt to set parent to self
	_, err := svc.Update(ctx, folderID, "Test", &folderID)
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestFolderService_Update_IndirectCycle(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	// Create hierarchy: A -> B -> C
	idA := int64(1)
	idB := int64(2)
	idC := int64(3)

	folderB := model.Folder{ID: idB, Name: "B", ParentID: &idA}
	folderC := model.Folder{ID: idC, Name: "C", ParentID: &idB}

	mockFolders.EXPECT().
		GetByID(ctx, idC).
		Return(folderC, nil)

	mockFolders.EXPECT().
		GetByID(ctx, idB).
		Return(folderB, nil)

	// Try to set A's parent to C (would create cycle: A -> C -> B -> A)
	_, err := svc.Update(ctx, idA, "A", &idC)
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestFolderService_UpdateType_CascadeToFeeds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test", Type: "article"}, nil)

	mockFolders.EXPECT().
		UpdateType(ctx, folderID, "picture").
		Return(nil)

	mockFeeds.EXPECT().
		UpdateTypeByFolderID(ctx, folderID, "picture").
		Return(nil)

	err := svc.UpdateType(ctx, folderID, "picture")
	require.NoError(t, err)
}

func TestFolderService_Delete_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	mockFeeds.EXPECT().
		List(ctx, &folderID).
		Return([]model.Feed{}, nil)

	mockFolders.EXPECT().
		Delete(ctx, folderID).
		Return(nil)

	err := svc.Delete(ctx, folderID)
	require.NoError(t, err)
}

func TestFolderService_Delete_WithFeeds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	feeds := []model.Feed{
		{ID: 1, FolderID: &folderID, Title: "Feed 1"},
		{ID: 2, FolderID: &folderID, Title: "Feed 2"},
	}

	mockFeeds.EXPECT().
		List(ctx, &folderID).
		Return(feeds, nil)

	mockFeeds.EXPECT().
		DeleteBatch(ctx, []int64{1, 2}).
		Return(int64(2), nil)

	mockFolders.EXPECT().
		Delete(ctx, folderID).
		Return(nil)

	err := svc.Delete(ctx, folderID)
	require.NoError(t, err)
}

func TestFolderService_Delete_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	mockFolders.EXPECT().
		GetByID(ctx, int64(999)).
		Return(model.Folder{}, sql.ErrNoRows)

	err := svc.Delete(ctx, 999)
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestFolderService_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	expectedFolders := []model.Folder{
		{ID: 1, Name: "Folder A", Type: "article", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: 2, Name: "Folder B", Type: "picture", CreatedAt: time.Now(), UpdatedAt: time.Now()},
	}

	mockFolders.EXPECT().
		List(ctx).
		Return(expectedFolders, nil)

	folders, err := svc.List(ctx)
	require.NoError(t, err)
	require.Len(t, folders, 2)
	require.Equal(t, "Folder A", folders[0].Name)
}

func TestFolderService_Update_NameConflict(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	parentID := int64(100)

	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{ID: parentID, Name: "Parent"}, nil).AnyTimes()

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Old Name"}, nil)

	existingFolder := &model.Folder{ID: 456, Name: "Existing Name", ParentID: &parentID}

	mockFolders.EXPECT().
		FindByName(ctx, "Existing Name", &parentID).
		Return(existingFolder, nil)

	_, err := svc.Update(ctx, folderID, "Existing Name", &parentID)
	require.ErrorIs(t, err, service.ErrConflict)
}

func TestFolderService_Update_SameNameOK(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Same Name"}, nil)

	existingFolder := &model.Folder{ID: folderID, Name: "Same Name"}

	mockFolders.EXPECT().
		FindByName(ctx, "Same Name", (*int64)(nil)).
		Return(existingFolder, nil)

	mockFolders.EXPECT().
		Update(ctx, folderID, "Same Name", (*int64)(nil)).
		Return(model.Folder{ID: folderID, Name: "Same Name"}, nil)

	_, err := svc.Update(ctx, folderID, "Same Name", nil)
	require.NoError(t, err)
}

// --- Error Propagation Tests ---

func TestFolderService_Create_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	dbError := errors.New("database connection lost")

	mockFolders.EXPECT().
		FindByName(ctx, "Test", (*int64)(nil)).
		Return(nil, dbError)

	_, err := svc.Create(ctx, "Test", nil, "article")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "check folder name") {
		t.Errorf("expected wrapped error with context, got: %v", err)
	}
}

func TestFolderService_Create_ParentCheckError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	parentID := int64(100)
	dbError := errors.New("database timeout")

	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{}, dbError)

	_, err := svc.Create(ctx, "Child", &parentID, "article")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "check parent folder") {
		t.Errorf("expected wrapped error with context, got: %v", err)
	}
}

func TestFolderService_Update_CycleDetectionError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(1)
	parentID := int64(2)
	dbError := errors.New("database error during cycle check")

	// detectCycle calls GetByID for newParentID
	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{}, dbError)

	_, err := svc.Update(ctx, folderID, "Test", &parentID)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "check cycle") {
		t.Errorf("expected wrapped error with context, got: %v", err)
	}
}

func TestFolderService_List_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	dbError := errors.New("database unavailable")

	mockFolders.EXPECT().
		List(ctx).
		Return(nil, dbError)

	_, err := svc.List(ctx)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error to be preserved, got: %v", err)
	}
}

// --- Partial Failure Tests ---

func TestFolderService_UpdateType_FolderUpdateFails(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	dbError := errors.New("folder update failed")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	mockFolders.EXPECT().
		UpdateType(ctx, folderID, "picture").
		Return(dbError)

	err := svc.UpdateType(ctx, folderID, "picture")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}

func TestFolderService_UpdateType_BatchUpdateFails(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	dbError := errors.New("batch update failed")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	mockFolders.EXPECT().
		UpdateType(ctx, folderID, "picture").
		Return(nil)

	mockFeeds.EXPECT().
		UpdateTypeByFolderID(ctx, folderID, "picture").
		Return(dbError)

	err := svc.UpdateType(ctx, folderID, "picture")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "update feeds type in folder") {
		t.Errorf("expected wrapped error with context, got: %v", err)
	}
}

func TestFolderService_Delete_ListFeedsFails(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	dbError := errors.New("list feeds failed")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	mockFeeds.EXPECT().
		List(ctx, &folderID).
		Return(nil, dbError)

	err := svc.Delete(ctx, folderID)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "list feeds in folder") {
		t.Errorf("expected wrapped error with context, got: %v", err)
	}
}

func TestFolderService_Delete_FeedDeleteBatchFails(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	dbError := errors.New("feed batch delete failed")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	feeds := []model.Feed{
		{ID: 1, FolderID: &folderID, Title: "Feed 1"},
		{ID: 2, FolderID: &folderID, Title: "Feed 2"},
	}

	mockFeeds.EXPECT().
		List(ctx, &folderID).
		Return(feeds, nil)

	// Batch delete fails
	mockFeeds.EXPECT().
		DeleteBatch(ctx, []int64{1, 2}).
		Return(int64(0), dbError)

	err := svc.Delete(ctx, folderID)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "delete feeds in folder") {
		t.Errorf("expected error mentioning feed deletion, got: %v", err)
	}
}

func TestFolderService_Delete_FolderDeleteFails(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	dbError := errors.New("folder delete failed")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	mockFeeds.EXPECT().
		List(ctx, &folderID).
		Return([]model.Feed{}, nil)

	mockFolders.EXPECT().
		Delete(ctx, folderID).
		Return(dbError)

	err := svc.Delete(ctx, folderID)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}
