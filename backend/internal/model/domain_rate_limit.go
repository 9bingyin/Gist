package model

import "time"

// DomainRateLimit represents a per-host rate limit configuration.
type DomainRateLimit struct {
	ID              int64
	Host            string
	IntervalSeconds int
	CreatedAt       time.Time
	UpdatedAt       time.Time
}
