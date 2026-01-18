package config_test

import (
	"gist/backend/internal/config"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoad(t *testing.T) {
	// Set env vars
	os.Setenv("GIST_ADDR", ":9999")
	os.Setenv("GIST_DATA_DIR", "/tmp/gist")
	os.Setenv("GIST_LOG_LEVEL", "debug")
	defer func() {
		os.Unsetenv("GIST_ADDR")
		os.Unsetenv("GIST_DATA_DIR")
		os.Unsetenv("GIST_LOG_LEVEL")
	}()

	cfg := config.Load()
	require.Equal(t, ":9999", cfg.Addr)
	require.Equal(t, "/tmp/gist", cfg.DataDir)
	require.Contains(t, cfg.DBPath, "/tmp/gist/gist.db")
	require.Equal(t, "debug", cfg.LogLevel)
}

func TestLoad_Defaults(t *testing.T) {
	// Clear env vars
	os.Unsetenv("GIST_ADDR")
	os.Unsetenv("GIST_DATA_DIR")
	os.Unsetenv("GIST_DB_PATH")
	os.Unsetenv("GIST_LOG_LEVEL")

	cfg := config.Load()
	require.Equal(t, ":8080", cfg.Addr)
	require.Equal(t, "data", cfg.DataDir)
	require.Contains(t, cfg.DBPath, "gist.db")
	require.Equal(t, "info", cfg.LogLevel)
}
