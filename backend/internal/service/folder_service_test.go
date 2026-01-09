package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/service/testutil"

	"go.uber.org/mock/gomock"
)

func TestFolderService_Create_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
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

	folder, err := service.Create(ctx, "Tech News", nil, "article")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if folder.ID != 123 {
		t.Errorf("expected ID 123, got %d", folder.ID)
	}

	if folder.Name != "Tech News" {
		t.Errorf("expected name 'Tech News', got %s", folder.Name)
	}
}

func TestFolderService_Create_EmptyName(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	_, err := service.Create(ctx, "", nil, "article")
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("expected ErrInvalid, got %v", err)
	}

	_, err = service.Create(ctx, "   ", nil, "article")
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("expected ErrInvalid for whitespace-only name, got %v", err)
	}
}

func TestFolderService_Create_DuplicateName(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	existingFolder := &model.Folder{ID: 1, Name: "Existing"}

	mockFolders.EXPECT().
		FindByName(ctx, "Existing", (*int64)(nil)).
		Return(existingFolder, nil)

	_, err := service.Create(ctx, "Existing", nil, "article")
	if !errors.Is(err, ErrConflict) {
		t.Errorf("expected ErrConflict, got %v", err)
	}
}

func TestFolderService_Create_ParentNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	parentID := int64(999)

	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{}, sql.ErrNoRows)

	_, err := service.Create(ctx, "Child", &parentID, "article")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestFolderService_Create_WithParent(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
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

	folder, err := service.Create(ctx, "Child", &parentID, "article")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if folder.ParentID == nil || *folder.ParentID != parentID {
		t.Error("expected parent_id to be set")
	}
}

func TestFolderService_Update_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	// detectCycle doesn't call GetByID when newParentID is nil
	// Only Update method calls GetByID once

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Old Name"}, nil)

	mockFolders.EXPECT().
		FindByName(ctx, "New Name", (*int64)(nil)).
		Return(nil, nil)

	mockFolders.EXPECT().
		Update(ctx, folderID, "New Name", (*int64)(nil)).
		Return(model.Folder{ID: folderID, Name: "New Name"}, nil)

	folder, err := service.Update(ctx, folderID, "New Name", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if folder.Name != "New Name" {
		t.Errorf("expected name 'New Name', got %s", folder.Name)
	}
}

func TestFolderService_Update_DirectCycle(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	// Attempt to set parent to self
	_, err := service.Update(ctx, folderID, "Test", &folderID)
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("expected ErrInvalid for self-reference, got %v", err)
	}
}

func TestFolderService_Update_IndirectCycle(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	// Create hierarchy: A -> B -> C
	idA := int64(1)
	idB := int64(2)
	idC := int64(3)

	folderB := model.Folder{ID: idB, Name: "B", ParentID: &idA}
	folderC := model.Folder{ID: idC, Name: "C", ParentID: &idB}

	// detectCycle walks up from new parent (C):
	// visited[1] = true (folderID being updated)
	// currentID = 3 (newParentID)
	// Get folder 3 -> visited[3] = true, parentID = 2
	// Get folder 2 -> visited[2] = true, parentID = 1
	// visited[1] is already true -> CYCLE DETECTED

	mockFolders.EXPECT().
		GetByID(ctx, idC).
		Return(folderC, nil)

	mockFolders.EXPECT().
		GetByID(ctx, idB).
		Return(folderB, nil)

	// When we check folder B's parent (idA=1), we find it's already in visited map
	// So cycle is detected, no need to call GetByID(idA)

	// Try to set A's parent to C (would create cycle: A -> C -> B -> A)
	_, err := service.Update(ctx, idA, "A", &idC)
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("expected ErrInvalid for indirect cycle, got %v", err)
	}
}

func TestFolderService_UpdateType_CascadeToFeeds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test", Type: "article"}, nil)

	mockFolders.EXPECT().
		UpdateType(ctx, folderID, "picture").
		Return(nil)

	// Feeds should be updated using batch operation
	mockFeeds.EXPECT().
		UpdateTypeByFolderID(ctx, folderID, "picture").
		Return(nil)

	err := service.UpdateType(ctx, folderID, "picture")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFolderService_Delete_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	// Return empty feed list
	mockFeeds.EXPECT().
		List(ctx, &folderID).
		Return([]model.Feed{}, nil)

	mockFolders.EXPECT().
		Delete(ctx, folderID).
		Return(nil)

	err := service.Delete(ctx, folderID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFolderService_Delete_WithFeeds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	// Return 2 feeds in this folder
	feeds := []model.Feed{
		{ID: 1, FolderID: &folderID, Title: "Feed 1"},
		{ID: 2, FolderID: &folderID, Title: "Feed 2"},
	}

	mockFeeds.EXPECT().
		List(ctx, &folderID).
		Return(feeds, nil)

	// Feeds should be deleted using batch operation
	mockFeeds.EXPECT().
		DeleteBatch(ctx, []int64{1, 2}).
		Return(int64(2), nil)

	mockFolders.EXPECT().
		Delete(ctx, folderID).
		Return(nil)

	err := service.Delete(ctx, folderID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFolderService_Delete_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	mockFolders.EXPECT().
		GetByID(ctx, int64(999)).
		Return(model.Folder{}, sql.ErrNoRows)

	err := service.Delete(ctx, 999)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestFolderService_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	expectedFolders := []model.Folder{
		{ID: 1, Name: "Folder A", Type: "article", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: 2, Name: "Folder B", Type: "picture", CreatedAt: time.Now(), UpdatedAt: time.Now()},
	}

	mockFolders.EXPECT().
		List(ctx).
		Return(expectedFolders, nil)

	folders, err := service.List(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(folders) != 2 {
		t.Errorf("expected 2 folders, got %d", len(folders))
	}

	if folders[0].Name != "Folder A" {
		t.Errorf("expected first folder name 'Folder A', got %s", folders[0].Name)
	}
}

func TestFolderService_Update_NameConflict(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	parentID := int64(100)

	// detectCycle will get parent
	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{ID: parentID, Name: "Parent"}, nil)

	// Then check parent again
	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{ID: parentID, Name: "Parent"}, nil)

	// Get the folder being updated
	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Old Name"}, nil)

	// Another folder with same name already exists under same parent
	existingFolder := &model.Folder{ID: 456, Name: "Existing Name", ParentID: &parentID}

	mockFolders.EXPECT().
		FindByName(ctx, "Existing Name", &parentID).
		Return(existingFolder, nil)

	_, err := service.Update(ctx, folderID, "Existing Name", &parentID)
	if !errors.Is(err, ErrConflict) {
		t.Errorf("expected ErrConflict, got %v", err)
	}
}

func TestFolderService_Update_SameNameOK(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)

	// GetByID called once by Update method
	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Same Name"}, nil)

	// FindByName returns the same folder (renaming to itself is OK)
	existingFolder := &model.Folder{ID: folderID, Name: "Same Name"}

	mockFolders.EXPECT().
		FindByName(ctx, "Same Name", (*int64)(nil)).
		Return(existingFolder, nil)

	mockFolders.EXPECT().
		Update(ctx, folderID, "Same Name", (*int64)(nil)).
		Return(model.Folder{ID: folderID, Name: "Same Name"}, nil)

	_, err := service.Update(ctx, folderID, "Same Name", nil)
	if err != nil {
		t.Errorf("renaming folder to same name should succeed, got error: %v", err)
	}
}

// --- Error Propagation Tests ---

func TestFolderService_Create_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	dbError := errors.New("database connection lost")

	mockFolders.EXPECT().
		FindByName(ctx, "Test", (*int64)(nil)).
		Return(nil, dbError)

	_, err := service.Create(ctx, "Test", nil, "article")
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

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	parentID := int64(100)
	dbError := errors.New("database timeout")

	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{}, dbError)

	_, err := service.Create(ctx, "Child", &parentID, "article")
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

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(1)
	parentID := int64(2)
	dbError := errors.New("database error during cycle check")

	// detectCycle calls GetByID for newParentID
	mockFolders.EXPECT().
		GetByID(ctx, parentID).
		Return(model.Folder{}, dbError)

	_, err := service.Update(ctx, folderID, "Test", &parentID)
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

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	dbError := errors.New("database unavailable")

	mockFolders.EXPECT().
		List(ctx).
		Return(nil, dbError)

	_, err := service.List(ctx)
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

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	dbError := errors.New("folder update failed")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	mockFolders.EXPECT().
		UpdateType(ctx, folderID, "picture").
		Return(dbError)

	err := service.UpdateType(ctx, folderID, "picture")
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

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
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

	err := service.UpdateType(ctx, folderID, "picture")
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

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
	ctx := context.Background()

	folderID := int64(123)
	dbError := errors.New("list feeds failed")

	mockFolders.EXPECT().
		GetByID(ctx, folderID).
		Return(model.Folder{ID: folderID, Name: "Test"}, nil)

	mockFeeds.EXPECT().
		List(ctx, &folderID).
		Return(nil, dbError)

	err := service.Delete(ctx, folderID)
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

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
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

	err := service.Delete(ctx, folderID)
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

	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewFolderService(mockFolders, mockFeeds)
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

	err := service.Delete(ctx, folderID)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !errors.Is(err, dbError) {
		t.Errorf("expected original error, got: %v", err)
	}
}
