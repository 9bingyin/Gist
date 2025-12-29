package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	Addr  string
	DBPath string
	StaticDir string
}

func Load() Config {
	addr := os.Getenv("GIST_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	path := os.Getenv("GIST_DB_PATH")
	if path == "" {
		path = "./data/gist.db"
	}
	staticDir := os.Getenv("GIST_STATIC_DIR")
	if staticDir == "" {
		staticDir = detectStaticDir()
	}

	return Config{
		Addr:  addr,
		DBPath: filepath.Clean(path),
		StaticDir: filepath.Clean(staticDir),
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
