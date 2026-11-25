package db_test

import (
	"database/sql"
	"testing"

	"gist/backend/internal/db"

	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func TestMigrate_EntryHashDeduplication_MergesHistoricalDuplicates(t *testing.T) {
	database, err := sql.Open("sqlite", "file::memory:?cache=shared&_pragma=foreign_keys(1)")
	require.NoError(t, err)
	defer database.Close()

	_, err = database.Exec(`
		CREATE TABLE feeds (
			id INTEGER PRIMARY KEY,
			folder_id INTEGER,
			title TEXT NOT NULL,
			url TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE entries (
			id INTEGER PRIMARY KEY,
			feed_id INTEGER NOT NULL,
			title TEXT,
			url TEXT,
			content TEXT,
			author TEXT,
			published_at TEXT,
			read INTEGER NOT NULL DEFAULT 0,
			starred INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
		);

		CREATE UNIQUE INDEX idx_entries_feed_url ON entries(feed_id, url);

		CREATE TABLE ai_summaries (
			id INTEGER PRIMARY KEY,
			entry_id INTEGER NOT NULL,
			is_readability INTEGER NOT NULL DEFAULT 0,
			language TEXT NOT NULL,
			summary TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
		);
		CREATE UNIQUE INDEX idx_ai_summaries_entry_mode ON ai_summaries(entry_id, is_readability, language);

		CREATE TABLE ai_translations (
			id INTEGER PRIMARY KEY,
			entry_id INTEGER NOT NULL,
			is_readability INTEGER NOT NULL DEFAULT 0,
			language TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
		);
		CREATE UNIQUE INDEX idx_ai_translations_entry_mode ON ai_translations(entry_id, is_readability, language);

		CREATE TABLE ai_list_translations (
			id INTEGER PRIMARY KEY,
			entry_id INTEGER NOT NULL,
			language TEXT NOT NULL,
			title TEXT NOT NULL,
			summary TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
		);
		CREATE UNIQUE INDEX idx_ai_list_translations_entry_lang ON ai_list_translations(entry_id, language);
	`)
	require.NoError(t, err)

	_, err = database.Exec(`INSERT INTO feeds (id, title, url, created_at, updated_at) VALUES (1, 'feed', 'https://example.com/rss', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')`)
	require.NoError(t, err)

	_, err = database.Exec(`
		INSERT INTO entries (id, feed_id, title, url, content, author, published_at, read, starred, created_at, updated_at) VALUES
		(1001, 1, 'same', 'https://www.v2ex.com/t/1193191#reply10', 'body', 'author', '2025-01-01T00:00:00Z', 1, 0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
		(1002, 1, 'same', 'https://www.v2ex.com/t/1193191#reply20', 'body', 'author', '2025-01-01T00:00:00Z', 0, 1, '2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z'),
		(1003, 1, NULL, NULL, NULL, NULL, NULL, 0, 0, '2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z')
	`)
	require.NoError(t, err)

	_, err = database.Exec(`
		INSERT INTO ai_summaries (id, entry_id, is_readability, language, summary, created_at) VALUES
		(2001, 1001, 0, 'zh-CN', 'summary from old row', '2025-01-01T00:00:00Z'),
		(2002, 1002, 0, 'zh-CN', 'summary keep row', '2025-01-02T00:00:00Z')
	`)
	require.NoError(t, err)

	_, err = database.Exec(`
		INSERT INTO ai_translations (id, entry_id, is_readability, language, content, created_at) VALUES
		(3001, 1001, 0, 'zh-CN', '<p>translated</p>', '2025-01-01T00:00:00Z')
	`)
	require.NoError(t, err)

	_, err = database.Exec(`
		INSERT INTO ai_list_translations (id, entry_id, language, title, summary, created_at) VALUES
		(4001, 1001, 'zh-CN', 'title', 'summary', '2025-01-01T00:00:00Z')
	`)
	require.NoError(t, err)

	err = db.Migrate(database)
	require.NoError(t, err)

	var reminderColumnCount int
	err = database.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('feeds') WHERE name = 'summary_prompt_reminder'`).Scan(&reminderColumnCount)
	require.NoError(t, err)
	require.Equal(t, 1, reminderColumnCount)

	var oldIndexCount int
	err = database.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_entries_feed_url'`).Scan(&oldIndexCount)
	require.NoError(t, err)
	require.Equal(t, 0, oldIndexCount)

	var newIndexCount int
	err = database.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_entries_feed_hash'`).Scan(&newIndexCount)
	require.NoError(t, err)
	require.Equal(t, 1, newIndexCount)

	var entryCount int
	err = database.QueryRow(`SELECT COUNT(*) FROM entries`).Scan(&entryCount)
	require.NoError(t, err)
	require.Equal(t, 2, entryCount)

	var url, hash string
	var read, starred int
	err = database.QueryRow(`SELECT url, hash, read, starred FROM entries WHERE id = 1002`).Scan(&url, &hash, &read, &starred)
	require.NoError(t, err)
	require.Equal(t, "https://www.v2ex.com/t/1193191#reply20", url)
	require.Len(t, hash, 64)
	require.Equal(t, 1, read)
	require.Equal(t, 1, starred)

	var hashEmptyEntry string
	err = database.QueryRow(`SELECT hash FROM entries WHERE id = 1003`).Scan(&hashEmptyEntry)
	require.NoError(t, err)
	require.Len(t, hashEmptyEntry, 64)

	err = database.QueryRow(`SELECT COUNT(*) FROM entries WHERE id = 1001`).Scan(&entryCount)
	require.NoError(t, err)
	require.Equal(t, 0, entryCount)

	var summaryRows int
	err = database.QueryRow(`SELECT COUNT(*) FROM ai_summaries WHERE entry_id = 1001`).Scan(&summaryRows)
	require.NoError(t, err)
	require.Equal(t, 0, summaryRows)
	err = database.QueryRow(`SELECT COUNT(*) FROM ai_summaries WHERE entry_id = 1002`).Scan(&summaryRows)
	require.NoError(t, err)
	require.Equal(t, 1, summaryRows)

	var translationRows int
	err = database.QueryRow(`SELECT COUNT(*) FROM ai_translations WHERE entry_id = 1002`).Scan(&translationRows)
	require.NoError(t, err)
	require.Equal(t, 1, translationRows)
	err = database.QueryRow(`SELECT COUNT(*) FROM ai_list_translations WHERE entry_id = 1002`).Scan(&translationRows)
	require.NoError(t, err)
	require.Equal(t, 1, translationRows)

	var duplicateHashGroups int
	err = database.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT feed_id, hash, COUNT(*) AS c
			FROM entries
			GROUP BY feed_id, hash
			HAVING c > 1
		)
	`).Scan(&duplicateHashGroups)
	require.NoError(t, err)
	require.Equal(t, 0, duplicateHashGroups)

	// Verify v2 drops unused FTS5 and redundant indexes, and creates composite sort indexes.
	var ftsCount int
	err = database.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name IN ('entries_fts', 'entries_ai', 'entries_ad', 'entries_au', 'idx_domain_rate_limits_host', 'idx_entries_feed_id')`).Scan(&ftsCount)
	require.NoError(t, err)
	require.Equal(t, 0, ftsCount)

	var sortIdxCount int
	err = database.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN ('idx_entries_published_id', 'idx_entries_feed_published_id')`).Scan(&sortIdxCount)
	require.NoError(t, err)
	require.Equal(t, 2, sortIdxCount)

	// Migration should be idempotent.
	err = db.Migrate(database)
	require.NoError(t, err)
}

func TestMigrate_PreservesSubSecondPrecisionAndCreatesFeedURLIndex(t *testing.T) {
	database, err := sql.Open("sqlite", "file:test_migrate_subsecond?mode=memory&cache=shared")
	require.NoError(t, err)
	defer database.Close()

	// Seed a database at v1 with mixed RFC3339 / variable-width RFC3339Nano timestamps.
	require.NoError(t, db.Migrate(database))
	_, err = database.Exec(`PRAGMA user_version = 1`)
	require.NoError(t, err)
	_, err = database.Exec(`DROP INDEX IF EXISTS idx_entries_feed_url_lookup`)
	require.NoError(t, err)

	_, err = database.Exec(`INSERT INTO feeds (id, title, url, type, created_at, updated_at) VALUES (1, 'F', 'https://example.com/rss', 'article', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
	require.NoError(t, err)
	_, err = database.Exec(`
		INSERT INTO entries (id, feed_id, hash, title, url, published_at, read, starred, created_at, updated_at) VALUES
		  (10, 1, 'h0', 'sec',  'https://example.com/0', '2026-01-01T12:00:00Z',      0, 0, '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z'),
		  (11, 1, 'h1', 'ms15', 'https://example.com/1', '2026-01-01T12:00:00.15Z',   0, 0, '2026-01-01T12:00:00.15Z', '2026-01-01T12:00:00.15Z'),
		  (12, 1, 'h2', 'ms2',  'https://example.com/2', '2026-01-01T12:00:00.2Z',    0, 0, '2026-01-01T12:00:00.2Z', '2026-01-01T12:00:00.2Z')
	`)
	require.NoError(t, err)

	require.NoError(t, db.Migrate(database))

	var version int
	require.NoError(t, database.QueryRow(`PRAGMA user_version`).Scan(&version))
	require.Equal(t, 3, version)

	var urlIdxCount int
	require.NoError(t, database.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_entries_feed_url_lookup'`).Scan(&urlIdxCount))
	require.Equal(t, 1, urlIdxCount)

	rows, err := database.Query(`SELECT title, published_at FROM entries WHERE feed_id = 1 ORDER BY published_at DESC, id DESC`)
	require.NoError(t, err)
	defer rows.Close()

	var titles, stamps []string
	for rows.Next() {
		var title, stamp string
		require.NoError(t, rows.Scan(&title, &stamp))
		titles = append(titles, title)
		stamps = append(stamps, stamp)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []string{"ms2", "ms15", "sec"}, titles)
	require.Equal(t, []string{
		"2026-01-01T12:00:00.200000000Z",
		"2026-01-01T12:00:00.150000000Z",
		"2026-01-01T12:00:00.000000000Z",
	}, stamps)
}
