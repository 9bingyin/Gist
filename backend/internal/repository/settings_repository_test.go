package repository

import (
	"context"
	"testing"

	"gist/backend/internal/repository/testutil"
)

func TestSettingsRepository_Set_Insert(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	err := repo.Set(ctx, "test.key", "test value")
	if err != nil {
		t.Fatalf("failed to set setting: %v", err)
	}

	// Verify insertion
	setting, err := repo.Get(ctx, "test.key")
	if err != nil {
		t.Fatalf("failed to get setting: %v", err)
	}

	if setting == nil {
		t.Fatal("expected setting to exist, got nil")
	}

	if setting.Key != "test.key" {
		t.Errorf("expected key 'test.key', got %s", setting.Key)
	}

	if setting.Value != "test value" {
		t.Errorf("expected value 'test value', got %s", setting.Value)
	}

	if setting.UpdatedAt.IsZero() {
		t.Error("expected non-zero updated_at timestamp")
	}
}

func TestSettingsRepository_Set_Update(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	// Initial insertion
	testutil.SeedSetting(t, db, "test.key", "initial value")

	// Update the value
	err := repo.Set(ctx, "test.key", "updated value")
	if err != nil {
		t.Fatalf("failed to update setting: %v", err)
	}

	// Verify update
	setting, err := repo.Get(ctx, "test.key")
	if err != nil {
		t.Fatalf("failed to get setting: %v", err)
	}

	if setting.Value != "updated value" {
		t.Errorf("expected value 'updated value', got %s", setting.Value)
	}
}

func TestSettingsRepository_Get_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	testutil.SeedSetting(t, db, "ai.provider", "openai")

	setting, err := repo.Get(ctx, "ai.provider")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if setting == nil {
		t.Fatal("expected setting to exist, got nil")
	}

	if setting.Key != "ai.provider" {
		t.Errorf("expected key 'ai.provider', got %s", setting.Key)
	}

	if setting.Value != "openai" {
		t.Errorf("expected value 'openai', got %s", setting.Value)
	}
}

func TestSettingsRepository_Get_NotFound(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	setting, err := repo.Get(ctx, "nonexistent.key")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if setting != nil {
		t.Errorf("expected nil for nonexistent key, got %v", setting)
	}
}

func TestSettingsRepository_GetByPrefix_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	// Seed multiple settings with different prefixes
	testutil.SeedSetting(t, db, "ai.provider", "openai")
	testutil.SeedSetting(t, db, "ai.api_key", "sk-test123")
	testutil.SeedSetting(t, db, "ai.model", "gpt-4")
	testutil.SeedSetting(t, db, "general.theme", "dark")

	// Get all settings with "ai." prefix
	settings, err := repo.GetByPrefix(ctx, "ai.")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(settings) != 3 {
		t.Errorf("expected 3 settings with prefix 'ai.', got %d", len(settings))
	}

	// Verify all returned keys have the prefix
	for _, s := range settings {
		if len(s.Key) < 3 || s.Key[:3] != "ai." {
			t.Errorf("expected key with prefix 'ai.', got %s", s.Key)
		}
	}
}

func TestSettingsRepository_GetByPrefix_Empty(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	testutil.SeedSetting(t, db, "ai.provider", "openai")

	// Get settings with non-matching prefix
	settings, err := repo.GetByPrefix(ctx, "nonexistent.")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(settings) != 0 {
		t.Errorf("expected 0 settings with prefix 'nonexistent.', got %d", len(settings))
	}
}

func TestSettingsRepository_Delete_Success(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	testutil.SeedSetting(t, db, "test.key", "test value")

	// Delete the setting
	err := repo.Delete(ctx, "test.key")
	if err != nil {
		t.Fatalf("failed to delete setting: %v", err)
	}

	// Verify deletion
	setting, err := repo.Get(ctx, "test.key")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if setting != nil {
		t.Error("expected setting to be deleted, but it still exists")
	}
}

func TestSettingsRepository_Delete_Nonexistent(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	// Delete non-existent key should not error
	err := repo.Delete(ctx, "nonexistent.key")
	if err != nil {
		t.Fatalf("unexpected error when deleting non-existent key: %v", err)
	}
}

func TestSettingsRepository_Set_EmptyValue(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	// Set empty value should be allowed
	err := repo.Set(ctx, "test.key", "")
	if err != nil {
		t.Fatalf("failed to set empty value: %v", err)
	}

	setting, err := repo.Get(ctx, "test.key")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if setting == nil {
		t.Fatal("expected setting to exist, got nil")
	}

	if setting.Value != "" {
		t.Errorf("expected empty value, got %s", setting.Value)
	}
}

func TestSettingsRepository_Set_SpecialCharacters(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	// Test value with special characters (SQL injection attempt)
	specialValue := "'; DROP TABLE settings; --"

	err := repo.Set(ctx, "test.key", specialValue)
	if err != nil {
		t.Fatalf("failed to set value with special characters: %v", err)
	}

	setting, err := repo.Get(ctx, "test.key")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if setting.Value != specialValue {
		t.Errorf("expected value %q, got %q", specialValue, setting.Value)
	}

	// Verify table still exists
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM settings").Scan(&count)
	if err != nil {
		t.Fatalf("settings table should still exist: %v", err)
	}
}

func TestSettingsRepository_GetByPrefix_SpecialCharacters(t *testing.T) {
	t.Parallel()
	db := testutil.NewTestDB(t)
	repo := NewSettingsRepository(db)
	ctx := context.Background()

	testutil.SeedSetting(t, db, "test.key", "value")

	// Test prefix with SQL wildcard characters - % will match "test." and beyond
	settings, err := repo.GetByPrefix(ctx, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should match "test.key" because the prefix matches
	if len(settings) != 1 {
		t.Errorf("expected 1 setting with prefix 'test', got %d", len(settings))
	}

	// Test empty prefix - should match all
	allSettings, err := repo.GetByPrefix(ctx, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(allSettings) < 1 {
		t.Error("expected at least 1 setting with empty prefix")
	}
}
