package repository_test

import (
	"gist/backend/internal/repository"
	"context"
	"testing"

	"gist/backend/internal/repository/testutil"

	"github.com/stretchr/testify/require"
)

func TestDomainRateLimitRepository(t *testing.T) {
	db := testutil.NewTestDB(t)
	repo := repository.NewDomainRateLimitRepository(db)
	ctx := context.Background()

	// Create
	created, err := repo.Create(ctx, "example.com", 60)
	require.NoError(t, err)
	require.NotNil(t, created)

	// List
	limits, err := repo.List(ctx)
	require.NoError(t, err)
	require.Len(t, limits, 1)
	require.Equal(t, "example.com", limits[0].Host)
	require.Equal(t, 60, limits[0].IntervalSeconds)

	// Update
	err = repo.Update(ctx, "example.com", 120)
	require.NoError(t, err)
	updated, _ := repo.GetByHost(ctx, "example.com")
	require.Equal(t, 120, updated.IntervalSeconds)

	// Delete
	err = repo.Delete(ctx, "example.com")
	require.NoError(t, err)

	limits, _ = repo.List(ctx)
	require.Empty(t, limits)
}
