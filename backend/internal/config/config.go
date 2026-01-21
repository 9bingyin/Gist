package config

import (
	"os"
	"path/filepath"
)

const (
	AppName    = "Gist"
	AppVersion = "1.0.0"
	AppRepo    = "https://github.com/9bingyin/Gist"
)

// GistUserAgent identifies as Gist RSS reader
var GistUserAgent = "Mozilla/5.0 (compatible; " + AppName + "/" + AppVersion + "; +" + AppRepo + ")"

// Chrome headers for TLS fingerprinting (must match azuretls Chrome profile version)
const (
	ChromeUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
	ChromeSecChUa   = `"Google Chrome";v="135", "Chromium";v="135", "Not-A.Brand";v="8"`
)

// DefaultUserAgent for RSS fetching
var DefaultUserAgent = GistUserAgent

type Config struct {
	Addr          string
	DBPath        string
	DataDir       string
	StaticDir     string
	LogLevel      string
	EnableSwagger bool
}

func Load() Config {
	addr := os.Getenv("GIST_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	dataDir := os.Getenv("GIST_DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}
	path := os.Getenv("GIST_DB_PATH")
	if path == "" {
		path = filepath.Join(dataDir, "gist.db")
	}
	staticDir := os.Getenv("GIST_STATIC_DIR")
	if staticDir == "" {
		staticDir = detectStaticDir()
	}

	logLevel := os.Getenv("GIST_LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}

	enableSwagger := os.Getenv("GIST_SWAGGER") == "true"

	return Config{
		Addr:          addr,
		DBPath:        filepath.Clean(path),
		DataDir:       filepath.Clean(dataDir),
		StaticDir:     filepath.Clean(staticDir),
		LogLevel:      logLevel,
		EnableSwagger: enableSwagger,
	}
}

func detectStaticDir() string {
	candidates := []string{
		"./frontend/dist",
		"../frontend/dist",
	}
	for _, candidate := range candidates {
		indexPath := filepath.Join(candidate, "index.html")
		if info, err := os.Stat(indexPath); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return "./frontend/dist"
}
