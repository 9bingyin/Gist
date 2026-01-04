package repository

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"

	"gist/backend/internal/repository/testutil"
)

func TestFolderRepository_Create_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	folder, err := repo.Create(ctx, "Tech News", nil, "article")
	if err != nil {
		t.Fatalf("failed to create folder: %v", err)
	}

	if folder.ID == 0 {
		t.Error("expected non-zero ID")
	}

	if folder.Name != "Tech News" {
		t.Errorf("expected name 'Tech News', got %s", folder.Name)
	}

	if folder.ParentID != nil {
		t.Errorf("expected nil parent_id, got %v", *folder.ParentID)
	}

	if folder.Type != "article" {
		t.Errorf("expected type 'article', got %s", folder.Type)
	}

	if folder.CreatedAt.IsZero() {
		t.Error("expected non-zero created_at")
	}

	if folder.UpdatedAt.IsZero() {
		t.Error("expected non-zero updated_at")
	}
}

func TestFolderRepository_Create_WithParent(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	// Create parent folder
	parentID := testutil.SeedFolder(t, db, "Parent", nil, "article")

	// Create child folder
	folder, err := repo.Create(ctx, "Child", &parentID, "article")
	if err != nil {
		t.Fatalf("failed to create child folder: %v", err)
	}

	if folder.ParentID == nil {
		t.Fatal("expected non-nil parent_id")
	}

	if *folder.ParentID != parentID {
		t.Errorf("expected parent_id %d, got %d", parentID, *folder.ParentID)
	}
}

func TestFolderRepository_Create_DefaultType(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	folder, err := repo.Create(ctx, "Test", nil, "")
	if err != nil {
		t.Fatalf("failed to create folder: %v", err)
	}

	if folder.Type != "article" {
		t.Errorf("expected default type 'article', got %s", folder.Type)
	}
}

func TestFolderRepository_GetByID_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	id := testutil.SeedFolder(t, db, "Test Folder", nil, "picture")

	folder, err := repo.GetByID(ctx, id)
	if err != nil {
		t.Fatalf("failed to get folder: %v", err)
	}

	if folder.ID != id {
		t.Errorf("expected ID %d, got %d", id, folder.ID)
	}

	if folder.Name != "Test Folder" {
		t.Errorf("expected name 'Test Folder', got %s", folder.Name)
	}

	if folder.Type != "picture" {
		t.Errorf("expected type 'picture', got %s", folder.Type)
	}
}

func TestFolderRepository_GetByID_NotFound(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, 99999)
	if err == nil {
		t.Fatal("expected error for non-existent ID, got nil")
	}

	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestFolderRepository_FindByName_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	parentID := testutil.SeedFolder(t, db, "Parent", nil, "article")
	childID := testutil.SeedFolder(t, db, "Child", &parentID, "article")

	// Find child by name under parent
	folder, err := repo.FindByName(ctx, "Child", &parentID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if folder == nil {
		t.Fatal("expected folder to exist, got nil")
	}

	if folder.ID != childID {
		t.Errorf("expected ID %d, got %d", childID, folder.ID)
	}
}

func TestFolderRepository_FindByName_NotFound(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	folder, err := repo.FindByName(ctx, "NonExistent", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if folder != nil {
		t.Errorf("expected nil for non-existent folder, got %v", folder)
	}
}

func TestFolderRepository_FindByName_NullParent(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	// Create top-level folder (parent_id = NULL)
	id := testutil.SeedFolder(t, db, "TopLevel", nil, "article")

	// Find by name with nil parent
	folder, err := repo.FindByName(ctx, "TopLevel", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if folder == nil {
		t.Fatal("expected folder to exist, got nil")
	}

	if folder.ID != id {
		t.Errorf("expected ID %d, got %d", id, folder.ID)
	}

	if folder.ParentID != nil {
		t.Errorf("expected nil parent_id, got %v", *folder.ParentID)
	}
}

func TestFolderRepository_FindByName_DifferentParents(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	// Create two parent folders with same-named children
	parent1 := testutil.SeedFolder(t, db, "Parent1", nil, "article")
	parent2 := testutil.SeedFolder(t, db, "Parent2", nil, "article")

	child1 := testutil.SeedFolder(t, db, "SameName", &parent1, "article")
	testutil.SeedFolder(t, db, "SameName", &parent2, "article")

	// Find child under parent1
	folder, err := repo.FindByName(ctx, "SameName", &parent1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if folder.ID != child1 {
		t.Errorf("expected ID %d (child of parent1), got %d", child1, folder.ID)
	}
}

func TestFolderRepository_List_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	testutil.SeedFolder(t, db, "Folder A", nil, "article")
	testutil.SeedFolder(t, db, "Folder B", nil, "picture")
	testutil.SeedFolder(t, db, "Folder C", nil, "notification")

	folders, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("failed to list folders: %v", err)
	}

	if len(folders) != 3 {
		t.Errorf("expected 3 folders, got %d", len(folders))
	}

	// Verify ordering by name
	if len(folders) >= 2 {
		if folders[0].Name > folders[1].Name {
			t.Error("expected folders to be ordered by name")
		}
	}
}

func TestFolderRepository_List_Empty(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	folders, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(folders) != 0 {
		t.Errorf("expected 0 folders, got %d", len(folders))
	}
}

func TestFolderRepository_Update_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	id := testutil.SeedFolder(t, db, "Original Name", nil, "article")

	// Update folder
	newParentID := testutil.SeedFolder(t, db, "New Parent", nil, "article")
	updated, err := repo.Update(ctx, id, "Updated Name", &newParentID)
	if err != nil {
		t.Fatalf("failed to update folder: %v", err)
	}

	if updated.Name != "Updated Name" {
		t.Errorf("expected name 'Updated Name', got %s", updated.Name)
	}

	if updated.ParentID == nil || *updated.ParentID != newParentID {
		t.Error("expected parent_id to be updated")
	}
}

func TestFolderRepository_Update_RemoveParent(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	parentID := testutil.SeedFolder(t, db, "Parent", nil, "article")
	childID := testutil.SeedFolder(t, db, "Child", &parentID, "article")

	// Remove parent (set to nil)
	updated, err := repo.Update(ctx, childID, "Child", nil)
	if err != nil {
		t.Fatalf("failed to update folder: %v", err)
	}

	if updated.ParentID != nil {
		t.Errorf("expected parent_id to be nil, got %v", *updated.ParentID)
	}
}

func TestFolderRepository_UpdateType_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	id := testutil.SeedFolder(t, db, "Test", nil, "article")

	err := repo.UpdateType(ctx, id, "picture")
	if err != nil {
		t.Fatalf("failed to update type: %v", err)
	}

	// Verify update
	folder, err := repo.GetByID(ctx, id)
	if err != nil {
		t.Fatalf("failed to get folder: %v", err)
	}

	if folder.Type != "picture" {
		t.Errorf("expected type 'picture', got %s", folder.Type)
	}
}

func TestFolderRepository_Delete_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	id := testutil.SeedFolder(t, db, "To Delete", nil, "article")

	err := repo.Delete(ctx, id)
	if err != nil {
		t.Fatalf("failed to delete folder: %v", err)
	}

	// Verify deletion
	_, err = repo.GetByID(ctx, id)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Error("expected folder to be deleted")
	}
}

func TestFolderRepository_Delete_CascadeChildren(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	// Create parent and child
	parentID := testutil.SeedFolder(t, db, "Parent", nil, "article")
	childID := testutil.SeedFolder(t, db, "Child", &parentID, "article")

	// Delete parent should cascade to child
	err := repo.Delete(ctx, parentID)
	if err != nil {
		t.Fatalf("failed to delete parent: %v", err)
	}

	// Verify child is also deleted
	_, err = repo.GetByID(ctx, childID)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Error("expected child to be cascade deleted")
	}
}

func TestFolderRepository_Create_SpecialCharacters(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	specialName := "Test'; DROP TABLE folders; --"

	folder, err := repo.Create(ctx, specialName, nil, "article")
	if err != nil {
		t.Fatalf("failed to create folder with special characters: %v", err)
	}

	if folder.Name != specialName {
		t.Errorf("expected name %q, got %q", specialName, folder.Name)
	}

	// 验证表仍然存在
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM folders").Scan(&count)
	if err != nil {
		t.Fatalf("folders table should still exist: %v", err)
	}
}

// --- 并发测试 ---
// 注意: 这些测试不使用 t.Parallel()，因为它们内部创建的 goroutine 会访问测试数据库。
// 如果使用 t.Parallel()，数据库会在 goroutine 完成前被关闭 (通过 t.Cleanup)，
// 导致 "no such table" 错误。

func TestFolderRepository_Create_Concurrent(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	const goroutines = 10
	var wg sync.WaitGroup
	var mu sync.Mutex
	ids := make(map[int64]bool)
	errCount := 0

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			name := "Folder " + string(rune('A'+idx))
			folder, err := repo.Create(ctx, name, nil, "article")

			mu.Lock()
			defer mu.Unlock()

			if err != nil {
				errCount++
				return
			}

			if ids[folder.ID] {
				t.Errorf("duplicate ID generated: %d", folder.ID)
			}
			ids[folder.ID] = true
		}(i)
	}

	wg.Wait()

	if errCount > 0 {
		t.Errorf("expected 0 errors, got %d", errCount)
	}

	if len(ids) != goroutines {
		t.Errorf("expected %d unique folders, got %d", goroutines, len(ids))
	}
}

func TestFolderRepository_ReadWrite_Concurrent(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	// Create initial folder
	folderID := testutil.SeedFolder(t, db, "Concurrent Test", nil, "article")

	const goroutines = 20
	var wg sync.WaitGroup
	errChan := make(chan error, goroutines)

	// Half readers, half writers
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			if idx%2 == 0 {
				// Reader
				_, err := repo.GetByID(ctx, folderID)
				if err != nil {
					errChan <- err
				}
			} else {
				// Writer (update name)
				name := "Updated " + string(rune('A'+idx))
				_, err := repo.Update(ctx, folderID, name, nil)
				if err != nil {
					errChan <- err
				}
			}
		}(i)
	}

	wg.Wait()
	close(errChan)

	for err := range errChan {
		t.Errorf("concurrent operation failed: %v", err)
	}
}

func TestFolderRepository_List_Concurrent(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	// Seed some folders
	for i := 0; i < 5; i++ {
		testutil.SeedFolder(t, db, "Folder "+string(rune('A'+i)), nil, "article")
	}

	const goroutines = 10
	var wg sync.WaitGroup
	results := make(chan int, goroutines)

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			folders, err := repo.List(ctx)
			if err != nil {
				t.Errorf("List failed: %v", err)
				return
			}
			results <- len(folders)
		}()
	}

	wg.Wait()
	close(results)

	for count := range results {
		if count != 5 {
			t.Errorf("expected 5 folders, got %d", count)
		}
	}
}

func TestFolderRepository_Delete_Concurrent(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := NewFolderRepository(db)
	ctx := context.Background()

	// Create folders to delete
	ids := make([]int64, 10)
	for i := 0; i < 10; i++ {
		ids[i] = testutil.SeedFolder(t, db, "ToDelete "+string(rune('A'+i)), nil, "article")
	}

	var wg sync.WaitGroup

	// Concurrently delete all folders
	for _, id := range ids {
		wg.Add(1)
		go func(folderID int64) {
			defer wg.Done()

			err := repo.Delete(ctx, folderID)
			if err != nil {
				t.Errorf("Delete failed for ID %d: %v", folderID, err)
			}
		}(id)
	}

	wg.Wait()

	// Verify all deleted
	folders, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}

	if len(folders) != 0 {
		t.Errorf("expected 0 folders after deletion, got %d", len(folders))
	}
}
