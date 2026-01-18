package logger

import (
	"log/slog"
	"os"
	"strings"
)

// ParseLevel converts a string level name to slog.Level.
// Supported values: debug, info, warn, error (case-insensitive).
// Returns slog.LevelInfo for unrecognized values.
func ParseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// Init initializes the global logger with the specified level.
// This should be called once at application startup.
func Init(level slog.Level) {
	opts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(groups []string, attr slog.Attr) slog.Attr {
			if attr.Key == slog.LevelKey {
				attr.Value = slog.StringValue(strings.ToLower(attr.Value.String()))
			}
			return attr
		},
	}
	handler := slog.NewTextHandler(os.Stdout, opts)
	slog.SetDefault(slog.New(handler))
}

// Debug logs a message at DEBUG level.
func Debug(msg string, args ...any) {
	slog.Debug(msg, args...)
}

// Info logs a message at INFO level.
func Info(msg string, args ...any) {
	slog.Info(msg, args...)
}

// Warn logs a message at WARN level.
func Warn(msg string, args ...any) {
	slog.Warn(msg, args...)
}

// Error logs a message at ERROR level.
func Error(msg string, args ...any) {
	slog.Error(msg, args...)
}
