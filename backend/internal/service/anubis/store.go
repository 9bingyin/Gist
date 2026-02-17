package anubis

import (
	"context"
	"fmt"
	"time"

	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
)

const (
	// cookieKeyPrefix is the prefix for Anubis cookie keys in settings
	cookieKeyPrefix = "anubis.cookie."
	// expiresSuffix is the suffix for cookie expiration time keys
	expiresSuffix = ".expires"
)

// Store manages Anubis cookie persistence in the database
type Store struct {
	settings repository.SettingsRepository
}

// NewStore creates a new Anubis cookie store
func NewStore(settings repository.SettingsRepository) *Store {
	return &Store{settings: settings}
}

// GetCookie retrieves the cached cookie for the given host
// Returns empty string if not found or expired
func (s *Store) GetCookie(ctx context.Context, host string) (string, error) {
	if s.settings == nil {
		return "", nil
	}
	host = normalizeHost(host)

	// Check expiration first
	expiresKey := cookieKeyPrefix + host + expiresSuffix
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
		// Invalid format, treat as expired
		return "", nil
	}

	if time.Now().After(expiresAt) {
		// Cookie expired, clean up
		_ = s.DeleteCookie(ctx, host)
		return "", nil
	}

	// Get the cookie value
	cookieKey := cookieKeyPrefix + host
	cookieSetting, err := s.settings.Get(ctx, cookieKey)
	if err != nil {
		logger.Warn("anubis cookie read failed", "module", "service", "action", "fetch", "resource", "settings", "result", "failed", "host", host, "error", err)
		return "", fmt.Errorf("get cookie: %w", err)
	}
	if cookieSetting == nil {
		return "", nil
	}

	return cookieSetting.Value, nil
}

// SetCookie stores the cookie and its expiration time for the given host
func (s *Store) SetCookie(ctx context.Context, host, cookie string, expiresAt time.Time) error {
	if s.settings == nil {
		return nil
	}
	host = normalizeHost(host)

	// Store the cookie value
	cookieKey := cookieKeyPrefix + host
	if err := s.settings.Set(ctx, cookieKey, cookie); err != nil {
		logger.Warn("anubis cookie save failed", "module", "service", "action", "save", "resource", "settings", "result", "failed", "host", host, "error", err)
		return fmt.Errorf("set cookie: %w", err)
	}

	// Store the expiration time
	expiresKey := cookieKeyPrefix + host + expiresSuffix
	if err := s.settings.Set(ctx, expiresKey, expiresAt.UTC().Format(time.RFC3339)); err != nil {
		logger.Warn("anubis cookie expires save failed", "module", "service", "action", "save", "resource", "settings", "result", "failed", "host", host, "error", err)
		return fmt.Errorf("set expires: %w", err)
	}

	return nil
}

// DeleteCookie removes the cached cookie for the given host
func (s *Store) DeleteCookie(ctx context.Context, host string) error {
	if s.settings == nil {
		return nil
	}
	host = normalizeHost(host)

	cookieKey := cookieKeyPrefix + host
	expiresKey := cookieKeyPrefix + host + expiresSuffix

	if err := s.settings.Delete(ctx, cookieKey); err != nil {
		logger.Warn("anubis cookie delete failed", "module", "service", "action", "delete", "resource", "settings", "result", "failed", "host", host, "error", err)
		return fmt.Errorf("delete cookie: %w", err)
	}
	if err := s.settings.Delete(ctx, expiresKey); err != nil {
		logger.Warn("anubis cookie expires delete failed", "module", "service", "action", "delete", "resource", "settings", "result", "failed", "host", host, "error", err)
		return fmt.Errorf("delete expires: %w", err)
	}

	return nil
}
