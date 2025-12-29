package db

import (
	"database/sql"
	"fmt"
)

// Base schema without read column for initial table creation
const baseSchema = `
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL,
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
  INSERT INTO entries_fts(entries_fts, rowid, title, content, author, url)
  VALUES('delete', old.id, old.title, old.content, old.author, old.url);
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

	// Migration 2: Add unique index on (feed_id, url) for upsert support
	if _, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_feed_url ON entries(feed_id, url)`); err != nil {
		return fmt.Errorf("create idx_entries_feed_url: %w", err)
	}

	// Migration 3: Drop the UPDATE trigger (causes issues with FTS5 on read status changes)
	// RSS entries rarely change content after insertion, so we only need INSERT/DELETE triggers
	if _, err := db.Exec(`DROP TRIGGER IF EXISTS entries_au`); err != nil {
		return fmt.Errorf("drop entries_au trigger: %w", err)
	}

	return nil
}
