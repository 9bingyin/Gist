//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package repository

import (
	"context"
	"database/sql"
	"time"

	"gist/backend/internal/model"
	"gist/backend/pkg/snowflake"
)

type AIListTranslationRepository interface {
	Get(ctx context.Context, entryID int64, language string) (*model.AIListTranslation, error)
	GetBatch(ctx context.Context, entryIDs []int64, language string) (map[int64]*model.AIListTranslation, error)
	Save(ctx context.Context, entryID int64, language, title, summary string) error
	DeleteByEntryID(ctx context.Context, entryID int64) error
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
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	t.CreatedAt, _ = parseTime(createdAt)

	return &t, nil
}

func (r *aiListTranslationRepository) GetBatch(ctx context.Context, entryIDs []int64, language string) (map[int64]*model.AIListTranslation, error) {
	if len(entryIDs) == 0 {
		return make(map[int64]*model.AIListTranslation), nil
	}

	// Build query with placeholders
	query := `SELECT id, entry_id, language, title, summary, created_at
	          FROM ai_list_translations WHERE language = ? AND entry_id IN (`
	args := make([]interface{}, 0, len(entryIDs)+1)
	args = append(args, language)

	for i, id := range entryIDs {
		if i > 0 {
			query += ","
		}
		query += "?"
		args = append(args, id)
	}
	query += ")"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int64]*model.AIListTranslation)
	for rows.Next() {
		var t model.AIListTranslation
		var createdAt string

		if err := rows.Scan(&t.ID, &t.EntryID, &t.Language, &t.Title, &t.Summary, &createdAt); err != nil {
			return nil, err
		}

		t.CreatedAt, _ = parseTime(createdAt)
		result[t.EntryID] = &t
	}

	return result, rows.Err()
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

func (r *aiListTranslationRepository) DeleteByEntryID(ctx context.Context, entryID int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM ai_list_translations WHERE entry_id = ?`, entryID)
	return err
}

func (r *aiListTranslationRepository) DeleteAll(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM ai_list_translations`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
