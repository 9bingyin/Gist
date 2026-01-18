package repository_test

import (
	"testing"
	"time"

	"gist/backend/internal/repository"

	"github.com/stretchr/testify/require"
)

func TestNullableInt64(t *testing.T) {
	t.Run("nil pointer returns nil", func(t *testing.T) {
		result := repository.NullableInt64(nil)
		require.Nil(t, result)
	})

	t.Run("non-nil pointer returns value", func(t *testing.T) {
		value := int64(123)
		result := repository.NullableInt64(&value)
		require.Equal(t, int64(123), result)
	})

	t.Run("zero value is preserved", func(t *testing.T) {
		value := int64(0)
		result := repository.NullableInt64(&value)
		require.Equal(t, int64(0), result)
	})
}

func TestNullableString(t *testing.T) {
	t.Run("nil pointer returns nil", func(t *testing.T) {
		result := repository.NullableString(nil)
		require.Nil(t, result)
	})

	t.Run("non-nil pointer returns value", func(t *testing.T) {
		value := "test string"
		result := repository.NullableString(&value)
		require.Equal(t, "test string", result)
	})

	t.Run("empty string is preserved", func(t *testing.T) {
		value := ""
		result := repository.NullableString(&value)
		require.Equal(t, "", result)
	})
}

func TestFormatTime(t *testing.T) {
	t.Run("formats time in RFC3339Nano", func(t *testing.T) {
		// Fixed time: 2025-01-04 12:34:56.789 UTC
		fixedTime := time.Date(2025, 1, 4, 12, 34, 56, 789000000, time.UTC)
		result := repository.FormatTime(fixedTime)

		expected := "2025-01-04T12:34:56.789Z"
		require.Equal(t, expected, result)
	})

	t.Run("converts non-UTC time to UTC", func(t *testing.T) {
		// Time in Asia/Shanghai (UTC+8)
		loc, _ := time.LoadLocation("Asia/Shanghai")
		if loc == nil {
			loc = time.FixedZone("CST", 8*3600)
		}
		localTime := time.Date(2025, 1, 4, 20, 34, 56, 0, loc) // 20:34 in UTC+8
		result := repository.FormatTime(localTime)

		// Should be converted to UTC: 12:34
		expected := "2025-01-04T12:34:56Z"
		require.Equal(t, expected, result)
	})

	t.Run("preserves nanosecond precision", func(t *testing.T) {
		fixedTime := time.Date(2025, 1, 4, 12, 34, 56, 123456789, time.UTC)
		result := repository.FormatTime(fixedTime)

		expected := "2025-01-04T12:34:56.123456789Z"
		require.Equal(t, expected, result)
	})
}

func TestParseTime(t *testing.T) {
	t.Run("parses RFC3339Nano format", func(t *testing.T) {
		input := "2025-01-04T12:34:56.789Z"
		result, err := repository.ParseTime(input)
		require.NoError(t, err)

		expected := time.Date(2025, 1, 4, 12, 34, 56, 789000000, time.UTC)
		require.True(t, result.Equal(expected))
	})

	t.Run("parses full nanosecond precision", func(t *testing.T) {
		input := "2025-01-04T12:34:56.123456789Z"
		result, err := repository.ParseTime(input)
		require.NoError(t, err)

		expected := time.Date(2025, 1, 4, 12, 34, 56, 123456789, time.UTC)
		require.True(t, result.Equal(expected))
	})

	t.Run("returns error for invalid format", func(t *testing.T) {
		input := "2025-01-04 12:34:56"
		_, err := repository.ParseTime(input)
		require.Error(t, err)
	})

	t.Run("returns error for empty string", func(t *testing.T) {
		input := ""
		_, err := repository.ParseTime(input)
		require.Error(t, err)
	})
}

func TestFormatParseRoundTrip(t *testing.T) {
	t.Run("format and parse round trip", func(t *testing.T) {
		original := time.Date(2025, 1, 4, 12, 34, 56, 123456789, time.UTC)

		formatted := repository.FormatTime(original)
		parsed, err := repository.ParseTime(formatted)
		require.NoError(t, err)
		require.True(t, parsed.Equal(original))
	})
}
