package repository

import (
	"testing"
	"time"
)

func TestNullableInt64(t *testing.T) {
	t.Run("nil pointer returns nil", func(t *testing.T) {
		result := nullableInt64(nil)
		if result != nil {
			t.Errorf("expected nil, got %v", result)
		}
	})

	t.Run("non-nil pointer returns value", func(t *testing.T) {
		value := int64(123)
		result := nullableInt64(&value)
		if result != int64(123) {
			t.Errorf("expected 123, got %v", result)
		}
	})

	t.Run("zero value is preserved", func(t *testing.T) {
		value := int64(0)
		result := nullableInt64(&value)
		if result != int64(0) {
			t.Errorf("expected 0, got %v", result)
		}
	})
}

func TestNullableString(t *testing.T) {
	t.Run("nil pointer returns nil", func(t *testing.T) {
		result := nullableString(nil)
		if result != nil {
			t.Errorf("expected nil, got %v", result)
		}
	})

	t.Run("non-nil pointer returns value", func(t *testing.T) {
		value := "test string"
		result := nullableString(&value)
		if result != "test string" {
			t.Errorf("expected 'test string', got %v", result)
		}
	})

	t.Run("empty string is preserved", func(t *testing.T) {
		value := ""
		result := nullableString(&value)
		if result != "" {
			t.Errorf("expected empty string, got %v", result)
		}
	})
}

func TestFormatTime(t *testing.T) {
	t.Run("formats time in RFC3339Nano", func(t *testing.T) {
		// Fixed time: 2025-01-04 12:34:56.789 UTC
		fixedTime := time.Date(2025, 1, 4, 12, 34, 56, 789000000, time.UTC)
		result := formatTime(fixedTime)

		expected := "2025-01-04T12:34:56.789Z"
		if result != expected {
			t.Errorf("expected %s, got %s", expected, result)
		}
	})

	t.Run("converts non-UTC time to UTC", func(t *testing.T) {
		// Time in Asia/Shanghai (UTC+8)
		loc, _ := time.LoadLocation("Asia/Shanghai")
		localTime := time.Date(2025, 1, 4, 20, 34, 56, 0, loc) // 20:34 in UTC+8
		result := formatTime(localTime)

		// Should be converted to UTC: 12:34
		expected := "2025-01-04T12:34:56Z"
		if result != expected {
			t.Errorf("expected %s, got %s", expected, result)
		}
	})

	t.Run("preserves nanosecond precision", func(t *testing.T) {
		fixedTime := time.Date(2025, 1, 4, 12, 34, 56, 123456789, time.UTC)
		result := formatTime(fixedTime)

		expected := "2025-01-04T12:34:56.123456789Z"
		if result != expected {
			t.Errorf("expected %s, got %s", expected, result)
		}
	})
}

func TestParseTime(t *testing.T) {
	t.Run("parses RFC3339Nano format", func(t *testing.T) {
		input := "2025-01-04T12:34:56.789Z"
		result, err := parseTime(input)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		expected := time.Date(2025, 1, 4, 12, 34, 56, 789000000, time.UTC)
		if !result.Equal(expected) {
			t.Errorf("expected %v, got %v", expected, result)
		}
	})

	t.Run("parses full nanosecond precision", func(t *testing.T) {
		input := "2025-01-04T12:34:56.123456789Z"
		result, err := parseTime(input)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		expected := time.Date(2025, 1, 4, 12, 34, 56, 123456789, time.UTC)
		if !result.Equal(expected) {
			t.Errorf("expected %v, got %v", expected, result)
		}
	})

	t.Run("returns error for invalid format", func(t *testing.T) {
		input := "2025-01-04 12:34:56"
		_, err := parseTime(input)

		if err == nil {
			t.Error("expected error for invalid format, got nil")
		}
	})

	t.Run("returns error for empty string", func(t *testing.T) {
		input := ""
		_, err := parseTime(input)

		if err == nil {
			t.Error("expected error for empty string, got nil")
		}
	})
}

func TestFormatParseRoundTrip(t *testing.T) {
	t.Run("format and parse round trip", func(t *testing.T) {
		original := time.Date(2025, 1, 4, 12, 34, 56, 123456789, time.UTC)

		formatted := formatTime(original)
		parsed, err := parseTime(formatted)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !parsed.Equal(original) {
			t.Errorf("round trip failed: expected %v, got %v", original, parsed)
		}
	})
}
