package ai

import (
	"context"

	"golang.org/x/time/rate"

	"gist/backend/pkg/logger"
)

// DefaultRateLimit is the default QPS limit.
const DefaultRateLimit = 10

// RateLimiter provides global rate limiting for AI API calls.
// rate.Limiter is already concurrency-safe internally.
type RateLimiter struct {
	limiter *rate.Limiter
}

// NewRateLimiter creates a new rate limiter with the given QPS.
func NewRateLimiter(qps int) *RateLimiter {
	if qps <= 0 {
		qps = DefaultRateLimit
	}
	return &RateLimiter{
		limiter: rate.NewLimiter(rate.Limit(qps), qps),
	}
}

// Wait blocks until a token is available or context is cancelled.
func (r *RateLimiter) Wait(ctx context.Context) error {
	return r.limiter.Wait(ctx)
}

// SetLimit updates the rate limit dynamically.
func (r *RateLimiter) SetLimit(qps int) {
	if qps <= 0 {
		qps = DefaultRateLimit
	}
	r.limiter.SetLimit(rate.Limit(qps))
	r.limiter.SetBurst(qps)
	logger.Info("ai rate limit updated", "module", "ai", "action", "update", "resource", "ai", "result", "ok", "qps", qps)
}

// GetLimit returns the current rate limit.
func (r *RateLimiter) GetLimit() int {
	return int(r.limiter.Limit())
}
