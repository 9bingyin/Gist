package ai_test

import (
	"context"
	"gist/backend/internal/service/ai"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRateLimiter(t *testing.T) {
	rl := ai.NewRateLimiter(5)
	require.Equal(t, 5, rl.GetLimit())

	// Test update
	rl.SetLimit(20)
	require.Equal(t, 20, rl.GetLimit())

	// Test default on invalid
	rl.SetLimit(0)
	require.Equal(t, ai.DefaultRateLimit, rl.GetLimit())

	// Test wait (basic)
	err := rl.Wait(context.Background())
	require.NoError(t, err)
}
