//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package repository

import (
	"context"
	"database/sql"
	"time"

	"gist/backend/internal/model"
)

// SettingsRepository defines the interface for settings storage.
type SettingsRepository interface {
	Get(ctx context.Context, key string) (*model.Setting, error)
	Set(ctx context.Context, key, value string) error
	GetByPrefix(ctx context.Context, prefix string) ([]model.Setting, error)
	Delete(ctx context.Context, key string) error
	DeleteByPrefix(ctx context.Context, prefix string) (int64, error)
}

type settingsRepository struct {
	db *sql.DB
}

// NewSettingsRepository creates a new settings repository.
func NewSettingsRepository(db *sql.DB) SettingsRepository {
	return &settingsRepository{db: db}
}

// Get retrieves a setting by key.
func (r *settingsRepository) Get(ctx context.Context, key string) (*model.Setting, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT key, value, updated_at FROM settings WHERE key = ?
	`, key)

	var s model.Setting
	var updatedAt string
	if err := row.Scan(&s.Key, &s.Value, &updatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	t, _ := time.Parse(time.RFC3339, updatedAt)
	s.UpdatedAt = t
	return &s, nil
}

// Set creates or updates a setting.
func (r *settingsRepository) Set(ctx context.Context, key, value string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO settings (key, value, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, key, value, now)
	return err
}

// GetByPrefix retrieves all settings with keys starting with the given prefix.
func (r *settingsRepository) GetByPrefix(ctx context.Context, prefix string) ([]model.Setting, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT key, value, updated_at FROM settings WHERE key LIKE ?
	`, prefix+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var settings []model.Setting
	for rows.Next() {
		var s model.Setting
		var updatedAt string
		if err := rows.Scan(&s.Key, &s.Value, &updatedAt); err != nil {
			return nil, err
		}
		t, _ := time.Parse(time.RFC3339, updatedAt)
		s.UpdatedAt = t
		settings = append(settings, s)
	}
	return settings, rows.Err()
}

// Delete removes a setting by key.
func (r *settingsRepository) Delete(ctx context.Context, key string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM settings WHERE key = ?`, key)
	return err
}

// DeleteByPrefix removes all settings with keys starting with the given prefix.
func (r *settingsRepository) DeleteByPrefix(ctx context.Context, prefix string) (int64, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM settings WHERE key LIKE ?`, prefix+"%")
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
