package repository_test

import (
	"gist/backend/internal/repository"
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"

	"gist/backend/internal/repository/testutil"

	"github.com/stretchr/testify/require"
)

func TestFolderRepository_Create_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	folder, err := repo.Create(ctx, "Tech News", nil, "article")
	require.NoError(t, err)
	require.NotZero(t, folder.ID)
	require.Equal(t, "Tech News", folder.Name)
	require.Nil(t, folder.ParentID)
	require.Equal(t, "article", folder.Type)
	require.False(t, folder.CreatedAt.IsZero())
	require.False(t, folder.UpdatedAt.IsZero())
}

func TestFolderRepository_Create_WithParent(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	// Create parent folder
	parentID := testutil.SeedFolder(t, db, "Parent", nil, "article")

	// Create child folder
	folder, err := repo.Create(ctx, "Child", &parentID, "article")
	require.NoError(t, err)
	require.NotNil(t, folder.ParentID)
	require.Equal(t, parentID, *folder.ParentID)
}

func TestFolderRepository_Create_DefaultType(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	folder, err := repo.Create(ctx, "Test", nil, "")
	require.NoError(t, err)
	require.Equal(t, "article", folder.Type)
}

func TestFolderRepository_GetByID_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	id := testutil.SeedFolder(t, db, "Test Folder", nil, "picture")

	folder, err := repo.GetByID(ctx, id)
	require.NoError(t, err)
	require.Equal(t, id, folder.ID)
	require.Equal(t, "Test Folder", folder.Name)
	require.Equal(t, "picture", folder.Type)
}

func TestFolderRepository_GetByID_NotFound(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, 99999)
	require.Error(t, err)
	require.True(t, errors.Is(err, sql.ErrNoRows))
}

func TestFolderRepository_FindByName_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	parentID := testutil.SeedFolder(t, db, "Parent", nil, "article")
	childID := testutil.SeedFolder(t, db, "Child", &parentID, "article")

	// Find child by name under parent
	folder, err := repo.FindByName(ctx, "Child", &parentID)
	require.NoError(t, err)
	require.NotNil(t, folder)
	require.Equal(t, childID, folder.ID)
}

func TestFolderRepository_FindByName_NotFound(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	folder, err := repo.FindByName(ctx, "NonExistent", nil)
	require.NoError(t, err)
	require.Nil(t, folder)
}

func TestFolderRepository_List_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	testutil.SeedFolder(t, db, "Folder A", nil, "article")
	testutil.SeedFolder(t, db, "Folder B", nil, "picture")
	testutil.SeedFolder(t, db, "Folder C", nil, "notification")

	folders, err := repo.List(ctx)
	require.NoError(t, err)
	require.Len(t, folders, 3)

	// Verify ordering by name
	require.LessOrEqual(t, folders[0].Name, folders[1].Name)
}

func TestFolderRepository_Update_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	id := testutil.SeedFolder(t, db, "Original Name", nil, "article")

	// Update folder
	newParentID := testutil.SeedFolder(t, db, "New Parent", nil, "article")
	updated, err := repo.Update(ctx, id, "Updated Name", &newParentID)
	require.NoError(t, err)
	require.Equal(t, "Updated Name", updated.Name)
	require.NotNil(t, updated.ParentID)
	require.Equal(t, newParentID, *updated.ParentID)
}

func TestFolderRepository_Delete_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	id := testutil.SeedFolder(t, db, "To Delete", nil, "article")

	err := repo.Delete(ctx, id)
	require.NoError(t, err)

	// Verify deletion
	_, err = repo.GetByID(ctx, id)
	require.Error(t, err)
	require.True(t, errors.Is(err, sql.ErrNoRows))
}

func TestFolderRepository_Delete_CascadeChildren(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	// Create parent and child
	parentID := testutil.SeedFolder(t, db, "Parent", nil, "article")
	childID := testutil.SeedFolder(t, db, "Child", &parentID, "article")

	// Delete parent should cascade to child
	err := repo.Delete(ctx, parentID)
	require.NoError(t, err)

	// Verify child is also deleted
	_, err = repo.GetByID(ctx, childID)
	require.Error(t, err)
	require.True(t, errors.Is(err, sql.ErrNoRows))
}

func TestFolderRepository_Create_Concurrent(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewFolderRepository(db)
	ctx := context.Background()

	const goroutines = 10
	var wg sync.WaitGroup
	var mu sync.Mutex
	ids := make(map[int64]bool)

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			name := "Folder " + string(rune('A'+idx))
			folder, err := repo.Create(ctx, name, nil, "article")
			require.NoError(t, err)

			mu.Lock()
			defer mu.Unlock()
			require.False(t, ids[folder.ID], "duplicate ID generated")
			ids[folder.ID] = true
		}(i)
	}

	wg.Wait()
	require.Len(t, ids, goroutines)
}
