//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"gist/backend/internal/model"
	"gist/backend/pkg/snowflake"
)

// DomainRateLimitRepository defines the interface for domain rate limit storage.
type DomainRateLimitRepository interface {
	Create(ctx context.Context, host string, intervalSeconds int) (*model.DomainRateLimit, error)
	Update(ctx context.Context, host string, intervalSeconds int) error
	Delete(ctx context.Context, host string) error
	GetByHost(ctx context.Context, host string) (*model.DomainRateLimit, error)
	List(ctx context.Context) ([]model.DomainRateLimit, error)
}

type domainRateLimitRepository struct {
	db dbtx
}

// NewDomainRateLimitRepository creates a new domain rate limit repository.
func NewDomainRateLimitRepository(db dbtx) DomainRateLimitRepository {
	return &domainRateLimitRepository{db: db}
}

// Create creates a new domain rate limit.
func (r *domainRateLimitRepository) Create(ctx context.Context, host string, intervalSeconds int) (*model.DomainRateLimit, error) {
	id := snowflake.NextID()
	now := time.Now().UTC().Truncate(time.Second)
	nowStr := formatTime(now)

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO domain_rate_limits (id, host, interval_seconds, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, id, host, intervalSeconds, nowStr, nowStr)
	if err != nil {
		return nil, err
	}

	return &model.DomainRateLimit{
		ID:              id,
		Host:            host,
		IntervalSeconds: intervalSeconds,
		CreatedAt:       now,
		UpdatedAt:       now,
	}, nil
}

// Update updates an existing domain rate limit.
func (r *domainRateLimitRepository) Update(ctx context.Context, host string, intervalSeconds int) error {
	now := formatTime(time.Now())
	result, err := r.db.ExecContext(ctx, `
		UPDATE domain_rate_limits SET interval_seconds = ?, updated_at = ? WHERE host = ?
	`, intervalSeconds, now, host)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// Delete removes a domain rate limit by host.
func (r *domainRateLimitRepository) Delete(ctx context.Context, host string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM domain_rate_limits WHERE host = ?`, host)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// GetByHost retrieves a domain rate limit by host.
func (r *domainRateLimitRepository) GetByHost(ctx context.Context, host string) (*model.DomainRateLimit, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, host, interval_seconds, created_at, updated_at FROM domain_rate_limits WHERE host = ?
	`, host)

	d, err := scanDomainRateLimit(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &d, nil
}

// List retrieves all domain rate limits.
func (r *domainRateLimitRepository) List(ctx context.Context) ([]model.DomainRateLimit, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, host, interval_seconds, created_at, updated_at FROM domain_rate_limits ORDER BY host
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var limits []model.DomainRateLimit
	for rows.Next() {
		d, err := scanDomainRateLimit(rows)
		if err != nil {
			return nil, err
		}
		limits = append(limits, d)
	}
	return limits, rows.Err()
}

func scanDomainRateLimit(s rowScanner) (model.DomainRateLimit, error) {
	var d model.DomainRateLimit
	var createdAt, updatedAt string
	if err := s.Scan(&d.ID, &d.Host, &d.IntervalSeconds, &createdAt, &updatedAt); err != nil {
		return model.DomainRateLimit{}, err
	}
	var err error
	d.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return model.DomainRateLimit{}, fmt.Errorf("parse domain_rate_limit created_at: %w", err)
	}
	d.UpdatedAt, err = parseTime(updatedAt)
	if err != nil {
		return model.DomainRateLimit{}, fmt.Errorf("parse domain_rate_limit updated_at: %w", err)
	}
	return d, nil
}
