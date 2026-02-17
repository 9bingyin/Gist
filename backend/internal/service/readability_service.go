//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	readability "codeberg.org/readeck/go-readability/v2"
	"github.com/Noooste/azuretls-client"
	"golang.org/x/net/html"

	"gist/backend/internal/config"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/anubis"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const readabilityTimeout = 30 * time.Second

type ReadabilityService interface {
	FetchReadableContent(ctx context.Context, entryID int64) (string, error)
	Close()
}

type readabilityService struct {
	entries       repository.EntryRepository
	clientFactory *network.ClientFactory
	anubis        AnubisSolver
}

func NewReadabilityService(entries repository.EntryRepository, clientFactory *network.ClientFactory, anubisSolver AnubisSolver) ReadabilityService {
	return &readabilityService{
		entries:       entries,
		clientFactory: clientFactory,
		anubis:        anubisSolver,
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
		logger.Debug("readability cache hit", "module", "service", "action", "fetch", "resource", "entry", "result", "ok", "entry_id", entryID, "cache", "hit")
		return *entry.ReadableContent, nil
	}

	// Validate URL
	if entry.URL == nil || *entry.URL == "" {
		return "", ErrInvalid
	}

	// Fetch with Chrome fingerprint and Anubis support
	body, err := s.fetchWithChrome(ctx, *entry.URL, "", 0)
	if err != nil {
		logger.Warn("readability fetch failed", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "entry_id", entryID, "host", network.ExtractHost(*entry.URL), "error", err)
		return "", err
	}

	// Parse URL for readability
	parsedURL, err := url.Parse(*entry.URL)
	if err != nil {
		return "", fmt.Errorf("parse URL failed: %w", err)
	}

	// Parse with readability
	// go-readability handles lazy images (unwrapNoscriptImages, fixLazyImages) and script removal internally
	parser := readability.NewParser()
	parser.KeepClasses = true // Preserve class attributes (e.g., language-python on code blocks)
	article, err := parser.Parse(bytes.NewReader(body), parsedURL)
	if err != nil {
		logger.Error("readability parse failed", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "entry_id", entryID, "host", network.ExtractHost(*entry.URL), "error", err)
		return "", fmt.Errorf("parse content failed: %w", err)
	}

	// Render HTML content
	var buf bytes.Buffer
	if err := article.RenderHTML(&buf); err != nil {
		return "", fmt.Errorf("render failed: %w", err)
	}

	// Post-process: fix lazy images and remove metadata elements
	rendered := buf.Bytes()

	// Fix lazy images with data-original that go-readability doesn't handle
	rendered = fixLazyImages(rendered)

	// Remove date elements (Safari Reader style)
	content := removeMetadataElements(rendered)
	if content == "" {
		return "", ErrInvalid
	}

	// Save to database
	if err := s.entries.UpdateReadableContent(ctx, entryID, content); err != nil {
		logger.Error("readability cache save failed", "module", "service", "action", "save", "resource", "entry", "result", "failed", "entry_id", entryID, "error", err)
		return "", err
	}

	logger.Info("readability cached", "module", "service", "action", "save", "resource", "entry", "result", "ok", "entry_id", entryID)
	return content, nil
}

// Close releases resources held by the service
func (s *readabilityService) Close() {
	// No persistent resources to release
}

// fetchWithChrome fetches URL with Chrome TLS fingerprint and browser headers
func (s *readabilityService) fetchWithChrome(ctx context.Context, targetURL string, cookie string, retryCount int) ([]byte, error) {
	session := s.clientFactory.NewAzureSession(ctx, readabilityTimeout)
	defer session.Close()
	return s.doFetch(ctx, session, targetURL, cookie, retryCount)
}

// fetchWithFreshSession creates a new azuretls session to avoid connection reuse after Anubis
func (s *readabilityService) fetchWithFreshSession(ctx context.Context, targetURL, cookie string, retryCount int) ([]byte, error) {
	session := s.clientFactory.NewAzureSession(ctx, readabilityTimeout)
	defer session.Close()
	return s.doFetch(ctx, session, targetURL, cookie, retryCount)
}

// doFetch performs the actual HTTP request with the given session
func (s *readabilityService) doFetch(ctx context.Context, session *azuretls.Session, targetURL, cookie string, retryCount int) ([]byte, error) {
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, ErrFeedFetch
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, ErrInvalid
	}

	headers := azuretls.OrderedHeaders{
		{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
		{"accept-language", "zh-CN,zh;q=0.9"},
		{"cache-control", "max-age=0"},
		{"priority", "u=0, i"},
		{"sec-ch-ua", config.ChromeSecChUa},
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

	requestHeaders := anubis.OrderedHeadersToHTTPHeader(headers)
	if cookie != "" {
		headers = append(headers, []string{"cookie", cookie})
	} else {
		if cachedCookie := getCachedAnubisCookie(ctx, s.anubis, parsedURL.Host, requestHeaders); cachedCookie != "" {
			headers = append(headers, []string{"cookie", cachedCookie})
		}
	}

	resp, err := session.Do(&azuretls.Request{
		Method:         http.MethodGet,
		Url:            targetURL,
		OrderedHeaders: headers,
	})
	if err != nil {
		logger.Warn("readability request failed", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "host", parsedURL.Host, "error", err)
		return nil, fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		logger.Error("readability http error", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "host", parsedURL.Host, "status_code", resp.StatusCode)
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body := resp.Body

	newCookie, anubisErr := trySolveAnubisChallenge(ctx, s.anubis, body, targetURL, cookiesFromMap(resp.Cookies), requestHeaders, retryCount)
	switch {
	case anubisErr == nil:
		logger.Debug("readability detected anubis challenge", "module", "service", "action", "fetch", "resource", "entry", "result", "ok", "host", parsedURL.Host)
		return s.fetchWithFreshSession(ctx, targetURL, newCookie, retryCount+1)
	case errors.Is(anubisErr, errAnubisRejected):
		logger.Warn("readability upstream rejected", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "host", parsedURL.Host)
		return nil, fmt.Errorf("upstream rejected")
	case errors.Is(anubisErr, errAnubisRetryExceeded):
		logger.Warn("readability anubis persists", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "host", parsedURL.Host, "retry_count", retryCount)
		return nil, fmt.Errorf("anubis challenge persists after %d retries for %s", retryCount, targetURL)
	case anubisErr != nil && !errors.Is(anubisErr, errAnubisNotPage):
		logger.Warn("readability anubis solve failed", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "host", parsedURL.Host, "error", anubisErr)
		return nil, fmt.Errorf("anubis solve failed: %w", anubisErr)
	}

	return body, nil
}

// walkTree traverses all descendant element nodes and calls fn for each.
func walkTree(n *html.Node, fn func(*html.Node)) {
	if n.Type == html.ElementNode {
		fn(n)
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		walkTree(c, fn)
	}
}

// removeMetadataElements removes date elements from HTML content.
// This implements Safari Reader's approach to filter metadata that Readability doesn't handle:
// - Elements with class containing "date" (Safari: /date/.test(className))
// - Elements with itemprop containing "datePublished"
func removeMetadataElements(htmlContent []byte) string {
	doc, err := html.Parse(bytes.NewReader(htmlContent))
	if err != nil {
		return string(htmlContent)
	}

	var nodesToRemove []*html.Node

	walkTree(doc, func(n *html.Node) {
		if shouldRemoveMetadataElement(n) {
			nodesToRemove = append(nodesToRemove, n)
		}
	})

	for _, n := range nodesToRemove {
		if n.Parent != nil {
			n.Parent.RemoveChild(n)
		}
	}

	var buf bytes.Buffer
	if err := html.Render(&buf, doc); err != nil {
		return string(htmlContent)
	}
	return buf.String()
}

// shouldRemoveMetadataElement checks if an element should be removed as metadata.
func shouldRemoveMetadataElement(n *html.Node) bool {
	if n.Type != html.ElementNode {
		return false
	}

	for _, attr := range n.Attr {
		switch attr.Key {
		case "class":
			// Safari Reader: /date/.test(className)
			if containsDateClass(attr.Val) {
				return true
			}
		case "itemprop":
			// Safari Reader: /\bdatePublished\b/.test(itemprop)
			if strings.Contains(attr.Val, "datePublished") {
				return true
			}
		}
	}
	return false
}

// containsDateClass checks if class string contains a date-related class.
func containsDateClass(classStr string) bool {
	for _, class := range strings.Fields(classStr) {
		if strings.Contains(strings.ToLower(class), "date") {
			return true
		}
	}
	return false
}

// fixLazyImages fixes lazy-loaded images that go-readability doesn't handle.
// go-readability's fixLazyImages only processes images with empty src or "lazy" class.
// This function handles images with placeholder src and data-original attribute.
func fixLazyImages(htmlContent []byte) []byte {
	doc, err := html.Parse(bytes.NewReader(htmlContent))
	if err != nil {
		return htmlContent
	}

	walkTree(doc, func(n *html.Node) {
		if n.Data != "img" {
			return
		}

		var srcIdx = -1
		var dataOriginal string

		for i, attr := range n.Attr {
			switch attr.Key {
			case "src":
				srcIdx = i
			case "data-original":
				dataOriginal = attr.Val
			}
		}

		// Replace src with data-original if data-original exists and is a real image URL
		if dataOriginal != "" && !strings.HasPrefix(dataOriginal, "data:") {
			if srcIdx >= 0 {
				n.Attr[srcIdx].Val = dataOriginal
			} else {
				n.Attr = append(n.Attr, html.Attribute{Key: "src", Val: dataOriginal})
			}
		}
	})

	var buf bytes.Buffer
	if err := html.Render(&buf, doc); err != nil {
		return htmlContent
	}
	return buf.Bytes()
}
