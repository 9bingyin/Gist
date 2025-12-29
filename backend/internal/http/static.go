package http

import (
	nethttp "net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
)

func registerStatic(e *echo.Echo, dir string) {
	if dir == "" {
		return
	}
	indexPath := filepath.Join(dir, "index.html")
	info, err := os.Stat(indexPath)
	if err != nil || info.IsDir() {
		e.Logger.Warnf("static index not found at %s", indexPath)
		return
	}

	fileServer := nethttp.FileServer(nethttp.Dir(dir))

	e.GET("/*", func(c echo.Context) error {
		requestPath := c.Request().URL.Path
		if requestPath == "/api" || strings.HasPrefix(requestPath, "/api/") {
			return echo.ErrNotFound
		}
		if requestPath == "/" {
			return c.File(indexPath)
		}

		cleanPath := strings.TrimPrefix(path.Clean(requestPath), "/")
		if cleanPath == "." || cleanPath == "" {
			return c.File(indexPath)
		}

		candidate := filepath.Join(dir, cleanPath)
		fileInfo, err := os.Stat(candidate)
		if err == nil && !fileInfo.IsDir() {
			fileServer.ServeHTTP(c.Response(), c.Request())
			return nil
		}

		return c.File(indexPath)
	})
}
