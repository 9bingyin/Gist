package testutil

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"gist/backend/internal/db"
	"gist/backend/internal/hashutil"
	"gist/backend/internal/model"
	"gist/backend/pkg/snowflake"

	_ "modernc.org/sqlite"
)

var testDBSeq atomic.Uint64

// NewTestDB creates an isolated in-memory SQLite database with all migrations applied.
func NewTestDB(t *testing.T) *sql.DB {
	t.Helper()

	seq := testDBSeq.Add(1)
	dbName := fmt.Sprintf("file:gist_test_%d?mode=memory&cache=shared&_pragma=foreign_keys(1)", seq)
	database, err := sql.Open("sqlite", dbName)
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}
	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)

	if err := db.Migrate(database); err != nil {
		_ = database.Close()
		t.Fatalf("failed to migrate test database: %v", err)
	}

	t.Cleanup(func() {
		_ = database.Close()
	})

	return database
}

const fixedUTCFormat = "2006-01-02T15:04:05.000000000Z"

func timeVal(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format(fixedUTCFormat)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// SeedFolder inserts a test folder and returns its ID.
func SeedFolder(t *testing.T, db *sql.DB, name string, parentID *int64, folderType string) int64 {
	t.Helper()

	if folderType == "" {
		folderType = "article"
	}

	id := snowflake.NextID()
	now := time.Now().UTC().Format(fixedUTCFormat)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO folders (id, name, parent_id, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, name, parentID, folderType, now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed folder: %v", err)
	}

	return id
}

// SeedFeed inserts a test feed and returns its ID.
func SeedFeed(t *testing.T, db *sql.DB, feed model.Feed) int64 {
	t.Helper()

	if feed.ID == 0 {
		feed.ID = snowflake.NextID()
	}
	if feed.Type == "" {
		feed.Type = "article"
	}

	now := time.Now().UTC().Format(fixedUTCFormat)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO feeds (id, folder_id, title, url, site_url, description, summary_prompt_reminder, icon_path, type, etag, last_modified, error_message, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		feed.ID, feed.FolderID, feed.Title, feed.URL, feed.SiteURL, feed.Description,
		feed.SummaryPromptReminder, feed.IconPath, feed.Type, feed.ETag, feed.LastModified, feed.ErrorMessage, now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed feed: %v", err)
	}

	return feed.ID
}

// SeedEntry inserts a test entry and returns its ID.
func SeedEntry(t *testing.T, db *sql.DB, entry model.Entry) int64 {
	t.Helper()

	if entry.ID == 0 {
		entry.ID = snowflake.NextID()
	}
	if entry.Hash == "" {
		entry.Hash = defaultEntryHash(entry)
	}

	now := time.Now().UTC().Format(fixedUTCFormat)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO entries (id, feed_id, hash, title, url, content, readable_content, thumbnail_url, author, published_at, read, starred, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.ID, entry.FeedID, entry.Hash, entry.Title, entry.URL, entry.Content, entry.ReadableContent,
		entry.ThumbnailURL, entry.Author, timeVal(entry.PublishedAt), boolToInt(entry.Read), boolToInt(entry.Starred), now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed entry: %v", err)
	}

	return entry.ID
}

func defaultEntryHash(entry model.Entry) string {
	if entry.URL != nil && strings.TrimSpace(*entry.URL) != "" {
		return hashutil.SHA256Hex(strings.TrimSpace(*entry.URL))
	}
	var title, content string
	if entry.Title != nil {
		title = strings.TrimSpace(*entry.Title)
	}
	if entry.Content != nil {
		content = strings.TrimSpace(*entry.Content)
	}
	if title != "" || content != "" {
		return hashutil.SHA256Hex(title + content)
	}
	return hashutil.SHA256Hex(fmt.Sprintf("seed-entry-id:%d", entry.ID))
}

// SeedSetting inserts a test setting.
func SeedSetting(t *testing.T, db *sql.DB, key, value string) {
	t.Helper()

	now := time.Now().UTC().Format(fixedUTCFormat)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
		key, value, now,
	)
	if err != nil {
		t.Fatalf("failed to seed setting: %v", err)
	}
}
