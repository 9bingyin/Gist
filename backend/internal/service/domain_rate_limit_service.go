package service

import (
	"context"
	"net"
	"regexp"
	"strconv"
	"strings"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
)

// DomainRateLimitDTO represents a domain rate limit for API responses.
type DomainRateLimitDTO struct {
	ID              string    `json:"id"`
	Host            string    `json:"host"`
	IntervalSeconds int       `json:"intervalSeconds"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// isValidHost checks if the host is a valid IP, localhost, or a domain with at least one dot.
func isValidHost(host string) bool {
	host = strings.TrimSpace(host)
	if host == "" {
		return false
	}
	if len(host) > 253 {
		return false
	}
	if host == "localhost" {
		return true
	}
	// Check if it's an IP
	if ip := net.ParseIP(host); ip != nil {
		return true
	}
	// RFC 1123 compliant domain regex that requires at least one dot
	var domainRegex = regexp.MustCompile(`^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$`)
	return domainRegex.MatchString(host)
}

// DomainRateLimitService provides domain rate limit management.
type DomainRateLimitService interface {
	// GetInterval returns the interval for a host in seconds.
	// Returns 0 if not configured (no rate limiting).
	GetInterval(ctx context.Context, host string) int
	// GetIntervalDuration returns the interval as time.Duration.
	GetIntervalDuration(ctx context.Context, host string) time.Duration
	// SetInterval creates or updates the interval for a host.
	SetInterval(ctx context.Context, host string, seconds int) error
	// DeleteInterval removes the interval configuration for a host.
	DeleteInterval(ctx context.Context, host string) error
	// List returns all configured domain rate limits.
	List(ctx context.Context) ([]DomainRateLimitDTO, error)
}

type domainRateLimitService struct {
	repo repository.DomainRateLimitRepository
}

// NewDomainRateLimitService creates a new domain rate limit service.
func NewDomainRateLimitService(repo repository.DomainRateLimitRepository) DomainRateLimitService {
	return &domainRateLimitService{
		repo: repo,
	}
}

// GetInterval returns the interval for a host in seconds.
// Returns 0 if not configured (no rate limiting).
func (s *domainRateLimitService) GetInterval(ctx context.Context, host string) int {
	limit, err := s.repo.GetByHost(ctx, host)
	if err == nil && limit != nil {
		return limit.IntervalSeconds
	}
	return 0
}

// GetIntervalDuration returns the interval as time.Duration.
func (s *domainRateLimitService) GetIntervalDuration(ctx context.Context, host string) time.Duration {
	seconds := s.GetInterval(ctx, host)
	return time.Duration(seconds) * time.Second
}

// SetInterval creates or updates the interval for a host.
func (s *domainRateLimitService) SetInterval(ctx context.Context, host string, seconds int) error {
	if !isValidHost(host) {
		return ErrInvalid
	}
	if seconds < 0 {
		seconds = 0
	}

	// Check if it exists
	existing, err := s.repo.GetByHost(ctx, host)
	if err != nil {
		return err
	}

	if existing != nil {
		return s.repo.Update(ctx, host, seconds)
	}
	_, err = s.repo.Create(ctx, host, seconds)
	return err
}

// DeleteInterval removes the interval configuration for a host.
func (s *domainRateLimitService) DeleteInterval(ctx context.Context, host string) error {
	return s.repo.Delete(ctx, host)
}

// List returns all configured domain rate limits.
func (s *domainRateLimitService) List(ctx context.Context) ([]DomainRateLimitDTO, error) {
	limits, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}

	dtos := make([]DomainRateLimitDTO, len(limits))
	for i, limit := range limits {
		dtos[i] = modelToDTO(limit)
	}
	return dtos, nil
}

func modelToDTO(m model.DomainRateLimit) DomainRateLimitDTO {
	return DomainRateLimitDTO{
		ID:              strconv.FormatInt(m.ID, 10),
		Host:            m.Host,
		IntervalSeconds: m.IntervalSeconds,
		CreatedAt:       m.CreatedAt,
		UpdatedAt:       m.UpdatedAt,
	}
}
