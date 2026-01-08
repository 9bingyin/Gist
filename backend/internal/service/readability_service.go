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
	"github.com/microcosm-cc/bluemonday"
	"golang.org/x/net/html"

	"gist/backend/internal/config"
	"gist/backend/internal/logger"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/anubis"
)

const readabilityTimeout = 30 * time.Second

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
	p.AllowRelativeURLs(true)

	// Create azuretls session with Chrome fingerprint
	session := azuretls.NewSession()
	session.Browser = azuretls.Chrome
	session.SetTimeout(readabilityTimeout)

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
	body, err := s.fetchWithChrome(ctx, *entry.URL, "", 0)
	if err != nil {
		return "", err
	}

	// Process lazy-loaded images before sanitization
	// This converts data-src/data-lazy-src/data-original to src
	// and removes placeholder SVG images
	body = processLazyImages(body)

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
func (s *readabilityService) fetchWithChrome(ctx context.Context, targetURL string, cookie string, retryCount int) ([]byte, error) {
	return s.doFetch(ctx, s.session, targetURL, cookie, retryCount, false)
}

// fetchWithFreshSession creates a new azuretls session to avoid connection reuse after Anubis
func (s *readabilityService) fetchWithFreshSession(ctx context.Context, targetURL, cookie string, retryCount int) ([]byte, error) {
	tempSession := azuretls.NewSession()
	tempSession.Browser = azuretls.Chrome
	tempSession.SetTimeout(readabilityTimeout)
	defer tempSession.Close()

	return s.doFetch(ctx, tempSession, targetURL, cookie, retryCount, true)
}

// doFetch performs the actual HTTP request with the given session
func (s *readabilityService) doFetch(ctx context.Context, session *azuretls.Session, targetURL, cookie string, retryCount int, isFreshSession bool) ([]byte, error) {
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

	if cookie != "" {
		headers = append(headers, []string{"cookie", cookie})
	} else if !isFreshSession && s.anubis != nil {
		if cachedCookie := s.anubis.GetCachedCookie(ctx, parsedURL.Host); cachedCookie != "" {
			headers = append(headers, []string{"cookie", cachedCookie})
		}
	}

	resp, err := session.Do(&azuretls.Request{
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

	if s.anubis != nil && anubis.IsAnubisChallenge(body) {
		if retryCount >= 2 || isFreshSession {
			return nil, fmt.Errorf("anubis challenge persists after %d retries for %s", retryCount, targetURL)
		}
		logger.Debug("readability detected Anubis challenge", "url", targetURL)
		var initialCookies []*http.Cookie
		for name, value := range resp.Cookies {
			initialCookies = append(initialCookies, &http.Cookie{Name: name, Value: value})
		}
		newCookie, solveErr := s.anubis.SolveFromBody(ctx, body, targetURL, initialCookies)
		if solveErr != nil {
			return nil, fmt.Errorf("anubis solve failed: %w", solveErr)
		}
		return s.fetchWithFreshSession(ctx, targetURL, newCookie, retryCount+1)
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

// walkTreeUntil traverses element nodes until fn returns true.
func walkTreeUntil(n *html.Node, fn func(*html.Node) bool) bool {
	if n.Type == html.ElementNode && fn(n) {
		return true
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if walkTreeUntil(c, fn) {
			return true
		}
	}
	return false
}

// processLazyImages handles lazy-loaded images by converting data-* attributes to standard attributes.
// This must be called BEFORE bluemonday sanitization since bluemonday strips data-* attributes and noscript tags.
func processLazyImages(htmlContent []byte) []byte {
	doc, err := html.Parse(bytes.NewReader(htmlContent))
	if err != nil {
		return htmlContent
	}

	var nodesToRemove []*html.Node
	var noscriptNodes []*html.Node
	var noscriptContent [][]*html.Node

	// First pass: collect img nodes and noscript with real images
	walkTree(doc, func(n *html.Node) {
		switch n.Data {
		case "img":
			processImgNode(n, &nodesToRemove)
		case "noscript":
			if content := getNoscriptContent(n); hasRealImageInNodes(content) {
				noscriptNodes = append(noscriptNodes, n)
				noscriptContent = append(noscriptContent, content)
			}
		}
	})

	// Unwrap noscript: insert parsed content before noscript, then remove it
	for i, noscript := range noscriptNodes {
		parent := noscript.Parent
		if parent == nil {
			continue
		}
		for _, child := range noscriptContent[i] {
			walkTree(child, func(n *html.Node) {
				if n.Data == "img" {
					processImgNode(n, &nodesToRemove)
				}
			})
			parent.InsertBefore(child, noscript)
		}
		parent.RemoveChild(noscript)
	}

	// Remove placeholder images
	for _, n := range nodesToRemove {
		if n.Parent != nil {
			n.Parent.RemoveChild(n)
		}
	}

	var buf bytes.Buffer
	if err := html.Render(&buf, doc); err != nil {
		return htmlContent
	}
	return buf.Bytes()
}

// processImgNode handles lazy loading attributes for a single img element.
func processImgNode(n *html.Node, nodesToRemove *[]*html.Node) {
	var src, dataSrc, dataLazySrc, dataOriginal string
	var srcset, dataSrcset string
	var srcAttrIndex = -1

	// Collect relevant attributes
	for i, attr := range n.Attr {
		switch attr.Key {
		case "src":
			src = attr.Val
			srcAttrIndex = i
		case "data-src":
			dataSrc = attr.Val
		case "data-lazy-src":
			dataLazySrc = attr.Val
		case "data-original":
			dataOriginal = attr.Val
		case "srcset":
			srcset = attr.Val
		case "data-srcset":
			dataSrcset = attr.Val
		}
	}

	// Determine the real src (priority: data-src > data-lazy-src > data-original)
	realSrc := ""
	if dataSrc != "" && !strings.HasPrefix(dataSrc, "data:") {
		realSrc = dataSrc
	} else if dataLazySrc != "" && !strings.HasPrefix(dataLazySrc, "data:") {
		realSrc = dataLazySrc
	} else if dataOriginal != "" && !strings.HasPrefix(dataOriginal, "data:") {
		realSrc = dataOriginal
	}

	// If we found a real src from data-* attributes, use it
	if realSrc != "" {
		if srcAttrIndex >= 0 {
			n.Attr[srcAttrIndex].Val = realSrc
		} else {
			n.Attr = append(n.Attr, html.Attribute{Key: "src", Val: realSrc})
		}
	} else if src == "" || strings.HasPrefix(src, "data:") {
		// No valid src and no lazy loading attributes - mark for removal
		// This handles: placeholder SVGs, empty src, JS-only images
		*nodesToRemove = append(*nodesToRemove, n)
	}

	// Handle data-srcset
	if dataSrcset != "" && srcset == "" {
		n.Attr = append(n.Attr, html.Attribute{Key: "srcset", Val: dataSrcset})
	}
}

// getNoscriptContent extracts and parses the text content of a noscript node.
// Go's html.Parse treats noscript content as text nodes, not HTML elements,
// so we need to re-parse the text to get actual img elements.
func getNoscriptContent(n *html.Node) []*html.Node {
	var textContent string
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.TextNode {
			textContent += c.Data
		}
	}
	if textContent == "" {
		return nil
	}

	doc, err := html.Parse(strings.NewReader(textContent))
	if err != nil {
		return nil
	}

	// Find body and extract its children
	var nodes []*html.Node
	walkTreeUntil(doc, func(node *html.Node) bool {
		if node.Data == "body" {
			for c := node.FirstChild; c != nil; {
				next := c.NextSibling
				node.RemoveChild(c)
				nodes = append(nodes, c)
				c = next
			}
			return true
		}
		return false
	})
	return nodes
}

// hasRealImageInNodes checks if any node in the list contains an img with a real (non-data:) src.
func hasRealImageInNodes(nodes []*html.Node) bool {
	for _, n := range nodes {
		if walkTreeUntil(n, isRealImage) {
			return true
		}
	}
	return false
}

// isRealImage returns true if the node is an img with a real (non-data:) src.
func isRealImage(n *html.Node) bool {
	if n.Data != "img" {
		return false
	}
	for _, attr := range n.Attr {
		if attr.Key == "src" && attr.Val != "" && !strings.HasPrefix(attr.Val, "data:") {
			return true
		}
	}
	return false
}
