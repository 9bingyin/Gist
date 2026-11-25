package repository

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

// sqliteMaxBatchSize stays comfortably under SQLite 3.32+ SQLITE_MAX_VARIABLE_NUMBER (32766).
const sqliteMaxBatchSize = 30000

type dbtx interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type txBeginner interface {
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}

type rowScanner interface {
	Scan(dest ...any) error
}

// withTx executes fn inside a transaction when db supports BeginTx;
// otherwise (e.g. db is already a *sql.Tx) it runs fn directly on db.
func withTx(ctx context.Context, db dbtx, fn func(exec dbtx) error) error {
	beginner, ok := db.(txBeginner)
	if !ok {
		return fn(db)
	}
	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// fixedUTCFormat preserves nanosecond precision with fixed 30-char width so
// lexicographical ORDER BY matches exact chronological order.
const fixedUTCFormat = "2006-01-02T15:04:05.000000000Z"

// formatTime formats timestamps as fixed-width UTC RFC3339Nano (30 chars).
func formatTime(value time.Time) string {
	return value.UTC().Format(fixedUTCFormat)
}

// parseTime parses RFC3339 / RFC3339Nano timestamps.
func parseTime(value string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, value)
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	if n == 1 {
		return "?"
	}
	return strings.Repeat("?,", n-1) + "?"
}

var likeEscaper = strings.NewReplacer(
	`\`, `\\`,
	`%`, `\%`,
	`_`, `\_`,
)

func escapeLikePrefix(prefix string) string {
	return likeEscaper.Replace(prefix)
}

func chunkSlice[T any](items []T, chunkSize int, fn func(chunk []T) error) error {
	if chunkSize <= 0 {
		chunkSize = sqliteMaxBatchSize
	}
	for start := 0; start < len(items); start += chunkSize {
		end := min(start+chunkSize, len(items))
		if err := fn(items[start:end]); err != nil {
			return err
		}
	}
	return nil
}
