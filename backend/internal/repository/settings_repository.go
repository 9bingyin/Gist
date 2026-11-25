//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"gist/backend/internal/model"
)

// SettingsRepository defines the interface for settings storage.
type SettingsRepository interface {
	Get(ctx context.Context, key string) (*model.Setting, error)
	Set(ctx context.Context, key, value string) error
	SetMany(ctx context.Context, values map[string]string) error
	GetByPrefix(ctx context.Context, prefix string) ([]model.Setting, error)
	Delete(ctx context.Context, key string) error
	DeleteByPrefix(ctx context.Context, prefix string) (int64, error)
}

type settingsRepository struct {
	db dbtx
}

// NewSettingsRepository creates a new settings repository.
func NewSettingsRepository(db dbtx) SettingsRepository {
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
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	t, err := parseTime(updatedAt)
	if err != nil {
		return nil, fmt.Errorf("parse setting updated_at: %w", err)
	}
	s.UpdatedAt = t
	return &s, nil
}

// Set creates or updates a setting.
func (r *settingsRepository) Set(ctx context.Context, key, value string) error {
	now := formatTime(time.Now())
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO settings (key, value, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, key, value, now)
	return err
}

// SetMany creates or updates multiple settings in one transaction.
func (r *settingsRepository) SetMany(ctx context.Context, values map[string]string) error {
	if len(values) == 0 {
		return nil
	}

	now := formatTime(time.Now())
	return withTx(ctx, r.db, func(exec dbtx) error {
		for key, value := range values {
			if _, err := exec.ExecContext(ctx, `
				INSERT INTO settings (key, value, updated_at)
				VALUES (?, ?, ?)
				ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
			`, key, value, now); err != nil {
				return fmt.Errorf("set setting %s: %w", key, err)
			}
		}
		return nil
	})
}

// GetByPrefix retrieves all settings with keys starting with the given prefix.
func (r *settingsRepository) GetByPrefix(ctx context.Context, prefix string) ([]model.Setting, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT key, value, updated_at FROM settings WHERE key LIKE ? ESCAPE '\'
	`, escapeLikePrefix(prefix)+"%")
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
		t, err := parseTime(updatedAt)
		if err != nil {
			return nil, fmt.Errorf("parse setting updated_at: %w", err)
		}
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
	result, err := r.db.ExecContext(ctx, `DELETE FROM settings WHERE key LIKE ? ESCAPE '\'`, escapeLikePrefix(prefix)+"%")
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
