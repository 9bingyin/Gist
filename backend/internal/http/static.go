package http

import (
	nethttp "net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"

	"gist/backend/pkg/logger"
)

func registerStatic(e *echo.Echo, dir string) {
	if dir == "" {
		return
	}
	indexPath := filepath.Join(dir, "index.html")
	info, err := os.Stat(indexPath)
	if err != nil || info.IsDir() {
		logger.Warn("static index missing", "module", "http", "action", "request", "resource", "http", "result", "failed", "path", indexPath)
		return
	}

	logger.Info("static assets enabled", "module", "http", "action", "request", "resource", "http", "result", "ok", "dir", dir)

	fileServer := nethttp.FileServer(nethttp.Dir(dir))

	e.GET("/*", func(c echo.Context) error {
		requestPath := c.Request().URL.Path
		if requestPath == "/api" || strings.HasPrefix(requestPath, "/api/") {
			return echo.ErrNotFound
		}
		if requestPath == "/" {
			setStaticHeaders(c.Response().Header(), "index.html")
			logger.Debug("static index served", "module", "http", "action", "fetch", "resource", "http", "result", "ok", "path", requestPath)
			return c.File(indexPath)
		}

		cleanPath := strings.TrimPrefix(path.Clean(requestPath), "/")
		if cleanPath == "." || cleanPath == "" {
			setStaticHeaders(c.Response().Header(), "index.html")
			return c.File(indexPath)
		}

		candidate := filepath.Join(dir, cleanPath)
		fileInfo, err := os.Stat(candidate)
		if err == nil && !fileInfo.IsDir() {
			setStaticHeaders(c.Response().Header(), cleanPath)
			logger.Debug("static file served", "module", "http", "action", "fetch", "resource", "http", "result", "ok", "path", requestPath)
			fileServer.ServeHTTP(c.Response(), c.Request())
			return nil
		}

		if shouldBypassSPA(cleanPath) {
			logger.Debug("static asset missing", "module", "http", "action", "fetch", "resource", "http", "result", "failed", "path", requestPath)
			return echo.ErrNotFound
		}

		setStaticHeaders(c.Response().Header(), "index.html")
		logger.Debug("static fallback", "module", "http", "action", "fetch", "resource", "http", "result", "ok", "path", requestPath)
		return c.File(indexPath)
	})
}

func shouldBypassSPA(cleanPath string) bool {
	if strings.HasPrefix(cleanPath, "assets/") {
		return true
	}
	return path.Ext(cleanPath) != ""
}

func setStaticHeaders(header nethttp.Header, cleanPath string) {
	switch cleanPath {
	case "index.html", "sw.js", "manifest.webmanifest":
		header.Set("Cache-Control", "no-cache")
	}
}
