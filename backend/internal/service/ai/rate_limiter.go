package ai

import (
	"context"
	"sync"

	"golang.org/x/time/rate"

	"gist/backend/pkg/logger"
)

// DefaultRateLimit is the default QPS limit.
const DefaultRateLimit = 10

// RateLimiter provides global rate limiting for AI API calls.
type RateLimiter struct {
	limiter *rate.Limiter
	mu      sync.RWMutex
}

// NewRateLimiter creates a new rate limiter with the given QPS.
func NewRateLimiter(qps int) *RateLimiter {
	if qps <= 0 {
		qps = DefaultRateLimit
	}
	return &RateLimiter{
		limiter: rate.NewLimiter(rate.Limit(qps), qps), // burst = qps
	}
}

// Wait blocks until a token is available or context is cancelled.
func (r *RateLimiter) Wait(ctx context.Context) error {
	r.mu.RLock()
	limiter := r.limiter
	r.mu.RUnlock()
	return limiter.Wait(ctx)
}

// SetLimit updates the rate limit dynamically.
func (r *RateLimiter) SetLimit(qps int) {
	if qps <= 0 {
		qps = DefaultRateLimit
	}
	r.mu.Lock()
	r.limiter.SetLimit(rate.Limit(qps))
	r.limiter.SetBurst(qps)
	r.mu.Unlock()
	logger.Info("ai rate limit updated", "module", "ai", "action", "update", "resource", "ai", "result", "ok", "qps", qps)
}

// GetLimit returns the current rate limit.
func (r *RateLimiter) GetLimit() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return int(r.limiter.Limit())
}
