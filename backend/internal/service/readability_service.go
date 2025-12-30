package service

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"
	readability "codeberg.org/readeck/go-readability/v2"

	"gist/backend/internal/repository"
)

type ReadabilityService interface {
	FetchReadableContent(ctx context.Context, entryID int64) (string, error)
}

type readabilityService struct {
	entries    repository.EntryRepository
	httpClient *http.Client
	sanitizer  *bluemonday.Policy
}

func NewReadabilityService(entries repository.EntryRepository) ReadabilityService {
	// Create a sanitizer policy similar to DOMPurify
	// This removes scripts and other elements that interfere with readability parsing
	p := bluemonday.UGCPolicy()
	p.AllowElements("article", "section", "header", "footer", "nav", "aside", "main", "figure", "figcaption")
	p.AllowAttrs("id", "class", "lang", "dir").Globally()

	return &readabilityService{
		entries: entries,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		sanitizer: p,
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

	// Fetch page content
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, *entry.URL, nil)
	if err != nil {
		return "", ErrFeedFetch
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read body failed: %w", err)
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
