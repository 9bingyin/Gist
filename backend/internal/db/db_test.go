package db_test

import (
	"database/sql"
	"net/url"
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

	var name string
	err = database.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='feeds'").Scan(&name)
	require.NoError(t, err)
	require.Equal(t, "feeds", name)

	var userVersion int
	err = database.QueryRow("PRAGMA user_version").Scan(&userVersion)
	require.NoError(t, err)
	require.Equal(t, 3, userVersion)

	require.Equal(t, 1, database.Stats().MaxOpenConnections)
}

func TestBuildDSN(t *testing.T) {
	dsn := db.BuildDSN("test.db")
	require.Contains(t, dsn, "file:test.db")
	require.Contains(t, dsn, "_txlock=immediate")
	require.Contains(t, dsn, "journal_mode")
	require.Contains(t, dsn, "WAL")
	require.Contains(t, dsn, "foreign_keys")
	require.Contains(t, dsn, "ON")
}

func TestBuildDSN_EscapesSpecialPathChars(t *testing.T) {
	dsn := db.BuildDSN("/tmp/a?b#c/test.db")
	require.Contains(t, dsn, "a%3Fb%23c")
	require.Contains(t, dsn, "_txlock=immediate")
}

func TestBuildDSN_AllPragmasInDSN(t *testing.T) {
	dsn := db.BuildDSN("mydb.sqlite")

	decodedDSN, err := url.QueryUnescape(dsn)
	require.NoError(t, err)

	expectedPragmas := []string{
		"_txlock=immediate",
		"journal_mode(WAL)",
		"foreign_keys(ON)",
		"busy_timeout(30000)",
		"synchronous(NORMAL)",
	}

	for _, pragma := range expectedPragmas {
		require.Contains(t, decodedDSN, pragma, "DSN must contain pragma: "+pragma)
	}
}

func TestMigrate_ClosedDB(t *testing.T) {
	database, err := sql.Open("sqlite", "file::memory:?cache=shared")
	require.NoError(t, err)
	require.NoError(t, database.Close())

	err = db.Migrate(database)
	require.Error(t, err)
}
