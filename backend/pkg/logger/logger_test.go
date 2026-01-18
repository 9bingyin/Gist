package logger

import (
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseLevel(t *testing.T) {
	tests := []struct {
		input string
		want  slog.Level
	}{
		{"debug", slog.LevelDebug},
		{"DEBUG", slog.LevelDebug},
		{"info", slog.LevelInfo},
		{"warn", slog.LevelWarn},
		{"warning", slog.LevelWarn},
		{"error", slog.LevelError},
		{"unknown", slog.LevelInfo},
		{"", slog.LevelInfo},
	}

	for _, tt := range tests {
		require.Equal(t, tt.want, ParseLevel(tt.input))
	}
}

func TestInit(t *testing.T) {
	// Verify it doesn't panic
	Init(slog.LevelDebug)
	Debug("test message")
	Info("test message")
	Warn("test message")
	Error("test message")
}
