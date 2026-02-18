package testutil

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"gist/backend/internal/db"
	"gist/backend/internal/hashutil"
	"gist/backend/internal/model"
	"gist/backend/pkg/snowflake"

	_ "modernc.org/sqlite"
)

// snowflakeOnce 确保 snowflake 在所有并行测试中只初始化一次
var snowflakeOnce sync.Once

// NewTestDB 创建内存 SQLite 数据库并执行所有迁移
func NewTestDB(t *testing.T) *sql.DB {
	t.Helper()

	// 线程安全地只初始化一次 snowflake
	snowflakeOnce.Do(func() {
		if err := snowflake.Init(0); err != nil {
			// sync.Once 内无法使用 t.Fatalf，改用 panic
			panic("failed to initialize snowflake: " + err.Error())
		}
	})

	// 使用共享缓存模式以支持内存数据库的并发访问
	// 每个测试使用唯一的数据库名称以避免冲突
	// 使用更可靠的唯一标识符
	dbName := fmt.Sprintf("file:%s_%d?mode=memory&cache=shared&_pragma=foreign_keys(1)", t.Name(), time.Now().UnixNano())
	database, err := sql.Open("sqlite", dbName)
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		database.Close()
		t.Fatalf("failed to migrate test database: %v", err)
	}

	t.Cleanup(func() {
		database.Close()
	})

	return database
}

// ptrVal 将指针转换为 interface{}，nil 指针返回 nil
func ptrVal[T any](p *T) interface{} {
	if p == nil {
		return nil
	}
	return *p
}

// timeVal 将时间指针转换为 RFC3339 格式的字符串，nil 返回 nil
func timeVal(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339)
}

// boolToInt 将布尔值转换为整数 (0/1)
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// SeedFolder 插入测试文件夹数据并返回其 ID
func SeedFolder(t *testing.T, db *sql.DB, name string, parentID *int64, folderType string) int64 {
	t.Helper()

	if folderType == "" {
		folderType = "article"
	}

	id := snowflake.NextID()
	now := time.Now().UTC().Format(time.RFC3339)

	var parentIDVal interface{} = nil
	if parentID != nil {
		parentIDVal = *parentID
	}

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO folders (id, name, parent_id, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, name, parentIDVal, folderType, now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed folder: %v", err)
	}

	return id
}

// SeedFeed 插入测试 Feed 数据并返回其 ID
func SeedFeed(t *testing.T, db *sql.DB, feed model.Feed) int64 {
	t.Helper()

	if feed.ID == 0 {
		feed.ID = snowflake.NextID()
	}
	if feed.Type == "" {
		feed.Type = "article"
	}

	now := time.Now().UTC().Format(time.RFC3339)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO feeds (id, folder_id, title, url, site_url, description, icon_path, type, etag, last_modified, error_message, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		feed.ID, ptrVal(feed.FolderID), feed.Title, feed.URL, ptrVal(feed.SiteURL), ptrVal(feed.Description),
		ptrVal(feed.IconPath), feed.Type, ptrVal(feed.ETag), ptrVal(feed.LastModified), ptrVal(feed.ErrorMessage), now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed feed: %v", err)
	}

	return feed.ID
}

// SeedEntry 插入测试 Entry 数据并返回其 ID
func SeedEntry(t *testing.T, db *sql.DB, entry model.Entry) int64 {
	t.Helper()

	if entry.ID == 0 {
		entry.ID = snowflake.NextID()
	}
	if entry.Hash == "" {
		entry.Hash = defaultEntryHash(entry)
	}

	now := time.Now().UTC().Format(time.RFC3339)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO entries (id, feed_id, hash, title, url, content, readable_content, thumbnail_url, author, published_at, read, starred, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.ID, entry.FeedID, entry.Hash, ptrVal(entry.Title), ptrVal(entry.URL), ptrVal(entry.Content), ptrVal(entry.ReadableContent),
		ptrVal(entry.ThumbnailURL), ptrVal(entry.Author), timeVal(entry.PublishedAt), boolToInt(entry.Read), boolToInt(entry.Starred), now, now,
	)
	if err != nil {
		t.Fatalf("failed to seed entry: %v", err)
	}

	return entry.ID
}

func defaultEntryHash(entry model.Entry) string {
	if entry.URL != nil && strings.TrimSpace(*entry.URL) != "" {
		return hashHex(strings.TrimSpace(*entry.URL))
	}
	var title, content string
	if entry.Title != nil {
		title = strings.TrimSpace(*entry.Title)
	}
	if entry.Content != nil {
		content = strings.TrimSpace(*entry.Content)
	}
	if title != "" || content != "" {
		return hashHex(title + content)
	}
	return hashHex(fmt.Sprintf("seed-entry-id:%d", entry.ID))
}

func hashHex(input string) string {
	return hashutil.SHA256Hex(input)
}

// SeedSetting 插入测试配置数据
func SeedSetting(t *testing.T, db *sql.DB, key, value string) {
	t.Helper()

	now := time.Now().UTC().Format(time.RFC3339)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
		key, value, now,
	)
	if err != nil {
		t.Fatalf("failed to seed setting: %v", err)
	}
}
