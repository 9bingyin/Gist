package repository

import (
	"context"
	"database/sql"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/snowflake"
)

type AITranslationRepository interface {
	Get(ctx context.Context, entryID int64, isReadability bool, language string) (*model.AITranslation, error)
	Save(ctx context.Context, entryID int64, isReadability bool, language, content string) error
	DeleteByEntryID(ctx context.Context, entryID int64) error
}

type aiTranslationRepository struct {
	db dbtx
}

func NewAITranslationRepository(db dbtx) AITranslationRepository {
	return &aiTranslationRepository{db: db}
}

func (r *aiTranslationRepository) Get(ctx context.Context, entryID int64, isReadability bool, language string) (*model.AITranslation, error) {
	isReadabilityInt := 0
	if isReadability {
		isReadabilityInt = 1
	}

	row := r.db.QueryRowContext(
		ctx,
		`SELECT id, entry_id, is_readability, language, content, created_at
		 FROM ai_translations WHERE entry_id = ? AND is_readability = ? AND language = ?`,
		entryID, isReadabilityInt, language,
	)

	var t model.AITranslation
	var isReadabilityDB int
	var createdAt string

	err := row.Scan(&t.ID, &t.EntryID, &isReadabilityDB, &t.Language, &t.Content, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	t.IsReadability = isReadabilityDB == 1
	t.CreatedAt, _ = parseTime(createdAt)

	return &t, nil
}

func (r *aiTranslationRepository) Save(ctx context.Context, entryID int64, isReadability bool, language, content string) error {
	id := snowflake.NextID()
	now := formatTime(time.Now())

	isReadabilityInt := 0
	if isReadability {
		isReadabilityInt = 1
	}

	_, err := r.db.ExecContext(
		ctx,
		`INSERT INTO ai_translations (id, entry_id, is_readability, language, content, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(entry_id, is_readability, language) DO UPDATE SET
		   content = excluded.content,
		   created_at = excluded.created_at`,
		id, entryID, isReadabilityInt, language, content, now,
	)
	return err
}

func (r *aiTranslationRepository) DeleteByEntryID(ctx context.Context, entryID int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM ai_translations WHERE entry_id = ?`, entryID)
	return err
}
