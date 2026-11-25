package config_test

import (
	"testing"

	"gist/backend/internal/config"

	"github.com/stretchr/testify/require"
)

func TestLoad(t *testing.T) {
	t.Setenv("GIST_ADDR", ":9999")
	t.Setenv("GIST_DATA_DIR", "/tmp/gist")
	t.Setenv("GIST_LOG_LEVEL", "debug")
	t.Setenv("GIST_SWAGGER", "1")
	t.Setenv("GIST_ENABLE_PPROF", "true")
	t.Setenv("GIST_PPROF_ADDR", "127.0.0.1:6061")

	cfg := config.Load()
	require.Equal(t, ":9999", cfg.Addr)
	require.Equal(t, "/tmp/gist", cfg.DataDir)
	require.Contains(t, cfg.DBPath, "/tmp/gist/gist.db")
	require.Equal(t, "debug", cfg.LogLevel)
	require.True(t, cfg.EnableSwagger)
	require.Equal(t, "127.0.0.1:6061", cfg.PprofAddr)
}

func TestLoad_PprofRequiresEnableFlag(t *testing.T) {
	t.Setenv("GIST_ENABLE_PPROF", "false")
	t.Setenv("GIST_PPROF_ADDR", "127.0.0.1:6060")

	cfg := config.Load()
	require.Empty(t, cfg.PprofAddr)
}

func TestLoad_PprofDefaultAddrWhenEnabled(t *testing.T) {
	t.Setenv("GIST_ENABLE_PPROF", "1")
	t.Setenv("GIST_PPROF_ADDR", "")

	cfg := config.Load()
	require.Equal(t, "127.0.0.1:6060", cfg.PprofAddr)
}

func TestLoad_Defaults(t *testing.T) {
	t.Setenv("GIST_ADDR", "")
	t.Setenv("GIST_DATA_DIR", "")
	t.Setenv("GIST_DB_PATH", "")
	t.Setenv("GIST_LOG_LEVEL", "")
	t.Setenv("GIST_SWAGGER", "")
	t.Setenv("GIST_PPROF_ADDR", "")
	t.Setenv("GIST_ENABLE_PPROF", "")

	cfg := config.Load()
	require.Equal(t, ":8080", cfg.Addr)
	require.Equal(t, "data", cfg.DataDir)
	require.Contains(t, cfg.DBPath, "gist.db")
	require.Equal(t, "info", cfg.LogLevel)
	require.False(t, cfg.EnableSwagger)
	require.Empty(t, cfg.PprofAddr)
}
