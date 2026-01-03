package service

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Noooste/azuretls-client"
	"github.com/microcosm-cc/bluemonday"
	readability "codeberg.org/readeck/go-readability/v2"

	"gist/backend/internal/config"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/anubis"
)

type ReadabilityService interface {
	FetchReadableContent(ctx context.Context, entryID int64) (string, error)
	Close()
}

type readabilityService struct {
	entries   repository.EntryRepository
	session   *azuretls.Session
	sanitizer *bluemonday.Policy
	anubis    *anubis.Solver
}

func NewReadabilityService(entries repository.EntryRepository, anubisSolver *anubis.Solver) ReadabilityService {
	// Create a sanitizer policy similar to DOMPurify
	// This removes scripts and other elements that interfere with readability parsing
	p := bluemonday.UGCPolicy()
	p.AllowElements("article", "section", "header", "footer", "nav", "aside", "main", "figure", "figcaption")
	p.AllowAttrs("id", "class", "lang", "dir").Globally()

	// Create azuretls session with Chrome fingerprint
	session := azuretls.NewSession()
	session.Browser = azuretls.Chrome
	session.SetTimeout(30 * time.Second)

	return &readabilityService{
		entries:   entries,
		session:   session,
		sanitizer: p,
		anubis:    anubisSolver,
	}
}

func (s *readabilityService) FetchReadableContent(ctx context.Context, entryID int64) (string, error) {
	entry, err := s.entries.GetByID(ctx, entryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}

	// Return cached content if available
	if entry.ReadableContent != nil && *entry.ReadableContent != "" {
		return *entry.ReadableContent, nil
	}

	// Validate URL
	if entry.URL == nil || *entry.URL == "" {
		return "", ErrInvalid
	}

	// Fetch with Chrome fingerprint and Anubis support
	body, err := s.fetchWithChrome(ctx, *entry.URL, "")
	if err != nil {
		return "", err
	}

	// Sanitize HTML to remove scripts and other interfering elements
	// This is similar to what DOMPurify does in JS, which fixes readability parsing issues
	sanitized := s.sanitizer.Sanitize(string(body))

	// Parse URL for readability
	parsedURL, err := url.Parse(*entry.URL)
	if err != nil {
		return "", fmt.Errorf("parse URL failed: %w", err)
	}

	// Parse with readability
	parser := readability.NewParser()
	article, err := parser.Parse(strings.NewReader(sanitized), parsedURL)
	if err != nil {
		return "", fmt.Errorf("parse content failed: %w", err)
	}

	// Render HTML content
	var buf bytes.Buffer
	if err := article.RenderHTML(&buf); err != nil {
		return "", fmt.Errorf("render failed: %w", err)
	}

	content := buf.String()
	if content == "" {
		return "", ErrInvalid
	}

	// Save to database
	if err := s.entries.UpdateReadableContent(ctx, entryID, content); err != nil {
		return "", err
	}

	return content, nil
}

// Close releases resources held by the service
func (s *readabilityService) Close() {
	if s.session != nil {
		s.session.Close()
	}
}

// fetchWithChrome fetches URL with Chrome TLS fingerprint and browser headers
func (s *readabilityService) fetchWithChrome(ctx context.Context, targetURL string, cookie string) ([]byte, error) {
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, ErrFeedFetch
	}

	// Validate URL scheme to prevent SSRF
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, ErrInvalid
	}

	// Build ordered headers matching Chrome 135
	headers := azuretls.OrderedHeaders{
		{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
		{"accept-language", "zh-CN,zh;q=0.9"},
		{"cache-control", "max-age=0"},
		{"priority", "u=0, i"},
		{"sec-ch-ua", `"Google Chrome";v="135", "Chromium";v="135", "Not-A.Brand";v="8"`},
		{"sec-ch-ua-arch", `"x86"`},
		{"sec-ch-ua-mobile", "?0"},
		{"sec-ch-ua-model", `""`},
		{"sec-ch-ua-platform", `"Windows"`},
		{"sec-ch-ua-platform-version", `"19.0.0"`},
		{"sec-fetch-dest", "document"},
		{"sec-fetch-mode", "navigate"},
		{"sec-fetch-site", "none"},
		{"sec-fetch-user", "?1"},
		{"upgrade-insecure-requests", "1"},
		{"user-agent", config.ChromeUserAgent},
	}

	// Add cookie (either provided or from Anubis cache)
	if cookie != "" {
		headers = append(headers, []string{"cookie", cookie})
	} else if s.anubis != nil {
		if cachedCookie := s.anubis.GetCachedCookie(ctx, parsedURL.Host); cachedCookie != "" {
			headers = append(headers, []string{"cookie", cachedCookie})
		}
	}

	resp, err := s.session.Do(&azuretls.Request{
		Method:         http.MethodGet,
		Url:            targetURL,
		OrderedHeaders: headers,
	})
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body := resp.Body

	// Check if response is Anubis challenge
	if s.anubis != nil && cookie == "" && anubis.IsAnubisChallenge(body) {
		log.Printf("readability: detected Anubis challenge for %s", targetURL)
		// Convert azuretls cookies (map[string]string) to []*http.Cookie
		var initialCookies []*http.Cookie
		for name, value := range resp.Cookies {
			initialCookies = append(initialCookies, &http.Cookie{Name: name, Value: value})
		}
		newCookie, solveErr := s.anubis.SolveFromBody(ctx, body, targetURL, initialCookies)
		if solveErr != nil {
			return nil, fmt.Errorf("anubis solve failed: %w", solveErr)
		}
		// Retry with the new cookie
		return s.fetchWithChrome(ctx, targetURL, newCookie)
	}

	return body, nil
}
