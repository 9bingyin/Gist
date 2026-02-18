package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"gist/backend/internal/hashutil"
	"gist/backend/internal/urlutil"
)

// Base schema - uses Snowflake IDs (no AUTOINCREMENT)
const baseSchema = `
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY,
  folder_id INTEGER,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  site_url TEXT,
  description TEXT,
  etag TEXT,
  last_modified TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feeds_folder_id ON feeds(folder_id);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY,
  feed_id INTEGER NOT NULL,
  hash TEXT NOT NULL DEFAULT '',
  title TEXT,
  url TEXT,
  content TEXT,
  author TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entries_feed_id ON entries(feed_id);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  title,
  content,
  author,
  url,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, title, content, author, url)
  VALUES (new.id, new.title, new.content, new.author, new.url);
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  DELETE FROM entries_fts WHERE rowid = old.id;
END;
`

func Migrate(db *sql.DB) error {
	// Run base schema first (without read column)
	if _, err := db.Exec(baseSchema); err != nil {
		return fmt.Errorf("migrate base schema: %w", err)
	}

	// Run incremental migrations
	if err := runMigrations(db); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	return nil
}

func runMigrations(db *sql.DB) error {
	// Migration 1: Add read column to entries if not exists
	var count int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM pragma_table_info('entries') WHERE name = 'read'
	`).Scan(&count)
	if err != nil {
		return fmt.Errorf("check read column: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec(`ALTER TABLE entries ADD COLUMN read INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("add read column: %w", err)
		}
	}

	// Create indexes (safe to run even if they exist)
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_entries_read ON entries(read)`); err != nil {
		return fmt.Errorf("create idx_entries_read: %w", err)
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_entries_feed_read ON entries(feed_id, read)`); err != nil {
		return fmt.Errorf("create idx_entries_feed_read: %w", err)
	}

	// Migration 3: Drop the UPDATE trigger (causes issues with FTS5 on read status changes)
	// RSS entries rarely change content after insertion, so we only need INSERT/DELETE triggers
	if _, err := db.Exec(`DROP TRIGGER IF EXISTS entries_au`); err != nil {
		return fmt.Errorf("drop entries_au trigger: %w", err)
	}

	// Migration 4: Add readable_content column to entries for readability-extracted content
	err = db.QueryRow(`
		SELECT COUNT(*) FROM pragma_table_info('entries') WHERE name = 'readable_content'
	`).Scan(&count)
	if err != nil {
		return fmt.Errorf("check readable_content column: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec(`ALTER TABLE entries ADD COLUMN readable_content TEXT`); err != nil {
			return fmt.Errorf("add readable_content column: %w", err)
		}
	}

	// Migration 5: Add icon_path column to feeds for cached icon file path
	err = db.QueryRow(`
		SELECT COUNT(*) FROM pragma_table_info('feeds') WHERE name = 'icon_path'
	`).Scan(&count)
	if err != nil {
		return fmt.Errorf("check icon_path column: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec(`ALTER TABLE feeds ADD COLUMN icon_path TEXT`); err != nil {
			return fmt.Errorf("add icon_path column: %w", err)
		}
	}

	// Migration 6: Add thumbnail_url column to entries for article cover image
	err = db.QueryRow(`
		SELECT COUNT(*) FROM pragma_table_info('entries') WHERE name = 'thumbnail_url'
	`).Scan(&count)
	if err != nil {
		return fmt.Errorf("check thumbnail_url column: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec(`ALTER TABLE entries ADD COLUMN thumbnail_url TEXT`); err != nil {
			return fmt.Errorf("add thumbnail_url column: %w", err)
		}
	}

	// Migration 7: Add starred column to entries for bookmarking
	err = db.QueryRow(`
		SELECT COUNT(*) FROM pragma_table_info('entries') WHERE name = 'starred'
	`).Scan(&count)
	if err != nil {
		return fmt.Errorf("check starred column: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec(`ALTER TABLE entries ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("add starred column: %w", err)
		}
	}

	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_entries_starred ON entries(starred)`); err != nil {
		return fmt.Errorf("create idx_entries_starred: %w", err)
	}

	// Migration 8: Add error_message column to feeds for tracking fetch/refresh errors
	err = db.QueryRow(`
		SELECT COUNT(*) FROM pragma_table_info('feeds') WHERE name = 'error_message'
	`).Scan(&count)
	if err != nil {
		return fmt.Errorf("check error_message column: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec(`ALTER TABLE feeds ADD COLUMN error_message TEXT`); err != nil {
			return fmt.Errorf("add error_message column: %w", err)
		}
	}

	// Migration 9: Create settings table for key-value configuration storage
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`); err != nil {
		return fmt.Errorf("create settings table: %w", err)
	}

	// Migration 10: Create ai_summaries table for AI summary cache
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_summaries (
			id INTEGER PRIMARY KEY,
			entry_id INTEGER NOT NULL,
			is_readability INTEGER NOT NULL DEFAULT 0,
			language TEXT NOT NULL,
			summary TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
		)
	`); err != nil {
		return fmt.Errorf("create ai_summaries table: %w", err)
	}

	if _, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_summaries_entry_mode ON ai_summaries(entry_id, is_readability, language)`); err != nil {
		return fmt.Errorf("create idx_ai_summaries_entry_mode: %w", err)
	}

	// Migration 11: Create ai_translations table for AI translation cache
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_translations (
			id INTEGER PRIMARY KEY,
			entry_id INTEGER NOT NULL,
			is_readability INTEGER NOT NULL DEFAULT 0,
			language TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
		)
	`); err != nil {
		return fmt.Errorf("create ai_translations table: %w", err)
	}

	if _, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_translations_entry_mode ON ai_translations(entry_id, is_readability, language)`); err != nil {
		return fmt.Errorf("create idx_ai_translations_entry_mode: %w", err)
	}

	// Migration 12: Create ai_list_translations table for title/summary translation cache
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_list_translations (
			id INTEGER PRIMARY KEY,
			entry_id INTEGER NOT NULL,
			language TEXT NOT NULL,
			title TEXT NOT NULL,
			summary TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
		)
	`); err != nil {
		return fmt.Errorf("create ai_list_translations table: %w", err)
	}

	if _, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_list_translations_entry_lang ON ai_list_translations(entry_id, language)`); err != nil {
		return fmt.Errorf("create idx_ai_list_translations_entry_lang: %w", err)
	}

	// Migration 13: Add type column to feeds for content type (article/picture/notification)
	err = db.QueryRow(`
		SELECT COUNT(*) FROM pragma_table_info('feeds') WHERE name = 'type'
	`).Scan(&count)
	if err != nil {
		return fmt.Errorf("check feeds type column: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec(`ALTER TABLE feeds ADD COLUMN type TEXT NOT NULL DEFAULT 'article'`); err != nil {
			return fmt.Errorf("add feeds type column: %w", err)
		}
	}

	// Migration 14: Add type column to folders for content type (article/picture/notification)
	err = db.QueryRow(`
		SELECT COUNT(*) FROM pragma_table_info('folders') WHERE name = 'type'
	`).Scan(&count)
	if err != nil {
		return fmt.Errorf("check folders type column: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec(`ALTER TABLE folders ADD COLUMN type TEXT NOT NULL DEFAULT 'article'`); err != nil {
			return fmt.Errorf("add folders type column: %w", err)
		}
	}

	// Migration 15: Fix FTS5 delete trigger (modernc.org/sqlite doesn't support the special insert syntax)
	// Recreate the trigger with direct DELETE syntax
	if _, err := db.Exec(`DROP TRIGGER IF EXISTS entries_ad`); err != nil {
		return fmt.Errorf("drop entries_ad trigger: %w", err)
	}
	if _, err := db.Exec(`CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
		DELETE FROM entries_fts WHERE rowid = old.id;
	END`); err != nil {
		return fmt.Errorf("create entries_ad trigger: %w", err)
	}

	// Migration 16: Create domain_rate_limits table for per-host rate limiting
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS domain_rate_limits (
			id INTEGER PRIMARY KEY,
			host TEXT NOT NULL UNIQUE,
			interval_seconds INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`); err != nil {
		return fmt.Errorf("create domain_rate_limits table: %w", err)
	}

	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_domain_rate_limits_host ON domain_rate_limits(host)`); err != nil {
		return fmt.Errorf("create idx_domain_rate_limits_host: %w", err)
	}

	// Migration 17: Switch entry dedup key to hash and merge historical duplicates.
	if err := migrateEntryHashDeduplication(db); err != nil {
		return fmt.Errorf("migrate entry hash deduplication: %w", err)
	}

	return nil
}

type dedupeEntry struct {
	id        int64
	feedID    int64
	url       string
	title     string
	content   string
	read      int
	starred   int
	updatedAt time.Time
}

type dedupeGroup struct {
	keep       dedupeEntry
	hasKeep    bool
	readMax    int
	starredMax int
	duplicate  []int64
}

func migrateEntryHashDeduplication(db *sql.DB) error {
	var hashIndexCount int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_entries_feed_hash'`,
	).Scan(&hashIndexCount); err != nil {
		return fmt.Errorf("check idx_entries_feed_hash: %w", err)
	}
	if hashIndexCount > 0 {
		return nil
	}

	exists, err := hasColumn(db, "entries", "hash")
	if err != nil {
		return fmt.Errorf("check hash column: %w", err)
	}
	if !exists {
		if _, err := db.Exec(`ALTER TABLE entries ADD COLUMN hash TEXT NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("add hash column: %w", err)
		}
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := mergeHistoricalEntries(tx); err != nil {
		return err
	}
	if err := backfillEntryHash(tx); err != nil {
		return err
	}
	if err := ensureHashUniqueness(tx); err != nil {
		return err
	}
	if _, err := tx.Exec(`DROP INDEX IF EXISTS idx_entries_feed_url`); err != nil {
		return fmt.Errorf("drop idx_entries_feed_url: %w", err)
	}
	if _, err := tx.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_feed_hash ON entries(feed_id, hash)`); err != nil {
		return fmt.Errorf("create idx_entries_feed_hash: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

func hasColumn(db *sql.DB, table string, column string) (bool, error) {
	var count int
	if err := db.QueryRow(
		fmt.Sprintf(`SELECT COUNT(*) FROM pragma_table_info('%s') WHERE name = ?`, table),
		column,
	).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func mergeHistoricalEntries(tx *sql.Tx) error {
	rows, err := tx.Query(`
		SELECT id, feed_id, url, title, content, read, starred, updated_at
		FROM entries
	`)
	if err != nil {
		return fmt.Errorf("query entries for merge: %w", err)
	}
	defer rows.Close()

	groups := make(map[string]*dedupeGroup)
	for rows.Next() {
		var (
			entry        dedupeEntry
			urlStr       sql.NullString
			titleStr     sql.NullString
			contentStr   sql.NullString
			updatedAtStr string
		)
		if err := rows.Scan(
			&entry.id,
			&entry.feedID,
			&urlStr,
			&titleStr,
			&contentStr,
			&entry.read,
			&entry.starred,
			&updatedAtStr,
		); err != nil {
			return fmt.Errorf("scan entry for merge: %w", err)
		}
		entry.url = strings.TrimSpace(urlStr.String)
		entry.title = strings.TrimSpace(titleStr.String)
		entry.content = strings.TrimSpace(contentStr.String)
		entry.updatedAt, _ = time.Parse(time.RFC3339, updatedAtStr)

		groupKey := fmt.Sprintf("%d|%s", entry.feedID, legacyMergeKey(entry))
		group, ok := groups[groupKey]
		if !ok {
			groups[groupKey] = &dedupeGroup{
				keep:       entry,
				hasKeep:    true,
				readMax:    entry.read,
				starredMax: entry.starred,
			}
			continue
		}

		if entry.read > group.readMax {
			group.readMax = entry.read
		}
		if entry.starred > group.starredMax {
			group.starredMax = entry.starred
		}

		if chooseAsKeep(entry, group.keep) {
			group.duplicate = append(group.duplicate, group.keep.id)
			group.keep = entry
		} else {
			group.duplicate = append(group.duplicate, entry.id)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate entries for merge: %w", err)
	}

	for _, group := range groups {
		if !group.hasKeep || len(group.duplicate) == 0 {
			continue
		}

		if group.keep.read != group.readMax || group.keep.starred != group.starredMax {
			if _, err := tx.Exec(
				`UPDATE entries SET read = ?, starred = ? WHERE id = ?`,
				group.readMax,
				group.starredMax,
				group.keep.id,
			); err != nil {
				return fmt.Errorf("update merged entry state: %w", err)
			}
		}

		for _, duplicateID := range group.duplicate {
			if err := moveEntryCaches(tx, duplicateID, group.keep.id); err != nil {
				return err
			}
		}

		if err := deleteEntriesByID(tx, group.duplicate); err != nil {
			return err
		}
	}

	return nil
}

func moveEntryCaches(tx *sql.Tx, fromID int64, toID int64) error {
	tables := []string{"ai_summaries", "ai_translations", "ai_list_translations"}
	for _, table := range tables {
		updateQuery := fmt.Sprintf(`UPDATE OR IGNORE %s SET entry_id = ? WHERE entry_id = ?`, table)
		if _, err := tx.Exec(updateQuery, toID, fromID); err != nil {
			return fmt.Errorf("update %s entry_id: %w", table, err)
		}

		deleteQuery := fmt.Sprintf(`DELETE FROM %s WHERE entry_id = ?`, table)
		if _, err := tx.Exec(deleteQuery, fromID); err != nil {
			return fmt.Errorf("delete %s duplicate rows: %w", table, err)
		}
	}
	return nil
}

func deleteEntriesByID(tx *sql.Tx, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}

	// Keep each statement below SQLite variable limits.
	const batchSize = 500
	for start := 0; start < len(ids); start += batchSize {
		end := start + batchSize
		if end > len(ids) {
			end = len(ids)
		}

		chunk := ids[start:end]
		args := make([]interface{}, 0, len(chunk))
		placeholders := make([]string, 0, len(chunk))
		for _, id := range chunk {
			args = append(args, id)
			placeholders = append(placeholders, "?")
		}

		query := fmt.Sprintf(`DELETE FROM entries WHERE id IN (%s)`, strings.Join(placeholders, ","))
		if _, err := tx.Exec(query, args...); err != nil {
			return fmt.Errorf("delete duplicate entries: %w", err)
		}
	}
	return nil
}

func backfillEntryHash(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT id, url, title, content FROM entries WHERE hash = ''`)
	if err != nil {
		return fmt.Errorf("query entries for hash backfill: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id       int64
			urlStr   sql.NullString
			titleStr sql.NullString
			bodyStr  sql.NullString
		)
		if err := rows.Scan(&id, &urlStr, &titleStr, &bodyStr); err != nil {
			return fmt.Errorf("scan entry for hash backfill: %w", err)
		}

		link := strings.TrimSpace(urlStr.String)
		title := strings.TrimSpace(titleStr.String)
		content := strings.TrimSpace(bodyStr.String)

		var hash string
		switch {
		case link != "":
			hash = hashHex(link)
		case title != "" || content != "":
			hash = hashHex(title + content)
		default:
			hash = hashHex(fmt.Sprintf("legacy-entry-id:%d", id))
		}

		if _, err := tx.Exec(`UPDATE entries SET hash = ? WHERE id = ?`, hash, id); err != nil {
			return fmt.Errorf("update entry hash: %w", err)
		}
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate entries for hash backfill: %w", err)
	}

	return nil
}

func ensureHashUniqueness(tx *sql.Tx) error {
	var duplicateGroups int
	if err := tx.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT feed_id, hash, COUNT(*) AS c
			FROM entries
			GROUP BY feed_id, hash
			HAVING c > 1
		)
	`).Scan(&duplicateGroups); err != nil {
		return fmt.Errorf("check hash uniqueness: %w", err)
	}
	if duplicateGroups > 0 {
		return fmt.Errorf("found %d duplicate (feed_id, hash) groups after merge", duplicateGroups)
	}
	return nil
}

func legacyMergeKey(entry dedupeEntry) string {
	if entry.url != "" {
		return "url:" + urlutil.StripFragment(entry.url)
	}
	if entry.title != "" || entry.content != "" {
		return "content:" + entry.title + "\n" + entry.content
	}
	return fmt.Sprintf("id:%d", entry.id)
}

func chooseAsKeep(candidate dedupeEntry, current dedupeEntry) bool {
	if candidate.updatedAt.After(current.updatedAt) {
		return true
	}
	if candidate.updatedAt.Equal(current.updatedAt) && candidate.id > current.id {
		return true
	}
	return false
}

func hashHex(input string) string {
	return hashutil.SHA256Hex(input)
}
