package repository_test

import (
	"testing"
	"time"

	"gist/backend/internal/repository"

	"github.com/stretchr/testify/require"
)

func TestFormatTime(t *testing.T) {
	t.Run("formats fixed-width UTC RFC3339Nano preserving sub-second precision", func(t *testing.T) {
		fixedTime := time.Date(2025, 1, 4, 12, 34, 56, 789000000, time.UTC)
		result := repository.FormatTime(fixedTime)
		require.Equal(t, "2025-01-04T12:34:56.789000000Z", result)
	})

	t.Run("converts non-UTC time to UTC", func(t *testing.T) {
		loc := time.FixedZone("CST", 8*3600)
		localTime := time.Date(2025, 1, 4, 20, 34, 56, 0, loc)
		result := repository.FormatTime(localTime)
		require.Equal(t, "2025-01-04T12:34:56.000000000Z", result)
	})

	t.Run("preserves lexicographical order within the same second", func(t *testing.T) {
		a := repository.FormatTime(time.Date(2025, 1, 4, 12, 34, 56, 0, time.UTC))
		b := repository.FormatTime(time.Date(2025, 1, 4, 12, 34, 56, 150000000, time.UTC))
		c := repository.FormatTime(time.Date(2025, 1, 4, 12, 34, 56, 200000000, time.UTC))
		require.True(t, a < b && b < c)
	})
}

func TestParseTime(t *testing.T) {
	t.Run("parses RFC3339", func(t *testing.T) {
		result, err := repository.ParseTime("2025-01-04T12:34:56Z")
		require.NoError(t, err)
		expected := time.Date(2025, 1, 4, 12, 34, 56, 0, time.UTC)
		require.True(t, result.Equal(expected))
	})

	t.Run("parses legacy RFC3339Nano format", func(t *testing.T) {
		result, err := repository.ParseTime("2025-01-04T12:34:56.789Z")
		require.NoError(t, err)
		expected := time.Date(2025, 1, 4, 12, 34, 56, 789000000, time.UTC)
		require.True(t, result.Equal(expected))
	})

	t.Run("returns error for invalid format", func(t *testing.T) {
		_, err := repository.ParseTime("2025-01-04 12:34:56")
		require.Error(t, err)
	})

	t.Run("returns error for empty string", func(t *testing.T) {
		_, err := repository.ParseTime("")
		require.Error(t, err)
	})
}

func TestEscapeLikePrefix(t *testing.T) {
	require.Equal(t, `ai\_100\%\\`, repository.EscapeLikePrefix(`ai_100%\`))
}
