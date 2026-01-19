package http_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	gh "gist/backend/internal/http"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

func TestRegisterStatic_EmptyDir(t *testing.T) {
	e := echo.New()
	gh.RegisterStatic(e, "")
	require.Empty(t, e.Routes())
}

func TestRegisterStatic_MissingIndex(t *testing.T) {
	e := echo.New()
	gh.RegisterStatic(e, t.TempDir())
	require.Empty(t, e.Routes())
}

func TestRegisterStatic_ServesFiles(t *testing.T) {
	dir := t.TempDir()
	indexPath := filepath.Join(dir, "index.html")
	appPath := filepath.Join(dir, "app.js")

	require.NoError(t, os.WriteFile(indexPath, []byte("INDEX"), 0o600))
	require.NoError(t, os.WriteFile(appPath, []byte("APP"), 0o600))

	e := echo.New()
	gh.RegisterStatic(e, dir)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "INDEX")

	req = httptest.NewRequest(http.MethodGet, "/app.js", nil)
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "APP")

	req = httptest.NewRequest(http.MethodGet, "/missing", nil)
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "INDEX")

	req = httptest.NewRequest(http.MethodGet, "/api/test", nil)
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}
