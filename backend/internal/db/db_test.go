package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"gist/backend/internal/db"

	"github.com/stretchr/testify/require"
)

func TestOpen(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "gist-db-test")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	database, err := db.Open(dbPath)
	require.NoError(t, err)
	require.NotNil(t, database)
	defer database.Close()

	// Verify table exists (basic check)
	var name string
	err = database.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='feeds'").Scan(&name)
	require.NoError(t, err)
	require.Equal(t, "feeds", name)
}

func TestBuildDSN(t *testing.T) {
	dsn := db.BuildDSN("test.db")
	require.Contains(t, dsn, "file:test.db")
	require.Contains(t, dsn, "journal_mode")
	require.Contains(t, dsn, "WAL")
	require.Contains(t, dsn, "foreign_keys")
	require.Contains(t, dsn, "ON")
}

func TestMigrate_ClosedDB(t *testing.T) {
	database, err := sql.Open("sqlite", "file::memory:?cache=shared")
	require.NoError(t, err)
	require.NoError(t, database.Close())

	err = db.Migrate(database)
	require.Error(t, err)
}
