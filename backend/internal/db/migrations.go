package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"gist/backend/internal/hashutil"
	"gist/backend/internal/urlutil"
)

const (
	latestSchemaVersion = 3
	sqliteBatchSize     = 30000
	fixedUTCFormat      = "2006-01-02T15:04:05.000000000Z"
)

// Base schema - uses Snowflake IDs (no AUTOINCREMENT).
const baseSchema = `
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER,
  type TEXT NOT NULL DEFAULT 'article',
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
  summary_prompt_reminder TEXT,
  icon_path TEXT,
  type TEXT NOT NULL DEFAULT 'article',
  etag TEXT,
  last_modified TEXT,
  error_message TEXT,
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
  readable_content TEXT,
  thumbnail_url TEXT,
  author TEXT,
  published_at TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);
`

func Migrate(db *sql.DB) error {
	var version int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}
	if version >= latestSchemaVersion {
		return nil
	}

	if version < 1 {
		if err := migrateToV1(db); err != nil {
			return fmt.Errorf("migrate to v1: %w", err)
		}
		if _, err := db.Exec(`PRAGMA user_version = 1`); err != nil {
			return fmt.Errorf("set user_version 1: %w", err)
		}
		version = 1
	}

	if version < 2 {
		if err := migrateToV2(db); err != nil {
			return fmt.Errorf("migrate to v2: %w", err)
		}
		if _, err := db.Exec(`PRAGMA user_version = 2`); err != nil {
			return fmt.Errorf("set user_version 2: %w", err)
		}
		version = 2
	}

	if version < 3 {
		if err := migrateToV3(db); err != nil {
			return fmt.Errorf("migrate to v3: %w", err)
		}
		if _, err := db.Exec(`PRAGMA user_version = 3`); err != nil {
			return fmt.Errorf("set user_version 3: %w", err)
		}
	}

	return nil
}

func migrateToV1(db *sql.DB) error {
	if _, err := db.Exec(baseSchema); err != nil {
		return fmt.Errorf("migrate base schema: %w", err)
	}

	columnMigrations := []struct {
		table  string
		column string
		ddl    string
	}{
		{"entries", "read", `ALTER TABLE entries ADD COLUMN read INTEGER NOT NULL DEFAULT 0`},
		{"entries", "readable_content", `ALTER TABLE entries ADD COLUMN readable_content TEXT`},
		{"entries", "thumbnail_url", `ALTER TABLE entries ADD COLUMN thumbnail_url TEXT`},
		{"entries", "starred", `ALTER TABLE entries ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`},
		{"feeds", "icon_path", `ALTER TABLE feeds ADD COLUMN icon_path TEXT`},
		{"feeds", "error_message", `ALTER TABLE feeds ADD COLUMN error_message TEXT`},
		{"feeds", "type", `ALTER TABLE feeds ADD COLUMN type TEXT NOT NULL DEFAULT 'article'`},
		{"feeds", "summary_prompt_reminder", `ALTER TABLE feeds ADD COLUMN summary_prompt_reminder TEXT`},
		{"folders", "type", `ALTER TABLE folders ADD COLUMN type TEXT NOT NULL DEFAULT 'article'`},
	}

	for _, m := range columnMigrations {
		exists, err := hasColumn(db, m.table, m.column)
		if err != nil {
			return fmt.Errorf("check %s.%s column: %w", m.table, m.column, err)
		}
		if !exists {
			if _, err := db.Exec(m.ddl); err != nil {
				return fmt.Errorf("add %s.%s column: %w", m.table, m.column, err)
			}
		}
	}

	ddlStatements := []struct {
		name string
		sql  string
	}{
		{"idx_entries_read", `CREATE INDEX IF NOT EXISTS idx_entries_read ON entries(read)`},
		{"idx_entries_feed_read", `CREATE INDEX IF NOT EXISTS idx_entries_feed_read ON entries(feed_id, read)`},
		{"idx_entries_starred", `CREATE INDEX IF NOT EXISTS idx_entries_starred ON entries(starred)`},
		{"settings table", `
			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`},
		{"ai_summaries table", `
			CREATE TABLE IF NOT EXISTS ai_summaries (
				id INTEGER PRIMARY KEY,
				entry_id INTEGER NOT NULL,
				is_readability INTEGER NOT NULL DEFAULT 0,
				language TEXT NOT NULL,
				summary TEXT NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
			)
		`},
		{"idx_ai_summaries_entry_mode", `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_summaries_entry_mode ON ai_summaries(entry_id, is_readability, language)`},
		{"ai_translations table", `
			CREATE TABLE IF NOT EXISTS ai_translations (
				id INTEGER PRIMARY KEY,
				entry_id INTEGER NOT NULL,
				is_readability INTEGER NOT NULL DEFAULT 0,
				language TEXT NOT NULL,
				content TEXT NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
			)
		`},
		{"idx_ai_translations_entry_mode", `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_translations_entry_mode ON ai_translations(entry_id, is_readability, language)`},
		{"ai_list_translations table", `
			CREATE TABLE IF NOT EXISTS ai_list_translations (
				id INTEGER PRIMARY KEY,
				entry_id INTEGER NOT NULL,
				language TEXT NOT NULL,
				title TEXT NOT NULL,
				summary TEXT NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
			)
		`},
		{"idx_ai_list_translations_entry_lang", `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_list_translations_entry_lang ON ai_list_translations(entry_id, language)`},
		{"domain_rate_limits table", `
			CREATE TABLE IF NOT EXISTS domain_rate_limits (
				id INTEGER PRIMARY KEY,
				host TEXT NOT NULL UNIQUE,
				interval_seconds INTEGER NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`},
	}

	for _, stmt := range ddlStatements {
		if _, err := db.Exec(stmt.sql); err != nil {
			return fmt.Errorf("create %s: %w", stmt.name, err)
		}
	}

	if err := migrateEntryHashDeduplication(db); err != nil {
		return fmt.Errorf("migrate entry hash deduplication: %w", err)
	}

	return nil
}

func migrateToV2(db *sql.DB) error {
	// Drop unused FTS5 triggers/table and redundant indexes; add composite sort indexes.
	statements := []struct {
		name string
		sql  string
	}{
		{"drop entries_ai", `DROP TRIGGER IF EXISTS entries_ai`},
		{"drop entries_ad", `DROP TRIGGER IF EXISTS entries_ad`},
		{"drop entries_au", `DROP TRIGGER IF EXISTS entries_au`},
		{"drop entries_fts", `DROP TABLE IF EXISTS entries_fts`},
		{"drop idx_domain_rate_limits_host", `DROP INDEX IF EXISTS idx_domain_rate_limits_host`},
		{"drop idx_entries_feed_id", `DROP INDEX IF EXISTS idx_entries_feed_id`},
		{"idx_entries_published_id", `CREATE INDEX IF NOT EXISTS idx_entries_published_id ON entries(published_at DESC, id DESC)`},
		{"idx_entries_feed_published_id", `CREATE INDEX IF NOT EXISTS idx_entries_feed_published_id ON entries(feed_id, published_at DESC, id DESC)`},
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt.sql); err != nil {
			return fmt.Errorf("%s: %w", stmt.name, err)
		}
	}

	// Normalize timestamps to fixed-width UTC RFC3339Nano (30 chars) so
	// lexicographical ORDER BY matches chronological order without losing sub-second precision.
	if err := normalizeTimestamps(db); err != nil {
		return fmt.Errorf("normalize timestamps: %w", err)
	}

	return nil
}

func migrateToV3(db *sql.DB) error {
	// Non-unique lookup index on (feed_id, url) so legacy URL-hash to GUID-hash in-place upgrades use B-tree lookups.
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_entries_feed_url_lookup ON entries(feed_id, url)`); err != nil {
		return fmt.Errorf("create idx_entries_feed_url_lookup: %w", err)
	}

	// Ensure timestamps from any prior version (including v2 second-precision rows)
	// are normalized to fixed-width UTC RFC3339Nano.
	if err := normalizeTimestamps(db); err != nil {
		return fmt.Errorf("normalize timestamps: %w", err)
	}

	return nil
}

func normalizeTimestamps(db *sql.DB) error {
	targets := []struct {
		table   string
		idCol   string
		timeCol string
	}{
		{"entries", "id", "published_at"},
		{"entries", "id", "created_at"},
		{"entries", "id", "updated_at"},
		{"feeds", "id", "created_at"},
		{"feeds", "id", "updated_at"},
		{"folders", "id", "created_at"},
		{"folders", "id", "updated_at"},
		{"ai_summaries", "id", "created_at"},
		{"ai_translations", "id", "created_at"},
		{"ai_list_translations", "id", "created_at"},
		{"domain_rate_limits", "id", "created_at"},
		{"domain_rate_limits", "id", "updated_at"},
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	type rowUpdate struct {
		id  int64
		val string
	}

	for _, target := range targets {
		query := fmt.Sprintf(
			`SELECT %s, %s FROM %s WHERE %s IS NOT NULL AND %s != '' AND (length(%s) != 30 OR %s NOT GLOB '????-??-??T??:??:??.?????????Z')`,
			target.idCol, target.timeCol, target.table, target.timeCol, target.timeCol, target.timeCol, target.timeCol,
		)
		rows, err := tx.Query(query)
		if err != nil {
			return err
		}

		var updates []rowUpdate
		for rows.Next() {
			var id int64
			var raw string
			if err := rows.Scan(&id, &raw); err != nil {
				_ = rows.Close()
				return err
			}
			parsed, err := time.Parse(time.RFC3339Nano, raw)
			if err != nil {
				continue
			}
			normalized := parsed.UTC().Format(fixedUTCFormat)
			if normalized != raw {
				updates = append(updates, rowUpdate{id: id, val: normalized})
			}
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return err
		}
		_ = rows.Close()

		if len(updates) == 0 {
			continue
		}

		updateSQL := fmt.Sprintf(`UPDATE %s SET %s = ? WHERE %s = ?`, target.table, target.timeCol, target.idCol)
		stmt, err := tx.Prepare(updateSQL)
		if err != nil {
			return err
		}
		for _, u := range updates {
			if _, err := stmt.Exec(u.val, u.id); err != nil {
				_ = stmt.Close()
				return err
			}
		}
		if err := stmt.Close(); err != nil {
			return err
		}
	}

	return tx.Commit()
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
		`SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`,
		table,
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
			_ = rows.Close()
			return fmt.Errorf("scan entry for merge: %w", err)
		}
		entry.url = strings.TrimSpace(urlStr.String)
		entry.title = strings.TrimSpace(titleStr.String)
		entry.content = strings.TrimSpace(contentStr.String)
		if parsed, parseErr := time.Parse(time.RFC3339Nano, updatedAtStr); parseErr == nil {
			entry.updatedAt = parsed
		}

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
		_ = rows.Close()
		return fmt.Errorf("iterate entries for merge: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close entries merge rows: %w", err)
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

	for start := 0; start < len(ids); start += sqliteBatchSize {
		end := min(start+sqliteBatchSize, len(ids))

		chunk := ids[start:end]
		args := make([]any, len(chunk))
		for i, id := range chunk {
			args[i] = id
		}

		placeholders := strings.Repeat("?,", len(chunk)-1) + "?"
		query := `DELETE FROM entries WHERE id IN (` + placeholders + `)`
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

	type hashUpdate struct {
		id   int64
		hash string
	}
	var updates []hashUpdate

	for rows.Next() {
		var (
			id       int64
			urlStr   sql.NullString
			titleStr sql.NullString
			bodyStr  sql.NullString
		)
		if err := rows.Scan(&id, &urlStr, &titleStr, &bodyStr); err != nil {
			_ = rows.Close()
			return fmt.Errorf("scan entry for hash backfill: %w", err)
		}

		entry := dedupeEntry{
			id:      id,
			url:     strings.TrimSpace(urlStr.String),
			title:   strings.TrimSpace(titleStr.String),
			content: strings.TrimSpace(bodyStr.String),
		}
		updates = append(updates, hashUpdate{
			id:   id,
			hash: legacyEntryHash(entry),
		})
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return fmt.Errorf("iterate entries for hash backfill: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close entries hash backfill rows: %w", err)
	}

	if len(updates) == 0 {
		return nil
	}

	stmt, err := tx.Prepare(`UPDATE entries SET hash = ? WHERE id = ?`)
	if err != nil {
		return fmt.Errorf("prepare hash backfill update: %w", err)
	}
	defer stmt.Close()

	for _, u := range updates {
		if _, err := stmt.Exec(u.hash, u.id); err != nil {
			return fmt.Errorf("update entry hash: %w", err)
		}
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

// legacyEntryHash uses the same normalization key as legacyMergeKey so merged rows
// always map deterministically to unique hashes without collisions.
func legacyEntryHash(entry dedupeEntry) string {
	if entry.url != "" {
		return hashutil.SHA256Hex(urlutil.StripFragment(entry.url))
	}
	if entry.title != "" || entry.content != "" {
		return hashutil.SHA256Hex(entry.title + "\n" + entry.content)
	}
	return hashutil.SHA256Hex(fmt.Sprintf("legacy-entry-id:%d", entry.id))
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
