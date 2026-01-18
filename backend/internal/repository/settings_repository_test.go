package repository_test

import (
	"gist/backend/internal/repository"
	"context"
	"testing"

	"gist/backend/internal/repository/testutil"

	"github.com/stretchr/testify/require"
)

func TestSettingsRepository_Set_Insert(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewSettingsRepository(db)
	ctx := context.Background()

	err := repo.Set(ctx, "test.key", "test value")
	require.NoError(t, err)

	// Verify insertion
	setting, err := repo.Get(ctx, "test.key")
	require.NoError(t, err)
	require.NotNil(t, setting)
	require.Equal(t, "test.key", setting.Key)
	require.Equal(t, "test value", setting.Value)
	require.False(t, setting.UpdatedAt.IsZero())
}

func TestSettingsRepository_Set_Update(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewSettingsRepository(db)
	ctx := context.Background()

	// Initial insertion
	testutil.SeedSetting(t, db, "test.key", "initial value")

	// Update the value
	err := repo.Set(ctx, "test.key", "updated value")
	require.NoError(t, err)

	// Verify update
	setting, err := repo.Get(ctx, "test.key")
	require.NoError(t, err)
	require.Equal(t, "updated value", setting.Value)
}

func TestSettingsRepository_Get_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewSettingsRepository(db)
	ctx := context.Background()

	testutil.SeedSetting(t, db, "ai.provider", "openai")

	setting, err := repo.Get(ctx, "ai.provider")
	require.NoError(t, err)
	require.NotNil(t, setting)
	require.Equal(t, "ai.provider", setting.Key)
	require.Equal(t, "openai", setting.Value)
}

func TestSettingsRepository_Get_NotFound(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewSettingsRepository(db)
	ctx := context.Background()

	setting, err := repo.Get(ctx, "nonexistent.key")
	require.NoError(t, err)
	require.Nil(t, setting)
}

func TestSettingsRepository_GetByPrefix_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewSettingsRepository(db)
	ctx := context.Background()

	// Seed multiple settings with different prefixes
	testutil.SeedSetting(t, db, "ai.provider", "openai")
	testutil.SeedSetting(t, db, "ai.api_key", "sk-test123")
	testutil.SeedSetting(t, db, "ai.model", "gpt-4")
	testutil.SeedSetting(t, db, "general.theme", "dark")

	// Get all settings with "ai." prefix
	settings, err := repo.GetByPrefix(ctx, "ai.")
	require.NoError(t, err)
	require.Len(t, settings, 3)

	// Verify all returned keys have the prefix
	for _, s := range settings {
		require.True(t, len(s.Key) >= 3 && s.Key[:3] == "ai.", "expected key with prefix 'ai.', got %s", s.Key)
	}
}

func TestSettingsRepository_Delete_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := repository.NewSettingsRepository(db)
	ctx := context.Background()

	testutil.SeedSetting(t, db, "test.key", "test value")

	// Delete the setting
	err := repo.Delete(ctx, "test.key")
	require.NoError(t, err)

	// Verify deletion
	setting, err := repo.Get(ctx, "test.key")
	require.NoError(t, err)
	require.Nil(t, setting)
}
