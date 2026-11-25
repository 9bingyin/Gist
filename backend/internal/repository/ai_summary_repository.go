//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"gist/backend/internal/model"
	"gist/backend/pkg/snowflake"
)

type AISummaryRepository interface {
	Get(ctx context.Context, entryID int64, isReadability bool, language string) (*model.AISummary, error)
	Save(ctx context.Context, entryID int64, isReadability bool, language, summary string) error
	DeleteAll(ctx context.Context) (int64, error)
}

type aiSummaryRepository struct {
	db dbtx
}

func NewAISummaryRepository(db dbtx) AISummaryRepository {
	return &aiSummaryRepository{db: db}
}

func (r *aiSummaryRepository) Get(ctx context.Context, entryID int64, isReadability bool, language string) (*model.AISummary, error) {
	row := r.db.QueryRowContext(
		ctx,
		`SELECT id, entry_id, is_readability, language, summary, created_at
		 FROM ai_summaries WHERE entry_id = ? AND is_readability = ? AND language = ?`,
		entryID, boolToInt(isReadability), language,
	)

	var s model.AISummary
	var isReadabilityDB int
	var createdAt string

	err := row.Scan(&s.ID, &s.EntryID, &isReadabilityDB, &s.Language, &s.Summary, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	s.IsReadability = isReadabilityDB == 1
	s.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return nil, fmt.Errorf("parse ai_summary created_at: %w", err)
	}

	return &s, nil
}

func (r *aiSummaryRepository) Save(ctx context.Context, entryID int64, isReadability bool, language, summary string) error {
	id := snowflake.NextID()
	now := formatTime(time.Now())

	_, err := r.db.ExecContext(
		ctx,
		`INSERT INTO ai_summaries (id, entry_id, is_readability, language, summary, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(entry_id, is_readability, language) DO UPDATE SET
		   summary = excluded.summary,
		   created_at = excluded.created_at`,
		id, entryID, boolToInt(isReadability), language, summary, now,
	)
	return err
}

func (r *aiSummaryRepository) DeleteAll(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM ai_summaries`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
