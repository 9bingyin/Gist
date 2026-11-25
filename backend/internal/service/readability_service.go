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
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"

	readability "codeberg.org/readeck/go-readability/v2"
	"github.com/Noooste/azuretls-client"
	"golang.org/x/net/html"
	"golang.org/x/sync/singleflight"

	"gist/backend/internal/config"
	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const readabilityTimeout = 30 * time.Second

type ReadabilityService interface {
	FetchReadableContent(ctx context.Context, entryID int64) (string, error)
}

type readabilityService struct {
	entries       repository.EntryRepository
	clientFactory *network.ClientFactory
	anubis        AnubisSolver
	sf            singleflight.Group
}

func NewReadabilityService(entries repository.EntryRepository, clientFactory *network.ClientFactory, anubisSolver AnubisSolver) ReadabilityService {
	return &readabilityService{
		entries:       entries,
		clientFactory: clientFactory,
		anubis:        anubisSolver,
	}
}

func (s *readabilityService) FetchReadableContent(ctx context.Context, entryID int64) (string, error) {
	key := strconv.FormatInt(entryID, 10)
	ch := s.sf.DoChan(key, func() (any, error) {
		workCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), readabilityTimeout*2)
		defer cancel()
		return s.fetchReadableContentOnce(workCtx, entryID)
	})

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case res := <-ch:
		if res.Err != nil {
			return "", res.Err
		}
		content, _ := res.Val.(string)
		return content, nil
	}
}

func (s *readabilityService) fetchReadableContentOnce(ctx context.Context, entryID int64) (string, error) {
	entry, err := s.entries.GetByID(ctx, entryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}

	if entry.ReadableContent != nil && *entry.ReadableContent != "" {
		logger.Debug("readability cache hit", "module", "service", "action", "fetch", "resource", "entry", "result", "ok", "entry_id", entryID, "cache", "hit")
		return *entry.ReadableContent, nil
	}

	if entry.URL == nil || strings.TrimSpace(*entry.URL) == "" {
		return "", ErrInvalid
	}

	parsedURL, err := network.ValidateFetchURL(*entry.URL)
	if err != nil {
		return "", ErrInvalid
	}

	body, err := s.fetchWithChrome(ctx, *entry.URL)
	if err != nil {
		logger.Warn("readability fetch failed", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "entry_id", entryID, "host", parsedURL.Host, "error", err)
		return "", err
	}

	content, err := parseAndCleanReadability(body, parsedURL)
	if err != nil {
		logger.Error("readability parse failed", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "entry_id", entryID, "host", parsedURL.Host, "error", err)
		return "", err
	}
	if content == "" {
		return "", ErrInvalid
	}

	if err := s.entries.UpdateReadableContent(ctx, entryID, content); err != nil {
		logger.Error("readability cache save failed", "module", "service", "action", "save", "resource", "entry", "result", "failed", "entry_id", entryID, "error", err)
		return "", err
	}

	logger.Info("readability cached", "module", "service", "action", "save", "resource", "entry", "result", "ok", "entry_id", entryID)
	return content, nil
}

func parseAndCleanReadability(body []byte, parsedURL *url.URL) (string, error) {
	parser := readability.NewParser()
	parser.KeepClasses = true // Preserve class attributes (e.g., language-python on code blocks).
	article, err := parser.Parse(bytes.NewReader(body), parsedURL)
	if err != nil {
		return "", fmt.Errorf("parse content failed: %w", err)
	}

	if article.Node == nil {
		var buf bytes.Buffer
		if err := article.RenderHTML(&buf); err != nil {
			return "", fmt.Errorf("render failed: %w", err)
		}
		return strings.TrimSpace(buf.String()), nil
	}

	// Single AST pass directly on article.Node: fix lazy images and remove metadata elements
	// without re-parsing/re-rendering HTML 3 times or introducing outer <html><body> wrappers.
	cleanReadabilityTree(article.Node)

	var buf bytes.Buffer
	if err := html.Render(&buf, article.Node); err != nil {
		return "", fmt.Errorf("render failed: %w", err)
	}
	return strings.TrimSpace(buf.String()), nil
}

func (s *readabilityService) fetchWithChrome(ctx context.Context, targetURL string) ([]byte, error) {
	if _, err := network.ValidateFetchURL(targetURL); err != nil {
		return nil, ErrInvalid
	}

	headers := azuretls.OrderedHeaders{
		{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
		{"accept-encoding", azureStreamAcceptEncoding},
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

	res, err := fetchAzureWithAnubis(ctx, azureFetchOptions{
		URL:           targetURL,
		Timeout:       readabilityTimeout,
		MaxBodyBytes:  maxHTMLBodyBytes,
		Headers:       headers,
		ClientFactory: s.clientFactory,
		Anubis:        s.anubis,
	})
	if err != nil {
		if errors.Is(err, network.ErrInvalidURL) || errors.Is(err, network.ErrBlockedAddress) {
			return nil, ErrInvalid
		}
		if errors.Is(err, ErrUpstreamRejected) {
			return nil, fmt.Errorf("upstream rejected")
		}
		return nil, fmt.Errorf("request failed: %w", err)
	}

	if res.StatusCode != http.StatusOK {
		logger.Error("readability http error", "module", "service", "action", "fetch", "resource", "entry", "result", "failed", "host", network.ExtractHost(targetURL), "status_code", res.StatusCode)
		return nil, fmt.Errorf("HTTP %d", res.StatusCode)
	}

	return res.Body, nil
}

// cleanReadabilityTree mutates root in a single pass, fixing data-original lazy images
// and removing date metadata elements.
func cleanReadabilityTree(root *html.Node) {
	if root == nil {
		return
	}
	var nodesToRemove []*html.Node

	walkTree(root, func(n *html.Node) {
		if shouldRemoveMetadataElement(n) {
			nodesToRemove = append(nodesToRemove, n)
			return
		}
		if n.Data == "img" {
			fixLazyImageNode(n)
		}
	})

	for _, n := range nodesToRemove {
		if n.Parent != nil {
			n.Parent.RemoveChild(n)
		}
	}
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

func fixLazyImageNode(n *html.Node) {
	srcIdx := -1
	var dataOriginal string
	for i, attr := range n.Attr {
		switch attr.Key {
		case "src":
			srcIdx = i
		case "data-original":
			dataOriginal = attr.Val
		}
	}
	if dataOriginal != "" && !strings.HasPrefix(dataOriginal, "data:") {
		if srcIdx >= 0 {
			n.Attr[srcIdx].Val = dataOriginal
		} else {
			n.Attr = append(n.Attr, html.Attribute{Key: "src", Val: dataOriginal})
		}
	}
}

// shouldRemoveMetadataElement checks if an element should be removed as metadata.
func shouldRemoveMetadataElement(n *html.Node) bool {
	if n.Type != html.ElementNode {
		return false
	}

	for _, attr := range n.Attr {
		switch attr.Key {
		case "class":
			if containsDateClass(attr.Val) {
				return true
			}
		case "itemprop":
			if slices.Contains(strings.Fields(attr.Val), "datePublished") {
				return true
			}
		}
	}
	return false
}

var dateClassTokens = map[string]struct{}{
	"date":          {},
	"datetime":      {},
	"pubdate":       {},
	"postdate":      {},
	"datepublished": {},
	"dateline":      {},
	"timestamp":     {},
}

// containsDateClass matches date-related CSS class tokens on word boundaries
// (hyphen/underscore/camelCase splits) so words like "update", "outdated", or
// "candidate" are never mistakenly removed.
func containsDateClass(classStr string) bool {
	for class := range strings.FieldsSeq(classStr) {
		for _, tok := range splitClassTokens(class) {
			if _, ok := dateClassTokens[tok]; ok {
				return true
			}
		}
	}
	return false
}

func splitClassTokens(class string) []string {
	var tokens []string
	var buf strings.Builder
	runes := []rune(class)
	for i, r := range runes {
		if r == '-' || r == '_' || r == ':' || r == '/' || r == '.' {
			if buf.Len() > 0 {
				tokens = append(tokens, strings.ToLower(buf.String()))
				buf.Reset()
			}
			continue
		}
		if i > 0 && unicode.IsUpper(r) && unicode.IsLower(runes[i-1]) && buf.Len() > 0 {
			tokens = append(tokens, strings.ToLower(buf.String()))
			buf.Reset()
		}
		buf.WriteRune(r)
	}
	if buf.Len() > 0 {
		tokens = append(tokens, strings.ToLower(buf.String()))
	}
	return tokens
}
