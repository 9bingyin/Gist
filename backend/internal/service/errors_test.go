package service_test

import (
	"errors"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/service"

	"github.com/stretchr/testify/require"
)

func TestFeedConflictError_Error(t *testing.T) {
	err := &service.FeedConflictError{
		ExistingFeed: model.Feed{
			ID:    123,
			Title: "Test Feed",
		},
	}

	require.Equal(t, "feed already exists", err.Error())
}

func TestFeedConflictError_Is(t *testing.T) {
	err := &service.FeedConflictError{
		ExistingFeed: model.Feed{
			ID:    123,
			Title: "Test Feed",
		},
	}

	// Should match ErrConflict
	require.True(t, errors.Is(err, service.ErrConflict))

	// Should not match other errors
	require.False(t, errors.Is(err, service.ErrNotFound))
	require.False(t, errors.Is(err, service.ErrInvalid))
	require.False(t, errors.Is(err, service.ErrFeedFetch))
}

func TestFeedConflictError_As(t *testing.T) {
	err := &service.FeedConflictError{
		ExistingFeed: model.Feed{
			ID:    123,
			Title: "Test Feed",
			URL:   "https://example.com/feed",
		},
	}

	var conflictErr *service.FeedConflictError
	require.True(t, errors.As(err, &conflictErr))
	require.Equal(t, int64(123), conflictErr.ExistingFeed.ID)
	require.Equal(t, "Test Feed", conflictErr.ExistingFeed.Title)
}
