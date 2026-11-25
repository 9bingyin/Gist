//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"database/sql"
	"errors"
	"net"
	"strings"
	"time"
	"unicode"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
)

func normalizeHost(host string) string {
	return strings.ToLower(strings.TrimSpace(host))
}

// isValidHost validates a host name (supports IPs, single-label Docker/LAN hosts like "rsshub",
// standard domains, and IDN hostnames) while rejecting whitespace, control chars, or URL delimiters.
func isValidHost(host string) bool {
	host = normalizeHost(host)
	if host == "" || len(host) > 253 {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return true
	}
	if strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") || strings.Contains(host, "..") {
		return false
	}
	for _, r := range host {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return false
		}
		switch r {
		case '/', '\\', '?', '#', '@', ':', '[', ']':
			return false
		}
	}
	for label := range strings.SplitSeq(host, ".") {
		if label == "" || len(label) > 63 || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return false
		}
	}
	return true
}

// DomainRateLimitService provides domain rate limit management.
type DomainRateLimitService interface {
	GetInterval(ctx context.Context, host string) int
	GetIntervalDuration(ctx context.Context, host string) time.Duration
	SetInterval(ctx context.Context, host string, seconds int) (model.DomainRateLimit, error)
	DeleteInterval(ctx context.Context, host string) error
	List(ctx context.Context) ([]model.DomainRateLimit, error)
}

type domainRateLimitService struct {
	repo repository.DomainRateLimitRepository
}

// NewDomainRateLimitService creates a new domain rate limit service.
func NewDomainRateLimitService(repo repository.DomainRateLimitRepository) DomainRateLimitService {
	return &domainRateLimitService{repo: repo}
}

func (s *domainRateLimitService) GetInterval(ctx context.Context, host string) int {
	host = normalizeHost(host)
	if host == "" {
		return 0
	}
	limit, err := s.repo.GetByHost(ctx, host)
	if err == nil && limit != nil {
		return limit.IntervalSeconds
	}
	return 0
}

func (s *domainRateLimitService) GetIntervalDuration(ctx context.Context, host string) time.Duration {
	return time.Duration(s.GetInterval(ctx, host)) * time.Second
}

func (s *domainRateLimitService) SetInterval(ctx context.Context, host string, seconds int) (model.DomainRateLimit, error) {
	normalized := normalizeHost(host)
	if !isValidHost(normalized) {
		return model.DomainRateLimit{}, ErrInvalid
	}
	if seconds < 0 {
		seconds = 0
	}

	existing, err := s.repo.GetByHost(ctx, normalized)
	if err != nil {
		return model.DomainRateLimit{}, err
	}

	if existing != nil {
		if err := s.repo.Update(ctx, normalized, seconds); err != nil {
			logger.Error("domain rate limit update failed", "module", "service", "action", "update", "resource", "domain_rate_limit", "result", "failed", "host", normalized, "error", err)
			return model.DomainRateLimit{}, err
		}
		existing.IntervalSeconds = seconds
		existing.UpdatedAt = time.Now().UTC()
		logger.Info("domain rate limit updated", "module", "service", "action", "update", "resource", "domain_rate_limit", "result", "ok", "host", normalized, "interval_seconds", seconds)
		return *existing, nil
	}

	created, err := s.repo.Create(ctx, normalized, seconds)
	if err != nil {
		logger.Error("domain rate limit create failed", "module", "service", "action", "create", "resource", "domain_rate_limit", "result", "failed", "host", normalized, "error", err)
		return model.DomainRateLimit{}, err
	}
	logger.Info("domain rate limit created", "module", "service", "action", "create", "resource", "domain_rate_limit", "result", "ok", "host", normalized, "interval_seconds", seconds)
	return *created, nil
}

func (s *domainRateLimitService) DeleteInterval(ctx context.Context, host string) error {
	normalized := normalizeHost(host)
	if normalized == "" {
		return ErrInvalid
	}
	if err := s.repo.Delete(ctx, normalized); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		logger.Error("domain rate limit delete failed", "module", "service", "action", "delete", "resource", "domain_rate_limit", "result", "failed", "host", normalized, "error", err)
		return err
	}
	logger.Info("domain rate limit deleted", "module", "service", "action", "delete", "resource", "domain_rate_limit", "result", "ok", "host", normalized)
	return nil
}

func (s *domainRateLimitService) List(ctx context.Context) ([]model.DomainRateLimit, error) {
	return s.repo.List(ctx)
}
