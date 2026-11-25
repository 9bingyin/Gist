package db

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func Open(path string) (*sql.DB, error) {
	dir := filepath.Dir(path)
	if dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}

	dsn := buildDSN(path)

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	// Single connection pool avoids SQLITE_BUSY write-lock upgrade conflicts in WAL mode.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := Migrate(db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return db, nil
}

// buildDSN constructs a SQLite URI DSN safely using url.URL with embedded pragmas
// and immediate write transaction locking.
func buildDSN(path string) string {
	params := url.Values{}
	params.Set("_txlock", "immediate")
	params.Add("_pragma", "journal_mode(WAL)")
	params.Add("_pragma", "foreign_keys(ON)")
	params.Add("_pragma", "busy_timeout(30000)")
	params.Add("_pragma", "synchronous(NORMAL)")

	escapedPath := (&url.URL{Path: filepath.ToSlash(path)}).EscapedPath()
	u := url.URL{
		Scheme:   "file",
		Opaque:   escapedPath,
		RawQuery: params.Encode(),
	}
	return u.String()
}
