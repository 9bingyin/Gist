package anubis

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
)

const (
	cookieKeyPrefix = "anubis.cookie."
	expiresSuffix   = ".expires"
)

type cachedCookie struct {
	Cookie    string    `json:"cookie"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Store manages Anubis cookie persistence in the database with an in-memory cache.
// writeMu serializes all mutations (DB + cache) so persistence and memory stay linearizable,
// while mu + generation protect lock-free GetCookie reads and block stale cache repopulation.
type Store struct {
	settings   repository.SettingsRepository
	writeMu    sync.Mutex
	mu         sync.RWMutex
	cache      map[string]cachedCookie
	generation uint64
}

// NewStore creates a new Anubis cookie store.
func NewStore(settings repository.SettingsRepository) *Store {
	return &Store{
		settings: settings,
		cache:    make(map[string]cachedCookie),
	}
}

// GetCookie retrieves the cached cookie for the given host.
// Returns empty string if not found or expired.
func (s *Store) GetCookie(ctx context.Context, host string) (string, error) {
	host = normalizeHost(host)
	if host == "" {
		return "", nil
	}

	now := time.Now()
	s.mu.RLock()
	entry, ok := s.cache[host]
	gen := s.generation
	s.mu.RUnlock()
	if ok {
		if now.Before(entry.ExpiresAt) {
			return entry.Cookie, nil
		}
		_ = s.deleteIfUnchanged(ctx, host, gen)
		return "", nil
	}

	if s.settings == nil {
		return "", nil
	}

	cookieKey := cookieKeyPrefix + host
	setting, err := s.settings.Get(ctx, cookieKey)
	if err != nil {
		logger.Warn("anubis cookie read failed", "module", "service", "action", "fetch", "resource", "settings", "result", "failed", "host", host, "error", err)
		return "", fmt.Errorf("get cookie: %w", err)
	}
	if setting == nil || setting.Value == "" {
		return "", nil
	}

	// New single-key JSON format.
	var stored cachedCookie
	if err := json.Unmarshal([]byte(setting.Value), &stored); err == nil && stored.Cookie != "" && !stored.ExpiresAt.IsZero() {
		if now.After(stored.ExpiresAt) {
			_ = s.deleteIfUnchanged(ctx, host, gen)
			return "", nil
		}
		s.mu.Lock()
		if s.generation == gen {
			s.cache[host] = stored
		}
		s.mu.Unlock()
		return stored.Cookie, nil
	}

	// Backward compatibility for legacy two-key format (cookie + .expires).
	expiresKey := cookieKey + expiresSuffix
	expiresSetting, err := s.settings.Get(ctx, expiresKey)
	if err != nil {
		logger.Warn("anubis cookie expires read failed", "module", "service", "action", "fetch", "resource", "settings", "result", "failed", "host", host, "error", err)
		return "", fmt.Errorf("get expires: %w", err)
	}
	if expiresSetting == nil {
		return "", nil
	}
	expiresAt, err := time.Parse(time.RFC3339, expiresSetting.Value)
	if err != nil {
		return "", nil
	}
	if now.After(expiresAt) {
		_ = s.deleteIfUnchanged(ctx, host, gen)
		return "", nil
	}

	stored = cachedCookie{Cookie: setting.Value, ExpiresAt: expiresAt}
	s.mu.Lock()
	if s.generation == gen {
		s.cache[host] = stored
	}
	s.mu.Unlock()
	return stored.Cookie, nil
}

// SetCookie stores the cookie and its expiration time as a single JSON setting
// and updates the in-memory cache.
func (s *Store) SetCookie(ctx context.Context, host, cookie string, expiresAt time.Time) error {
	host = normalizeHost(host)
	if host == "" {
		return nil
	}

	entry := cachedCookie{
		Cookie:    cookie,
		ExpiresAt: expiresAt.UTC(),
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	if s.settings != nil {
		payload, err := json.Marshal(entry)
		if err != nil {
			return fmt.Errorf("marshal cookie: %w", err)
		}
		cookieKey := cookieKeyPrefix + host
		if err := s.settings.Set(ctx, cookieKey, string(payload)); err != nil {
			logger.Warn("anubis cookie save failed", "module", "service", "action", "save", "resource", "settings", "result", "failed", "host", host, "error", err)
			return fmt.Errorf("set cookie: %w", err)
		}
	}

	s.mu.Lock()
	s.cache[host] = entry
	s.generation++
	s.mu.Unlock()
	return nil
}

// DeleteCookie removes the cached cookie from both memory and database.
func (s *Store) DeleteCookie(ctx context.Context, host string) error {
	host = normalizeHost(host)
	if host == "" {
		return nil
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	return s.deleteCookieLocked(ctx, host)
}

// deleteIfUnchanged deletes an expired cookie only if no newer mutation occurred since gen.
func (s *Store) deleteIfUnchanged(ctx context.Context, host string, gen uint64) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	s.mu.RLock()
	unchanged := s.generation == gen
	s.mu.RUnlock()
	if !unchanged {
		return nil
	}

	return s.deleteCookieLocked(ctx, host)
}

func (s *Store) deleteCookieLocked(ctx context.Context, host string) error {
	s.mu.Lock()
	delete(s.cache, host)
	s.generation++
	s.mu.Unlock()

	if s.settings == nil {
		return nil
	}

	cookieKey := cookieKeyPrefix + host
	if err := s.settings.Delete(ctx, cookieKey); err != nil {
		logger.Warn("anubis cookie delete failed", "module", "service", "action", "delete", "resource", "settings", "result", "failed", "host", host, "error", err)
		return fmt.Errorf("delete cookie: %w", err)
	}
	// Best-effort cleanup of legacy .expires key.
	_ = s.settings.Delete(ctx, cookieKey+expiresSuffix)

	s.mu.Lock()
	delete(s.cache, host)
	s.generation++
	s.mu.Unlock()
	return nil
}

// ClearAll removes all cached Anubis cookies from both in-memory cache and persistent storage.
func (s *Store) ClearAll(ctx context.Context) (int64, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	s.mu.Lock()
	clear(s.cache)
	s.generation++
	s.mu.Unlock()

	if s.settings == nil {
		return 0, nil
	}

	deleted, err := s.settings.DeleteByPrefix(ctx, cookieKeyPrefix)
	if err != nil {
		logger.Warn("anubis cookies clear failed", "module", "service", "action", "clear", "resource", "settings", "result", "failed", "error", err)
		return 0, err
	}

	// Evict any stale entry repopulated while DeleteByPrefix was in flight and advance
	// generation so still-in-flight GetCookie calls discard stale reads.
	s.mu.Lock()
	clear(s.cache)
	s.generation++
	s.mu.Unlock()
	return deleted, nil
}
