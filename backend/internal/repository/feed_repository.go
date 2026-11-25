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

const feedColumns = `id, folder_id, title, url, site_url, description, summary_prompt_reminder, icon_path, type, etag, last_modified, error_message, created_at, updated_at`

type FeedRepository interface {
	Create(ctx context.Context, feed model.Feed) (model.Feed, error)
	GetByID(ctx context.Context, id int64) (model.Feed, error)
	GetByIDs(ctx context.Context, ids []int64) ([]model.Feed, error)
	FindByURL(ctx context.Context, url string) (*model.Feed, error)
	List(ctx context.Context, folderID *int64) ([]model.Feed, error)
	ListWithoutIcon(ctx context.Context) ([]model.Feed, error)
	Update(ctx context.Context, feed model.Feed) (model.Feed, error)
	UpdateConditionalGet(ctx context.Context, id int64, etag, lastModified *string) error
	UpdateIconPath(ctx context.Context, id int64, iconPath string) error
	UpdateErrorMessage(ctx context.Context, id int64, errorMessage *string) error
	UpdateType(ctx context.Context, id int64, feedType string) error
	UpdateTypeByFolderID(ctx context.Context, folderID int64, feedType string) error
	Delete(ctx context.Context, id int64) error
	DeleteBatch(ctx context.Context, ids []int64) (int64, error)
	ClearAllIconPaths(ctx context.Context) (int64, error)
	ClearAllConditionalGet(ctx context.Context) (int64, error)
	UpdateSiteURL(ctx context.Context, id int64, siteURL string) error
}

type feedRepository struct {
	db dbtx
}

func NewFeedRepository(db dbtx) FeedRepository {
	return &feedRepository{db: db}
}

func (r *feedRepository) Create(ctx context.Context, feed model.Feed) (model.Feed, error) {
	feed.ID = snowflake.NextID()
	now := time.Now().UTC().Truncate(time.Second)
	if feed.Type == "" {
		feed.Type = "article"
	}
	_, err := r.db.ExecContext(
		ctx,
		`INSERT INTO feeds (id, folder_id, title, url, site_url, description, summary_prompt_reminder, type, etag, last_modified, error_message, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		feed.ID,
		feed.FolderID,
		feed.Title,
		feed.URL,
		feed.SiteURL,
		feed.Description,
		feed.SummaryPromptReminder,
		feed.Type,
		feed.ETag,
		feed.LastModified,
		feed.ErrorMessage,
		formatTime(now),
		formatTime(now),
	)
	if err != nil {
		return model.Feed{}, fmt.Errorf("create feed: %w", err)
	}
	feed.CreatedAt = now
	feed.UpdatedAt = now
	return feed, nil
}

func (r *feedRepository) GetByID(ctx context.Context, id int64) (model.Feed, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+feedColumns+` FROM feeds WHERE id = ?`, id)
	return scanFeed(row)
}

func (r *feedRepository) GetByIDs(ctx context.Context, ids []int64) ([]model.Feed, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	var feeds []model.Feed
	err := chunkSlice(ids, sqliteMaxBatchSize, func(chunk []int64) error {
		args := make([]any, len(chunk))
		for i, id := range chunk {
			args[i] = id
		}
		rows, err := r.db.QueryContext(ctx, `SELECT `+feedColumns+` FROM feeds WHERE id IN (`+placeholders(len(chunk))+`)`, args...)
		if err != nil {
			return fmt.Errorf("get feeds by ids: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			feed, err := scanFeed(rows)
			if err != nil {
				return err
			}
			feeds = append(feeds, feed)
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("iterate feeds: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return feeds, nil
}

func (r *feedRepository) FindByURL(ctx context.Context, url string) (*model.Feed, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+feedColumns+` FROM feeds WHERE url = ?`, url)
	feed, err := scanFeed(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find feed: %w", err)
	}
	return &feed, nil
}

func (r *feedRepository) List(ctx context.Context, folderID *int64) ([]model.Feed, error) {
	query := `SELECT ` + feedColumns + ` FROM feeds ORDER BY title`
	var args []any
	if folderID != nil {
		query = `SELECT ` + feedColumns + ` FROM feeds WHERE folder_id = ? ORDER BY title`
		args = append(args, *folderID)
	}
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list feeds: %w", err)
	}
	defer rows.Close()

	var feeds []model.Feed
	for rows.Next() {
		feed, err := scanFeed(rows)
		if err != nil {
			return nil, err
		}
		feeds = append(feeds, feed)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate feeds: %w", err)
	}

	return feeds, nil
}

func (r *feedRepository) ListWithoutIcon(ctx context.Context) ([]model.Feed, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+feedColumns+` FROM feeds WHERE icon_path IS NULL OR icon_path = ''`)
	if err != nil {
		return nil, fmt.Errorf("list feeds without icon: %w", err)
	}
	defer rows.Close()

	var feeds []model.Feed
	for rows.Next() {
		feed, err := scanFeed(rows)
		if err != nil {
			return nil, err
		}
		feeds = append(feeds, feed)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate feeds: %w", err)
	}

	return feeds, nil
}

func (r *feedRepository) Update(ctx context.Context, feed model.Feed) (model.Feed, error) {
	now := time.Now().UTC().Truncate(time.Second)
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE feeds SET folder_id = ?, title = ?, url = ?, site_url = ?, description = ?, summary_prompt_reminder = ?, etag = ?, last_modified = ?, error_message = ?, updated_at = ? WHERE id = ?`,
		feed.FolderID,
		feed.Title,
		feed.URL,
		feed.SiteURL,
		feed.Description,
		feed.SummaryPromptReminder,
		feed.ETag,
		feed.LastModified,
		feed.ErrorMessage,
		formatTime(now),
		feed.ID,
	)
	if err != nil {
		return model.Feed{}, fmt.Errorf("update feed: %w", err)
	}
	feed.UpdatedAt = now
	return feed, nil
}

// UpdateConditionalGet updates only ETag and LastModified without overwriting user-edited columns.
func (r *feedRepository) UpdateConditionalGet(ctx context.Context, id int64, etag, lastModified *string) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE feeds
		 SET etag = COALESCE(?, etag),
		     last_modified = COALESCE(?, last_modified),
		     updated_at = ?
		 WHERE id = ?`,
		etag,
		lastModified,
		formatTime(time.Now()),
		id,
	)
	if err != nil {
		return fmt.Errorf("update feed conditional get: %w", err)
	}
	return nil
}

func (r *feedRepository) UpdateIconPath(ctx context.Context, id int64, iconPath string) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE feeds SET icon_path = ?, updated_at = ? WHERE id = ?`,
		iconPath,
		formatTime(time.Now()),
		id,
	)
	return err
}

func (r *feedRepository) UpdateSiteURL(ctx context.Context, id int64, siteURL string) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE feeds SET site_url = ?, updated_at = ? WHERE id = ?`,
		siteURL,
		formatTime(time.Now()),
		id,
	)
	return err
}

func (r *feedRepository) UpdateErrorMessage(ctx context.Context, id int64, errorMessage *string) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE feeds SET error_message = ?, updated_at = ? WHERE id = ?`,
		errorMessage,
		formatTime(time.Now()),
		id,
	)
	return err
}

func (r *feedRepository) UpdateType(ctx context.Context, id int64, feedType string) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE feeds SET type = ?, updated_at = ? WHERE id = ?`,
		feedType,
		formatTime(time.Now()),
		id,
	)
	return err
}

func (r *feedRepository) UpdateTypeByFolderID(ctx context.Context, folderID int64, feedType string) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE feeds SET type = ?, updated_at = ? WHERE folder_id = ?`,
		feedType,
		formatTime(time.Now()),
		folderID,
	)
	return err
}

func (r *feedRepository) Delete(ctx context.Context, id int64) error {
	if _, err := r.db.ExecContext(ctx, `DELETE FROM feeds WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete feed: %w", err)
	}
	return nil
}

func (r *feedRepository) DeleteBatch(ctx context.Context, ids []int64) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	var total int64
	err := withTx(ctx, r.db, func(exec dbtx) error {
		return chunkSlice(ids, sqliteMaxBatchSize, func(chunk []int64) error {
			args := make([]any, len(chunk))
			for i, id := range chunk {
				args[i] = id
			}
			result, err := exec.ExecContext(ctx, `DELETE FROM feeds WHERE id IN (`+placeholders(len(chunk))+`)`, args...)
			if err != nil {
				return fmt.Errorf("delete feeds batch: %w", err)
			}
			affected, err := result.RowsAffected()
			if err != nil {
				return err
			}
			total += affected
			return nil
		})
	})
	if err != nil {
		return 0, err
	}
	return total, nil
}

func (r *feedRepository) ClearAllIconPaths(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE feeds SET icon_path = NULL, updated_at = ? WHERE icon_path IS NOT NULL`, formatTime(time.Now()))
	if err != nil {
		return 0, fmt.Errorf("clear icon paths: %w", err)
	}
	return result.RowsAffected()
}

func (r *feedRepository) ClearAllConditionalGet(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE feeds SET etag = NULL, last_modified = NULL, updated_at = ? WHERE etag IS NOT NULL OR last_modified IS NOT NULL`, formatTime(time.Now()))
	if err != nil {
		return 0, fmt.Errorf("clear conditional get: %w", err)
	}
	return result.RowsAffected()
}

func scanFeed(scanner rowScanner) (model.Feed, error) {
	var feed model.Feed
	var folderID sql.NullInt64
	var siteURL sql.NullString
	var description sql.NullString
	var summaryPromptReminder sql.NullString
	var iconPath sql.NullString
	var feedType sql.NullString
	var etag sql.NullString
	var lastModified sql.NullString
	var errorMessage sql.NullString
	var createdAt string
	var updatedAt string
	if err := scanner.Scan(
		&feed.ID,
		&folderID,
		&feed.Title,
		&feed.URL,
		&siteURL,
		&description,
		&summaryPromptReminder,
		&iconPath,
		&feedType,
		&etag,
		&lastModified,
		&errorMessage,
		&createdAt,
		&updatedAt,
	); err != nil {
		return model.Feed{}, err
	}
	if folderID.Valid {
		feed.FolderID = &folderID.Int64
	}
	if siteURL.Valid {
		feed.SiteURL = &siteURL.String
	}
	if description.Valid {
		feed.Description = &description.String
	}
	if summaryPromptReminder.Valid {
		feed.SummaryPromptReminder = &summaryPromptReminder.String
	}
	if iconPath.Valid {
		feed.IconPath = &iconPath.String
	}
	if feedType.Valid {
		feed.Type = feedType.String
	} else {
		feed.Type = "article"
	}
	if etag.Valid {
		feed.ETag = &etag.String
	}
	if lastModified.Valid {
		feed.LastModified = &lastModified.String
	}
	if errorMessage.Valid {
		feed.ErrorMessage = &errorMessage.String
	}
	var err error
	feed.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return model.Feed{}, fmt.Errorf("parse feed created_at: %w", err)
	}
	feed.UpdatedAt, err = parseTime(updatedAt)
	if err != nil {
		return model.Feed{}, fmt.Errorf("parse feed updated_at: %w", err)
	}
	return feed, nil
}
