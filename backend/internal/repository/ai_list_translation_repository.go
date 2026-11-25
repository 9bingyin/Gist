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

type AIListTranslationRepository interface {
	Get(ctx context.Context, entryID int64, language string) (*model.AIListTranslation, error)
	GetBatch(ctx context.Context, entryIDs []int64, language string) (map[int64]*model.AIListTranslation, error)
	Save(ctx context.Context, entryID int64, language, title, summary string) error
	DeleteAll(ctx context.Context) (int64, error)
}

type aiListTranslationRepository struct {
	db dbtx
}

func NewAIListTranslationRepository(db dbtx) AIListTranslationRepository {
	return &aiListTranslationRepository{db: db}
}

func (r *aiListTranslationRepository) Get(ctx context.Context, entryID int64, language string) (*model.AIListTranslation, error) {
	row := r.db.QueryRowContext(
		ctx,
		`SELECT id, entry_id, language, title, summary, created_at
		 FROM ai_list_translations WHERE entry_id = ? AND language = ?`,
		entryID, language,
	)

	var t model.AIListTranslation
	var createdAt string

	err := row.Scan(&t.ID, &t.EntryID, &t.Language, &t.Title, &t.Summary, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	t.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return nil, fmt.Errorf("parse ai_list_translation created_at: %w", err)
	}

	return &t, nil
}

func (r *aiListTranslationRepository) GetBatch(ctx context.Context, entryIDs []int64, language string) (map[int64]*model.AIListTranslation, error) {
	result := make(map[int64]*model.AIListTranslation)
	if len(entryIDs) == 0 {
		return result, nil
	}

	err := chunkSlice(entryIDs, sqliteMaxBatchSize-1, func(chunk []int64) error {
		args := make([]any, 0, len(chunk)+1)
		args = append(args, language)
		for _, id := range chunk {
			args = append(args, id)
		}

		query := `SELECT id, entry_id, language, title, summary, created_at
		          FROM ai_list_translations WHERE language = ? AND entry_id IN (` + placeholders(len(chunk)) + `)`

		rows, err := r.db.QueryContext(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var t model.AIListTranslation
			var createdAt string
			if err := rows.Scan(&t.ID, &t.EntryID, &t.Language, &t.Title, &t.Summary, &createdAt); err != nil {
				return err
			}
			t.CreatedAt, err = parseTime(createdAt)
			if err != nil {
				return fmt.Errorf("parse ai_list_translation created_at: %w", err)
			}
			result[t.EntryID] = &t
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (r *aiListTranslationRepository) Save(ctx context.Context, entryID int64, language, title, summary string) error {
	id := snowflake.NextID()
	now := formatTime(time.Now())

	_, err := r.db.ExecContext(
		ctx,
		`INSERT INTO ai_list_translations (id, entry_id, language, title, summary, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(entry_id, language) DO UPDATE SET
		   title = excluded.title,
		   summary = excluded.summary,
		   created_at = excluded.created_at`,
		id, entryID, language, title, summary, now,
	)
	return err
}

func (r *aiListTranslationRepository) DeleteAll(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM ai_list_translations`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
