package repository

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"gist/backend/internal/model"
)

type EntryListFilter struct {
	FeedID     *int64
	FolderID   *int64
	UnreadOnly bool
	Limit      int
	Offset     int
}

type UnreadCount struct {
	FeedID int64
	Count  int
}

type EntryRepository interface {
	GetByID(ctx context.Context, id int64) (model.Entry, error)
	List(ctx context.Context, filter EntryListFilter) ([]model.Entry, error)
	UpdateReadStatus(ctx context.Context, id int64, read bool) error
	UpdateReadableContent(ctx context.Context, id int64, content string) error
	MarkAllAsRead(ctx context.Context, feedID *int64, folderID *int64) error
	GetAllUnreadCounts(ctx context.Context) ([]UnreadCount, error)
	CreateOrUpdate(ctx context.Context, entry model.Entry) error
	ExistsByURL(ctx context.Context, feedID int64, url string) (bool, error)
}

type entryRepository struct {
	db dbtx
}

func NewEntryRepository(db dbtx) EntryRepository {
	return &entryRepository{db: db}
}

func (r *entryRepository) GetByID(ctx context.Context, id int64) (model.Entry, error) {
	row := r.db.QueryRowContext(
		ctx,
		`SELECT id, feed_id, title, url, content, readable_content, thumbnail_url, author, published_at, read, created_at, updated_at
		 FROM entries WHERE id = ?`,
		id,
	)
	return scanEntry(row)
}

func (r *entryRepository) List(ctx context.Context, filter EntryListFilter) ([]model.Entry, error) {
	var args []interface{}
	query := `
		SELECT e.id, e.feed_id, e.title, e.url, e.content, e.readable_content, e.thumbnail_url, e.author,
		       e.published_at, e.read, e.created_at, e.updated_at
		FROM entries e
	`

	var conditions []string

	if filter.FolderID != nil {
		query += " INNER JOIN feeds f ON e.feed_id = f.id"
		conditions = append(conditions, "f.folder_id = ?")
		args = append(args, *filter.FolderID)
	}

	if filter.FeedID != nil {
		conditions = append(conditions, "e.feed_id = ?")
		args = append(args, *filter.FeedID)
	}

	if filter.UnreadOnly {
		conditions = append(conditions, "e.read = 0")
	}

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}

	query += " ORDER BY e.published_at DESC, e.id DESC"

	if filter.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, filter.Limit)
	}
	if filter.Offset > 0 {
		query += " OFFSET ?"
		args = append(args, filter.Offset)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.Entry
	for rows.Next() {
		entry, err := scanEntryRows(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return entries, nil
}

func (r *entryRepository) UpdateReadStatus(ctx context.Context, id int64, read bool) error {
	readInt := 0
	if read {
		readInt = 1
	}

	_, err := r.db.ExecContext(
		ctx,
		`UPDATE entries SET read = ?, updated_at = ? WHERE id = ?`,
		readInt,
		formatTime(time.Now()),
		id,
	)
	return err
}

func (r *entryRepository) MarkAllAsRead(ctx context.Context, feedID *int64, folderID *int64) error {
	now := formatTime(time.Now())

	if folderID != nil {
		_, err := r.db.ExecContext(
			ctx,
			`UPDATE entries SET read = 1, updated_at = ?
			 WHERE feed_id IN (SELECT id FROM feeds WHERE folder_id = ?) AND read = 0`,
			now,
			*folderID,
		)
		return err
	}

	if feedID != nil {
		_, err := r.db.ExecContext(
			ctx,
			`UPDATE entries SET read = 1, updated_at = ? WHERE feed_id = ? AND read = 0`,
			now,
			*feedID,
		)
		return err
	}

	// Mark all as read
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE entries SET read = 1, updated_at = ? WHERE read = 0`,
		now,
	)
	return err
}

func (r *entryRepository) GetAllUnreadCounts(ctx context.Context) ([]UnreadCount, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT feed_id, COUNT(*) as count FROM entries WHERE read = 0 GROUP BY feed_id`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var counts []UnreadCount
	for rows.Next() {
		var uc UnreadCount
		if err := rows.Scan(&uc.FeedID, &uc.Count); err != nil {
			return nil, err
		}
		counts = append(counts, uc)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return counts, nil
}

func scanEntry(row *sql.Row) (model.Entry, error) {
	var e model.Entry
	var publishedAt sql.NullString
	var createdAt, updatedAt string
	var readInt int

	err := row.Scan(
		&e.ID, &e.FeedID, &e.Title, &e.URL, &e.Content, &e.ReadableContent, &e.ThumbnailURL, &e.Author,
		&publishedAt, &readInt, &createdAt, &updatedAt,
	)
	if err != nil {
		return model.Entry{}, err
	}

	e.Read = readInt == 1
	if publishedAt.Valid {
		e.PublishedAt = parseTimePtr(publishedAt.String)
	}
	e.CreatedAt, _ = parseTime(createdAt)
	e.UpdatedAt, _ = parseTime(updatedAt)

	return e, nil
}

func scanEntryRows(rows *sql.Rows) (model.Entry, error) {
	var e model.Entry
	var publishedAt sql.NullString
	var createdAt, updatedAt string
	var readInt int

	err := rows.Scan(
		&e.ID, &e.FeedID, &e.Title, &e.URL, &e.Content, &e.ReadableContent, &e.ThumbnailURL, &e.Author,
		&publishedAt, &readInt, &createdAt, &updatedAt,
	)
	if err != nil {
		return model.Entry{}, err
	}

	e.Read = readInt == 1
	if publishedAt.Valid {
		e.PublishedAt = parseTimePtr(publishedAt.String)
	}
	e.CreatedAt, _ = parseTime(createdAt)
	e.UpdatedAt, _ = parseTime(updatedAt)

	return e, nil
}

func parseTimePtr(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, _ := parseTime(s)
	return &t
}

func (r *entryRepository) CreateOrUpdate(ctx context.Context, entry model.Entry) error {
	now := formatTime(time.Now())

	var publishedAt interface{}
	if entry.PublishedAt != nil {
		publishedAt = formatTime(*entry.PublishedAt)
	}

	_, err := r.db.ExecContext(
		ctx,
		`INSERT INTO entries (feed_id, title, url, content, thumbnail_url, author, published_at, read, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
		 ON CONFLICT(feed_id, url) DO UPDATE SET
		   title = excluded.title,
		   content = excluded.content,
		   thumbnail_url = excluded.thumbnail_url,
		   author = excluded.author,
		   published_at = excluded.published_at,
		   updated_at = excluded.updated_at`,
		entry.FeedID,
		entry.Title,
		entry.URL,
		entry.Content,
		entry.ThumbnailURL,
		entry.Author,
		publishedAt,
		now,
		now,
	)
	return err
}

func (r *entryRepository) ExistsByURL(ctx context.Context, feedID int64, url string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM entries WHERE feed_id = ? AND url = ?`,
		feedID,
		url,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *entryRepository) UpdateReadableContent(ctx context.Context, id int64, content string) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE entries SET readable_content = ?, updated_at = ? WHERE id = ?`,
		content,
		formatTime(time.Now()),
		id,
	)
	return err
}
