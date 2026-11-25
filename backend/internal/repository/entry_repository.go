//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"gist/backend/internal/hashutil"
	"gist/backend/internal/model"
	"gist/backend/internal/urlutil"
	"gist/backend/pkg/snowflake"
)

type EntryListFilter struct {
	FeedID       *int64
	FolderID     *int64
	ContentType  *string
	UnreadOnly   bool
	StarredOnly  bool
	HasThumbnail bool
	Limit        int
	Offset       int
}

type UnreadCount struct {
	FeedID int64
	Count  int
}

type EntryRepository interface {
	GetByID(ctx context.Context, id int64) (model.Entry, error)
	List(ctx context.Context, filter EntryListFilter) ([]model.Entry, error)
	UpdateReadStatus(ctx context.Context, id int64, read bool) error
	UpdateManyReadStatus(ctx context.Context, ids []int64, read bool) error
	UpdateStarredStatus(ctx context.Context, id int64, starred bool) error
	UpdateReadableContent(ctx context.Context, id int64, content string) error
	MarkAllAsRead(ctx context.Context, feedID *int64, folderID *int64, contentType *string) error
	GetAllUnreadCounts(ctx context.Context) ([]UnreadCount, error)
	GetStarredCount(ctx context.Context) (int, error)
	CreateOrUpdate(ctx context.Context, entry model.Entry) error
	CreateOrUpdateBatch(ctx context.Context, entries []model.Entry) error
	GetExistingHashes(ctx context.Context, feedID int64, hashes []string) (map[string]struct{}, error)
	ExistsByHash(ctx context.Context, feedID int64, hash string) (bool, error)
	ClearAllReadableContent(ctx context.Context) (int64, error)
	DeleteUnstarred(ctx context.Context) (int64, error)
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
		`SELECT id, feed_id, hash, title, url, content, readable_content, thumbnail_url, author, published_at, read, starred, created_at, updated_at
		 FROM entries WHERE id = ?`,
		id,
	)
	return scanEntry(row)
}

func (r *entryRepository) List(ctx context.Context, filter EntryListFilter) ([]model.Entry, error) {
	var args []any
	query := `
		SELECT e.id, e.feed_id, e.hash, e.title, e.url, e.content, e.readable_content, e.thumbnail_url, e.author,
		       e.published_at, e.read, e.starred, e.created_at, e.updated_at
		FROM entries e
	`

	var conditions []string
	needFeedsJoin := filter.FolderID != nil || filter.ContentType != nil

	if needFeedsJoin {
		query += " INNER JOIN feeds f ON e.feed_id = f.id"
	}

	if filter.FolderID != nil {
		conditions = append(conditions, "f.folder_id = ?")
		args = append(args, *filter.FolderID)
	}

	if filter.ContentType != nil {
		conditions = append(conditions, "f.type = ?")
		args = append(args, *filter.ContentType)
	}

	if filter.FeedID != nil {
		conditions = append(conditions, "e.feed_id = ?")
		args = append(args, *filter.FeedID)
	}

	if filter.UnreadOnly {
		conditions = append(conditions, "e.read = 0")
	}

	if filter.StarredOnly {
		conditions = append(conditions, "e.starred = 1")
	}

	if filter.HasThumbnail {
		conditions = append(conditions, "e.thumbnail_url IS NOT NULL AND e.thumbnail_url != ''")
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
		entry, err := scanEntry(rows)
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
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE entries SET read = ?, updated_at = ? WHERE id = ?`,
		boolToInt(read),
		formatTime(time.Now()),
		id,
	)
	return err
}

func (r *entryRepository) UpdateManyReadStatus(ctx context.Context, ids []int64, read bool) error {
	if len(ids) == 0 {
		return nil
	}

	readInt := boolToInt(read)
	now := formatTime(time.Now())

	return withTx(ctx, r.db, func(exec dbtx) error {
		// Reserve 2 params for readInt and now.
		return chunkSlice(ids, sqliteMaxBatchSize-2, func(chunk []int64) error {
			args := make([]any, 0, len(chunk)+2)
			args = append(args, readInt, now)
			for _, id := range chunk {
				args = append(args, id)
			}
			_, err := exec.ExecContext(
				ctx,
				`UPDATE entries SET read = ?, updated_at = ? WHERE id IN (`+placeholders(len(chunk))+`)`,
				args...,
			)
			return err
		})
	})
}

func (r *entryRepository) MarkAllAsRead(ctx context.Context, feedID *int64, folderID *int64, contentType *string) error {
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

	if contentType != nil {
		_, err := r.db.ExecContext(
			ctx,
			`UPDATE entries SET read = 1, updated_at = ?
			 WHERE feed_id IN (SELECT id FROM feeds WHERE type = ?) AND read = 0`,
			now,
			*contentType,
		)
		return err
	}

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

func scanEntry(s rowScanner) (model.Entry, error) {
	var e model.Entry
	var publishedAt sql.NullString
	var createdAt, updatedAt string
	var readInt, starredInt int

	err := s.Scan(
		&e.ID, &e.FeedID, &e.Hash, &e.Title, &e.URL, &e.Content, &e.ReadableContent, &e.ThumbnailURL, &e.Author,
		&publishedAt, &readInt, &starredInt, &createdAt, &updatedAt,
	)
	if err != nil {
		return model.Entry{}, err
	}

	e.Read = readInt == 1
	e.Starred = starredInt == 1
	if publishedAt.Valid && publishedAt.String != "" {
		t, err := parseTime(publishedAt.String)
		if err != nil {
			return model.Entry{}, fmt.Errorf("parse entry published_at: %w", err)
		}
		e.PublishedAt = &t
	}
	e.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return model.Entry{}, fmt.Errorf("parse entry created_at: %w", err)
	}
	e.UpdatedAt, err = parseTime(updatedAt)
	if err != nil {
		return model.Entry{}, fmt.Errorf("parse entry updated_at: %w", err)
	}

	return e, nil
}

const upsertEntrySQL = `INSERT INTO entries (id, feed_id, hash, title, url, content, thumbnail_url, author, published_at, read, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
 ON CONFLICT(feed_id, hash) DO UPDATE SET
   title = excluded.title,
   url = excluded.url,
   content = excluded.content,
   thumbnail_url = excluded.thumbnail_url,
   author = excluded.author,
   published_at = COALESCE(entries.published_at, excluded.published_at),
   updated_at = excluded.updated_at`

const upgradeLegacyEntrySQL = `UPDATE entries
 SET hash = ?,
     title = ?,
     url = ?,
     content = ?,
     thumbnail_url = ?,
     author = ?,
     published_at = COALESCE(published_at, ?),
     updated_at = ?
 WHERE id = ?`

func (r *entryRepository) CreateOrUpdate(ctx context.Context, entry model.Entry) error {
	now := formatTime(time.Now())
	return withTx(ctx, r.db, func(exec dbtx) error {
		var publishedAt any
		if entry.PublishedAt != nil {
			publishedAt = formatTime(*entry.PublishedAt)
		}

		if entry.URL != nil && strings.TrimSpace(*entry.URL) != "" {
			exists, err := hashExistsOnExec(ctx, exec, entry.FeedID, entry.Hash)
			if err != nil {
				return err
			}
			if !exists {
				upgraded, err := tryUpgradeLegacyURLHash(ctx, exec, entry, publishedAt, now)
				if err != nil {
					return err
				}
				if upgraded {
					return nil
				}
			}
		}

		_, err := exec.ExecContext(
			ctx,
			upsertEntrySQL,
			snowflake.NextID(),
			entry.FeedID,
			entry.Hash,
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
	})
}

// CreateOrUpdateBatch upserts all entries inside a single transaction using a prepared statement,
// upgrading legacy URL-hashed rows in place when their GUID hash does not exist yet.
func (r *entryRepository) CreateOrUpdateBatch(ctx context.Context, entries []model.Entry) error {
	if len(entries) == 0 {
		return nil
	}

	now := formatTime(time.Now())
	return withTx(ctx, r.db, func(exec dbtx) error {
		existingByFeed, err := loadExistingHashesByFeed(ctx, exec, entries)
		if err != nil {
			return err
		}

		type preparer interface {
			PrepareContext(ctx context.Context, query string) (*sql.Stmt, error)
		}
		var stmt *sql.Stmt
		if p, ok := exec.(preparer); ok {
			stmt, err = p.PrepareContext(ctx, upsertEntrySQL)
			if err != nil {
				return err
			}
			defer stmt.Close()
		}

		for _, entry := range entries {
			var publishedAt any
			if entry.PublishedAt != nil {
				publishedAt = formatTime(*entry.PublishedAt)
			}

			feedHashes := existingByFeed[entry.FeedID]
			if feedHashes == nil {
				feedHashes = make(map[string]struct{})
				existingByFeed[entry.FeedID] = feedHashes
			}

			if _, exists := feedHashes[entry.Hash]; !exists && entry.URL != nil && strings.TrimSpace(*entry.URL) != "" {
				upgraded, err := tryUpgradeLegacyURLHash(ctx, exec, entry, publishedAt, now)
				if err != nil {
					return err
				}
				if upgraded {
					feedHashes[entry.Hash] = struct{}{}
					continue
				}
			}

			args := []any{
				snowflake.NextID(),
				entry.FeedID,
				entry.Hash,
				entry.Title,
				entry.URL,
				entry.Content,
				entry.ThumbnailURL,
				entry.Author,
				publishedAt,
				now,
				now,
			}
			if stmt != nil {
				if _, err := stmt.ExecContext(ctx, args...); err != nil {
					return err
				}
			} else {
				if _, err := exec.ExecContext(ctx, upsertEntrySQL, args...); err != nil {
					return err
				}
			}
			feedHashes[entry.Hash] = struct{}{}
		}
		return nil
	})
}

func hashExistsOnExec(ctx context.Context, exec dbtx, feedID int64, hash string) (bool, error) {
	var exists int
	err := exec.QueryRowContext(
		ctx,
		`SELECT 1 FROM entries WHERE feed_id = ? AND hash = ? LIMIT 1`,
		feedID, hash,
	).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func loadExistingHashesByFeed(ctx context.Context, exec dbtx, entries []model.Entry) (map[int64]map[string]struct{}, error) {
	byFeed := make(map[int64][]string)
	seen := make(map[int64]map[string]struct{})
	for _, entry := range entries {
		if seen[entry.FeedID] == nil {
			seen[entry.FeedID] = make(map[string]struct{})
		}
		if _, dup := seen[entry.FeedID][entry.Hash]; !dup {
			seen[entry.FeedID][entry.Hash] = struct{}{}
			byFeed[entry.FeedID] = append(byFeed[entry.FeedID], entry.Hash)
		}
	}

	existing := make(map[int64]map[string]struct{}, len(byFeed))
	for feedID, hashes := range byFeed {
		feedSet := make(map[string]struct{})
		err := chunkSlice(hashes, sqliteMaxBatchSize-1, func(chunk []string) error {
			args := make([]any, 0, len(chunk)+1)
			args = append(args, feedID)
			for _, h := range chunk {
				args = append(args, h)
			}
			rows, err := exec.QueryContext(
				ctx,
				`SELECT hash FROM entries WHERE feed_id = ? AND hash IN (`+placeholders(len(chunk))+`)`,
				args...,
			)
			if err != nil {
				return err
			}
			defer rows.Close()
			for rows.Next() {
				var h string
				if err := rows.Scan(&h); err != nil {
					return err
				}
				feedSet[h] = struct{}{}
			}
			return rows.Err()
		})
		if err != nil {
			return nil, err
		}
		existing[feedID] = feedSet
	}
	return existing, nil
}

func isLegacyURLHash(storedHash, storedURL string) bool {
	trimmed := strings.TrimSpace(storedURL)
	if trimmed == "" {
		return false
	}
	if storedHash == hashutil.SHA256Hex(trimmed) {
		return true
	}
	stripped := urlutil.StripFragment(trimmed)
	return stripped != trimmed && storedHash == hashutil.SHA256Hex(stripped)
}

const (
	legacyExactLookupSQL = `SELECT id, hash, url FROM entries WHERE feed_id = ? AND url = ? ORDER BY id ASC`
	legacyRangeLookupSQL = `SELECT id, hash, url FROM entries WHERE feed_id = ? AND url >= ? AND url < ?`
)

// tryUpgradeLegacyURLHash looks up legacy URL-hashed rows via idx_entries_feed_url_lookup
// using separate exact and range queries (avoiding mixed-OR planner fallback) and updates
// the matching row in place to preserve its ID, read/starred flags, and caches.
func tryUpgradeLegacyURLHash(ctx context.Context, exec dbtx, entry model.Entry, publishedAt any, now string) (bool, error) {
	rawURL := strings.TrimSpace(*entry.URL)
	if rawURL == "" {
		return false, nil
	}
	baseURL := urlutil.StripFragment(rawURL)

	targetID, err := findLegacyCandidateID(ctx, exec, entry.FeedID, entry.Hash, legacyExactLookupSQL, entry.FeedID, rawURL)
	if err != nil {
		return false, err
	}
	if targetID == 0 && rawURL != baseURL {
		targetID, err = findLegacyCandidateID(ctx, exec, entry.FeedID, entry.Hash, legacyExactLookupSQL, entry.FeedID, baseURL)
		if err != nil {
			return false, err
		}
	}
	if targetID == 0 {
		targetID, err = findLegacyCandidateID(ctx, exec, entry.FeedID, entry.Hash, legacyRangeLookupSQL, entry.FeedID, baseURL+"#", baseURL+"$")
		if err != nil {
			return false, err
		}
	}
	if targetID == 0 {
		return false, nil
	}

	_, err = exec.ExecContext(
		ctx,
		upgradeLegacyEntrySQL,
		entry.Hash,
		entry.Title,
		entry.URL,
		entry.Content,
		entry.ThumbnailURL,
		entry.Author,
		publishedAt,
		now,
		targetID,
	)
	if err != nil {
		return false, err
	}
	return true, nil
}

func findLegacyCandidateID(ctx context.Context, exec dbtx, _ int64, targetHash, query string, args ...any) (int64, error) {
	rows, err := exec.QueryContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var minID int64
	for rows.Next() {
		var (
			id         int64
			storedHash string
			storedURL  sql.NullString
		)
		if err := rows.Scan(&id, &storedHash, &storedURL); err != nil {
			return 0, err
		}
		if storedHash == targetHash || !storedURL.Valid {
			continue
		}
		if isLegacyURLHash(storedHash, storedURL.String) {
			if minID == 0 || id < minID {
				minID = id
			}
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	return minID, nil
}

// GetExistingHashes returns the subset of hashes that already exist for feedID.
func (r *entryRepository) GetExistingHashes(ctx context.Context, feedID int64, hashes []string) (map[string]struct{}, error) {
	result := make(map[string]struct{})
	if len(hashes) == 0 {
		return result, nil
	}

	err := chunkSlice(hashes, sqliteMaxBatchSize-1, func(chunk []string) error {
		args := make([]any, 0, len(chunk)+1)
		args = append(args, feedID)
		for _, h := range chunk {
			args = append(args, h)
		}
		rows, err := r.db.QueryContext(
			ctx,
			`SELECT hash FROM entries WHERE feed_id = ? AND hash IN (`+placeholders(len(chunk))+`)`,
			args...,
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var h string
			if err := rows.Scan(&h); err != nil {
				return err
			}
			result[h] = struct{}{}
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (r *entryRepository) ExistsByHash(ctx context.Context, feedID int64, hash string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM entries WHERE feed_id = ? AND hash = ?`,
		feedID,
		hash,
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

func (r *entryRepository) UpdateStarredStatus(ctx context.Context, id int64, starred bool) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE entries SET starred = ?, updated_at = ? WHERE id = ?`,
		boolToInt(starred),
		formatTime(time.Now()),
		id,
	)
	return err
}

func (r *entryRepository) GetStarredCount(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM entries WHERE starred = 1`).Scan(&count)
	return count, err
}

func (r *entryRepository) ClearAllReadableContent(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE entries SET readable_content = NULL, updated_at = ? WHERE readable_content IS NOT NULL`, formatTime(time.Now()))
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (r *entryRepository) DeleteUnstarred(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM entries WHERE starred = 0`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
